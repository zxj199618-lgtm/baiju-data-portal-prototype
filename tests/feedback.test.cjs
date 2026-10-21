/**
 * 回答反馈测试：只能评价自己的分析、重复提交覆盖、管理员汇总、历史记录保留评价。
 * 运行：node --test tests/feedback.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { startHarness } = require("./helpers/gateway-harness.cjs");

describe("回答反馈", () => {
  let harness;
  before(async () => { harness = await startHarness(); });
  after(async () => { await harness.stop(); });

  const analyze = async name => {
    const result = await harness.call("POST", "/v1/analyze", {
      token: await harness.tokenFor(name),
      body: { question: `${name} 的问题：广告计划表有哪些字段？`, scenario: "single", model: harness.MODEL, tables: ["广告计划日报表"], toolMode: false }
    });
    assert.equal(result.status, 200);
    return result.data.meta.requestId;
  };
  const rate = async (name, body) => harness.call("POST", "/v1/feedback", { token: await harness.tokenFor(name), body });

  test("评价自己的分析：成功，并记录模型、Skill 与问题摘要", async () => {
    const requestId = await analyze("李雨航");
    const result = await rate("李雨航", { requestId, rating: "down", comment: "口径不对" });
    assert.equal(result.status, 200);
    const list = await harness.call("GET", "/v1/feedback", { token: await harness.tokenFor("曾祥竞") });
    const item = list.data.items.find(entry => entry.requestId === requestId);
    assert.equal(item.rating, "down");
    assert.equal(item.comment, "口径不对");
    assert.equal(item.user, "李雨航");
    assert.equal(item.model, harness.MODEL);
    assert.match(item.question, /广告计划表/);
  });

  test("不能评价别人的分析，也不能评价不存在的分析", async () => {
    const requestId = await analyze("谭嘉颖");
    assert.equal((await rate("林金维", { requestId, rating: "up" })).status, 404, "别人的 requestId 不应能被评价");
    assert.equal((await rate("林金维", { requestId: "不存在的id", rating: "up" })).status, 404);
  });

  test("评价值非法被拒绝；未登录被拒绝", async () => {
    const requestId = await analyze("李雨航");
    assert.equal((await rate("李雨航", { requestId, rating: "meh" })).status, 400);
    assert.equal((await harness.call("POST", "/v1/feedback", { body: { requestId, rating: "up" } })).status, 401);
  });

  test("重复评价覆盖上一次，不会产生两条；评语最多 500 字", async () => {
    const requestId = await analyze("黄佩贤");
    await rate("黄佩贤", { requestId, rating: "down", comment: "x".repeat(900) });
    await rate("黄佩贤", { requestId, rating: "up" });
    const list = await harness.call("GET", "/v1/feedback", { token: await harness.tokenFor("曾祥竞") });
    const mine = list.data.items.filter(entry => entry.requestId === requestId);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].rating, "up");
    const again = await rate("黄佩贤", { requestId, rating: "down", comment: "x".repeat(900) });
    assert.equal(again.status, 200);
    const final = (await harness.call("GET", "/v1/feedback?rating=down&limit=100", { token: await harness.tokenFor("曾祥竞") })).data.items.find(entry => entry.requestId === requestId);
    assert.equal(final.comment.length, 500);
  });

  test("只有管理员能看反馈列表与汇总，并可按评价筛选", async () => {
    assert.equal((await harness.call("GET", "/v1/feedback", { token: await harness.tokenFor("李雨航") })).status, 403);
    const admin = await harness.tokenFor("曾祥竞");
    const downs = await harness.call("GET", "/v1/feedback?rating=down", { token: admin });
    assert.ok(downs.data.items.every(entry => entry.rating === "down"));
    const summary = downs.data.summary;
    assert.ok(summary.total >= 2);
    assert.equal(summary.up + summary.down, summary.total);
    assert.ok(summary.byModel[harness.MODEL].down >= 1);
  });

  test("历史记录保留 requestId 与评价；非法评价值被丢弃", async () => {
    const token = await harness.tokenFor("李雨航");
    await harness.call("PUT", "/v1/history", {
      token,
      body: {
        reports: [],
        sessions: [{ id: "s1", title: "t", messages: [
          { role: "assistant", lines: ["a"], requestId: "req-1", feedback: "up" },
          { role: "assistant", lines: ["b"], requestId: "req-2", feedback: "<script>" }
        ] }]
      }
    });
    const history = await harness.call("GET", "/v1/history", { token });
    const [first, second] = history.data.sessions[0].messages;
    assert.equal(first.requestId, "req-1");
    assert.equal(first.feedback, "up");
    assert.equal(second.feedback, "", "非法评价值不应被保存");
  });
});
