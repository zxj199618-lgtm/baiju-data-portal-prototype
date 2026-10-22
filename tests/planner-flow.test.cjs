/**
 * 规划层接入分析接口：关键词拿不准时用模型判断；手动选择与关键词命中不额外调用模型；
 * 判断失败不影响回答；plan（来源、理由、备选）在 started 事件、meta 和审计里都有。
 * 运行：node --test tests/planner-flow.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { startHarness } = require("./helpers/gateway-harness.cjs");

const PACK = "equity-union-analyst";
const NO_KEYWORD = "帮我看下各部门的回本情况怎么样"; // 不含任何路由关键词，会落到兜底

describe("规划层", () => {
  let harness;
  before(async () => { harness = await startHarness(); });
  after(async () => { await harness.stop(); });

  const isPlannerCall = request => !request.tools && String(request.messages[0]?.content || "").includes("规划助手");
  const reset = reply => {
    harness.relay.requests.length = 0;
    harness.relay.toolScript = [];
    harness.relay.report = body => (String(body.messages[0]?.content || "").includes("规划助手") ? (typeof reply === "function" ? reply(body) : reply) : "测试回答");
  };
  const auto = (question, extra = {}) => harness.analyzeStream("林金维", { skillId: "general-analyst", scenario: "general", toolMode: false, question, ...extra });
  const plannerCalls = () => harness.relay.requests.filter(isPlannerCall);

  test("没有关键词命中时用一次模型判断：选中权益包，plan 里有来源、理由和备选", async () => {
    reset('{"skill":"equity-union-analyst","output":"answer","confidence":0.9,"reason":"问的是各部门回本，属于权益投放"}');
    const result = await auto(NO_KEYWORD);
    assert.equal(plannerCalls().length, 1);
    const started = result.events.find(event => event.started);
    assert.equal(started.routedSkill.id, PACK);
    assert.match(started.routeReason, /^智能判断：问的是各部门回本/);
    assert.equal(started.plan.source, "model");
    assert.equal(started.plan.skillId, PACK);
    assert.equal(started.plan.confidence, 0.9);
    assert.equal(started.plan.output, "answer");
    assert.ok(started.plan.alternatives.length >= 2 && !started.plan.alternatives.some(item => item.id === PACK), "备选里不含当前技能");
    assert.deepEqual(result.done.meta.plan, started.plan);
    assert.equal(result.done.meta.pack, PACK, "规划选中的技能真的被执行（权益包的口径解析在 meta 里）");
    assert.match(result.events.map(event => event.status || "").join("|"), /正在判断用什么技能/);
    assert.ok(result.events.findIndex(event => event.status === "正在判断用什么技能…") < result.events.findIndex(event => event.started), "判断期间界面先收到进度提示");
  });

  test("判断的 token 计入这次的用量与审计", async () => {
    reset('{"skill":"equity-union-analyst","output":"answer","confidence":0.9,"reason":"x"}');
    const result = await auto(NO_KEYWORD);
    assert.ok(result.done.meta.totalTokens >= 20, `规划 + 回答至少两次调用的 token，实际 ${result.done.meta.totalTokens}`);
    const audit = harness.readJsonLines("analysis-audit.jsonl").filter(item => item.type === "analysis").at(-1);
    assert.equal(audit.plan, "model");
    assert.equal(audit.planSkill, PACK);
  });

  test("置信度不够：保留兜底结果，不采用模型的选择", async () => {
    reset('{"skill":"equity-union-analyst","output":"answer","confidence":0.3,"reason":"不太确定"}');
    const result = await auto(NO_KEYWORD);
    const started = result.events.find(event => event.started);
    assert.equal(plannerCalls().length, 1);
    assert.equal(started.plan.source, "fallback");
    assert.notEqual(started.routedSkill?.id, PACK);
  });

  test("判断失败（不是 JSON、技能不存在、上游报错）：不影响回答，沿用兜底", async () => {
    for (const reply of ["我觉得是权益", '{"skill":"不存在的技能","confidence":0.99}']) {
      reset(reply);
      const result = await auto(NO_KEYWORD);
      assert.equal(result.status, 200);
      assert.equal(result.done.meta.plan.source, "fallback", reply);
      assert.ok(result.events.some(event => event.delta), "仍然给出回答");
    }
  });

  test("关键词命中、沿用上一轮、手动选技能：都不额外调用模型", async () => {
    reset('{"skill":"asset-qa","confidence":0.99,"reason":"不该被调用"}');
    const keyword = await auto("任哥近 7 天消耗多少");
    assert.equal(keyword.done.meta.plan.source, "keyword");
    const sticky = await auto("那昨天呢", { conversation: [{ question: "任哥近 7 天消耗多少", answer: "10 万", skillId: PACK, terms: ["任哥"] }] });
    assert.equal(sticky.done.meta.plan.source, "sticky");
    const manual = await harness.analyzeStream("林金维", { skillId: "asset-qa", scenario: "asset", toolMode: false, question: NO_KEYWORD });
    assert.equal(manual.done.meta.plan.source, "manual");
    assert.equal(manual.done.meta.plan.skillId, "asset-qa");
    assert.equal(plannerCalls().length, 0);
  });

  test("planner=false 可以关闭判断（评测与排查用）", async () => {
    reset('{"skill":"equity-union-analyst","confidence":0.9}');
    const result = await auto(NO_KEYWORD, { planner: false });
    assert.equal(plannerCalls().length, 0);
    assert.equal(result.done.meta.plan.source, "fallback");
  });

  test("模型判断出「要报告」：按报告输出（通用模板）；用户明确说 output=answer 时不出报告", async () => {
    reset('{"skill":"equity-union-analyst","output":"report","confidence":0.85,"reason":"要发给领导看的材料"}');
    const asked = await auto("各部门这周的整体情况，要发给领导看");
    assert.equal(asked.done.meta.plan.output, "report");
    assert.equal(asked.done.meta.output, "report");
    assert.equal(asked.done.meta.template, "general");
    reset('{"skill":"equity-union-analyst","output":"report","confidence":0.85,"reason":"x"}');
    const refused = await auto("各部门这周的整体情况，要发给领导看", { output: "answer" });
    assert.equal(refused.done.meta.output, undefined);
    assert.equal(refused.done.meta.plan.output, "answer");
    reset("{}");
    const typed = await auto("帮我出个周报", { output: "answer" });
    assert.equal(typed.done.meta.output, undefined, "即使文字里有「周报」，界面上明确选了回答就不出报告");
  });

  test("手动指定输出形式 output=report 与规划无关：直接按报告", async () => {
    reset("{}");
    const result = await harness.analyzeStream("林金维", { skillId: PACK, scenario: "equity", toolMode: false, question: "近 7 天消耗", output: "report", template: "weekly" });
    assert.equal(result.done.meta.plan.output, "report");
    assert.equal(result.done.meta.plan.template, "weekly");
  });

  test("非流式请求也带 plan", async () => {
    reset('{"skill":"equity-union-analyst","output":"answer","confidence":0.9,"reason":"x"}');
    const response = await harness.call("POST", "/v1/analyze", { token: await harness.tokenFor("林金维"), body: { skillId: "general-analyst", scenario: "general", toolMode: false, model: harness.MODEL, question: NO_KEYWORD } });
    assert.equal(response.status, 200);
    assert.equal(response.data.meta.plan.source, "model");
  });
});
