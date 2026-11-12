/**
 * 业务线上下文包与工具测试。
 * 运行：node --test tests/knowledge-tools.test.cjs
 */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { resolveLine, buildContextPack, createKnowledgeTools } = require("../scripts/knowledge-tools.cjs");
const { createAnalysisToolkit } = require("../scripts/analysis-tools.cjs");

const kn = markdown => ({ markdown, updatedBy: "t", updatedAt: "2026-01-01T00:00:00.000Z" });
const rel = (id, lt, lf, rt, rf, type = "N:1") => ({ id, left: { table: lt, field: lf }, right: { table: rt, field: rf }, type, note: "" });
const field = (name, type = "STRING") => ({ name, type, comment: "" });

const BASE = ["消耗表", "用户表", "公共维表", "别线事实", "无权限表"];
const EFF = {
  rev: 1,
  businessLines: [
    { id: "pub", name: "公共", order: 0, knowledge: kn("公共口径：金额单位为元"), relations: [rel("rp", "消耗表", "channel", "公共维表", "channel")] },
    { id: "a", name: "保险", order: 1, knowledge: kn("保险业务说明\n含 secret_col 的口径行\n正常行"), relations: [rel("ra", "消耗表", "user_id", "用户表", "user_id")] },
    { id: "b", name: "权益", order: 2, knowledge: kn("权益说明"), relations: [rel("rb", "别线事实", "k", "公共维表", "k")] }
  ],
  tableLines: { 消耗表: "保险", 用户表: "保险", 公共维表: "公共", 别线事实: "权益", 无权限表: "保险" },
  tableKnowledge: { 消耗表: kn("消耗表知识\n字段 secret_col 的含义\n结尾"), 用户表: kn("用户表知识") }
};
const store = { PUBLIC: "公共", effective: () => EFF };

const defs = [
  { cnName: "消耗表", desc: "消耗明细", fields: [field("user_id"), field("channel"), field("cost", "DECIMAL(10,2)"), field("dt")], agg: { dateKey: "dt" } },
  { cnName: "用户表", desc: "用户维度", fields: [field("user_id"), field("city")], agg: {} },
  { cnName: "公共维表", desc: "渠道维度", fields: [field("channel"), field("k")], agg: {} },
  { cnName: "别线事实", desc: "别线", fields: [field("k"), field("v", "BIGINT")], agg: {} }
];
const ROWS = {
  消耗表: [{ user_id: "u1", channel: "c1", cost: 10, dt: "2026-01-02" }, { user_id: "u2", channel: "c2", cost: 5, dt: "2026-01-02" }],
  用户表: [{ user_id: "u1", city: "北京" }, { user_id: "u2", city: "上海" }],
  公共维表: [{ channel: "c1", k: "x" }, { channel: "c2", k: "y" }],
  别线事实: [{ k: "x", v: 1 }]
};
const rowsOf = name => ROWS[name] || [];
const allowed = ["消耗表", "用户表", "公共维表", "别线事实"];

describe("resolveLine", () => {
  test("公共 → 400；不存在 → 404；用户在其下没有任何有权限的表 → 404；正常返回的 tables 含公共表且不含无权限表", () => {
    assert.equal(resolveLine(store, "公共", allowed).ok, false);
    assert.equal(resolveLine(store, "公共", allowed).status, 400);
    assert.equal(resolveLine(store, "不存在", allowed).status, 404);
    const none = resolveLine(store, "保险", ["别线事实"]);
    assert.equal(none.status, 404);
    assert.match(none.error, /业务线下没有可用数据资产/);
    const ok = resolveLine(store, "保险", allowed);
    assert.equal(ok.ok, true);
    assert.equal(ok.line.name, "保险");
    assert.equal(ok.publicLine.name, "公共");
    assert.deepEqual([...ok.tables].sort(), ["消耗表", "用户表", "公共维表"].sort());
    assert.ok(!ok.tables.includes("无权限表"));
  });
});

describe("上下文包", () => {
  const resolved = resolveLine(store, "保险", allowed);
  const build = (extra = {}) => buildContextPack({
    line: resolved.line, publicLine: resolved.publicLine, tables: resolved.tables,
    scopedTables: defs, relations: [...resolved.line.relations, ...resolved.publicLine.relations],
    tableKnowledgeFlags: { 消耗表: true, 用户表: true }, hiddenNames: [], ...extra
  });

  test("上下文包：含业务线与公共知识库、可用表清单；无权限的表名不出现", () => {
    const pack = build();
    assert.match(pack, /业务线知识库/);
    assert.match(pack, /保险业务说明/);
    assert.match(pack, /公共知识库/);
    assert.match(pack, /公共口径/);
    assert.match(pack, /可用表清单/);
    assert.match(pack, /消耗表/);
    assert.match(pack, /消耗明细/);
    assert.match(pack, /表关联清单/);
    assert.ok(!pack.includes("无权限表"));
    assert.ok(!pack.includes("别线事实"));
  });

  test("上下文包：知识库正文里提到隐藏字段的行被替换为「（已隐藏）」", () => {
    const pack = build({ hiddenNames: ["secret_col"] });
    assert.ok(!pack.includes("secret_col"));
    assert.match(pack, /（已隐藏）/);
    assert.match(pack, /正常行/);
  });

  test("上下文包：关联一端字段被隐藏的整条关联不出现", () => {
    const trimmed = defs.map(d => (d.cnName === "用户表" ? { ...d, fields: d.fields.filter(f => f.name !== "user_id") } : d));
    const pack = build({ scopedTables: trimmed, hiddenNames: ["user_id"] });
    assert.ok(!pack.includes("用户表.user_id"));
    assert.match(pack, /公共维表\.channel/);
  });
});

