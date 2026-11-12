/**
 * 业务线与知识库存储：业务线、表归属（tableLines）、业务线知识库、表知识库、表关联，保存在 DATA_DIR/knowledge.json。
 *
 * - 还没有保存过（或文件损坏）时使用代码里的种子；「公共」业务线由 store 自动补在第一位，不可删除、不可改名；
 * - saveBusinessLines 是整份快照替换：先在内存里算出新状态并完整校验，通过后一次写文件，rev 加 1；
 * - 一张表最多属于一个业务线；没有记录的表视为「未分组」。
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PUBLIC = "公共";
const PUBLIC_ID = "line-public";
const RELATION_TYPES = ["1:1", "1:N", "N:1"];
const MAX_LINES = 50;
const MAX_LINE_KNOWLEDGE = 20000;
const MAX_TABLE_KNOWLEDGE = 10000;
const MAX_RELATIONS = 200;
const MAX_NAME = 30;
const MAX_NOTE = 200;

const text = (value, max) => String(value ?? "").trim().slice(0, max);
const newId = prefix => `${prefix}-${crypto.randomBytes(6).toString("hex")}`;
const isObject = value => value && typeof value === "object" && !Array.isArray(value);

function knowledgeOf(raw) {
  if (!isObject(raw) || typeof raw.markdown !== "string" || !raw.markdown) return null;
  return { markdown: raw.markdown, updatedBy: text(raw.updatedBy, 60), updatedAt: text(raw.updatedAt, 40) };
}

function relationOf(raw) {
  if (!isObject(raw)) return null;
  return {
    id: text(raw.id, 60),
    left: { table: text(raw.left?.table, 80), field: text(raw.left?.field, 80) },
    right: { table: text(raw.right?.table, 80), field: text(raw.right?.field, 80) },
    type: text(raw.type, 10),
    note: text(raw.note, MAX_NOTE)
  };
}

function createKnowledgeStore({ dataDir, tableNames, fieldsOf, defaults = {} }) {
  const file = path.join(dataDir, "knowledge.json");
  const load = () => { try { const data = JSON.parse(fs.readFileSync(file, "utf8")); return isObject(data) ? data : {}; } catch { return {}; } };

  /** 种子：默认业务线名称 → 带 id 的业务线（「公共」在第一位） */
  function seedLines() {
    const names = (Array.isArray(defaults.businessLines) ? defaults.businessLines : []).map(name => text(name, MAX_NAME)).filter(name => name && name !== PUBLIC);
    return [PUBLIC, ...new Set(names)].map((name, index) => ({
      id: name === PUBLIC ? PUBLIC_ID : `line-seed-${index}`, name, order: index, knowledge: null, relations: []
    }));
  }

  function normalizeLines(raw) {
    const result = [];
    const seen = new Set();
    for (const item of Array.isArray(raw) ? raw : []) {
      const name = text(item?.name, MAX_NAME);
      const id = text(item?.id, 60);
      if (!name || !id || seen.has(id) || result.some(line => line.name === name)) continue;
      seen.add(id);
      result.push({
        id, name, order: 0, knowledge: knowledgeOf(item.knowledge),
        relations: (Array.isArray(item.relations) ? item.relations : []).map(relationOf).filter(Boolean).slice(0, MAX_RELATIONS)
      });
    }
    // 「公共」必须在、且排第一
    const pub = result.find(line => line.name === PUBLIC) || { id: PUBLIC_ID, name: PUBLIC, order: 0, knowledge: null, relations: [] };
    const ordered = [pub, ...result.filter(line => line !== pub)];
    ordered.forEach((line, index) => { line.order = index; });
    return ordered;
  }

  /** 当前生效的状态：已保存的快照优先，否则用种子；对不存在的表 / 业务线容错丢弃 */
  function effective() {
    const saved = load();
    const hasSaved = Array.isArray(saved.businessLines);
    const businessLines = normalizeLines(hasSaved ? saved.businessLines : seedLines());
    const tables = new Set(tableNames());
    const names = new Set(businessLines.map(line => line.name));
    const rawLines = hasSaved ? saved.tableLines : defaults.tableLines;
    const tableLines = {};
    for (const [table, line] of Object.entries(isObject(rawLines) ? rawLines : {})) {
      if (tables.has(table) && names.has(line)) tableLines[table] = line;
    }
    const rawKnowledge = hasSaved ? saved.tableKnowledge : defaults.tableKnowledge;
    const tableKnowledge = {};
    for (const [table, entry] of Object.entries(isObject(rawKnowledge) ? rawKnowledge : {})) {
      const knowledge = knowledgeOf(entry);
      if (tables.has(table) && knowledge) tableKnowledge[table] = knowledge;
    }
    return { rev: Number.isInteger(saved.rev) ? saved.rev : 0, businessLines, tableLines, tableKnowledge };
  }

  function write(state) {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2));
    fs.renameSync(tmp, file);
  }

  const lineOf = table => effective().tableLines[table] || "";
  const tablesOfLine = name => Object.entries(effective().tableLines).filter(([, line]) => line === name).map(([table]) => table);

  function validateRelations(relations, lineName, usedIds) {
    if (relations !== undefined && !Array.isArray(relations)) return { error: `业务线「${lineName}」的关联格式不正确` };
    const list = relations || [];
    if (list.length > MAX_RELATIONS) return { error: `业务线「${lineName}」的关联最多 ${MAX_RELATIONS} 条` };
    const result = [];
    for (const raw of list) {
      const item = relationOf(raw);
      if (!item) return { error: `业务线「${lineName}」的关联格式不正确` };
      if (!RELATION_TYPES.includes(item.type)) return { error: `业务线「${lineName}」的关系类型只能是 ${RELATION_TYPES.join(" / ")}` };
      for (const side of [item.left, item.right]) {
        if (!side.table || !tableNames().includes(side.table)) return { error: `业务线「${lineName}」的关联里数据表不存在：${side.table || "（空）"}` };
        if (!side.field || !fieldsOf(side.table).includes(side.field)) return { error: `业务线「${lineName}」的关联里字段不存在于「${side.table}」：${side.field || "（空）"}` };
      }
      if (!item.id) item.id = newId("rel");
      if (usedIds.has(item.id)) return { error: `关联 id 重复：${item.id}` };
      usedIds.add(item.id);
      result.push(item);
    }
    return { value: result };
  }

  /**
   * 保存业务线快照。input: { rev, businessLines: [{ id?, name, knowledge?: string | { markdown }, relations? }], tableLines?: { 表名: 业务线名 | "" } }。
   * tableLines 是对已存归属的覆盖：没给出的表保持原归属（原归属指向被改名的业务线时跟着改名）；值为 "" 表示改为未分组。
   */
  function saveBusinessLines(input, actor) {
    const current = effective();
    if (!isObject(input)) return { ok: false, error: "保存内容格式不正确" };
    if (input.rev !== current.rev) return { ok: false, conflict: true, error: "业务线配置已被其他人更新，请刷新后重试" };
    const payload = input.businessLines;
    if (!Array.isArray(payload) || !payload.length) return { ok: false, error: "业务线不能为空" };
    if (payload.length > MAX_LINES) return { ok: false, error: `业务线最多 ${MAX_LINES} 个（含「${PUBLIC}」）` };

    const stored = current.businessLines;
    const storedPublic = stored.find(line => line.name === PUBLIC);
    const names = new Set();
    const ids = new Set();
    const usedRelationIds = new Set();
    const next = [];
    for (const raw of payload) {
      const name = text(raw?.name, MAX_NAME);
      if (!name) return { ok: false, error: "业务线名称不能为空" };
      if (names.has(name)) return { ok: false, error: `业务线名称重复：${name}` };
      names.add(name);
      let id = text(raw?.id, 60);
      if (!id && name === PUBLIC) id = storedPublic.id;
      if (!id) id = newId("line");
      if (ids.has(id)) return { ok: false, error: `业务线 id 重复：${id}` };
      ids.add(id);
      const old = stored.find(line => line.id === id);
      if (id === storedPublic.id && name !== PUBLIC) return { ok: false, error: `「${PUBLIC}」是内置业务线，不能改名` };
      if (name === PUBLIC && id !== storedPublic.id) return { ok: false, error: `「${PUBLIC}」是内置业务线，名称不能重复使用` };

      const markdown = typeof raw?.knowledge === "string" ? raw.knowledge : (isObject(raw?.knowledge) && typeof raw.knowledge.markdown === "string" ? raw.knowledge.markdown : "");
      if (markdown.length > MAX_LINE_KNOWLEDGE) return { ok: false, error: `业务线「${name}」的知识库不能超过 ${MAX_LINE_KNOWLEDGE} 字` };
      let knowledge = null;
      if (markdown.trim()) knowledge = old?.knowledge && old.knowledge.markdown === markdown ? old.knowledge : { markdown, updatedBy: text(actor, 60), updatedAt: new Date().toISOString() };

      const relations = validateRelations(raw?.relations, name, usedRelationIds);
      if (relations.error) return { ok: false, error: relations.error };
      next.push({ id, name, order: next.length, knowledge, relations: relations.value });
    }
    if (!storedPublic || !next.some(line => line.id === storedPublic.id)) return { ok: false, error: `「${PUBLIC}」是内置业务线，不能删除` };
    // 「公共」固定排第一
    next.sort((a, b) => (a.id === storedPublic.id ? -1 : b.id === storedPublic.id ? 1 : a.order - b.order));
    next.forEach((line, index) => { line.order = index; });

    // 表归属：已存归属 + 改名同步 + payload 覆盖
    const tableSet = new Set(tableNames());
    const overrides = isObject(input.tableLines) ? input.tableLines : {};
    const renamed = new Map(); // 旧名 → 新名
    const removed = new Set(); // 被删除业务线的旧名
    for (const line of stored) {
      const after = next.find(item => item.id === line.id);
      if (!after) removed.add(line.name);
      else if (after.name !== line.name) renamed.set(line.name, after.name);
    }
    const tableLines = {};
    const stuck = [];
    for (const [table, line] of Object.entries(current.tableLines)) {
      if (Object.prototype.hasOwnProperty.call(overrides, table)) continue;
      if (removed.has(line)) { stuck.push(table); continue; }
      tableLines[table] = renamed.get(line) || line;
    }
    if (stuck.length) return { ok: false, error: `业务线下还有数据表，请先迁出：${stuck.join("、")}` };
    for (const [table, line] of Object.entries(overrides)) {
      if (!tableSet.has(table)) return { ok: false, error: `数据表不存在：${table}` };
      if (line === "" || line === null) continue; // 改为未分组
      if (typeof line !== "string" || !names.has(line)) return { ok: false, error: `数据表「${table}」指向的业务线不存在：${line}` };
      tableLines[table] = line;
    }

    const rev = current.rev + 1;
    write({ rev, businessLines: next, tableLines, tableKnowledge: current.tableKnowledge });
    return { ok: true, rev };
  }

  function saveTableKnowledge(table, markdown, actor) {
    if (!tableNames().includes(table)) return { ok: false, error: `数据表不存在：${table}` };
    const body = typeof markdown === "string" ? markdown : "";
    if (body.length > MAX_TABLE_KNOWLEDGE) return { ok: false, error: `表知识库不能超过 ${MAX_TABLE_KNOWLEDGE} 字` };
    const current = effective();
    const tableKnowledge = { ...current.tableKnowledge };
    const entry = { markdown: body, updatedBy: text(actor, 60), updatedAt: new Date().toISOString() };
    if (body.trim()) tableKnowledge[table] = entry; else delete tableKnowledge[table];
    // 种子是首次启动的默认值：写盘时把当前状态完整固化下来
    write({ rev: current.rev, businessLines: current.businessLines, tableLines: current.tableLines, tableKnowledge });
    return { ok: true, entry };
  }

  return { PUBLIC, effective, saveBusinessLines, saveTableKnowledge, lineOf, tablesOfLine };
}

module.exports = { createKnowledgeStore, PUBLIC, RELATION_TYPES };
