/**
 * 看板存储：看板列表、分类、每个人的收藏，保存在 DATA_DIR/boards.json。
 *
 * 规则集中在这里（网关只负责转发与鉴权）：
 *  - 谁能看到哪些看板：门户管理员全部；其他人 = 所在权限组授权的看板（看板名 / 分类名 / 「全部看板」）∪ 看板上直接授权的「可查看用户」。
 *  - 谁能改：门户管理员，或所在权限组 menuEdits 含「看板管理」。
 *  - 编辑者只能提交自己看得到的那部分；他看不到的看板保持原样，不会被整份覆盖冲掉。
 *  - 自定义看板的地址（可能带访问密钥）只随「看得到该看板」的人返回，不写在前端代码里。
 *  - 还没人保存过时 saved=false，由前端把当前默认看板整份交上来作为初始数据。
 */
const fs = require("node:fs");
const path = require("node:path");

const ALL_BOARDS = "全部看板";
const EDIT_MENU = "看板管理";
const STATUSES = ["已上线", "已下线"];
const TYPES = ["quickbi", "custom"];
const MAX_BOARDS = 500;
const MAX_CATEGORIES = 50;

const text = (value, max) => String(value ?? "").trim().slice(0, max);
const list = (value, max, each = 60) => (Array.isArray(value) ? [...new Set(value.map(item => text(item, each)).filter(Boolean))].slice(0, max) : []);
const nowText = () => new Date().toISOString().replace("T", " ").slice(0, 16);

