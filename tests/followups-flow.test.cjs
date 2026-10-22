/**
 * 推荐问题接入分析接口：meta.suggestions 在回答、报告、被拦截的回复里都有；追问卡片没有；
 * 推荐的问题真的能被平台回答（用它再问一次能取到数）。
 * 运行：node --test tests/followups-flow.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { startHarness } = require("./helpers/gateway-harness.cjs");

const PACK = "equity-union-analyst";
const TABLE = "权益-账号维度消耗统计表";

describe("推荐问题", () => {
  let harness;
  before(async () => { harness = await startHarness(); });
  after(async () => { await harness.stop(); });
  const reset = () => { harness.relay.requests.length = 0; harness.relay.toolScript = []; harness.relay.report = "测试回答"; };
  const call = (name, args) => ({ calls: [{ id: `${name}-1`, type: "function", function: { name, arguments: JSON.stringify(args) } }] });
  const texts = meta => (meta.suggestions || []).map(item => item.text);

  test("取数回答之后：最多 3 条推荐，带 kind；任哥的口径带进问题里", async () => {
    reset();
    harness.relay.toolScript = [call("query_metric", { metric: "cost", table: TABLE, filters: [{ field: "department", values: ["投放一部-权益一组", "投放一部-权益二组"] }] })];
    const result = await harness.analyzeStream("林金维", { skillId: PACK, scenario: "equity", question: "任哥近 7 天消耗多少" });
    const suggestions = result.done.meta.suggestions;
    assert.ok(suggestions.length >= 2 && suggestions.length <= 3, texts(result.done.meta).join(" | "));
    assert.ok(suggestions.every(item => item.kind && item.text));
    assert.ok(suggestions.filter(item => item.kind !== "report").every(item => item.text.startsWith("任哥")), texts(result.done.meta).join(" | "));
    assert.equal(suggestions.filter(item => item.kind === "report").length <= 1, true);
  });

  test("按商户拆分被拦截时：推荐规范里写的替代问法", async () => {
    reset();
    const result = await harness.analyzeStream("林金维", { skillId: PACK, scenario: "equity", question: "按商户看一下这周的收入" });
    assert.deepEqual(texts(result.done.meta), ["近 7 天各部门的实付收入对比", "近 7 天各账号的消耗对比", "近 7 天各套餐类型的成功用户数"]);
  });

  test("报告之后：推荐换模板重新整理", async () => {
    reset();
    harness.relay.toolScript = [call("query_metric", { metric: "cost", table: TABLE })];
    const result = await harness.analyzeStream("林金维", { skillId: PACK, scenario: "equity", question: "帮我出一份权益周报" });
    assert.equal(result.done.meta.output, "report");
    assert.ok(texts(result.done.meta).every(text => /换成.+重新整理/.test(text)), texts(result.done.meta).join(" | "));
    assert.ok(!texts(result.done.meta).some(text => text.includes("周报")), "不含当前模板");
  });

  test("追问卡片（模型向用户提问）没有推荐；没有取到事实时给起步问题", async () => {
    reset();
    harness.relay.toolScript = [call("ask_user", { questions: [{ question: "看哪个部门？", options: ["任哥", "伯都"] }] })];
    const ask = await harness.analyzeStream("林金维", { skillId: PACK, scenario: "equity", question: "帮我看看效果" });
    assert.equal(ask.done.meta.suggestions, undefined);
    reset();
    const none = await harness.analyzeStream("林金维", { skillId: PACK, scenario: "equity", question: "你好", toolMode: false });
    assert.ok(texts(none.done.meta).length >= 1);
    assert.ok(texts(none.done.meta).every(text => /权益|近 7 天|任哥/.test(text)), texts(none.done.meta).join(" | "));
  });

  test("推荐的问题是平台真的能回答的：把「按部门拆开看」翻成查询，能取到数", async () => {
    reset();
    harness.relay.toolScript = [call("query_metric", { metric: "roi_self", table: TABLE })];
    const result = await harness.analyzeStream("林金维", { skillId: PACK, scenario: "equity", question: "近 7 天自营 ROI 怎么样" });
    const group = texts(result.done.meta).find(text => /各.+的自营 ROI 对比/.test(text));
    assert.ok(group, texts(result.done.meta).join(" | "));
    const label = group.match(/各(.+?)的/)[1];
    const field = { 部门: "department", 账号: "account_id", 渠道: "platform_name", 套餐类型: "commodity_classify" }[label];
    assert.ok(field, `维度 ${label}`);
    const queried = await harness.call("POST", "/v1/metrics/query", { token: await harness.tokenFor("林金维"), body: { metric: "roi_self", table: TABLE, group: field, days: 7 } });
    assert.equal(queried.status, 200);
    assert.ok(queried.data.分组.明细.length > 1);
  });

  test("对话历史里保留推荐问题（刷新后最后一条回答下仍显示）", async () => {
    const token = await harness.tokenFor("谭嘉颖");
    const saved = await harness.call("PUT", "/v1/history", { token, body: { sessions: [{ id: "s1", title: "t", messages: [{ role: "assistant", lines: ["a"], html: "<p>a</p>", suggestions: ["近 7 天各部门的消耗对比", "x".repeat(200), "c", "d"] }] }], reports: [] } });
    assert.equal(saved.status, 200);
    const loaded = (await harness.call("GET", "/v1/history", { token })).data;
    const message = loaded.sessions[0].messages[0];
    assert.equal(message.suggestions.length, 3);
    assert.equal(message.suggestions[1].length, 60);
  });
});
