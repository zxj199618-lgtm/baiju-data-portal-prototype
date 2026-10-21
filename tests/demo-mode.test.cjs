/**
 * 演示登录模式：共用公开密码的账号不能被锁死，访客之间历史 / 用量 / 反馈互相隔离，并有全站 token 兜底。
 * 运行：node --test tests/demo-mode.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { startHarness, PASSWORD } = require("./helpers/gateway-harness.cjs");

const A = { "X-Visitor-Id": "visitor-aaaaaaaaaaaa" };
const B = { "X-Visitor-Id": "visitor-bbbbbbbbbbbb" };

describe("演示模式：账号不会被锁死", () => {
  let harness;
  before(async () => { harness = await startHarness({ env: { PORTAL_DEMO_LOGIN_PASSWORD: PASSWORD } }); });
  after(async () => { await harness.stop(); });

  test("连续输错很多次也不锁定，正确密码随时能登录", async () => {
    for (let index = 0; index < 8; index += 1) {
      assert.equal((await harness.call("POST", "/v1/auth/login", { body: { name: "李雨航", password: "wrong" } })).status, 401);
    }
    assert.equal((await harness.call("POST", "/v1/auth/login", { body: { name: "李雨航", password: PASSWORD } })).status, 200);
  });

  test("历史按访客隔离：同一个账号、不同浏览器互相看不到", async () => {
    const token = await harness.tokenFor("李雨航");
    const session = { id: "s-a", title: "访客 A 的会话", messages: [{ role: "user", lines: ["A"] }] };
    await harness.call("PUT", "/v1/history", { token, headers: A, body: { sessions: [session], reports: [] } });
    const seenByA = await harness.call("GET", "/v1/history", { token, headers: A });
    const seenByB = await harness.call("GET", "/v1/history", { token, headers: B });
    const seenWithoutId = await harness.call("GET", "/v1/history", { token });
    assert.deepEqual(seenByA.data.sessions.map(item => item.id), ["s-a"]);
    assert.deepEqual(seenByB.data.sessions, [], "另一个访客不应看到");
    assert.deepEqual(seenWithoutId.data.sessions, [], "没带访客 id 的请求落在账号本身的桶里，也看不到访客的会话");
  });

  test("请求头里的访客 id 格式不合法时被忽略（落回账号本身，不能借此读写别人的桶）", async () => {
    const token = await harness.tokenFor("谭嘉颖");
    await harness.call("PUT", "/v1/history", { token, headers: { "X-Visitor-Id": "bad~visitor-id-1234" }, body: { sessions: [{ id: "s-bad", title: "t", messages: [] }], reports: [] } });
    const own = await harness.call("GET", "/v1/history", { token });
    assert.deepEqual(own.data.sessions.map(item => item.id), ["s-bad"], "非法 id 等同于没带，写进了账号自己的桶");
  });

  test("反馈归属按访客：A 的分析 B 不能评价", async () => {
    const token = await harness.tokenFor("林金维");
    const analyzed = await harness.call("POST", "/v1/analyze", {
      token, headers: A, body: { question: "字段？", scenario: "single", model: harness.MODEL, tables: ["广告计划日报表"], toolMode: false }
    });
    const requestId = analyzed.data.meta.requestId;
    assert.equal((await harness.call("POST", "/v1/feedback", { token, headers: B, body: { requestId, rating: "up" } })).status, 404);
    assert.equal((await harness.call("POST", "/v1/feedback", { token, headers: A, body: { requestId, rating: "up" } })).status, 200);
  });

  test("管理员看到的用量按账号合并（含名下所有访客），并带全站合计与默认兜底上限", async () => {
    const snapshot = await harness.call("GET", "/v1/usage/all", { token: await harness.tokenFor("曾祥竞") });
    const row = snapshot.data.users.find(item => item.name === "林金维");
    assert.ok(row.requests >= 1);
    assert.equal(snapshot.data.global.limit, 20000000, "演示模式默认全站每日 2000 万 token 兜底");
    assert.ok(snapshot.data.global.tokens >= row.tokens);
  });
});

describe("演示模式：用量按访客各自计数，并有全站兜底", () => {
  let harness;
  before(async () => {
    harness = await startHarness({ env: { PORTAL_DEMO_LOGIN_PASSWORD: PASSWORD, PORTAL_DAILY_REQUEST_LIMIT: "1", PORTAL_DAILY_TOKEN_LIMIT: "0", PORTAL_GLOBAL_DAILY_TOKEN_LIMIT: "15" } });
  });
  after(async () => { await harness.stop(); });

  const analyze = async (headers, name = "李雨航") => harness.call("POST", "/v1/analyze", {
    token: await harness.tokenFor(name), headers, body: { question: "字段？", scenario: "single", model: harness.MODEL, tables: ["广告计划日报表"], toolMode: false }
  });

  test("每个访客各自有自己的每日次数：A 用完了不影响 B", async () => {
    assert.equal((await analyze(A)).status, 200);
    const second = await analyze(A);
    assert.equal(second.status, 429);
    assert.match(second.data.error, /今日分析次数已达上限/);
    assert.equal((await analyze(B)).status, 200, "B 是另一个浏览器，应有自己的额度");
  });

  test("全站 token 兜底：总量达到上限后，所有访客都被拒绝", async () => {
    // 前面已经用了 2 次 × 10 token = 20 ≥ 15
    const blocked = await analyze({ "X-Visitor-Id": "visitor-cccccccccccc" }, "谭嘉颖");
    assert.equal(blocked.status, 429);
    assert.match(blocked.data.error, /全站 token 用量已达上限/);
  });
});

describe("非演示模式：访客请求头被忽略", () => {
  test("同一账号带不同访客 id 时看到的是同一份历史（身份只看账号）", async () => {
    const harness = await startHarness();
    try {
      const token = await harness.tokenFor("李雨航");
      await harness.call("PUT", "/v1/history", { token, headers: A, body: { sessions: [{ id: "s-x", title: "t", messages: [] }], reports: [] } });
      const viaB = await harness.call("GET", "/v1/history", { token, headers: B });
      assert.deepEqual(viaB.data.sessions.map(item => item.id), ["s-x"]);
      // 连续输错仍会锁定
      for (let index = 0; index < 5; index += 1) await harness.call("POST", "/v1/auth/login", { body: { name: "谭嘉颖", password: "wrong" } });
      assert.equal((await harness.call("POST", "/v1/auth/login", { body: { name: "谭嘉颖", password: PASSWORD } })).status, 429);
    } finally { await harness.stop(); }
  });
});
