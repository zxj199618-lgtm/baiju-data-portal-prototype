/**
 * Skill 组合：权益口径 + 归因工具 + 血缘工具，以及它们的结果进入证据账本、被「异动复盘」报告使用。
 * 运行：node --test tests/composition.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { startHarness } = require("./helpers/gateway-harness.cjs");

const TABLE = "权益-账号维度消耗统计表";

describe("Skill 组合", () => {
  let harness;
  before(async () => { harness = await startHarness(); });
  after(async () => { await harness.stop(); });
  const reset = () => { harness.relay.requests.length = 0; harness.relay.toolScript = []; harness.relay.report = "测试回答"; };
  const call = (name, args) => ({ calls: [{ id: `${name}-1`, type: "function", function: { name, arguments: JSON.stringify(args) } }] });
  const toolMessages = request => request.messages.filter(message => message.role === "tool").map(message => message.content);

  test("「任哥为什么变了」：自动进权益包，先看总体再归因，口径解析的范围用于限定归因", async () => {
    reset();
    const scope = [{ field: "department", values: ["投放一部-权益一组", "投放一部-权益二组"] }];
    harness.relay.toolScript = [call("query_metric", { metric: "cost", table: TABLE, filters: scope }), call("attribute_change", { metric: "cost", table: TABLE, filters: scope, dimensions: ["account_id"] })];
    const result = await harness.analyzeStream("林金维", { skillId: "general-analyst", scenario: "general", question: "任哥近 7 天消耗为什么变化了" });
    assert.equal(result.status, 200);
    assert.equal(result.events.find(event => event.started).routedSkill.id, "equity-union-analyst");
    assert.deepEqual(result.done.meta.toolCalls.map(item => item.tool), ["query_metric", "attribute_change"]);
    assert.ok(result.done.meta.toolCalls.every(item => item.ok));
    const withTools = harness.relay.requests.filter(request => request.tools).at(-1);
    const attribution = toolMessages(withTools).find(content => content.includes("各组变化之和等于总变化"));
    assert.ok(attribution, "归因结果应进入模型上下文");
    assert.match(attribution, /任哥一组-1/);
    assert.doesNotMatch(attribution, /伯都主号/, "限定到任哥后不应出现其他部门的账号");
    const toolSystem = harness.relay.requests.find(request => request.tools).messages[0].content;
    assert.match(toolSystem, /attribute_change/);
    assert.match(toolSystem, /效率效应/);
  });

  test("归因结果进证据账本；之后点「异动复盘」报告直接用它，不再取数", async () => {
    reset();
    harness.relay.toolScript = [call("attribute_change", { metric: "sign_rate", table: TABLE })];
    harness.relay.report = "签约率下降，主要来自伯都主号。";
    const first = await harness.analyzeStream("林金维", { skillId: "equity-union-analyst", scenario: "equity", question: "近 7 天自营签约率为什么下滑" });
    const requestId = first.done.meta.requestId;
    const saved = JSON.parse(fs.readFileSync(path.join(harness.dataDir, "evidence", `${requestId}.json`), "utf8"));
    assert.deepEqual(saved.evidence.map(item => item.工具), ["attribute_change"]);

    reset();
    const report = await harness.analyzeStream("林金维", {
      skillId: "general-analyst", scenario: "general", question: "把上面的分析整理成异动复盘", output: "report", template: "review",
      conversation: [{ question: "近 7 天自营签约率为什么下滑", answer: "签约率下降，主要来自伯都主号。", skillId: "equity-union-analyst", requestId }]
    });
    assert.equal(report.done.meta.template, "review");
    assert.equal(harness.relay.requests.filter(request => request.tools).length, 0);
    const request = harness.relay.requests[0];
    const user = request.messages.find(message => message.role === "user").content;
    assert.match(request.messages[0].content, /## 报告模板：异动复盘/);
    assert.match(request.messages[0].content, /定位过程/);
    assert.match(user, /attribute_change/);
    assert.match(user, /三部分之和等于总变化/);
    assert.match(user, /伯都主号/);
  });

  test("血缘与口径可以在同一轮里组合：先查血缘，再用权益口径取数", async () => {
    reset();
    harness.relay.toolScript = [call("get_lineage", { table: TABLE }), call("query_metric", { metric: "cost", table: TABLE })];
    const result = await harness.analyzeStream("林金维", { skillId: "equity-union-analyst", scenario: "equity", question: "这张权益表的上游是什么，近 7 天消耗多少" });
    assert.deepEqual(result.done.meta.toolCalls.map(item => item.tool), ["get_lineage", "query_metric"]);
    const withTools = harness.relay.requests.filter(request => request.tools).at(-1);
    assert.ok(toolMessages(withTools).some(content => content.includes("dws_equity_com_order_profit_detail_mv")), "应读到登记的上游表");
  });

  test("没有权限的表：血缘与归因都按「不存在或无权访问」处理，不泄露", async () => {
    reset();
    harness.relay.toolScript = [call("get_lineage", { table: "用户画像标签明细表" }), call("attribute_change", { metric: "cost", table: "不存在的表" })];
    const result = await harness.analyzeStream("谭嘉颖", { skillId: "equity-union-analyst", scenario: "equity", question: "看下用户画像表的血缘" });
    assert.ok(result.done.meta.toolCalls.every(item => item.ok === false));
  });
});
