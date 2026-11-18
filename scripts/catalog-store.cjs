/**
 * 数据资产目录存储：数据表与维表（assets）、字典（dictionaries）、标签主体表（tags）、推送目标（targets）、菜单（menus）、开放 API（apis）。
 * 每个集合是一份带版本号（rev）的整份快照，保存在 DATA_DIR/catalog.json。
 *
 * 规则集中在这里：
 *  - 读：任何登录用户（和之前页面里自带的数据范围一致）；写：门户管理员，或所在权限组 menuEdits 含该集合对应的菜单。
 *  - 校验：数量上限、必填字段、唯一键、单条大小、内容只能是纯 JSON（拦掉 __proto__ 等危险键）。
 *  - 密钥类字段（推送目标的 sk）只存在服务端：读出来永远是掩码，前端把掩码原样交回就表示「不改」。
 *  - 开放 API 的 Token 由服务端生成：只在创建 / 重置时返回一次完整值，库里只存哈希，读出来永远是「前缀 + ****」；客户端传的 token 一律忽略。
 *  - 还没人保存过时 saved=false，由有编辑权限的人把页面默认数据整份交上来作为初始数据。
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const MASK = "********";
const MAX_ITEM_CHARS = 400000; // 单条（含维表数据行）序列化后的上限
const MAX_DEPTH = 8;

const COLLECTIONS = {
  assets: { label: "数据表与维表", editMenus: ["表管理", "维表管理"], keyOf: item => item.assetId || `${item.database || ""}.${item.table || ""}`, required: ["table", "cnName"], max: 1000 },
  dictionaries: { label: "字典", editMenus: ["字典管理"], keyOf: item => item.dictId || item.code, required: ["code", "name"], max: 500 },
  tags: { label: "标签主体表", editMenus: ["标签管理"], keyOf: item => item.name, required: ["name", "cn"], max: 200 },
  targets: { label: "推送目标", editMenus: ["人群包推送渠道"], keyOf: item => item.name, required: ["name"], max: 100, secretFields: ["sk"] },
  // 开放 API：apiId 是稳定编号（改名不影响）；Token 由服务端签发（见 issueToken）
  apis: { label: "开放 API", editMenus: ["数据开放平台"], keyOf: item => item.apiId, required: ["name"], max: 300, tokenField: "token", idField: "apiId", idPrefix: "API" },
  // 菜单是一棵树（顶级目录带 children）：编号、权限标识在整棵树里都不能重复
  menus: { label: "菜单", editMenus: ["菜单管理"], keyOf: item => item.id, required: ["id", "name", "path", "permission"], max: 100, validate: validateMenuTree }
};

/** 菜单树校验：深度 ≤ 3、总数 ≤ 300，编号与权限标识全树唯一，children 必须是数组 */
function validateMenuTree(items) {
  const ids = new Set(), permissions = new Set();
  let count = 0;
  const walk = (nodes, depth) => {
    if (depth > 3) return "菜单层级过深";
    for (const node of nodes) {
      if (++count > 300) return "菜单数量过多";
      for (const field of ["id", "name", "path", "permission"]) if (typeof node[field] !== "string" || !node[field].trim()) return `菜单的「${field}」不能为空`;
      if (ids.has(node.id)) return `菜单编号重复：${node.id}`;
      if (permissions.has(node.permission)) return `权限标识重复：${node.permission}`;
      ids.add(node.id); permissions.add(node.permission);
      if (node.children !== undefined) {
        if (!Array.isArray(node.children)) return "菜单的 children 必须是数组";
        for (const child of node.children) if (!child || typeof child !== "object" || Array.isArray(child)) return "菜单里有不合法的条目";
        const inner = walk(node.children, depth + 1);
        if (inner) return inner;
      }
    }
    return "";
  };
  return walk(items, 1);
}
const NAMES = Object.keys(COLLECTIONS);
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** 校验并复制成纯 JSON；非法内容返回 null */
function cleanJson(value, depth = 0) {
  if (depth > MAX_DEPTH) return undefined;
  if (value === null || typeof value === "boolean" || typeof value === "number") return Number.isFinite(value) || typeof value !== "number" ? value : null;
  if (typeof value === "string") return value.slice(0, 100000);
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) { const cleaned = cleanJson(item, depth + 1); if (cleaned === undefined) return undefined; out.push(cleaned); }
    return out;
  }
  if (typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) return undefined;
      const cleaned = cleanJson(item, depth + 1);
      if (cleaned === undefined) return undefined;
      out[key] = cleaned;
    }
    return out;
  }
  return undefined;
}

