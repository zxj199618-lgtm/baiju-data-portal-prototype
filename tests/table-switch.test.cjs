/**
 * 对话中切换数据表：旧表的问题、回答摘要、沿用的技能与口径词、证据账本都不能带进新表的提问。
 * 运行：node --test tests/table-switch.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { startHarness } = require("./helpers/gateway-harness.cjs");
const pack = require("../scripts/skill-pack.cjs");

const PACK = "equity-union-analyst";
const EQUITY = "权益-账号维度消耗统计表";
const OTHER = "广告计划日报表";

describe("表边界（纯函数）", () => {
  const turn = (question, tables, extra = {}) => ({ question, answer: `${question}的回答`, skillId: "", requestId: "", terms: [], tables, ...extra });

  test("sanitizeConversation 保留每轮用到的表", () => {
    const [kept] = pack.sanitizeConversation([{ question: "q", answer: "a", tables: [EQUITY, 3, "x".repeat(200)] }]);
    assert.deepEqual(kept.tables, [EQUITY, "3", "x".repeat(60)]);
    assert.deepEqual(pack.sanitizeConversation([{ question: "q", answer: "a" }])[0].tables, []);
  });

  test("同一张表追问：全部保留，不算切表", () => {
    const turns = [turn("a", [EQUITY]), turn("b", [EQUITY])];
    const result = pack.applyTableBoundary(turns, [EQUITY]);
    assert.equal(result.turns.length, 2);
    assert.equal(result.reset, null);
  });

  test("切到别的表：切表之前的轮次全部丢掉，并说明从哪张表切到哪张表", () => {
    const turns = [turn("a", [EQUITY]), turn("b", [EQUITY])];
    const result = pack.applyTableBoundary(turns, [OTHER]);
    assert.deepEqual(result.turns, []);
    assert.deepEqual(result.reset, { from: [EQUITY], to: [OTHER] });
  });

  test("切表后又问了一轮：新表的轮次保留，旧表的仍丢弃；切回旧表也不恢复更早的轮次", () => {
    const turns = [turn("a", [EQUITY]), turn("b", [OTHER]), turn("c", [OTHER])];
    assert.deepEqual(pack.applyTableBoundary(turns, [OTHER]).turns.map(item => item.question), ["b", "c"]);
    assert.equal(pack.applyTableBoundary(turns, [OTHER]).reset, null);
    const back = pack.applyTableBoundary(turns, [EQUITY]);
    assert.deepEqual(back.turns, []);
    assert.deepEqual(back.reset, { from: [OTHER], to: [EQUITY] });
  });

  test("本次没选表，或旧轮次没记录表：无法判断，不当作切表", () => {
    const turns = [turn("a", [EQUITY])];
    assert.equal(pack.applyTableBoundary(turns, []).turns.length, 1);
    assert.equal(pack.applyTableBoundary([turn("a", [])], [OTHER]).turns.length, 1);
  });

  test("表集合有交集（多选里仍含原来的表）不算切表", () => {
    const result = pack.applyTableBoundary([turn("a", [EQUITY])], [EQUITY, OTHER]);
    assert.equal(result.turns.length, 1);
    assert.equal(result.reset, null);
  });

  test("上下文提示词：只在同一张表内沿用；切表时写明旧对话不适用", () => {
    const text = pack.buildConversationContext([turn("a", [EQUITY])]);
    assert.match(text, /同一张表/);
    assert.doesNotMatch(text, /只有用户明确改变时才更换/);
    const reset = pack.buildConversationContext([], { reset: { from: [EQUITY], to: [OTHER] } });
    assert.match(reset, new RegExp(`已切换到「${OTHER}」`));
    assert.match(reset, new RegExp(EQUITY));
    assert.match(reset, /不适用/);
    assert.equal(pack.buildConversationContext([]), "");
  });
});

describe("切表后的分析请求", () => {
  let harness;
  before(async () => { harness = await startHarness(); });
  after(async () => { await harness.stop(); });
  const reset = () => { harness.relay.requests.length = 0; harness.relay.toolScript = []; harness.relay.report = "测试回答"; };
  const userOf = request => request.messages.find(message => message.role === "user")?.content || "";
  const OLD_TURN = { question: "任哥近 7 天消耗多少", answer: "任哥近 7 天消耗 10 万。", skillId: PACK, terms: ["任哥"], tables: [EQUITY] };

  test("切表：旧问题和回答摘要不进提示词，不沿用技能和口径词，并写明已切表", async () => {
    reset();
    const result = await harness.analyzeStream("林金维", {
      skillId: "general-analyst", scenario: "general", question: "那昨天呢", tables: [OTHER], conversation: [OLD_TURN]
    });
    assert.equal(result.status, 200);
    const started = result.events.find(event => event.started);
    assert.notEqual(started.routeReason, "沿用上一轮的技能");
    assert.notEqual(started.routedSkill?.id, PACK, "切表后不能沿用权益包");
    assert.deepEqual(started.resolved, [], "旧表的口径词不沿用");
    assert.deepEqual(started.contextReset, { from: [EQUITY], to: [OTHER] });
    assert.deepEqual(result.done.meta.contextReset, { from: [EQUITY], to: [OTHER] });
    const prompts = harness.relay.requests.map(userOf).join("\n");
    assert.doesNotMatch(prompts, /任哥近 7 天消耗/);
    assert.doesNotMatch(prompts, /消耗 10 万/);
    assert.match(prompts, new RegExp(`已切换到「${OTHER}」`));
  });

  test("同一张表追问：行为不变，仍沿用技能、口径词和对话内容", async () => {
    reset();
    const result = await harness.analyzeStream("林金维", {
      skillId: "general-analyst", scenario: "general", question: "那昨天呢", tables: [EQUITY], conversation: [OLD_TURN]
    });
    const started = result.events.find(event => event.started);
    assert.equal(started.routedSkill.id, PACK);
    assert.equal(started.contextReset, undefined);
    assert.match(harness.relay.requests.map(userOf).join("\n"), /任哥近 7 天消耗 10 万/);
  });

  test("切表后点「整理成报告」：不复用旧表的证据账本", async () => {
    reset();
    const first = await harness.analyzeStream("林金维", { skillId: PACK, scenario: "equity", question: "任哥近 7 天消耗多少", tables: [EQUITY] });
    const requestId = first.done.meta.requestId;
    reset();
    const report = await harness.analyzeStream("林金维", {
      skillId: "general-analyst", scenario: "general", question: "把上面的分析整理成周报", output: "report", template: "weekly", tables: [OTHER],
      conversation: [{ ...OLD_TURN, requestId }]
    });
    assert.equal(report.status, 200);
    assert.deepEqual(report.done.meta.basedOn || [], [], "账本不能带进来");
    assert.doesNotMatch(harness.relay.requests.map(userOf).join("\n"), /任哥近 7 天消耗 10 万/);
  });
});
