/**
 * 规划层的纯逻辑：什么时候需要模型判断、提示词、回复解析、可信度、小模型选择、plan 汇总。
 * 运行：node --test tests/planner.test.cjs
 */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const planner = require("../scripts/planner.cjs");

const skills = planner.describeSkills([
  { id: "equity-union-analyst", title: "权益投放分析", desc: "银联权益", useWhen: ["权益投放的消耗、签约漏斗"], notFor: ["按商户拆分"] },
  { id: "asset-qa", title: "数据资产问答", displayDesc: "有哪些表、口径、负责人" }
]);

describe("什么时候需要模型判断", () => {
  test("只有落到兜底、且有两个以上业务技能时才需要", () => {
    assert.equal(planner.needsModelPlanning({ reason: "未命中关键词，使用兜底技能" }, skills), true);
    assert.equal(planner.needsModelPlanning({ reason: "命中关键词「任哥」" }, skills), false);
    assert.equal(planner.needsModelPlanning({ reason: "沿用上一轮的技能" }, skills), false);
    assert.equal(planner.needsModelPlanning({ reason: "未命中关键词，使用兜底技能" }, skills.slice(0, 1)), false);
    assert.equal(planner.needsModelPlanning(null, skills), false);
  });
});

describe("提示词与回复解析", () => {
  test("提示词包含每个技能的适用 / 不适用、输出形式说明和用户这句话", () => {
    const prompt = planner.buildPlannerPrompt({ question: "各部门昨天的 ROI 怎么样", skills, conversation: [{ question: "上一句" }] });
    assert.match(prompt, /- equity-union-analyst：权益投放分析；银联权益/);
    assert.match(prompt, /适用：权益投放的消耗、签约漏斗/);
    assert.match(prompt, /不适用：按商户拆分/);
    assert.match(prompt, /- asset-qa：数据资产问答；有哪些表、口径、负责人/);
    assert.match(prompt, /report：只有用户明确要/);
    assert.match(prompt, /各部门昨天的 ROI 怎么样/);
    assert.match(prompt, /第 1 轮：上一句/);
  });

  test("解析：容忍代码块与前后文字；技能 id 必须在候选里；置信度夹在 0 到 1", () => {
    const ids = ["equity-union-analyst", "asset-qa"];
    const good = planner.parsePlannerReply('好的：\n```json\n{"skill":"equity-union-analyst","output":"report","confidence":0.82,"reason":"问的是权益 ROI"}\n```', ids);
    assert.deepEqual(good, { skillId: "equity-union-analyst", output: "report", confidence: 0.82, reason: "问的是权益 ROI" });
    assert.equal(planner.parsePlannerReply('{"skill":"不存在","confidence":0.9}', ids).skillId, "");
    assert.equal(planner.parsePlannerReply('{"skill":"asset-qa","confidence":5}', ids).confidence, 1);
    assert.equal(planner.parsePlannerReply('{"skill":"asset-qa","output":"其他"}', ids).output, "answer");
    assert.equal(planner.parsePlannerReply("没有 json", ids), null);
    assert.equal(planner.parsePlannerReply("{坏的", ids), null);
  });

  test("只有技能有效且置信度达标才采用", () => {
    assert.equal(planner.acceptPlan({ skillId: "x", confidence: 0.6 }), true);
    assert.equal(planner.acceptPlan({ skillId: "x", confidence: 0.59 }), false);
    assert.equal(planner.acceptPlan({ skillId: "", confidence: 0.99 }), false);
    assert.equal(planner.acceptPlan(null), false);
  });
});

describe("小模型选择", () => {
  test("指定的优先；其次名字带 flash / mini 等的；最后用请求的模型", () => {
    const callable = ["qwen3.8-max", "kimi-k3", "qwen3.8-flash"];
    assert.equal(planner.pickPlannerModel({ requested: "kimi-k3", preferred: "kimi-k3", callable }), "kimi-k3");
    assert.equal(planner.pickPlannerModel({ requested: "kimi-k3", callable }), "qwen3.8-flash");
    assert.equal(planner.pickPlannerModel({ requested: "kimi-k3", preferred: "不可用", callable: ["kimi-k3"] }), "kimi-k3");
  });
});

describe("plan 汇总", () => {
  test("带来源与理由；备选里不含当前技能，最多 6 个", () => {
    const plan = planner.buildPlan({ skill: { id: "a", title: "A 技能" }, source: "keyword", reason: "命中关键词「任哥」", output: "answer", alternatives: [{ id: "a", title: "A 技能" }, { id: "b", name: "B 技能" }] });
    assert.deepEqual(plan, { skillId: "a", skillName: "A 技能", source: "keyword", reason: "命中关键词「任哥」", output: "answer", template: "", alternatives: [{ id: "b", name: "B 技能" }] });
    assert.equal(planner.buildPlan({ skill: null, source: "fallback", output: "report", confidence: 0.7 }).confidence, 0.7);
  });

  test("路由理由归类为来源", () => {
    assert.equal(planner.sourceOfReason("命中关键词「任哥」", false), "keyword");
    assert.equal(planner.sourceOfReason("沿用上一轮的技能", false), "sticky");
    assert.equal(planner.sourceOfReason("未命中关键词，使用兜底技能", false), "fallback");
    assert.equal(planner.sourceOfReason("", true), "manual");
  });
});
