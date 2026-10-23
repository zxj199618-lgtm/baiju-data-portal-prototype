/**
 * 报告提速：生成报告时压低模型思考、限定篇幅、精简提示词与事实。
 * 运行：node --test tests/report-speed.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { startHarness } = require("./helpers/gateway-harness.cjs");
const { lightweightThinking } = require("../scripts/thinking-control.cjs");
const report = require("../scripts/report-skill.cjs");
const { loadPacks } = require("../scripts/skill-pack.cjs");

const templates = loadPacks(path.join(__dirname, "..", "skill-packs")).get("report-writer").spec.templates;
const PACK = "equity-union-analyst";
const TABLE = "权益-账号维度消耗统计表";

describe("轻量思考参数", () => {
  test("声明了 low 档的模型用 reasoning_effort=low；千问、智谱、Kimi、豆包等按家族关闭思考；不认识的不改变行为", () => {
    assert.deepEqual(lightweightThinking("gpt-5.6-sol", { levels: ["low", "medium", "high"] }), { reasoning_effort: "low" });
    assert.deepEqual(lightweightThinking("qwen3.8-max-0902", { levels: [] }), { enable_thinking: false });
    for (const id of ["glm-5.3", "ZHIPU/GLM-5.3", "kimi-k3", "deepseek-v3.2", "doubao-seed-2-1-pro-260915"]) assert.deepEqual(lightweightThinking(id, { levels: [] }), { thinking: { type: "disabled" } }, id);
    assert.deepEqual(lightweightThinking("some-unknown-model", { levels: [] }), {});
    assert.deepEqual(lightweightThinking("", null), {});
  });
});

describe("事实精简", () => {
  const evidence = [{
    工具: "query_metric", 参数: "{}",
    结果: { 表名: "T", 指标: "roi_self", 名称: "自营 ROI", 近N天: 1.0375, 前N天: 1.0054, 环比百分比: 3.19, 窗口: { N: 7, 近N天: ["2026-08-25", "2026-08-31"] },
      口径: { 说明: "很长的口径说明".repeat(20), 状态: "草稿（待数据团队确认）", 负责人: "待确认", 固定筛选: [{ 字段: "commodity_classify", 取值: ["常规套餐"] }] },
      提示: "日级 ROI 受订单与消耗不同轴影响，周 / 月口径才可靠。", 读法: "x".repeat(200), 空值: null, 空数组: [] }
  }, {
    工具: "query_metric", 参数: "{}",
    结果: { 指标: "cost", 名称: "消耗", 近N天: 188952.88, 口径: { 说明: "另一段口径说明", 状态: "草稿（待数据团队确认）" }, 提示: "日级 ROI 受订单与消耗不同轴影响，周 / 月口径才可靠。" }
  }];

  test("去掉重复的长说明和空值；提示去重、草稿口径合并成一段放在最后；数字原样保留", () => {
    const section = report.buildFactsSection([{ question: "q", evidence }]);
    assert.doesNotMatch(section, /很长的口径说明|另一段口径说明|负责人|读法|空值|空数组/);
    assert.equal(section.split("日级 ROI 受订单与消耗不同轴影响").length - 1, 1, "同一条提示只出现一次");
    assert.match(section, /### 口径提示（对所有事实适用）/);
    assert.match(section, /草稿口径（待数据团队确认）：自营 ROI、消耗/);
    for (const value of ["1.0375", "1.0054", "3.19", "188952.88", "常规套餐", "2026-08-25"]) assert.ok(section.includes(value), `${value} 应保留`);
  });

  test("精简明显变短；原件不被改动（账本与数字回查仍用原件）", () => {
    const before = JSON.stringify(evidence);
    const compact = JSON.stringify(report.compactEvidence(evidence).items);
    assert.ok(compact.length < before.length * 0.6, `精简后 ${compact.length} vs 原来 ${before.length}`);
    assert.equal(JSON.stringify(evidence), before);
  });
});

describe("模板篇幅", () => {
  test("每个模板都有字数上限，写进提示词", () => {
    for (const template of templates) {
      assert.ok(template.maxChars >= 600 && template.maxChars <= 1000, template.id);
      assert.match(report.buildTemplateSection(template), new RegExp(`全文不超过 ${template.maxChars} 字，表格最多 2 个`));
    }
  });
});

describe("报告请求本身", () => {
  let harness;
  before(async () => { harness = await startHarness(); });
  after(async () => { await harness.stop(); });
  const call = (name, args) => ({ calls: [{ id: `${name}-1`, type: "function", function: { name, arguments: JSON.stringify(args) } }] });

  async function firstAnswer() {
    harness.relay.requests.length = 0;
    harness.relay.toolScript = [call("query_metric", { metric: "roi_self", table: TABLE })];
    const result = await harness.analyzeStream("林金维", { skillId: PACK, scenario: "equity", question: "近 7 天自营 ROI 怎么样", reasoningEffort: "high" });
    return result.done.meta.requestId;
  }

  test("报告：提示词精简（没有场景名 / 数据表说明 / 门户配置说明 / 缺省值 / 前几轮回答摘要），带篇幅上限，并压低思考；普通回答不受影响", async () => {
    const requestId = await firstAnswer();
    const normal = harness.relay.requests.filter(request => !request.tools).at(-1);
    assert.equal(normal.reasoning_effort, "high", "普通回答按用户选择的思考档位");
    assert.equal(normal.enable_thinking, undefined);

    harness.relay.requests.length = 0;
    const result = await harness.analyzeStream("林金维", {
      skillId: "general-analyst", scenario: "general", question: "把上面的分析整理成周报", output: "report", template: "weekly", reasoningEffort: "high",
      conversation: [{ question: "近 7 天自营 ROI 怎么样", answer: "这是一段很长的回答摘要，报告里不需要它。", skillId: PACK, requestId }]
    });
    assert.equal(result.done.meta.output, "report");
    const request = harness.relay.requests[0];
    const system = request.messages.find(message => message.role === "system").content;
    const user = request.messages.find(message => message.role === "user").content;
    assert.match(system, /全文不超过 900 字，表格最多 2 个/);
    for (const unwanted of ["## 分析场景", "## 引用数据表", "## 门户配置说明", "缺省值", "回答摘要", "这是一段很长的回答摘要"]) assert.ok(!user.includes(unwanted), `报告提示词不应包含「${unwanted}」`);
    assert.match(user, /第 1 轮 用户：近 7 天自营 ROI 怎么样/);
    assert.match(user, /已核实的取数事实/);
    const lowered = request.reasoning_effort === "low" || request.enable_thinking === false || request.thinking?.type === "disabled";
    assert.ok(lowered, `应压低思考：${JSON.stringify({ e: request.reasoning_effort, t: request.enable_thinking, k: request.thinking })}`);
    assert.match(String(result.done.meta.reasoningEffort), /^(low|off)$/);
  });

  test("上游拒绝这些参数时自动去掉重试，报告照常生成", async () => {
    const requestId = await firstAnswer();
    harness.relay.requests.length = 0;
    harness.relay.rejectThinking = true;
    harness.relay.report = "# 周报\n\n消耗稳定，自营 ROI 约 1.0，各部门没有需要立即处理的异常。";
    try {
      const result = await harness.analyzeStream("林金维", {
        skillId: PACK, scenario: "equity", question: "出个周报", output: "report", template: "weekly",
        conversation: [{ question: "近 7 天自营 ROI 怎么样", answer: "x", skillId: PACK, requestId }]
      });
      assert.equal(result.status, 200);
      assert.ok(result.events.some(event => event.delta), "重试后仍然生成了报告");
      const attempts = harness.relay.requests.filter(request => !request.tools);
      assert.ok(attempts.length >= 2, "先带参数试一次，被拒绝后去掉参数再试");
      assert.ok(attempts.at(-1).reasoning_effort === undefined && attempts.at(-1).enable_thinking === undefined);
    } finally {
      harness.relay.rejectThinking = false;
      harness.relay.report = "默认测试回答";
    }
  });

  test("取数循环：loopThinking=off 时每一步带「轻量思考」参数；默认不带；上游拒绝时去掉重试且之后的步骤不再带", async () => {
    harness.relay.requests.length = 0;
    harness.relay.toolScript = [call("query_metric", { metric: "cost", table: TABLE })];
    await harness.analyzeStream("林金维", { skillId: PACK, scenario: "equity", question: "近 7 天消耗", reasoningEffort: "high", loopThinking: "off" });
    const lightStep = harness.relay.requests.find(request => request.tools);
    assert.ok(lightStep.reasoning_effort === "low" || lightStep.enable_thinking === false || lightStep.thinking?.type === "disabled", JSON.stringify(lightStep.reasoning_effort));

    harness.relay.requests.length = 0;
    harness.relay.toolScript = [call("query_metric", { metric: "cost", table: TABLE })];
    await harness.analyzeStream("林金维", { skillId: PACK, scenario: "equity", question: "近 7 天消耗" });
    const defaultStep = harness.relay.requests.find(request => request.tools);
    assert.equal(defaultStep.enable_thinking, undefined);
    assert.equal(defaultStep.reasoning_effort, undefined, "默认保持原来的行为");

    harness.relay.requests.length = 0;
    harness.relay.rejectThinking = true;
    harness.relay.toolScript = [call("query_metric", { metric: "cost", table: TABLE })];
    try {
      const result = await harness.analyzeStream("林金维", { skillId: PACK, scenario: "equity", question: "近 7 天消耗", loopThinking: "off" });
      assert.equal(result.status, 200);
      assert.ok(result.done.meta.toolCalls.some(item => item.tool === "query_metric" && item.ok), "被拒绝后重试，工具仍然被调用");
      const toolRequests = harness.relay.requests.filter(request => request.tools);
      assert.ok(toolRequests.length >= 2 && toolRequests.at(-1).reasoning_effort === undefined && toolRequests.at(-1).enable_thinking === undefined);
    } finally {
      harness.relay.rejectThinking = false;
    }
  });

  test("loopThinking=after-first：第一步保留思考，之后的步骤才带轻量思考参数", async () => {
    harness.relay.requests.length = 0;
    harness.relay.toolScript = [call("list_metrics", {}), call("query_metric", { metric: "cost", table: TABLE })];
    await harness.analyzeStream("林金维", { skillId: PACK, scenario: "equity", question: "近 7 天消耗", reasoningEffort: "high", loopThinking: "after-first" });
    const steps = harness.relay.requests.filter(request => request.tools);
    assert.ok(steps.length >= 3, `循环至少三步，实际 ${steps.length}`);
    const light = request => request.reasoning_effort === "low" || request.enable_thinking === false || request.thinking?.type === "disabled";
    assert.equal(light(steps[0]), false, "第一步不带");
    assert.equal(light(steps[1]), true, "第二步起带");
    assert.equal(light(steps[2]), true);
  });
});
