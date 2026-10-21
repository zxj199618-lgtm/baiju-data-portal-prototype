/**
 * 账号列表：哪些账号可以登录、是否停用。保存在 DATA_DIR/accounts.json；
 * 还没有管理员改过时，使用代码里的默认账号。密码不在这里（见 gateway-auth.cjs），权限组不在这里（见 org-store.cjs）。
 *
 * 只支持「新增」和「停用 / 启用」，不提供物理删除：账号名同时是历史、反馈、审计的归属键，删掉会让这些记录失去主人。
 */
const fs = require("fs");
const path = require("path");

const NAME_PATTERN = /^[^\s\u0000-\u001f~/\\,"'<>]{1,20}$/;
const RESERVED = new Set(["未分配", "全部数据表", "admin", "root", "system"]);

function createAccountStore({ dataDir, defaults }) {
  const file = path.join(dataDir, "accounts.json");

  const load = () => {
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      if (Array.isArray(data.accounts) && data.accounts.length) return data.accounts;
    } catch { /* 还没有保存过 */ }
    return defaults.map(name => ({ name, status: "active", createdAt: null }));
  };

  function save(accounts) {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ accounts, updatedAt: new Date().toISOString() }, null, 2));
    fs.renameSync(tmp, file);
  }

  const list = () => load();
  const names = () => load().map(account => account.name);
  const has = name => load().some(account => account.name === name);
  const isActive = name => load().some(account => account.name === name && account.status === "active");
  const activeNames = () => load().filter(account => account.status === "active").map(account => account.name);

  /** 新增账号；名称不合法或已存在返回 { ok: false, error } */
  function create(name) {
    const trimmed = String(name ?? "").trim();
    if (!NAME_PATTERN.test(trimmed)) return { ok: false, error: "账号名需要 1–20 个字符，不能包含空白、~ / \\ , 引号或尖括号" };
    if (RESERVED.has(trimmed)) return { ok: false, error: `「${trimmed}」是保留名称` };
    const accounts = load();
    if (accounts.some(account => account.name === trimmed)) return { ok: false, error: `账号已存在：${trimmed}` };
    accounts.push({ name: trimmed, status: "active", createdAt: new Date().toISOString() });
    save(accounts);
    return { ok: true, name: trimmed };
  }

  /** 停用 / 启用；账号不存在返回 { ok: false } */
  function setStatus(name, status) {
    if (!["active", "disabled"].includes(status)) return { ok: false, error: "状态只能是 active 或 disabled" };
    const accounts = load();
    const account = accounts.find(item => item.name === name);
    if (!account) return { ok: false, error: `账号不存在：${name}` };
    account.status = status;
    save(accounts);
    return { ok: true };
  }

  return { list, names, activeNames, has, isActive, create, setStatus };
}

module.exports = { createAccountStore };