const newId = prefix => `${prefix}_${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
/** 生成一个新 Token：返回完整值（只给调用方一次）和落库用的哈希 / 展示用的前缀 */
function issueToken() {
  const token = `bjgw_live_${crypto.randomBytes(24).toString("base64url")}`;
  return { token, hash: sha256(token), hint: `${token.slice(0, 14)}****` };
}

function createCatalogStore({ dataDir, orgStore }) {
  const file = path.join(dataDir, "catalog.json");
  const load = () => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; } };
  const persist = data => {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  };

  const canEdit = (user, name) => {
    if (orgStore.isAdmin(user)) return true;
    const { groups, userGroups } = orgStore.effective();
    const edits = groups.find(group => group.name === userGroups[user])?.menuEdits || [];
    return COLLECTIONS[name].editMenus.some(menu => edits.includes(menu));
  };

  const masked = (name, item) => {
    const spec = COLLECTIONS[name];
    const secrets = spec.secretFields || [];
    if (!secrets.length && !spec.tokenField) return item;
    const copy = { ...item };
    if (spec.tokenField) delete copy.tokenHash; // 哈希不出服务端
    for (const field of secrets) if (field in copy) copy[field] = copy[field] ? MASK : "";
    return copy;
  };

  function view(user) {
    const saved = load();
    const collections = {};
    for (const name of NAMES) {
      const entry = saved[name];
      collections[name] = {
        saved: Array.isArray(entry?.items), rev: Number(entry?.rev) || 0, canEdit: canEdit(user, name),
        items: Array.isArray(entry?.items) ? entry.items.map(item => masked(name, item)) : []
      };
    }
    return { collections };
  }

  /** 保存某个集合的整份快照；返回 { ok:true, rev } 或 { ok:false, error, status } */
  function save(user, name, input) {
    const spec = COLLECTIONS[name];
    if (!spec) return { ok: false, status: 404, error: "不存在的数据集合" };
    if (!canEdit(user, name)) return { ok: false, status: 403, error: `需要「${spec.editMenus.join("」或「")}」编辑权限` };
    const all = load();
    const current = all[name] || {};
    const currentRev = Number(current.rev) || 0;
    if (input?.rev !== undefined && Number(input.rev) !== currentRev) return { ok: false, status: 409, error: `${spec.label}已被他人修改，请刷新后再改` };
    if (!Array.isArray(input?.items) || input.items.length > spec.max) return { ok: false, status: 400, error: `${spec.label}数量需要在 0 到 ${spec.max} 之间` };

    const previous = new Map((Array.isArray(current.items) ? current.items : []).map(item => [spec.keyOf(item), item]));
    const keys = new Set();
    const items = [];
    const issued = [];
    for (const raw of input.items) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, status: 400, error: `${spec.label}里有不合法的条目` };
      const item = cleanJson(raw);
      if (item === undefined) return { ok: false, status: 400, error: `${spec.label}里有不合法的内容` };
      if (JSON.stringify(item).length > MAX_ITEM_CHARS) return { ok: false, status: 400, error: `${spec.label}里有条目过大` };
      for (const field of spec.required) {
        if (typeof item[field] !== "string" || !item[field].trim()) return { ok: false, status: 400, error: `${spec.label}的「${field}」不能为空` };
      }
      // 带稳定编号 / Token 的集合：编号缺失时服务端补；Token 一律以服务端为准（沿用旧的，没有就新签发）
      let issuedNow = null;
      if (spec.idField && !item[spec.idField]) item[spec.idField] = newId(spec.idPrefix);
      if (spec.tokenField) {
        const old = previous.get(String(item[spec.idField]));
        delete item.tokenHash;
        if (old?.tokenHash) { item.tokenHash = old.tokenHash; item[spec.tokenField] = old[spec.tokenField]; }
        else { issuedNow = issueToken(); item.tokenHash = issuedNow.hash; item[spec.tokenField] = issuedNow.hint; }
      }
      const key = String(spec.keyOf(item));
      if (keys.has(key)) return { ok: false, status: 400, error: `${spec.label}里有重复项：${key}` };
      if (issuedNow) issued.push({ id: key, name: item.name, token: issuedNow.token });
      keys.add(key);
      // 密钥字段：掩码 / 空表示不改，沿用服务端已有的值
      for (const field of spec.secretFields || []) {
        if (item[field] === MASK || item[field] === undefined) item[field] = previous.get(key)?.[field] || "";
      }
      items.push(item);
    }
    const treeError = spec.validate ? spec.validate(items) : "";
    if (treeError) return { ok: false, status: 400, error: treeError };
    const rev = currentRev + 1;
    persist({ ...all, [name]: { items, rev, updatedAt: new Date().toISOString() } });
    return { ok: true, rev, issued };
  }

  /** 重置某个 API 的 Token：旧 Token 立即失效；只返回一次完整值 */
  function resetToken(user, name, id) {
    const spec = COLLECTIONS[name];
    if (!spec?.tokenField) return { ok: false, status: 404, error: "这个集合没有 Token" };
    if (!canEdit(user, name)) return { ok: false, status: 403, error: `需要「${spec.editMenus.join("」或「")}」编辑权限` };
    const all = load();
    const items = Array.isArray(all[name]?.items) ? all[name].items : [];
    const target = items.find(item => String(item[spec.idField]) === String(id));
    if (!target) return { ok: false, status: 404, error: "找不到这个 API" };
    const next = issueToken();
    target.tokenHash = next.hash;
    target[spec.tokenField] = next.hint;
    const rev = (Number(all[name].rev) || 0) + 1;
    persist({ ...all, [name]: { ...all[name], rev, updatedAt: new Date().toISOString() } });
    return { ok: true, token: next.token, rev };
  }

  /** 校验一个 Token 属于哪个启用的 API（以后开放接口鉴权用）；不存在 / 已停用返回 null */
  function findApiByToken(token) {
    const hash = sha256(String(token || ""));
    const items = Array.isArray(load().apis?.items) ? load().apis.items : [];
    const found = items.find(item => item.tokenHash === hash && item.tokenStatus !== "停用");
    return found ? { apiId: found.apiId, name: found.name } : null;
  }

  return { view, save, canEdit, resetToken, findApiByToken, names: NAMES };
}

module.exports = { createCatalogStore, COLLECTIONS, MASK };
