/**
 * /v1/analyze 业务线模式：上下文包、知识工具、轮次、错误码。
 * 运行：node --test tests/knowledge-analyze.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { startHarness } = require("./helpers/gateway-harness.cjs");

const toolCall = (id, name, args) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });
const group = (name, tables, extra = {}) => ({ name, desc: "", menus: ["灵犀智析"], menuEdits: [], boards: [], tables, status: "启用", ...extra });

describe("/v1/analyze 业务线模式", () => {
  let harness;
  before(async () => { harness = await startHarness(); });
  after(async () => { await harness.stop(); });

  const analyze = (name, body) => harness.analyzeStream(name, { question: "各媒体消耗多少", ...body });
  const toolCount = body => body.messages.filter(message => message.role === "tool").length;
  const reset = () => { harness.relay.requests.length = 0; harness.relay.respond = undefined; harness.relay.toolScript = []; };
  const adminCall = async (method, route, body) => harness.call(method, route, { token: await harness.tokenFor("曾祥竞"), body });
  const systemOf = body => body.messages.find(message => message.role === "system")?.content || "";
  const toolNames = body => (body.tools || []).map(tool => tool.function.name);
  const withTools = () => harness.relay.requests.filter(body => body.tools);

  async function saveLine(name, patch) {
    const current = (await adminCall("GET", "/v1/knowledge")).data;
    const lines = current.businessLines.map(line => (line.name === name ? { ...line, ...patch } : line));
    const saved = await adminCall("PUT", "/v1/knowledge/business-lines", { rev: current.rev, businessLines: lines, tableLines: {} });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
  }

  before(async () => {
    await saveLine("权益", { knowledge: "权益业务线口径 EQ-LINE-BODY\nplan_id 的口径说明\n尾行" });
    await saveLine("公共", { knowledge: "公共口径 PUBLIC-BODY" });
  });

  test("选业务线后，发给模型的系统消息里含业务线知识库正文、公共知识库与可用表清单", async () => {
    reset();
    harness.relay.respond = () => ({ content: "好的" });
    const result = await analyze("曾祥竞", { businessLine: "权益" });
    assert.equal(result.status, 200, result.text);
    const system = systemOf(withTools()[0]);
    assert.match(system, /EQ-LINE-BODY/);
    assert.match(system, /PUBLIC-BODY/);
    assert.match(system, /广告计划日报表/);
    assert.match(system, /渠道维表/);
    assert.match(system, /先按问题判断需要哪些表，再调用 get_table_knowledge 与 get_schema，再取数；跨表用 query_join，不要自己写关联条件；数字只引用工具返回值；业务线里没有登记的关联不要猜。/);
  });

  describe("字段权限", () => {
    before(async () => {
      const groups = [
        group("门户管理员", ["全部数据表"], { menus: ["灵犀智析", "AI 中心"] }),
        group("投放组长", ["广告计划日报表", "广告账户日报", "广告组转化日报", "媒体消耗汇总", "产品 ROI 日报"]),
        group("优化师", ["广告计划日报表", "广告账户日报", "权益-账号维度消耗统计表"], { hiddenFields: { 广告计划日报表: ["plan_id"] } }),
        group("数据分析师", ["广告计划日报表", "用户画像标签明细表", "用户订单明细", "用户生命周期日报", "渠道归因明细"]),
        group("只读访客", [])
      ];
      assert.equal((await adminCall("PUT", "/v1/org", { groups })).status, 200);
    });

    test("业务线上下文包里没有用户无权限的表；隐藏字段所在行被替换为（已隐藏）", async () => {
      reset();
      harness.relay.respond = () => ({ content: "好的" });
      const result = await analyze("谭嘉颖", { businessLine: "权益", assetCandidates: ["用户订单明细"] });
      assert.equal(result.status, 200, result.text);
      const system = systemOf(withTools()[0]);
      assert.match(system, /广告计划日报表/);
      assert.ok(!system.includes("媒体消耗汇总"), "无权限的表不出现");
      assert.ok(!system.includes("用户订单明细"), "客户端 assetCandidates 被忽略");
      assert.ok(!system.includes("plan_id"));
      assert.match(system, /（已隐藏）/);
      assert.match(system, /EQ-LINE-BODY/);
    });

    test("@表 有权限 + 业务线下没有有权限的表 → 200，不进业务线模式（无知识工具、无上下文包）", async () => {
      reset();
      harness.relay.respond = () => ({ content: "好的" });
      const result = await analyze("谭嘉颖", { businessLine: "号卡", tables: ["广告计划日报表"] });
      assert.equal(result.status, 200, result.text);
      const first = withTools()[0];
      assert.ok(!toolNames(first).includes("get_table_knowledge"));
      assert.ok(!toolNames(first).includes("query_join"));
      assert.ok(!systemOf(first).includes("# 业务线：号卡"));
    });

    test("@表 无权限 + 业务线 → 仍是原有 403；「公共」仍是 400", async () => {
      reset();
      const denied = await analyze("谭嘉颖", { businessLine: "权益", tables: ["用户订单明细"] });
      assert.equal(denied.status, 403);
      assert.equal((await analyze("谭嘉颖", { businessLine: "公共", tables: ["广告计划日报表"] })).status, 400);
    });

    test("用户在该业务线下没有有权限的表 → 404 且提示含业务线名", async () => {
      reset();
      const result = await analyze("谭嘉颖", { businessLine: "号卡" });
      assert.equal(result.status, 404);
      assert.match(result.text, /号卡/);
    });
  });

  test("请求的 tools 列表里含 get_table_knowledge 与 query_join；没选业务线时不含", async () => {
    reset();
    harness.relay.respond = () => ({ content: "好的" });
    await analyze("曾祥竞", { businessLine: "权益" });
    assert.ok(toolNames(withTools()[0]).includes("get_table_knowledge"));
    assert.ok(toolNames(withTools()[0]).includes("query_join"));
    reset();
    harness.relay.respond = () => ({ content: "好的" });
    await analyze("曾祥竞", {});
    assert.ok(withTools().length > 0);
    assert.ok(!toolNames(withTools()[0]).includes("get_table_knowledge"));
    assert.ok(!toolNames(withTools()[0]).includes("query_join"));
  });

  test("脚本化模型依次调用 get_table_knowledge → query_join，网关返回的取数结果里有平台算好的数字，且审计里有两次调用", async () => {
    const current = (await adminCall("GET", "/v1/knowledge")).data;
    const rel = { id: "rel-t5", left: { table: "广告计划日报表", field: "media_source" }, right: { table: "媒体消耗汇总", field: "media_source" }, type: "N:1", note: "" };
    await saveLine("权益", { relations: [rel] });
    reset();
    let seen = [];
    harness.relay.respond = body => {
      const n = toolCount(body);
      if (n === 0) return { calls: [toolCall("k1", "get_table_knowledge", { tables: ["广告计划日报表"] })] };
      if (n === 1) return { calls: [toolCall("k2", "query_join", { metrics: [{ table: "广告计划日报表", field: "cost", agg: "sum" }], groupBy: [{ table: "广告计划日报表", field: "media_source" }], days: 7 })] };
      seen = body.messages.filter(message => message.role === "tool").map(message => message.content);
      return { content: "完成" };
    };
    const auditBefore = harness.readJsonLines("analysis-audit.jsonl").length;
    const result = await analyze("曾祥竞", { businessLine: "权益" });
    assert.equal(result.status, 200, result.text);
    assert.equal(result.done.meta.toolMode, "used:2");
    assert.equal(seen.length, 2);
    const join = JSON.parse(seen[1]);
    assert.equal(join.ok, true, seen[1]);
    assert.match(seen[1], /cost/);
    assert.match(seen[0], /广告计划日报表/);
    const audit = harness.readJsonLines("analysis-audit.jsonl").slice(auditBefore).filter(item => item.tool);
    assert.deepEqual(audit.map(item => item.tool), ["get_table_knowledge", "query_join"]);
    // 关联确实经 PUT 保存：rev 恰好加 1，权益业务线上就是这一条
    const saved = (await adminCall("GET", "/v1/knowledge")).data;
    assert.equal(saved.rev, current.rev + 1);
    assert.deepEqual(saved.businessLines.find(line => line.name === "权益").relations.map(item => item.id), ["rel-t5"]);
  });

  test("businessLine 为「公共」→ 400；不存在的业务线（且客户端没给 assetCandidates）按旧行为；给了 assetCandidates 则按其缩小范围", async () => {
    reset();
    assert.equal((await analyze("曾祥竞", { businessLine: "公共" })).status, 400);
    const none = await analyze("曾祥竞", { businessLine: "旧业务线" });
    assert.equal(none.status, 404);
    assert.match(none.text, /旧业务线/);
    harness.relay.respond = () => ({ content: "好的" });
    const legacy = await analyze("曾祥竞", { businessLine: "旧业务线", assetCandidates: ["广告计划日报表"] });
    assert.equal(legacy.status, 200, legacy.text);
    assert.ok(!toolNames(withTools()[0]).includes("query_join"));
  });

  test("业务线模式允许超过 4 轮：连续 6 轮调用工具仍能得到最终回答；没选业务线时仍是 4 轮上限", async () => {
    reset();
    harness.relay.respond = body => (toolCount(body) < 6 ? { calls: [toolCall(`s${toolCount(body)}`, "search_tables", { keyword: "" })] } : { content: "最终回答" });
    const a = await analyze("曾祥竞", { businessLine: "权益" });
    assert.equal(a.done.meta.toolMode, "used:6");
    reset();
    harness.relay.respond = body => ({ calls: [toolCall(`n${toolCount(body)}`, "search_tables", { keyword: "" })] });
    const b = await analyze("曾祥竞", {});
    assert.equal(b.done.meta.toolMode, "used:4");
  });

  test("@表 与业务线同时给：@表 仍作为 referenced，上下文包照常放入", async () => {
    reset();
    harness.relay.respond = () => ({ content: "好的" });
    const result = await analyze("曾祥竞", { businessLine: "权益", tables: ["广告账户日报"] });
    assert.equal(result.status, 200, result.text);
    const first = withTools()[0];
    assert.match(systemOf(first), /EQ-LINE-BODY/);
    assert.match(first.messages.find(message => message.role === "user").content, /用户指定的数据表：广告账户日报/);
  });

  test("get_table_knowledge 的字数预算可配置（PORTAL_KNOWLEDGE_BUDGET_CHARS）", async () => {
    const small = await startHarness({ env: { PORTAL_KNOWLEDGE_BUDGET_CHARS: "50" } });
    try {
      const token = await small.tokenFor("曾祥竞");
      await small.call("PUT", "/v1/knowledge/tables/" + encodeURIComponent("广告计划日报表"), { token, body: { markdown: "甲".repeat(200) } });
      let result = "";
      small.relay.respond = body => {
        const n = body.messages.filter(message => message.role === "tool").length;
        if (n === 0) return { calls: [toolCall("b1", "get_table_knowledge", { tables: ["广告计划日报表"] })] };
        result = body.messages.filter(message => message.role === "tool")[0].content;
        return { content: "好" };
      };
      await small.analyzeStream("曾祥竞", { question: "q", businessLine: "权益" });
      assert.match(result, /超出本次字数预算/);
    } finally { await small.stop(); }
  });
});

/* 三表关联：手工构造的小数据集（网关启动前写入 sample-data.json，其余表照常生成），期望值按下面的行手算 */
describe("/v1/analyze 业务线模式：三表 query_join（手算期望值）", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const dim = (product_id, product_name, biz_line) => ({ product_id, product_name, biz_line, unit_price: 10, row_status: "有效" });
  const roi = (stat_date, product_name, cost) => ({ stat_date, product_name, cost, activate_cnt: 1, revenue: 0, order_cnt: 0, roi: 0 });
  const order = (order_id, product_name, order_amount, created_at) => ({ order_id, user_id: "U" + order_id, product_name, order_amount, status: "已支付", pay_channel: "微信", created_at });
  const SAMPLE = {
    generatedAt: "2026-11-12T00:00:00.000Z",
    tables: {
      产品维表: [dim("P1", "产品甲", "权益"), dim("P2", "产品乙", "权益"), dim("P3", "产品丙", "号卡")],
      // 锚点 = 两张指标表的最大日期 2026-11-11，近 7 天 = 2026-11-05 ~ 2026-11-11
      "产品 ROI 日报": [
        roi("2026-11-10", "产品甲", 100), roi("2026-11-11", "产品乙", 50), roi("2026-11-11", "产品丙", 30),
        roi("2026-11-09", "产品丁", 7), // 维表里没有 → （未关联）
        roi("2026-11-01", "产品甲", 999) // 窗口外
      ],
      用户订单明细: [
        order("O1", "产品甲", 200, "2026-11-11 10:00:00"), order("O2", "产品丙", 80, "2026-11-10 09:00:00"),
        order("O3", "产品丙", 20, "2026-11-06 20:00:00"), order("O4", "产品乙", 500, "2026-11-02 08:00:00") // O4 在窗口外
      ]
    }
  };
  // 手算：权益 = 产品甲 + 产品乙：消耗 100 + 50 = 150，订单金额 200；号卡 = 产品丙：消耗 30，订单金额 80 + 20 = 100；（未关联）：消耗 7，订单 0
  const EXPECTED = [
    { 分组: { "产品维表.biz_line": "权益" }, 值: { 消耗: 150, 订单金额: 200 } },
    { 分组: { "产品维表.biz_line": "号卡" }, 值: { 消耗: 30, 订单金额: 100 } },
    { 分组: { "产品维表.biz_line": "（未关联）" }, 值: { 消耗: 7, 订单金额: 0 } }
  ];

  let harness;
  before(async () => {
    harness = await startHarness({ prepare: dir => fs.writeFileSync(path.join(dir, "sample-data.json"), JSON.stringify(SAMPLE)) });
    const admin = await harness.tokenFor("曾祥竞");
    const current = (await harness.call("GET", "/v1/knowledge", { token: admin })).data;
    const relations = [
      { left: { table: "产品 ROI 日报", field: "product_name" }, right: { table: "产品维表", field: "product_name" }, type: "N:1", note: "" },
      { left: { table: "用户订单明细", field: "product_name" }, right: { table: "产品维表", field: "product_name" }, type: "N:1", note: "" }
    ];
    const businessLines = current.businessLines.map(line => line.name === "权益" ? { ...line, relations } : line);
    // 关联通过 PUT 接口登记；用户订单明细原属号卡，移入权益后关联才用得上
    const saved = await harness.call("PUT", "/v1/knowledge/business-lines", { token: admin, body: { rev: current.rev, businessLines, tableLines: { 用户订单明细: "权益" } } });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    const view = (await harness.call("GET", "/v1/knowledge", { token: admin })).data;
    assert.ok(view.businessLines.find(line => line.name === "权益").relations.every(relation => !relation.invalid), "登记的关联应有效");
  });
  after(async () => { await harness.stop(); });

  /** 按脚本依次发起工具调用，返回网关送回给模型的工具结果（已解析） */
  async function runScript(user, calls) {
    harness.relay.requests.length = 0;
    let seen = [];
    harness.relay.respond = body => {
      const n = body.messages.filter(message => message.role === "tool").length;
      if (n < calls.length) return { calls: [toolCall("j" + n, calls[n][0], calls[n][1])] };
      seen = body.messages.filter(message => message.role === "tool").map(message => JSON.parse(message.content));
      return { content: "完成" };
    };
    const result = await harness.analyzeStream(user, { question: "近 7 天各业务线的消耗和订单金额", businessLine: "权益" });
    harness.relay.respond = undefined;
    assert.equal(result.status, 200, result.text);
    return seen;
  }
  const joinArgs = {
    metrics: [{ table: "产品 ROI 日报", field: "cost", agg: "sum", name: "消耗" }, { table: "用户订单明细", field: "order_amount", agg: "sum", name: "订单金额" }],
    groupBy: [{ table: "产品维表", field: "biz_line" }],
    days: 7
  };

  test("两张指标表经产品维表关联、按业务线分组：工具结果里的数字等于手算值", async () => {
    const [join] = await runScript("曾祥竞", [["query_join", joinArgs]]);
    assert.equal(join.ok, true, JSON.stringify(join));
    assert.deepEqual(join.data.明细, EXPECTED);
    assert.deepEqual(join.data.合计, { 消耗: 187, 订单金额: 300 });
    assert.deepEqual(join.data.窗口, { 起: "2026-11-05", 止: "2026-11-11", N: 7 });
    assert.deepEqual(join.data.关联路径.sort(), ["产品 ROI 日报.product_name N:1 产品维表.product_name", "用户订单明细.product_name N:1 产品维表.product_name"]);
  });

  test("一对多重复计数被拒绝：维表的单价按订单状态分组 → 不返回数字并点名关联", async () => {
    const [join] = await runScript("曾祥竞", [["query_join", { metrics: [{ table: "产品维表", field: "unit_price", agg: "sum" }], groupBy: [{ table: "用户订单明细", field: "status" }] }]]);
    assert.equal(join.ok, false);
    assert.match(join.error, /重复计数/);
    assert.match(join.error, /用户订单明细\.product_name N:1 产品维表\.product_name/);
    assert.equal(join.data, undefined);
  });

  test("用户被隐藏的字段不能作为分组：返回无权限错误，不返回数字", async () => {
    const admin = await harness.tokenFor("曾祥竞");
    const groups = [
      group("门户管理员", ["全部数据表"], { menus: ["灵犀智析", "AI 中心"] }),
      group("投放组长", ["广告计划日报表"]),
      group("优化师", ["产品 ROI 日报", "用户订单明细", "产品维表"], { hiddenFields: { 产品维表: ["biz_line"] } }),
      group("数据分析师", ["广告计划日报表"]),
      group("只读访客", [])
    ];
    assert.equal((await harness.call("PUT", "/v1/org", { token: admin, body: { groups } })).status, 200);
    const [hidden, visible] = await runScript("谭嘉颖", [
      ["query_join", joinArgs],
      ["query_join", { ...joinArgs, groupBy: [{ table: "产品维表", field: "product_name" }] }]
    ]);
    assert.equal(hidden.ok, false);
    assert.match(hidden.error, /产品维表\.biz_line 不存在或无权限/);
    assert.equal(hidden.data, undefined);
    // 同一用户按可见字段分组仍可算（对照）：产品甲 100/200、产品乙 50/0、产品丙 30/100、未关联 7/0
    assert.equal(visible.ok, true, JSON.stringify(visible));
    assert.deepEqual(Object.fromEntries(visible.data.明细.map(row => [row.分组["产品维表.product_name"], [row.值.消耗, row.值.订单金额]])), { 产品甲: [100, 200], 产品乙: [50, 0], 产品丙: [30, 100], "（未关联）": [7, 0] });
  });
});