function createBoardStore({ dataDir, orgStore, isAdmin }) {
  const file = path.join(dataDir, "boards.json");
  const load = () => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; } };
  const persist = data => {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  };
  const admin = name => (typeof isAdmin === "function" ? isAdmin(name) : orgStore.isAdmin(name));

  function state() {
    const saved = load();
    return {
      saved: Array.isArray(saved.boards),
      rev: Number(saved.rev) || 0,
      boards: Array.isArray(saved.boards) ? saved.boards : [],
      categories: Array.isArray(saved.categories) ? saved.categories : [],
      favorites: saved.favorites && typeof saved.favorites === "object" ? saved.favorites : {}
    };
  }

  function groupOf(name) {
    const { groups, userGroups } = orgStore.effective();
    return groups.find(group => group.name === userGroups[name]) || null;
  }

  function canView(name, board, group = groupOf(name)) {
    if (admin(name)) return true;
    const grants = Array.isArray(group?.boards) ? group.boards : [];
    if (grants.includes(ALL_BOARDS) || grants.includes(board.name) || grants.includes(board.category)) return true;
    return Array.isArray(board.users) && board.users.includes(name);
  }

  const canEdit = name => admin(name) || Boolean(groupOf(name)?.menuEdits?.includes(EDIT_MENU));

  function view(name) {
    const current = state();
    const group = groupOf(name);
    const boards = current.boards.filter(board => canView(name, board, group));
    const visibleIds = new Set(boards.map(board => board.quickBiId));
    const favorites = (current.favorites[name] || []).filter(id => visibleIds.has(id));
    return { saved: current.saved, rev: current.rev, canEdit: canEdit(name), categories: current.categories, boards, favorites };
  }

  /** 把一条看板整理成规范形态；返回 { ok, value } 或 { ok:false, error } */
  function normalizeBoard(raw, categories, previous) {
    const name = text(raw?.name, 60);
    const quickBiId = text(raw?.quickBiId, 40);
    if (!name) return { ok: false, error: "看板名称不能为空" };
    if (!quickBiId || !/^[A-Za-z0-9_-]+$/.test(quickBiId)) return { ok: false, error: `看板「${name}」的编号只能包含字母、数字、下划线和连字符` };
    const category = text(raw?.category, 40);
    if (!category || !categories.includes(category)) return { ok: false, error: `看板「${name}」的分类不存在` };
    const type = TYPES.includes(raw?.type) ? raw.type : "quickbi";
    const status = STATUSES.includes(raw?.status) ? raw.status : "已上线";
    let url = "";
    if (type === "custom") {
      url = text(raw?.url, 2000);
      if (!/^https?:\/\/[^\s]+$/i.test(url)) return { ok: false, error: `自定义看板「${name}」需要 http(s) 开头的地址` };
    }
    const value = {
      category, name, desc: text(raw?.desc, 300), quickBiId, owner: text(raw?.owner, 40),
      groups: list(raw?.groups, 50), users: list(raw?.users, 200), status, type, url
    };
    // 内容没变就保留原更新时间；变了由服务端记时间，不信任客户端传的
    const same = previous && JSON.stringify({ ...previous, updatedAt: undefined }) === JSON.stringify({ ...value, updatedAt: undefined });
    value.updatedAt = same ? previous.updatedAt : nowText();
    return { ok: true, value };
  }

  /**
   * 保存快照。input: { boards, categories, rev? }。
   * 编辑者只管他看得到的那部分；返回 { ok:true, rev } 或 { ok:false, error, conflict? }。
   */
  function save(name, input) {
    if (!canEdit(name)) return { ok: false, error: "需要「看板管理」编辑权限" };
    const current = state();
    if (input?.rev !== undefined && Number(input.rev) !== current.rev) return { ok: false, conflict: true, error: "看板配置已被他人修改，请刷新后再改" };
    if (!Array.isArray(input?.boards) || input.boards.length > MAX_BOARDS) return { ok: false, error: `看板数量需要在 0 到 ${MAX_BOARDS} 之间` };
    if (!Array.isArray(input?.categories) || input.categories.length > MAX_CATEGORIES) return { ok: false, error: `分类数量需要在 0 到 ${MAX_CATEGORIES} 之间` };

    const group = groupOf(name);
    const visible = current.boards.filter(board => canView(name, board, group));
    const visibleIds = new Set(visible.map(board => board.quickBiId));
    const hidden = current.boards.filter(board => !visibleIds.has(board.quickBiId));
    const hiddenIds = new Set(hidden.map(board => board.quickBiId));

    const categories = list(input.categories, MAX_CATEGORIES, 40);
    // 他看不到的看板用到的分类必须保留
    hidden.forEach(board => { if (!categories.includes(board.category)) categories.push(board.category); });

    const names = new Set(hidden.map(board => board.name));
    const incoming = [];
    const previousById = new Map(current.boards.map(board => [board.quickBiId, board]));
    for (const raw of input.boards) {
      const id = text(raw?.quickBiId, 40);
      if (hiddenIds.has(id)) return { ok: false, error: "包含你没有权限查看的看板，无法修改" };
      const result = normalizeBoard(raw, categories, previousById.get(id));
      if (!result.ok) return result;
      const board = result.value;
      if (names.has(board.name)) return { ok: false, error: `看板名称重复：${board.name}` };
      if (incoming.some(item => item.quickBiId === board.quickBiId)) return { ok: false, error: `看板编号重复：${board.quickBiId}` };
      names.add(board.name);
      incoming.push(board);
    }

    const boards = [...incoming, ...hidden];
    const rev = current.rev + 1;
    // 被删掉的看板，从所有人的收藏里一并清掉
    const alive = new Set(boards.map(board => board.quickBiId));
    const favorites = {};
    for (const [user, ids] of Object.entries(current.favorites)) {
      const kept = ids.filter(id => alive.has(id));
      if (kept.length) favorites[user] = kept;
    }
    persist({ boards, categories, favorites, rev, updatedAt: new Date().toISOString() });
    return { ok: true, rev };
  }

  /** 保存某个人自己的收藏：只能收藏他看得到的看板 */
  function setFavorites(name, ids) {
    if (!Array.isArray(ids)) return { ok: false, error: "收藏需要是数组" };
    const current = state();
    if (!current.saved) return { ok: true, favorites: [] }; // 还没有任何看板（尚未初始化），不落盘
    const group = groupOf(name);
    const visibleIds = new Set(current.boards.filter(board => canView(name, board, group)).map(board => board.quickBiId));
    const next = [...new Set(ids.map(id => text(id, 40)))].filter(id => visibleIds.has(id));
    const saved = load();
    const favorites = { ...current.favorites };
    if (next.length) favorites[name] = next; else delete favorites[name];
    persist({ ...saved, boards: current.boards, categories: current.categories, favorites, rev: current.rev });
    return { ok: true, favorites: next };
  }

  /** 看板详情（访问记录要用到看板名称与分类）；看不到则返回 null */
  function boardFor(name, quickBiId) {
    const group = groupOf(name);
    return state().boards.find(board => board.quickBiId === quickBiId && canView(name, board, group)) || null;
  }

  /** 权限组里可以授权的看板名单：看板名 + 分类名 + 「全部看板」；还没初始化（没有任何看板）时返回 null，表示不校验 */
  function grantNames() {
    const current = state();
    if (!current.saved) return null;
    return new Set([ALL_BOARDS, ...current.boards.map(board => board.name), ...current.categories]);
  }

  return { view, save, setFavorites, boardFor, canEdit, grantNames };
}

module.exports = { createBoardStore, ALL_BOARDS, EDIT_MENU };
