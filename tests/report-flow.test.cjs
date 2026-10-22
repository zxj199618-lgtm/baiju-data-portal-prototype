/**
 * 按需报告的完整流程：取数事实入账本 → 用户要报告 → 基于账本写报告（不重新取数）。
 * 运行：node --test tests/report-flow.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { startHarness } = require("./helpers/gateway-harness.cjs");

const PACK = "equity-union-analyst";
const TABLE = "权益-账号维度消耗统计表";

describe("按需报告", () => {
  let harness;
  before(async () => { harness = await startHarness(); });
  after(async () => { await harness.stop(); });

  const reset = () => { harness.relay.requests.length = 0; harness.relay.toolScript = []; harness.relay.report = "测试回答"; };
  const systemOf = request => request.messages.find(message => message.role === "system")?.content || "";
  const userOf = request => request.messages.find(message => message.role === "user")?.content || "";
  const queryCost = (filters = []) => [{ calls: [{ id: "q1", type: "function", function: { name: "query_metric", arguments: JSON.stringify({ metric: "cost", table: TABLE, ...(filters.length ? { filters } : {}) }) } }] }];

  /** 先做一次普通取数分析，返回它的 requestId（它的事实会进账本） */
  async function analyzeOnce(name, question = "任哥近 7 天消耗多少") {
    reset();
    harness.relay.toolScript = queryCost([{ field: "department", values: ["投放一部-权益一组", "投放一部-权益二组"] }]);
    harness.relay.report = "任哥近 7 天消耗 10 万元。";
    const result = await harness.analyzeStream(name, { skillId: PACK, scenario: "equity", question });
    assert.equal(result.status, 200);
    return { requestId: result.done.meta.requestId, meta: result.done.meta };
  }

  test("普通分析：取到的事实进证据账本，不含参考资料；回答仍是简短回答（不是报告）", async () => {
    const { requestId, meta } = await analyzeOnce("林金维");
    assert.equal(meta.output, undefined, "没要报告时不走报告流程");
    const file = path.join(harness.dataDir, "evidence", `${requestId}.json`);
    assert.ok(fs.existsSync(file), "应写入账本");
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(saved.scope, "林金维");
    assert.deepEqual(saved.evidence.map(item => item.工具), ["query_metric"]);
    assert.deepEqual(saved.resolvedTerms.map(item => item.term), ["任哥"]);
    const finalStep = harness.relay.requests.find(request => !request.tools);
    assert.match(systemOf(finalStep), /回答协议/);
    assert.doesNotMatch(systemOf(finalStep), /报告撰写助手/);
  });

  test("点「整理成报告」（output=report）：基于账本写报告，不再调用任何取数工具", async () => {
    const { requestId } = await analyzeOnce("林金维");
    reset();
    harness.relay.report = "# 周报\n\n任哥近 7 天消耗 10 万元。";
    const result = await harness.analyzeStream("林金维", {
      skillId: "general-analyst", scenario: "general", question: "把上面的分析整理成周报", output: "report", template: "weekly",
      conversation: [{ question: "任哥近 7 天消耗多少", answer: "任哥近 7 天消耗 10 万元。", skillId: PACK, terms: ["任哥"], requestId }]
    });
    assert.equal(result.status, 200);
    assert.equal(harness.relay.requests.filter(request => request.tools).length, 0, "沿用已有事实时不应再取数");
    assert.equal(harness.relay.requests.length, 1);
    const request = harness.relay.requests[0];
    assert.match(systemOf(request), /报告撰写助手/);
    assert.match(systemOf(request), /## 报告模板：周报/);
    assert.doesNotMatch(systemOf(request), /回答协议/, "报告不用对话的回答协议");
    assert.match(userOf(request), /已核实的取数事实/);
    assert.match(userOf(request), /第 1 次取数：任哥近 7 天消耗多少/);
    assert.match(userOf(request), /query_metric/);
    const meta = result.done.meta;
    assert.equal(meta.output, "report");
    assert.equal(meta.template, "weekly");
    assert.deepEqual(meta.basedOn, [requestId]);
    assert.equal(meta.toolMode, "reuse:1");
    assert.ok(meta.numericCheck, "报告也做数字回查");
    assert.ok(result.events.find(event => event.started).output === "report");
    const audit = harness.readJsonLines("analysis-audit.jsonl").filter(item => item.type === "analysis").at(-1);
    assert.equal(audit.output, "report");
    assert.equal(audit.template, "weekly");
  });

  test("直接说「把上面的分析出个周报」：识别意图并选周报模板，沿用已有事实", async () => {
    const { requestId } = await analyzeOnce("林金维");
    reset();
    const result = await harness.analyzeStream("林金维", {
      skillId: "general-analyst", scenario: "general", question: "把上面的分析出个周报",
      conversation: [{ question: "任哥近 7 天消耗多少", answer: "10 万", skillId: PACK, terms: ["任哥"], requestId }]
    });
    assert.equal(result.done.meta.output, "report");
    assert.equal(result.done.meta.template, "weekly");
    assert.equal(harness.relay.requests.filter(request => request.tools).length, 0);
  });

  test("别人的 requestId 不能借用：账本读不到，退回到自己重新取数，不泄露对方的事实", async () => {
    const { requestId } = await analyzeOnce("林金维");
    reset();
    harness.relay.toolScript = queryCost();
    const result = await harness.analyzeStream("谭嘉颖", {
      skillId: PACK, scenario: "equity", question: "把上面的分析整理成报告", output: "report",
      conversation: [{ question: "任哥近 7 天消耗多少", answer: "10 万", skillId: PACK, requestId }]
    });
    assert.equal(result.status, 200);
    assert.deepEqual(result.done.meta.basedOn, []);
    assert.ok(harness.relay.requests.some(request => request.tools), "读不到别人的账本，应走自己的取数");
    assert.ok(!harness.relay.requests.some(request => userOf(request).includes("已核实的取数事实")));
  });

  test("没有任何已有事实、直接说「出一份权益周报」：先取数，再按周报模板写", async () => {
    reset();
    harness.relay.toolScript = queryCost();
    harness.relay.report = "# 周报\n\n消耗 44 万。";
    const result = await harness.analyzeStream("林金维", { skillId: PACK, scenario: "equity", question: "帮我出一份权益周报" });
    assert.equal(result.status, 200);
    assert.equal(result.done.meta.output, "report");
    assert.equal(result.done.meta.template, "weekly");
    const toolStep = harness.relay.requests.find(request => request.tools);
    assert.ok(toolStep, "要先取数");
    assert.match(systemOf(toolStep), /本次要生成报告/);
    assert.doesNotMatch(systemOf(toolStep), /回答协议/);
    const finalStep = harness.relay.requests.find(request => !request.tools);
    assert.match(systemOf(finalStep), /## 报告模板：周报/);
    assert.match(userOf(finalStep), /表证据/);
    assert.match(result.events.map(event => event.status || "").join("|"), /正在撰写「周报」/);
  });

  test("在已有事实上补取新的内容：新旧事实一起进报告", async () => {
    const { requestId } = await analyzeOnce("林金维");
    reset();
    harness.relay.toolScript = queryCost([{ field: "department", values: ["伯都-权益"] }]);
    const result = await harness.analyzeStream("林金维", {
      skillId: PACK, scenario: "equity", question: "再加上伯都的情况，出一份周报",
      conversation: [{ question: "任哥近 7 天消耗多少", answer: "10 万", skillId: PACK, requestId }]
    });
    assert.deepEqual(result.done.meta.basedOn, [requestId]);
    assert.ok(harness.relay.requests.some(request => request.tools), "没说「上面的」，应补取新的事实");
    const finalStep = harness.relay.requests.find(request => !request.tools);
    assert.match(userOf(finalStep), /第 1 次取数：任哥近 7 天消耗多少/);
    assert.match(userOf(finalStep), /表证据/);
  });

  test("报告模板清单：登录即可读取", async () => {
    const templates = (await harness.call("GET", "/v1/report/templates", { token: await harness.tokenFor("谭嘉颖") })).data;
    assert.deepEqual(templates.map(item => item.id), ["general", "weekly", "review", "definition"]);
    assert.equal((await harness.call("GET", "/v1/report/templates")).status, 401);
  });

  test("被拦截的需求（按商户拆分）即使要报告也不会生成", async () => {
    reset();
    const result = await harness.analyzeStream("林金维", { skillId: PACK, scenario: "equity", question: "按商户出一份收入报告" });
    assert.equal(result.done.meta.toolMode, "guard:merchant-channel");
    assert.equal(harness.relay.requests.length, 0);
  });
});
