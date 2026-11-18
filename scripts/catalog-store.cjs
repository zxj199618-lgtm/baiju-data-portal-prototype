/**
 * 数据资产目录存储：数据表与维表（assets）、字典（dictionaries）、标签主体表（tags）、推送目标（targets）。
 * 每个集合是一份带版本号（rev）的整份快照，保存在 DATA_DIR/catalog.json。
 *
 * 规则集中在这里：
 *  - 读：任何登录用户（和之前页面里自带的数据范围一致）；写：门户管理员，或所在权限组 menuEdits 含该集合对应的菜单。
 *  - 校验：数量上限、必填字段、唯一键、单条大小、内容只能是纯 JSON（拦掉 __proto__ 等危险键）。
 *  - 密钥类字段（推送目标的 sk）只存在服务端：读出来永远是掩码，前端把掩码原样交回就表示「不改」。
 *  - 还没人保存过时 saved=false，由有编辑权限的人把页面默认数据整份交上来作为初始数据。
 */
const fs = require("node:fs");
const path = require("node:path");

const MASK = "********";
const MAX_ITEM_CHARS = 400000; // 单条（含维表数据行）序列化后的上限
const MAX_DEPTH = 8;

const COLLECTIONS = {
  assets: { label: "数据表与维表", editMenus: ["表管理", "维表管理"], keyOf: item => item.assetId || `${item.database || ""}.${item.table || ""}`, required: ["table", "cnName"], max: 1000 },
  dictionaries: { label: "字典", editMenus: ["字典管理"], keyOf: item => item.dictId || item.code, required: ["code", "name"], max: 500 },
  tags: { label: "标签主体表", editMenus: ["标签管理"], keyOf: item => item.name, required: ["name", "cn"], max: 200 },
  targets: { label: "推送目标", editMenus: ["人群包推送渠道"], keyOf: item => item.name, required: ["name"], max: 100, secretFields: ["sk"] }
};
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
    const secrets = COLLECTIONS[name].secretFields || [];
    if (!secrets.length) return item;
    const copy = { ...item };
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
    for (const raw of input.items) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, status: 400, error: `${spec.label}里有不合法的条目` };
      const item = cleanJson(raw);
      if (item === undefined) return { ok: false, status: 400, error: `${spec.label}里有不合法的内容` };
      if (JSON.stringify(item).length > MAX_ITEM_CHARS) return { ok: false, status: 400, error: `${spec.label}里有条目过大` };
      for (const field of spec.required) {
        if (typeof item[field] !== "string" || !item[field].trim()) return { ok: false, status: 400, error: `${spec.label}的「${field}」不能为空` };
      }
      const key = String(spec.keyOf(item));
      if (keys.has(key)) return { ok: false, status: 400, error: `${spec.label}里有重复项：${key}` };
      keys.add(key);
      // 密钥字段：掩码 / 空表示不改，沿用服务端已有的值
      for (const field of spec.secretFields || []) {
        if (item[field] === MASK || item[field] === undefined) item[field] = previous.get(key)?.[field] || "";
      }
      items.push(item);
    }
    const rev = currentRev + 1;
    persist({ ...all, [name]: { items, rev, updatedAt: new Date().toISOString() } });
    return { ok: true, rev };
  }

  return { view, save, canEdit, names: NAMES };
}

module.exports = { createCatalogStore, COLLECTIONS, MASK };
