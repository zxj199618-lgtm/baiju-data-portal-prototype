/**
 * 权益规范包接入分析接口：术语解析、拦截、上下文注入、参考资料工具、追问沿用技能与口径。
 * 运行：node --test tests/equity-pack.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { startHarness } = require("./helpers/gateway-harness.cjs");

const PACK = "equity-union-analyst";
const TABLE = "权益-账号维度消耗统计表";

describe("权益规范包", () => {
  let harness;
  before(async () => { harness = await startHarness(); });
  after(async () => { await harness.stop(); });
  const resetRelay = () => { harness.relay.requests.length = 0; harness.relay.toolScript = []; harness.relay.report = "测试回答"; };

  const stream = (name, body) => harness.analyzeStream(name, { skillId: PACK, scenario: "equity", ...body });
  const systemOf = request => request.messages.find(message => message.role === "system")?.content || "";
  const userOf = request => request.messages.find(message => message.role === "user")?.content || "";

  test("技能清单里有权益包，路由规则里有它的关键词", async () => {
    const admin = await harness.tokenFor("曾祥竞");
    const skills = (await harness.call("GET", "/v1/skills", { token: admin })).data;
    const entry = skills.find(item => item.id === PACK);
    assert.ok(entry && entry.pack && entry.builtin, "权益包应登记为内置规范包");
    assert.equal(entry.spec, undefined, "清单接口不返回规范内容");
    const router = skills.find(item => item.kind === "router");
    assert.ok(router.routes.some(route => route.skillId === PACK && route.keywords.includes("任哥")));
  });

  test("权益表对投放组长 / 优化师 / 数据分析师可见，且有示例数据", async () => {
    for (const name of ["林金维", "谭嘉颖", "李雨航"]) {
      const result = await harness.call("POST", "/v1/metrics/query", { token: await harness.tokenFor(name), body: { metric: "cost", table: TABLE, days: 7 } });
      assert.equal(result.status, 200, `${name}：${JSON.stringify(result.data).slice(0, 120)}`);
      assert.ok(result.data.近N天 > 0);
    }
  });

  test("按商户拆分：直接拦截，不调用模型，答复里给出替代方案", async () => {
    resetRelay();
    const result = await stream("谭嘉颖", { question: "按商户看一下这周的收入" });
    assert.equal(result.status, 200);
    assert.equal(harness.relay.requests.length, 0, "被拦截的请求不应调用模型");
    assert.equal(result.done.meta.toolMode, "guard:merchant-channel");
    assert.deepEqual(result.done.meta.guards, ["merchant-channel"]);
    assert.match(result.events.filter(event => event.delta).map(event => event.delta).join(""), /明细表/);
  });

  test("「任哥」被解析成部门口径：started 事件、meta 和给模型的上下文里都有", async () => {
    resetRelay();
    harness.relay.toolScript = [{ calls: [{ id: "c1", type: "function", function: { name: "query_metric", arguments: JSON.stringify({ metric: "cost", table: TABLE, filters: [{ field: "department", values: ["投放一部-权益一组", "投放一部-权益二组"] }] }) } }] }];
    const result = await stream("林金维", { question: "任哥近 7 天消耗多少" });
    assert.equal(result.status, 200);
    const started = result.events.find(event => event.started);
    assert.deepEqual(started.resolved.map(item => item.term), ["任哥"]);
    assert.equal(result.done.meta.pack, PACK);
    assert.equal(result.done.meta.role, "optimizer");
    const toolStep = harness.relay.requests.find(request => request.tools);
    assert.match(systemOf(toolStep), /五条硬口径/, "规范包核心规则进入取数阶段");
    assert.match(systemOf(toolStep), /「任哥」→ 部门口径/);
    assert.match(systemOf(toolStep), /回答协议/);
    assert.match(userOf(toolStep), new RegExp(`默认使用的数据表：${TABLE}`));
    const finalStep = harness.relay.requests.find(request => !request.tools);
    assert.match(systemOf(finalStep), /答案优先/);
    assert.match(userOf(finalStep), /口径解析/);
    assert.ok(result.done.meta.toolCalls.some(call => call.tool === "query_metric" && call.ok));
  });

  test("「白驹」有歧义：模型被告知要两种口径并列，而不是自己选", async () => {
    resetRelay();
    const result = await stream("林金维", { question: "白驹这周消耗怎么样", toolMode: false });
    assert.deepEqual(result.done.meta.ambiguousTerms, ["白驹"]);
    const finalStep = harness.relay.requests.at(-1);
    assert.match(userOf(finalStep), /口径歧义/);
    assert.match(userOf(finalStep), /两种口径各查一次/);
  });

  test("read_reference 能读到完整的长资料（不被工具输出上限截断）", async () => {
    resetRelay();
    harness.relay.toolScript = [{ calls: [{ id: "r1", type: "function", function: { name: "read_reference", arguments: JSON.stringify({ name: "metrics" }) } }] }];
    const result = await stream("李雨航", { question: "提单签约率是怎么算的" });
    assert.equal(result.status, 200);
    const toolMessage = harness.relay.requests.find(request => request.tools && request.messages.some(message => message.role === "tool"));
    const content = toolMessage.messages.find(message => message.role === "tool").content;
    assert.ok(content.length > 9000, `资料应完整返回，实际 ${content.length} 字符`);
    assert.ok(!content.includes('"truncated"'));
    assert.equal(result.done.meta.role, "analyst");
  });

  test("追问：沿用上一轮的技能、口径和对话内容", async () => {
    resetRelay();
    const result = await harness.analyzeStream("林金维", {
      skillId: "general-analyst", scenario: "general", question: "那昨天呢",
      conversation: [{ question: "任哥近 7 天消耗多少", answer: "任哥近 7 天消耗 10 万。", skillId: PACK, terms: ["任哥"] }]
    });
    assert.equal(result.status, 200);
    const started = result.events.find(event => event.started);
    assert.equal(started.routedSkill.id, PACK, "没有关键词的追问应沿用上一轮的技能");
    assert.equal(started.routeReason, "沿用上一轮的技能");
    assert.deepEqual(started.resolved.map(item => [item.term, item.carried]), [["任哥", true]]);
    const toolStep = harness.relay.requests.find(request => request.tools);
    assert.match(userOf(toolStep), /对话上下文/);
    assert.match(userOf(toolStep), /任哥近 7 天消耗 10 万/);
  });

  test("自动路由：权益关键词优先于通用技能的多个命中（「任哥近 7 天消耗多少」不会落到数据查询）", async () => {
    resetRelay();
    const result = await harness.analyzeStream("林金维", { skillId: "general-analyst", scenario: "general", question: "任哥近 7 天消耗多少", toolMode: false });
    const started = result.events.find(event => event.started);
    assert.equal(started.routedSkill.id, PACK);
    assert.match(started.routeReason, /任哥/);
    const other = await harness.analyzeStream("林金维", { skillId: "general-analyst", scenario: "general", question: "有哪些表可以查消耗", toolMode: false });
    assert.notEqual(other.events.find(event => event.started).routedSkill?.id, PACK, "不含权益词的问题不应被拉进权益包");
  });

  test("没有会话上下文时，回答协议仍然适用于其他技能", async () => {
    resetRelay();
    await harness.analyzeStream("谭嘉颖", { skillId: "warehouse-analyst", scenario: "data-query", question: "有哪些表", toolMode: false });
    const finalStep = harness.relay.requests.at(-1);
    assert.match(systemOf(finalStep), /回答协议/);
    assert.match(systemOf(finalStep), /投放优化师/);
  });
});
