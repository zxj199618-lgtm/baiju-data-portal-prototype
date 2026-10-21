/**
 * 组织与权限存储：权限组（菜单 / 编辑 / 看板 / 数据表）与账号的所属权限组，保存在 DATA_DIR/org.json。
 *
 * - 还没有管理员保存过时，使用代码里的默认值（只含数据表权限的 5 个默认组 + 默认账号分组）；
 * - 管理员在界面保存后，以保存的完整快照为准，服务端据此判断数据表权限与管理员角色；
 * - 校验：名称、长度、数据表名必须真实存在；至少保留一个管理员账号（防止把自己锁在外面）。
 */

const fs = require("fs");
const path = require("path");

const ADMIN_GROUP = "门户管理员";
const UNASSIGNED = "未分配";
const ALL_TABLES = "全部数据表";

const text = (value, max) => String(value ?? "").trim().slice(0, max);
const list = (value, maxItems, maxLength) => (Array.isArray(value) ? value : []).map(item => text(item, maxLength)).filter(Boolean).slice(0, maxItems);

function createOrgStore({ dataDir, defaultGroups, defaultUserGroups, accounts: accountsInput, isActive, tableNames }) {
  const file = path.join(dataDir, "org.json");
  // 账号清单可以是数组，也可以是函数（账号可新增 / 停用，每次现取）；isActive 用来判断「至少保留一个管理员」时只数未停用的账号
  const accountList = () => (typeof accountsInput === "function" ? accountsInput() : accountsInput);
  const activeList = () => (typeof isActive === "function" ? accountList().filter(isActive) : accountList());

  const load = () => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; } };

  /** 当前生效的组与账号分组：已保存的快照优先，否则用默认值 */
  function effective() {
    const saved = load();
    const groups = Array.isArray(saved.groups) && saved.groups.length ? saved.groups : defaultGroups.map(group => ({ ...group }));
    const userGroups = { ...defaultUserGroups, ...(saved.userGroups || {}) };
    accountList().forEach(name => { if (!userGroups[name]) userGroups[name] = UNASSIGNED; });
    return { groups, userGroups, customized: Array.isArray(saved.groups) && saved.groups.length > 0 };
  }

  const groupOf = name => effective().userGroups[name] || UNASSIGNED;
  const isAdmin = name => groupOf(name) === ADMIN_GROUP;

  /** 某账号可用的数据表：账号所属组的 tables，含「全部数据表」时展开为全部 */
  function tablesOf(name) {
    const { groups, userGroups } = effective();
    const group = groups.find(item => item.name === userGroups[name]);
    if (!group) return [];
    return group.tables.includes(ALL_TABLES) ? [...tableNames] : group.tables.filter(table => tableNames.includes(table));
  }

  /**
   * 保存快照。input: { groups?: [...], userGroups?: { 账号: 组名 } }；只传其中之一也可以。
   * 返回 { ok: true } 或 { ok: false, error }。
   */
  function save(input) {
    const current = effective();
    let groups = current.groups;
    if (input.groups !== undefined) {
      if (!Array.isArray(input.groups) || !input.groups.length || input.groups.length > 50) return { ok: false, error: "权限组数量需要在 1 到 50 之间" };
      const names = new Set();
      groups = [];
      for (const raw of input.groups) {
        const name = text(raw?.name, 30);
        if (!name) return { ok: false, error: "权限组名称不能为空" };
        if (name === UNASSIGNED) return { ok: false, error: `「${UNASSIGNED}」是保留名称` };
        if (names.has(name)) return { ok: false, error: `权限组名称重复：${name}` };
        names.add(name);
        const tables = list(raw?.tables, 100, 60);
        const unknown = tables.filter(table => table !== ALL_TABLES && !tableNames.includes(table));
        if (unknown.length) return { ok: false, error: `权限组「${name}」包含未知数据表：${unknown.join("、")}` };
        groups.push({
          name, desc: text(raw?.desc, 200), status: text(raw?.status, 10) || "启用",
          menus: list(raw?.menus, 200, 40), menuEdits: list(raw?.menuEdits, 200, 40), boards: list(raw?.boards, 300, 80), tables
        });
      }
    }

    const userGroups = { ...current.userGroups };
    if (input.userGroups !== undefined) {
      if (!input.userGroups || typeof input.userGroups !== "object") return { ok: false, error: "账号分组格式不正确" };
      for (const [name, group] of Object.entries(input.userGroups)) {
        if (!accountList().includes(name)) continue; // 非网关账号（界面里的演示成员）不由服务端管理
        const groupName = text(group, 30);
        if (groupName !== UNASSIGNED && !groups.some(item => item.name === groupName)) return { ok: false, error: `账号「${name}」的权限组不存在：${groupName}` };
        userGroups[name] = groupName;
      }
    }
    // 删掉了某个组时，原来属于它的账号落到「未分配」
    accountList().forEach(name => { if (userGroups[name] !== UNASSIGNED && !groups.some(item => item.name === userGroups[name])) userGroups[name] = UNASSIGNED; });

    if (!activeList().some(name => userGroups[name] === ADMIN_GROUP) || !groups.some(item => item.name === ADMIN_GROUP)) {
      return { ok: false, error: `至少需要保留一个「${ADMIN_GROUP}」账号，否则没人能再管理系统` };
    }

    // 只有管理员真正提交过权限组（或之前已保存过）才落盘 groups：否则默认组没有菜单信息，会被误当成「已定制」
    const persistedGroups = input.groups !== undefined ? groups : load().groups;
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ groups: persistedGroups, userGroups, updatedAt: new Date().toISOString() }, null, 2));
    fs.renameSync(tmp, file);
    return { ok: true };
  }

  return { effective, groupOf, isAdmin, tablesOf, save };
}

module.exports = { createOrgStore, ADMIN_GROUP, UNASSIGNED, ALL_TABLES };
