/**
 * 评测运行器自身的测试：用可编程的假模型验证「好答案通过、坏答案失败、泄露被发现、回退被标出」。
 * 运行：node --test tests/evals.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { startHarness } = require("./helpers/gateway-harness.cjs");
const { runEvals, findRegressions } = require("../scripts/run-evals.cjs");

describe("评测运行器", () => {
  let harness;
  before(async () => { harness = await startHarness(); });
  after(async () => { await harness.stop(); });

  const toolCall = (id, name, args) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });
  const hasToolResult = body => body.messages.some(message => message.role === "tool");

  /** 好模型：先调 query_metric，最终回答引用平台算出的数字 */
  const goodModel = {
    respond: body => (hasToolResult(body) ? { content: "" } : { calls: [toolCall("c1", "query_metric", { metric: "cost", table: "媒体消耗汇总" })] }),
    report: body => {
      const evidence = body.messages.find(message => message.role === "user").content;
      return `近 7 天总消耗 ${evidence.match(/"近N天": ([\d.]+)/)?.[1]} 元。`;
    }
  };
  /** 坏模型：调了工具，但最终回答编了一个数字 */
  const badModel = { respond: goodModel.respond, report: () => "近 7 天总消耗 123.45 元。" };

  const cases = {
    defaults: { user: "曾祥竞", scenario: "single", maxUngrounded: 0 },
    cases: [{
      id: "cost-total", title: "总消耗", question: "近 7 天总消耗是多少？", tables: ["媒体消耗汇总"],
      expect: { anyTool: ["query_metric"], cites: [{ metric: "cost", table: "媒体消耗汇总", field: "近N天" }] }
    }]
  };
  const run = extra => runEvals({ baseUrl: harness.baseUrl, password: harness.PASSWORD, cases, models: [harness.MODEL], ...extra });

  test("好答案通过：调用了工具，并引用了平台算出的标准答案", async () => {
    Object.assign(harness.relay, goodModel);
    const report = await run();
    assert.equal(report.results[0].passed, true, JSON.stringify(report.results[0].checks.filter(check => !check.ok)));
    assert.equal(report.summary[harness.MODEL].passed, 1);
    assert.ok(report.summary[harness.MODEL].tokens > 0, "应统计 token 用量");
  });

  test("编造数字的答案失败，并指出没有引用标准答案", async () => {
    Object.assign(harness.relay, badModel);
    const report = await run();
    assert.equal(report.results[0].passed, false);
    const failed = report.results[0].checks.filter(check => !check.ok).map(check => check.name).join("\n");
    assert.match(failed, /引用了标准答案/);
  });

  test("相对基线：基线里通过、现在失败的用例被标为回退", async () => {
    Object.assign(harness.relay, goodModel);
    const baseline = await run();
    Object.assign(harness.relay, badModel);
    const current = await run();
    assert.deepEqual(findRegressions(current, baseline), [`${harness.MODEL}::cost-total`]);
    assert.deepEqual(findRegressions(baseline, current), [], "反过来不是回退");
  });

  test("权限类用例：答案里出现无权限的真实数字会被发现，没有则通过", async () => {
    const leakCases = {
      defaults: { maxUngrounded: 99 },
      cases: [{
        id: "no-revenue-leak", title: "不泄露收入", user: "李雨航", question: "产品 ROI 日报近 7 天收入是多少？", tables: [],
        expect: { mustNotCite: [{ metric: "revenue", table: "产品 ROI 日报", field: "近N天", as: "曾祥竞" }] }
      }]
    };
    const admin = await harness.call("POST", "/v1/metrics/query", { token: await harness.tokenFor("曾祥竞"), body: { metric: "revenue", table: "产品 ROI 日报" } });
    const trueRevenue = admin.data.近N天;
    assert.ok(trueRevenue > 0);

    harness.relay.respond = undefined;
    harness.relay.report = () => `收入是 ${trueRevenue} 元`;
    const leaked = await runEvals({ baseUrl: harness.baseUrl, password: harness.PASSWORD, cases: leakCases, models: [harness.MODEL] });
    assert.equal(leaked.results[0].passed, false, "泄露了无权限的数字，应判失败");

    harness.relay.report = () => "您没有权限查看该表。";
    const safe = await runEvals({ baseUrl: harness.baseUrl, password: harness.PASSWORD, cases: leakCases, models: [harness.MODEL] });
    assert.equal(safe.results[0].passed, true);
  });

  test("mustMatchAny：满足其中任意一个即可（如无权限时「如实说明」或「先追问」都算通过）", async () => {
    const anyCases = { defaults: { maxUngrounded: 99 }, cases: [{ id: "deny-or-ask", title: "说明或追问", question: "收入？", tables: [], expect: { mustMatchAny: ["没有权限", "```ask"] } }] };
    harness.relay.respond = undefined;
    harness.relay.report = () => "您没有权限查看该表。";
    const denied = await runEvals({ baseUrl: harness.baseUrl, password: harness.PASSWORD, cases: anyCases, models: [harness.MODEL] });
    assert.equal(denied.results[0].passed, true);
    harness.relay.report = () => "这是一份完全无关的回答。";
    const unrelated = await runEvals({ baseUrl: harness.baseUrl, password: harness.PASSWORD, cases: anyCases, models: [harness.MODEL] });
    assert.equal(unrelated.results[0].passed, false);
  });

  test("期望的 HTTP 状态：引用无权限的表应返回 403，符合期望即通过", async () => {
    const statusCases = {
      cases: [{ id: "forbidden-table", title: "无权限的表", user: "李雨航", question: "收入？", tables: ["产品 ROI 日报"], expect: { expectStatus: 403 } }]
    };
    const report = await runEvals({ baseUrl: harness.baseUrl, password: harness.PASSWORD, cases: statusCases, models: [harness.MODEL] });
    assert.equal(report.results[0].passed, true, JSON.stringify(report.results[0].checks));
  });

  test("--filter 只跑匹配的用例；仓库里的黄金问题集格式正确", async () => {
    const report = await run({ filter: "不存在的用例" });
    assert.equal(report.results.length, 0);
    const golden = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "evals", "cases.json"), "utf8"));
    const ids = golden.cases.map(item => item.id);
    assert.equal(new Set(ids).size, ids.length, "用例 id 不能重复");
    golden.cases.forEach(item => {
      assert.ok(item.question && item.expect, `${item.id} 缺少问题或期望`);
      (item.expect.cites || []).concat(item.expect.mustNotCite || []).forEach(spec => assert.ok(spec.metric && spec.table && spec.field, `${item.id} 的标准答案定义不完整`));
    });
    assert.ok(golden.cases.length >= 10);
  });
});
