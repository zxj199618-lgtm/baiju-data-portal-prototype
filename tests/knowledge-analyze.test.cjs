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
    assert.ok(current.rev >= 1);
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
