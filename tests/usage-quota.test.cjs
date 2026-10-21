/**
 * 用量、配额与审计测试：单元（日期分桶、限额优先级）+ 经网关的端到端。
 * 运行：node --test tests/usage-quota.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createUsageTracker } = require("../scripts/usage-quota.cjs");
const { startHarness } = require("./helpers/gateway-harness.cjs");

describe("用量与配额（单元）", () => {
  let dir;
  let currentDate;
  const tracker = (env = {}) => createUsageTracker({ dataDir: dir, env, now: () => currentDate });

  test.beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "usage-unit-"));
    currentDate = new Date(2026, 9, 21, 10, 0, 0);
  });
  test.afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("请求数达到上限后拒绝，未达到前放行", () => {
    const usage = tracker({ PORTAL_DAILY_REQUEST_LIMIT: "2", PORTAL_DAILY_TOKEN_LIMIT: "0" });
    assert.equal(usage.check("甲").ok, true);
    usage.recordRequest("甲");
    usage.recordRequest("甲");
    const blocked = usage.check("甲");
    assert.equal(blocked.ok, false);
    assert.match(blocked.error, /次数已达上限（2 次）/);
    assert.equal(usage.check("乙").ok, true, "其他人不受影响");
  });

  test("token 用量达到上限后拒绝", () => {
    const usage = tracker({ PORTAL_DAILY_REQUEST_LIMIT: "0", PORTAL_DAILY_TOKEN_LIMIT: "100" });
    usage.recordTokens("甲", 99);
    assert.equal(usage.check("甲").ok, true);
    usage.recordTokens("甲", 5);
    assert.match(usage.check("甲").error, /token 用量已达上限/);
  });

  test("环境变量为空字符串时按未设置处理（使用默认限额），而不是当成 0 = 不限", () => {
    const usage = tracker({ PORTAL_DAILY_REQUEST_LIMIT: "", PORTAL_DAILY_TOKEN_LIMIT: "" });
    assert.deepEqual(usage.limitsFor("甲"), { requests: 200, tokens: 2000000 });
  });

  test("0 表示不限", () => {
    const usage = tracker({ PORTAL_DAILY_REQUEST_LIMIT: "0", PORTAL_DAILY_TOKEN_LIMIT: "0" });
    for (let index = 0; index < 5; index += 1) usage.recordRequest("甲");
    usage.recordTokens("甲", 10 ** 9);
    assert.equal(usage.check("甲").ok, true);
  });

  test("个人覆盖优先于全员覆盖，全员覆盖优先于环境变量；非法值被忽略", () => {
    const usage = tracker({ PORTAL_DAILY_REQUEST_LIMIT: "10", PORTAL_DAILY_TOKEN_LIMIT: "1000" });
    assert.deepEqual(usage.limitsFor("甲"), { requests: 10, tokens: 1000 });
    usage.setLimits({ requests: 5, perUser: { 甲: { tokens: 50 }, 不存在的人: { requests: 1 } } }, ["甲", "乙"]);
    assert.deepEqual(usage.limitsFor("甲"), { requests: 5, tokens: 50 });
    assert.deepEqual(usage.limitsFor("乙"), { requests: 5, tokens: 1000 });
    usage.setLimits({ requests: -3, tokens: "abc" }, ["甲"]);
    assert.equal(usage.limitsFor("乙").requests, 5, "非法值不应覆盖已有限额");
    usage.setLimits({ perUser: { 甲: null } }, ["甲"]);
    assert.deepEqual(usage.limitsFor("甲"), { requests: 5, tokens: 1000 }, "置空即恢复全员限额");
  });

  test("按日期分桶：第二天重新计数，30 天前的数据被清理", () => {
    const usage = tracker({ PORTAL_DAILY_REQUEST_LIMIT: "1" });
    usage.recordRequest("甲");
    assert.equal(usage.check("甲").ok, false);
    currentDate = new Date(2026, 9, 22, 9, 0, 0);
    assert.equal(usage.check("甲").ok, true, "新的一天应重新计数");
    for (let offset = 0; offset < 35; offset += 1) {
      currentDate = new Date(2026, 9, 22 + offset, 9, 0, 0);
      usage.recordRequest("甲");
    }
    const stored = JSON.parse(fs.readFileSync(path.join(dir, "usage.json"), "utf8"));
    assert.ok(Object.keys(stored.days).length <= 30, "最多保留 30 天");
  });
});

describe("用量、配额与审计（经网关）", () => {
  let harness;
  before(async () => { harness = await startHarness({ env: { PORTAL_DAILY_REQUEST_LIMIT: "2", PORTAL_DAILY_TOKEN_LIMIT: "0" } }); });
  after(async () => { await harness.stop(); });

  const analyze = async (name, extra = {}) => harness.call("POST", "/v1/analyze", {
    token: await harness.tokenFor(name),
    body: { question: "广告计划表有多少数据？", scenario: "single", model: harness.MODEL, tables: ["广告计划日报表"], toolMode: false, ...extra }
  });

  test("超过每日请求上限后返回 429，被拒绝的请求不计数也不写审计", async () => {
    assert.equal((await analyze("李雨航")).status, 200);
    assert.equal((await analyze("李雨航")).status, 200);
    const blocked = await analyze("李雨航");
    assert.equal(blocked.status, 429);
    assert.match(blocked.data.error, /今日分析次数已达上限/);
    const usage = await harness.call("GET", "/v1/usage", { token: await harness.tokenFor("李雨航") });
    assert.equal(usage.data.requests, 2);
    assert.equal(usage.data.tokens, 20, "每次回答 10 个 token");
    const audits = harness.readJsonLines("analysis-audit.jsonl").filter(entry => entry.type === "analysis" && entry.user === "李雨航");
    assert.equal(audits.length, 2);
  });

  test("配额按人独立：其他账号不受影响", async () => {
    assert.equal((await analyze("谭嘉颖")).status, 200);
  });

  test("审计记录包含问题、模型、用量、耗时与 requestId，并与返回的 meta 对应", async () => {
    const result = await analyze("林金维");
    assert.equal(result.status, 200);
    const entry = harness.readJsonLines("analysis-audit.jsonl").find(item => item.requestId === result.data.meta.requestId);
    assert.ok(entry, "应能用 requestId 找到审计记录");
    assert.equal(entry.user, "林金维");
    assert.equal(entry.status, "ok");
    assert.equal(entry.model, harness.MODEL);
    assert.equal(entry.tokens, 10);
    assert.ok(entry.question.includes("广告计划表"));
    assert.equal(typeof entry.latencyMs, "number");
    assert.equal(result.data.meta.usageToday.requests, 1);
    assert.equal(result.data.meta.totalTokens, 10, "meta 里的 totalTokens 含工具阶段与最终回答");
  });

  test("流式请求同样计数并审计，done 事件带 usageToday", async () => {
    const result = await harness.analyzeStream("黄佩贤", { question: "广告计划表字段？", tables: ["广告计划日报表"], toolMode: false });
    assert.equal(result.status, 200);
    assert.equal(result.done.meta.usageToday.requests, 1);
    assert.ok(harness.readJsonLines("analysis-audit.jsonl").some(item => item.requestId === result.done.meta.requestId && item.status === "ok"));
  });

  test("工具阶段的 token 也计入用量", async () => {
    harness.relay.toolScript = [{ calls: [{ id: "c1", type: "function", function: { name: "search_tables", arguments: "{}" } }] }];
    const before = (await harness.call("GET", "/v1/usage", { token: await harness.tokenFor("曾祥竞") })).data.tokens;
    const result = await harness.analyzeStream("曾祥竞", { question: "有哪些表？", tables: [], toolMode: true });
    assert.equal(result.done.meta.toolMode, "used:1");
    const after = (await harness.call("GET", "/v1/usage", { token: await harness.tokenFor("曾祥竞") })).data.tokens;
    assert.equal(after - before, 30, "工具调用一轮 10 + 判断无需更多工具 10 + 最终回答 10");
  });

  test("普通用户不能调整限额或查看全员用量；管理员可以，调整后立即生效", async () => {
    const user = await harness.tokenFor("李雨航");
    assert.equal((await harness.call("PUT", "/v1/quota", { token: user, body: { requests: 100 } })).status, 403);
    assert.equal((await harness.call("GET", "/v1/usage/all", { token: user })).status, 403);

    const admin = await harness.tokenFor("曾祥竞");
    const updated = await harness.call("PUT", "/v1/quota", { token: admin, body: { perUser: { 李雨航: { requests: 3 } } } });
    assert.equal(updated.status, 200);
    assert.equal((await analyze("李雨航")).status, 200, "上限提高到 3 次后应可继续使用");
    const snapshot = await harness.call("GET", "/v1/usage/all", { token: admin });
    const row = snapshot.data.users.find(item => item.name === "李雨航");
    assert.equal(row.requests, 3);
    assert.equal(row.limits.requests, 3);
  });
});
