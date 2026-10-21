/**
 * ask_user 工具测试：校验规整（单元）+ 经网关的暂停与恢复行为（端到端）。
 * 运行：node --test tests/ask-user.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { createAnalysisToolkit } = require("../scripts/analysis-tools.cjs");
const { startHarness } = require("./helpers/gateway-harness.cjs");

const makeToolkit = (options = {}) => createAnalysisToolkit({ userName: "测试用户", allowedTables: [], tables: [], rowsOf: () => [], ...options });
const ask = (toolkit, args) => toolkit.execute("ask_user", JSON.stringify(args));
const good = { title: "确认口径", intro: "需要确认指标", questions: [{ key: "metric", question: "看哪个指标？", options: [{ label: "消耗", desc: "cost" }, { label: "CPA" }] }] };

describe("ask_user（单元）", () => {
  test("合法追问被规整成界面使用的格式（字符串选项自动转成 label）", () => {
    const outcome = ask(makeToolkit(), { questions: [{ question: "看哪个指标？", multiple: true, options: ["消耗", "CPA", "ROI"] }] });
    assert.equal(outcome.ok, true);
    const payload = outcome.data.payload;
    assert.equal(payload.title, "需要你确认");
    assert.equal(payload.questions[0].key, "q1");
    assert.equal(payload.questions[0].multiple, true);
    assert.deepEqual(payload.questions[0].options, [{ label: "消耗" }, { label: "CPA" }, { label: "ROI" }]);
  });

  test("问题超过 3 个、选项少于 2 个或多于 6 个、缺少题目都被拒绝并给出原因", () => {
    const toolkit = makeToolkit();
    const q = options => ({ question: "问题", options });
    assert.match(ask(toolkit, { questions: [q(["a", "b"]), q(["a", "b"]), q(["a", "b"]), q(["a", "b"])] }).error, /最多 3 个问题/);
    assert.match(ask(toolkit, { questions: [q(["只有一个"])] }).error, /需要 2-6 个选项/);
    assert.match(ask(toolkit, { questions: [q(["1", "2", "3", "4", "5", "6", "7"])] }).error, /需要 2-6 个选项/);
    assert.match(ask(toolkit, { questions: [{ options: ["a", "b"] }] }).error, /缺少题目/);
    assert.match(ask(toolkit, {}).error, /至少需要 1 个问题/);
  });

  test("过长的文字被截断，空选项被丢弃", () => {
    const outcome = ask(makeToolkit(), { title: "t".repeat(200), questions: [{ question: "q".repeat(500), options: ["a", "  ", "b"] }] });
    assert.equal(outcome.data.payload.title.length, 60);
    assert.equal(outcome.data.payload.questions[0].question.length, 120);
    assert.equal(outcome.data.payload.questions[0].options.length, 2);
  });

  test("allowAsk=false 时工具不出现在定义里，直接调用也被拒绝", () => {
    const toolkit = makeToolkit({ allowAsk: false });
    assert.equal(toolkit.schemas.some(tool => tool.function.name === "ask_user"), false);
    assert.equal(ask(toolkit, good).ok, false);
  });
});

describe("ask_user（经网关）", () => {
  let harness;
  before(async () => { harness = await startHarness(); });
  after(async () => { await harness.stop(); });

  const callAsk = args => ({ id: "a1", type: "function", function: { name: "ask_user", arguments: JSON.stringify(args) } });
  const parseAskBlock = text => JSON.parse(text.match(/```ask\n([\s\S]*?)\n```/)[1]);

  test("模型提问时：界面收到与旧协议一致的 ```ask 块，本轮暂停且不再调用最终回答", async () => {
    harness.relay.requests.length = 0;
    harness.relay.toolScript = [{ calls: [callAsk(good)] }];
    const result = await harness.analyzeStream("曾祥竞", { question: "消耗怎么样？", tables: [] });
    assert.equal(result.status, 200);
    const text = result.events.filter(event => event.delta).map(event => event.delta).join("");
    const payload = parseAskBlock(text);
    assert.equal(payload.title, "确认口径");
    assert.deepEqual(payload.questions[0].options.map(option => option.label), ["消耗", "CPA"]);
    assert.equal(result.done.meta.toolMode, "ask:1");
    assert.equal(harness.relay.requests.length, 1, "只调用了一次模型，没有最终回答那一次");
    assert.ok(result.events.some(event => event.tool?.name === "ask_user"));
  });

  test("非流式同样返回问题卡片，并计入审计", async () => {
    harness.relay.toolScript = [{ calls: [callAsk(good)] }];
    const result = await harness.call("POST", "/v1/analyze", {
      token: await harness.tokenFor("曾祥竞"),
      body: { question: "有哪些表？", scenario: "single", model: harness.MODEL, tables: [] }
    });
    assert.equal(result.status, 200);
    assert.equal(parseAskBlock(result.data.report).questions.length, 1);
    const audit = harness.readJsonLines("analysis-audit.jsonl").find(entry => entry.requestId === result.data.meta.requestId);
    assert.equal(audit.toolMode, "ask:1");
  });

  test("模型给出不合格的追问时，错误返回给模型，由它重新提问", async () => {
    harness.relay.requests.length = 0;
    harness.relay.toolScript = [{ calls: [callAsk({ questions: [{ question: "只有一个选项", options: ["a"] }] })] }, { calls: [callAsk(good)] }];
    const result = await harness.analyzeStream("曾祥竞", { question: "消耗？", tables: [] });
    assert.equal(result.done.meta.toolMode, "ask:2");
    const toolMessages = harness.relay.requests.flatMap(body => body.messages.filter(message => message.role === "tool"));
    assert.match(toolMessages[0].content, /需要 2-6 个选项/);
  });

  test("用户已补充信息时不再提供提问工具：即使模型要提问也被拒绝，直接进入分析", async () => {
    harness.relay.requests.length = 0;
    harness.relay.toolScript = [{ calls: [callAsk(good)] }];
    harness.relay.report = "最终分析结果";
    const result = await harness.analyzeStream("曾祥竞", { question: "消耗怎么样？\n\n用户补充信息：近 7 天", tables: [] });
    const toolNames = harness.relay.requests[0].tools.map(tool => tool.function.name);
    assert.equal(toolNames.includes("ask_user"), false, "请求里不应带有 ask_user");
    assert.equal(result.done.meta.toolMode.startsWith("ask"), false);
    assert.equal(result.events.filter(event => event.delta).map(event => event.delta).join(""), "最终分析结果");
  });
});