describe("工具", () => {
  const resolved = resolveLine(store, "保险", allowed);
  const make = (extra = {}) => {
    const eff = { ...EFF, tableKnowledge: { ...EFF.tableKnowledge } };
    return createKnowledgeTools({ store: { PUBLIC: "公共", effective: () => eff }, resolved, scopedTables: defs, rowsOf, hiddenNames: [], ...extra });
  };
  const call = (tool, args) => tool.execute(args);

  test("get_table_knowledge：一次可取 12 张表；总字数超过预算时按点名顺序截断并在 未提供 里说明", () => {
    const names = Array.from({ length: 12 }, (_, i) => `表${i}`);
    const eff = {
      rev: 1,
      businessLines: [{ id: "pub", name: "公共", order: 0, knowledge: null, relations: [] }, { id: "a", name: "线", order: 1, knowledge: null, relations: [] }],
      tableLines: Object.fromEntries(names.map(n => [n, "线"])),
      tableKnowledge: Object.fromEntries(names.map(n => [n, kn(`${n}的知识`.padEnd(40, "。"))]))
    };
    const s = { PUBLIC: "公共", effective: () => eff };
    const r = resolveLine(s, "线", names);
    const defs12 = names.map(n => ({ cnName: n, desc: "", fields: [], agg: {} }));
    const [get] = createKnowledgeTools({ store: s, resolved: r, scopedTables: defs12, rowsOf: () => [], hiddenNames: [] });
    const all = call(get, { tables: names });
    assert.equal(all.ok, true);
    assert.equal(all.data.知识库.length, 12);
    const [cut] = createKnowledgeTools({ store: s, resolved: r, scopedTables: defs12, rowsOf: () => [], hiddenNames: [], budgetChars: 100 });
    const part = call(cut, { tables: names });
    assert.equal(part.data.知识库.length, 2);
    assert.deepEqual(part.data.知识库.map(i => i.表名), ["表0", "表1"]);
    assert.equal(part.data.未提供.length, 10);
    assert.ok(part.data.未提供.every(i => i.原因 === "超出本次字数预算"));
  });

  test("get_table_knowledge：无权限的表与不存在的表提示一致；没有表知识库的表有单独原因", () => {
    const [get] = make();
    const out = call(get, { tables: ["无权限表", "根本没有", "公共维表"] }).data;
    assert.equal(out.未提供[0].原因, out.未提供[1].原因);
    assert.equal(out.未提供[2].原因, "该表还没有知识库");
    assert.notEqual(out.未提供[0].原因, out.未提供[2].原因);
    assert.equal(out.知识库.length, 0);
  });

  test("get_table_knowledge：返回的正文同样做隐藏字段脱敏", () => {
    const [get] = make({ hiddenNames: ["secret_col"] });
    const out = call(get, { tables: ["消耗表"] }).data;
    assert.ok(!out.知识库[0].内容.includes("secret_col"));
    assert.match(out.知识库[0].内容, /（已隐藏）/);
    assert.match(out.知识库[0].内容, /结尾/);
  });

  test("query_join：只用本业务线加公共的关联；别的业务线登记的关联不可用", () => {
    const [, join] = make();
    assert.equal(join.maxChars, 12000);
    const ok = call(join, { metrics: [{ table: "消耗表", field: "cost", agg: "sum", name: "消耗" }], groupBy: [{ table: "用户表", field: "city" }, { table: "公共维表", field: "k" }] });
    assert.equal(ok.ok, true, ok.error);
    const bad = call(join, { metrics: [{ table: "别线事实", field: "v", agg: "sum" }], groupBy: [{ table: "公共维表", field: "channel" }] });
    assert.equal(bad.ok, false);
  });

  test("两个工具的 schema 名称为 get_table_knowledge / query_join，且能直接塞进 createAnalysisToolkit({ extraTools })", () => {
    const tools = make();
    assert.deepEqual(tools.map(t => t.schema.function.name), ["get_table_knowledge", "query_join"]);
    for (const t of tools) assert.match(t.schema.function.description, /关联不用自己写/);
    const toolkit = createAnalysisToolkit({ userName: "u", allowedTables: resolved.tables, tables: defs, rowsOf, extraTools: tools });
    const res = toolkit.execute("get_table_knowledge", JSON.stringify({ tables: ["消耗表"] }));
    assert.equal(res.ok, true);
    const j = toolkit.execute("query_join", JSON.stringify({ metrics: [{ table: "消耗表", field: "cost", agg: "sum" }], groupBy: [{ table: "用户表", field: "city" }] }));
    assert.equal(j.ok, true, j.error);
  });
});
