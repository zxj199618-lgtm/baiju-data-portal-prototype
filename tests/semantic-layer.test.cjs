/**
 * 语义层测试：口径计算（单元，手算结果）+ 目录校验 + 权限 + 经网关的工具调用。
 * 运行：node --test tests/semantic-layer.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createSemanticLayer } = require("../scripts/semantic-layer.cjs");
const { startHarness } = require("./helpers/gateway-harness.cjs");

const ANCHOR = "2026-08-31";
const shift = (offset) => new Date(Date.parse(`${ANCHOR}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);

const tables = [
  { cnName: "投放表", fields: [{ name: "d", type: "DATE" }, { name: "media", type: "VARCHAR" }, { name: "cost", type: "DECIMAL(18,2)" }, { name: "act", type: "BIGINT" }] },
  { cnName: "另一张表", fields: [{ name: "d", type: "DATE" }, { name: "media", type: "VARCHAR" }, { name: "cost", type: "DECIMAL(18,2)" }] }
];
const catalog = {
  tables: { 投放表: { dateField: "d", dimensions: ["media"] }, 另一张表: { dateField: "d", dimensions: ["media"] } },
  metrics: [
    { id: "cost", name: "消耗", aliases: ["花费"], type: "sum", unit: "元", description: "求和", reviewed: true, fields: { 投放表: "cost", 另一张表: "cost" } },
    { id: "activate", name: "激活数", type: "sum", unit: "次", description: "求和", fields: { 投放表: "act" } },
    { id: "cpa", name: "CPA", aliases: ["激活成本"], type: "ratio", unit: "元/次", numerator: "cost", denominator: "activate", scale: 1, description: "消耗 ÷ 激活数" }
  ]
};
const rows = {
  投放表: [
    // 近 7 天：A 消耗 100 / 激活 10（CPA 10），B 消耗 100 / 激活 1（CPA 100）
    { d: shift(0), media: "A", cost: 100, act: 10 }, { d: shift(-1), media: "B", cost: 100, act: 1 },
    // 前 7 天：A 消耗 50 / 激活 10（CPA 5）
    { d: shift(-8), media: "A", cost: 50, act: 10 }
  ],
  另一张表: [{ d: shift(0), media: "X", cost: 7 }]
};
const layer = createSemanticLayer({ catalog, tables, rowsOf: name => rows[name] || [] });
const ALL = ["投放表", "另一张表"];

describe("口径计算（单元）", () => {
  test("目录与表结构一致时没有警告", () => assert.deepEqual(layer.warnings, []));

  test("求和型：近 N 天与前 N 天、变化量、环比", () => {
    const result = layer.query({ metric: "cost", table: "投放表", allowedTables: ALL });
    assert.equal(result.data.近N天, 200);
    assert.equal(result.data.前N天, 50);
    assert.equal(result.data.变化量, 150);
    assert.equal(result.data.环比百分比, 300);
  });

  test("比率型是「先汇总再相除」，不是各行比率的平均", () => {
    const result = layer.query({ metric: "cpa", table: "投放表", allowedTables: ALL });
    assert.equal(result.data.近N天, 18.18, "200 / 11，而不是 (10 + 100) / 2 = 55");
    assert.equal(result.data.前N天, 5);
  });

  test("按维度拆分：每组各自先汇总再相除，并按变化量排序", () => {
    const result = layer.query({ metric: "cpa", table: "投放表", group: "media", allowedTables: ALL });
    const groups = Object.fromEntries(result.data.分组.明细.map(item => [item.组, item]));
    assert.equal(groups.A.近N天, 10);
    assert.equal(groups.B.近N天, 100);
    assert.equal(groups.B.前N天, null, "前 7 天 B 没有数据：不应写成 0");
    assert.equal(result.data.分组.明细[0].组, "A", "A 的变化量 5，B 的变化量为空，A 排前面");
  });

  test("分母为 0 时比率为空，而不是无穷大或 0", () => {
    const zero = createSemanticLayer({ catalog, tables, rowsOf: () => [{ d: shift(0), media: "A", cost: 10, act: 0 }, { d: shift(-8), media: "A", cost: 10, act: 0 }] });
    const result = zero.query({ metric: "cpa", table: "投放表", allowedTables: ALL });
    assert.equal(result.data.近N天, null);
  });

  test("指标可用名称或别名查找", () => {
    assert.equal(layer.query({ metric: "激活成本", table: "投放表", allowedTables: ALL }).data.指标, "cpa");
    assert.equal(layer.query({ metric: "花费", table: "投放表", allowedTables: ALL }).data.指标, "cost");
  });

  test("口径状态：未确认的指标标为草稿", () => {
    assert.equal(layer.query({ metric: "cost", table: "投放表", allowedTables: ALL }).data.口径.状态, "已确认");
    assert.match(layer.query({ metric: "cpa", table: "投放表", allowedTables: ALL }).data.口径.状态, /草稿/);
  });
});

describe("权限与参数", () => {
  test("没有权限的表：查不到，且与不存在的表提示一致", () => {
    const denied = layer.query({ metric: "cost", table: "另一张表", allowedTables: ["投放表"] });
    assert.equal(denied.ok, false);
    assert.match(denied.error, /不存在、无权访问或不支持该指标/);
  });

  test("指标只在没有权限的表上可用时整个隐藏", () => {
    const names = layer.listMetrics(["另一张表"]).map(item => item.指标);
    assert.deepEqual(names, ["cost"], "激活数与 CPA 只在「投放表」上，用户无权就不应出现");
    assert.deepEqual(layer.listMetrics(["另一张表"])[0].可用表.map(item => item.表名), ["另一张表"], "只列出有权限的表");
  });

  test("多张表都可用时必须指定表；只有一张可用时自动选择", () => {
    assert.match(layer.query({ metric: "cost", allowedTables: ALL }).error, /请指定 table/);
    assert.equal(layer.query({ metric: "cost", allowedTables: ["另一张表"] }).data.表名, "另一张表");
  });

  test("不支持的分组维度与未知指标返回可读的错误", () => {
    assert.match(layer.query({ metric: "cost", table: "投放表", group: "act", allowedTables: ALL }).error, /不支持按 act 分组/);
    assert.match(layer.query({ metric: "不存在的指标", allowedTables: ALL }).error, /未找到指标/);
  });
});

describe("目录校验", () => {
  test("引用了不存在的表、字段或类型不对的定义被丢弃并给出警告", () => {
    const bad = createSemanticLayer({
      tables,
      rowsOf: () => [],
      catalog: {
        tables: { 投放表: { dateField: "d", dimensions: ["media", "cost"] }, 不存在的表: { dateField: "d", dimensions: [] } },
        metrics: [
          { id: "ok", name: "好指标", type: "sum", fields: { 投放表: "cost" } },
          { id: "missing_field", name: "字段不存在", type: "sum", fields: { 投放表: "nope" } },
          { id: "text_field", name: "文本字段", type: "sum", fields: { 投放表: "media" } },
          { id: "orphan_ratio", name: "缺分母", type: "ratio", numerator: "ok", denominator: "missing_field", scale: 1 }
        ]
      }
    });
    assert.equal(bad.metricCount, 1, "只有合法的指标保留下来");
    const text = bad.warnings.join("\n");
    assert.match(text, /表「不存在的表」不存在/);
    assert.match(text, /维度 cost 不存在或不是文本字段/);
    assert.match(text, /指标 missing_field/);
    assert.match(text, /指标 text_field/);
    assert.match(text, /比率指标 orphan_ratio/);
  });

  test("仓库里的指标目录与真实表结构一致（启动时警告为空）", async () => {
    const harness = await startHarness();
    try {
      const result = await harness.call("GET", "/v1/metrics", { token: await harness.tokenFor("曾祥竞") });
      assert.equal(result.status, 200);
      assert.deepEqual(result.data.warnings, [], "指标目录与表结构不一致：" + JSON.stringify(result.data.warnings));
      assert.ok(result.data.metrics.length >= 10);
    } finally {
      await harness.stop();
    }
  });

  test("指标目录文件是合法 JSON，且每个指标都有负责人与口径说明", () => {
    const file = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "semantic", "metrics.json"), "utf8"));
    file.metrics.forEach(metric => {
      assert.ok(metric.owner, `${metric.id} 缺少负责人`);
      assert.ok(metric.description, `${metric.id} 缺少口径说明`);
    });
  });
});

describe("经网关的工具调用", () => {
  let harness;
  before(async () => { harness = await startHarness(); });
  after(async () => { await harness.stop(); });

  const call = (id, name, args) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });

  test("/v1/metrics 只列出当前用户有权限的指标", async () => {
    const analyst = await harness.call("GET", "/v1/metrics", { token: await harness.tokenFor("李雨航") });
    const ids = analyst.data.metrics.map(item => item.指标);
    assert.ok(ids.includes("order_amount"), "数据分析师有「用户订单明细」权限");
    assert.equal(ids.includes("revenue"), false, "「产品 ROI 日报」没有授权，收入指标不应出现");
    assert.equal(analyst.data.warnings, undefined, "校验警告只给管理员");
  });

  test("模型用 list_metrics / query_metric 取数，结果由平台按口径计算", async () => {
    harness.relay.requests.length = 0;
    harness.relay.toolScript = [
      { calls: [call("m1", "list_metrics", { keyword: "CPA" })] },
      { calls: [call("m2", "query_metric", { metric: "CPA", table: "媒体消耗汇总", group: "media_source" })] }
    ];
    const result = await harness.analyzeStream("曾祥竞", { question: "CPA 变化怎么样？", tables: [] });
    assert.equal(result.done.meta.toolMode, "used:2");
    const finalUser = harness.relay.requests.at(-1).messages.find(message => message.role === "user").content;
    assert.match(finalUser, /"口径状态": "草稿（待数据团队确认）"/);
    assert.match(finalUser, /"环比百分比"/);
    assert.deepEqual(result.events.filter(event => event.tool).map(event => event.tool.name), ["list_metrics", "query_metric"]);
  });

  test("无权限的表：query_metric 被拒绝并写入审计", async () => {
    harness.relay.requests.length = 0;
    harness.relay.toolScript = [{ calls: [call("m3", "query_metric", { metric: "收入", table: "产品 ROI 日报" })] }];
    await harness.analyzeStream("李雨航", { question: "收入怎么样？", tables: [] });
    const toolMessages = harness.relay.requests.flatMap(body => body.messages.filter(message => message.role === "tool"));
    assert.match(toolMessages[0].content, /没有可用的数据表支持指标/);
    const audit = harness.readJsonLines("analysis-audit.jsonl").find(entry => entry.tool === "query_metric" && entry.user === "李雨航");
    assert.equal(audit.ok, false);
  });
});
