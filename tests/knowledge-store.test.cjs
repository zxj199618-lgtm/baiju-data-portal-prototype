/**
 * 业务线知识库存储测试（单元）。
 * 运行：node --test tests/knowledge-store.test.cjs
 */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createKnowledgeStore } = require("../scripts/knowledge-store.cjs");

const TABLES = ["表甲", "表乙", "表丙"];
const fieldsOf = table => (table === "表甲" ? ["user_id", "cost"] : table === "表乙" ? ["user_id", "name"] : []);
const SEED_KNOWLEDGE = { markdown: "表甲说明", updatedBy: "系统", updatedAt: "2026-01-01T00:00:00.000Z" };

describe("知识库存储（单元）", () => {
  let dir, store;
  const make = () => createKnowledgeStore({
    dataDir: dir, tableNames: () => TABLES, fieldsOf,
    defaults: { businessLines: ["保险", "权益"], tableLines: { 表甲: "保险" }, tableKnowledge: { 表甲: SEED_KNOWLEDGE } }
  });
  test.beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "knowledge-unit-")); store = make(); });
  test.afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const lines = () => store.effective().businessLines.map(line => ({ id: line.id, name: line.name, knowledge: line.knowledge?.markdown ?? "", relations: line.relations }));
  const save = (patch = {}, tableLines = {}) => {
    const cur = store.effective();
    return store.saveBusinessLines({ rev: cur.rev, businessLines: patch.businessLines || lines(), tableLines }, "tester");
  };
  const rel = (extra = {}) => ({ id: "r1", left: { table: "表甲", field: "user_id" }, right: { table: "表乙", field: "user_id" }, type: "1:N", note: "", ...extra });

  test("没保存过时用种子：自动补「公共」，种子表知识库可读", () => {
    const eff = store.effective();
    assert.equal(eff.businessLines[0].name, "公共");
    assert.deepEqual(eff.businessLines.map(l => l.name), ["公共", "保险", "权益"]);
    assert.equal(eff.tableKnowledge["表甲"].markdown, "表甲说明");
    assert.equal(store.lineOf("表甲"), "保险");
    assert.equal(store.lineOf("表乙"), "");
    assert.deepEqual(store.tablesOfLine("保险"), ["表甲"]);
    assert.equal(store.PUBLIC, "公共");
  });

  test("保存后立即生效并落盘到 knowledge.json，rev 加 1", () => {
    const before = store.effective();
    const list = lines().map(l => l.name === "保险" ? { ...l, knowledge: "保险业务说明", relations: [rel()] } : l);
    const result = save({ businessLines: list }, { 表乙: "权益" });
    assert.deepEqual(result, { ok: true, rev: before.rev + 1 });
    const eff = store.effective();
    assert.equal(eff.rev, before.rev + 1);
    assert.equal(eff.businessLines.find(l => l.name === "保险").knowledge.markdown, "保险业务说明");
    assert.equal(eff.businessLines.find(l => l.name === "保险").knowledge.updatedBy, "tester");
    assert.equal(eff.businessLines.find(l => l.name === "保险").relations[0].type, "1:N");
    assert.equal(store.lineOf("表乙"), "权益");
    assert.equal(store.lineOf("表甲"), "保险");
    const disk = JSON.parse(fs.readFileSync(path.join(dir, "knowledge.json"), "utf8"));
    assert.equal(disk.rev, before.rev + 1);
    assert.equal(make().effective().tableLines["表乙"], "权益");
  });

  test("校验：重名、空名、超过 50 个、知识库超 20000 字、表知识库超 10000 字、关联超 200 条都被拒绝", () => {
    const base = lines();
    let r = save({ businessLines: [...base, { name: "保险" }] });
    assert.equal(r.ok, false); assert.match(r.error, /重复|重名/);
    r = save({ businessLines: [...base, { name: "  " }] });
    assert.equal(r.ok, false); assert.match(r.error, /名称/);
    const many = [...base];
    for (let i = 0; many.length < 51; i++) many.push({ name: `线${i}` });
    r = save({ businessLines: many });
    assert.equal(r.ok, false); assert.match(r.error, /50/);
    r = save({ businessLines: base.map(l => l.name === "保险" ? { ...l, knowledge: "字".repeat(20001) } : l) });
    assert.equal(r.ok, false); assert.match(r.error, /20000/);
    const ok = save({ businessLines: base.map(l => l.name === "保险" ? { ...l, knowledge: "字".repeat(20000) } : l) });
    assert.equal(ok.ok, true);
    r = store.saveTableKnowledge("表甲", "字".repeat(10001), "tester");
    assert.equal(r.ok, false); assert.match(r.error, /10000/);
    const manyRel = Array.from({ length: 201 }, (_, i) => rel({ id: `r${i}` }));
    r = save({ businessLines: lines().map(l => l.name === "保险" ? { ...l, relations: manyRel } : l) });
    assert.equal(r.ok, false); assert.match(r.error, /200/);
  });

  test("校验：关联的表或字段不存在、关系类型不在枚举内、关联 id 重复都被拒绝", () => {
    const withRels = relations => save({ businessLines: lines().map(l => l.name === "保险" ? { ...l, relations } : l) });
    let r = withRels([rel({ left: { table: "不存在的表", field: "user_id" } })]);
    assert.equal(r.ok, false); assert.match(r.error, /不存在/);
    r = withRels([rel({ right: { table: "表乙", field: "没这个字段" } })]);
    assert.equal(r.ok, false); assert.match(r.error, /字段/);
    r = withRels([rel({ type: "N:N" })]);
    assert.equal(r.ok, false); assert.match(r.error, /关系类型/);
    r = withRels([rel(), rel()]);
    assert.equal(r.ok, false); assert.match(r.error, /id/);
    // 跨业务线也不能重复
    r = save({ businessLines: lines().map(l => l.name === "保险" ? { ...l, relations: [rel()] } : l.name === "权益" ? { ...l, relations: [rel()] } : l) });
    assert.equal(r.ok, false); assert.match(r.error, /id/);
  });

  test("「公共」不可删除、不可改名", () => {
    const pub = lines()[0];
    let r = save({ businessLines: lines().filter(l => l.name !== "公共") });
    assert.equal(r.ok, false); assert.match(r.error, /公共/);
    r = save({ businessLines: lines().map(l => l.id === pub.id ? { ...l, name: "通用" } : l) });
    assert.equal(r.ok, false); assert.match(r.error, /公共/);
    r = save({ businessLines: [...lines(), { name: "公共" }] });
    assert.equal(r.ok, false);
  });

  test("改名同步：同一个 id 改名后，原来属于旧名的表自动归到新名", () => {
    const ins = lines().find(l => l.name === "保险");
    const r = save({ businessLines: lines().map(l => l.id === ins.id ? { ...l, name: "保险业务" } : l) });
    assert.equal(r.ok, true);
    assert.equal(store.lineOf("表甲"), "保险业务");
    assert.deepEqual(store.tablesOfLine("保险业务"), ["表甲"]);
  });

  test("删除保护：删除仍有表的业务线被拒绝，错误里列出表名", () => {
    let r = save({ businessLines: lines().filter(l => l.name !== "保险") });
    assert.equal(r.ok, false); assert.match(r.error, /表甲/);
    // 先迁出（分到别的业务线）后可删除
    r = save({ businessLines: lines().filter(l => l.name !== "保险") }, { 表甲: "权益" });
    assert.equal(r.ok, true);
    assert.equal(store.lineOf("表甲"), "权益");
  });

  test("rev 不一致返回 conflict: true", () => {
    const r = store.saveBusinessLines({ rev: store.effective().rev + 5, businessLines: lines(), tableLines: {} }, "tester");
    assert.equal(r.ok, false);
    assert.equal(r.conflict, true);
  });

  test("tableLines 的值不是已有业务线时被拒绝；表名不存在时被拒绝", () => {
    let r = save({}, { 表乙: "没有这条线" });
    assert.equal(r.ok, false); assert.match(r.error, /业务线/);
    r = save({}, { 不存在的表: "保险" });
    assert.equal(r.ok, false); assert.match(r.error, /不存在/);
  });

  test("表知识库保存：返回条目并持久化，未知表被拒绝", () => {
    const r = store.saveTableKnowledge("表乙", "表乙说明", "小王");
    assert.equal(r.ok, true);
    assert.equal(r.entry.markdown, "表乙说明");
    assert.equal(r.entry.updatedBy, "小王");
    assert.equal(make().effective().tableKnowledge["表乙"].markdown, "表乙说明");
    assert.equal(store.saveTableKnowledge("没有的表", "x", "小王").ok, false);
  });

  test("knowledge.json 损坏时按种子启动，不抛错", () => {
    fs.writeFileSync(path.join(dir, "knowledge.json"), "{坏的");
    const eff = make().effective();
    assert.equal(eff.businessLines[0].name, "公共");
    assert.equal(eff.tableKnowledge["表甲"].markdown, "表甲说明");
  });

  /** 临时替换 console.warn，收集告警文本 */
  const captureWarn = run => {
    const warnings = [];
    const original = console.warn;
    console.warn = (...args) => warnings.push(args.map(String).join(" "));
    try { run(); } finally { console.warn = original; }
    return warnings;
  };

  test("knowledge.json 损坏：告警含文件路径、原文件先备份为 knowledge.json.corrupt-<时间>（只备份一次），之后保存正常", () => {
    const file = path.join(dir, "knowledge.json");
    const bad = Buffer.from("{broken 坏的");
    fs.writeFileSync(file, bad);
    let corrupted;
    const warnings = captureWarn(() => {
      corrupted = make();
      assert.equal(corrupted.effective().rev, 0);
      assert.equal(corrupted.effective().businessLines[0].name, "公共");
    });
    assert.equal(warnings.length, 1, `只告警一次：${warnings}`);
    assert.ok(warnings[0].includes(file), "告警应含文件路径");
    assert.match(warnings[0], /种子/);
    const backups = fs.readdirSync(dir).filter(name => name.startsWith("knowledge.json.corrupt-"));
    assert.equal(backups.length, 1);
    assert.deepEqual(fs.readFileSync(path.join(dir, backups[0])), bad, "备份应是原始字节");
    const saved = captureWarn(() => {
      const cur = corrupted.effective();
      const result = corrupted.saveBusinessLines({ rev: cur.rev, businessLines: cur.businessLines, tableLines: {} }, "tester");
      assert.equal(result.ok, true);
    });
    assert.deepEqual(saved, [], "保存时不再告警");
    assert.equal(make().effective().rev, 1, "保存后文件可正常读回");
    assert.equal(fs.readdirSync(dir).filter(name => name.startsWith("knowledge.json.corrupt-")).length, 1, "备份不被覆盖、不重复生成");
  });

  test("knowledge.json 不存在（首次启动）不告警、不生成备份", () => {
    const warnings = captureWarn(() => { assert.equal(make().effective().rev, 0); });
    assert.deepEqual(warnings, []);
    assert.equal(fs.readdirSync(dir).filter(name => name.startsWith("knowledge.json.corrupt-")).length, 0);
  });

  test("relationIssue：表或字段不存在、表不在该业务线 ∪「公共」时给出原因；正常关联为空", () => {
    const tableLines = { 表甲: "保险", 表乙: "公共" };
    assert.equal(store.relationIssue(rel(), "保险", tableLines), "");
    assert.match(store.relationIssue(rel(), "权益", tableLines), /表甲.*不在/);
    assert.match(store.relationIssue(rel({ left: { table: "表甲", field: "nope" } }), "保险", tableLines), /字段.*nope/);
    assert.match(store.relationIssue(rel({ right: { table: "没有的表", field: "x" } }), "保险", tableLines), /没有的表.*不存在/);
    assert.match(store.relationIssue(rel(), "保险", { 表乙: "公共" }), /表甲.*不在/, "未分组的表也算不在");
    // 「公共」的关联：两张表在同一业务线或「公共」即可被使用
    assert.equal(store.relationIssue(rel(), "公共", tableLines), "");
    assert.match(store.relationIssue(rel(), "公共", { 表甲: "保险", 表乙: "权益" }), /不在同一业务线/);
    assert.match(store.relationIssue(rel(), "公共", { 表乙: "公共" }), /表甲.*未分组/);
  });
});
