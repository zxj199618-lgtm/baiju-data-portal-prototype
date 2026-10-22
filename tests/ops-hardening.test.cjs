/**
 * 运维兜底：健康检查接口、审计日志轮转。
 * 运行：node --test tests/ops-hardening.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { startHarness } = require("./helpers/gateway-harness.cjs");

describe("运维兜底", () => {
  let harness, admin;
  before(async () => {
    harness = await startHarness({ env: { AUDIT_MAX_BYTES: "2000" } });
    admin = await harness.tokenFor("曾祥竞");
  });
  after(async () => { await harness.stop(); });

  test("/healthz 无需登录，返回 ok", async () => {
    const response = await fetch(`${harness.baseUrl}/healthz`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
  });

  test("审计日志超过上限后换新文件，旧文件留档且最多保留 5 份", async () => {
    const auditDir = harness.dataDir;
    for (let round = 0; round < 40; round += 1) {
      await harness.call("PUT", "/v1/default-model", { token: admin, body: { model: "" } }); // 每次写一条审计
      fs.appendFileSync(path.join(auditDir, "analysis-audit.jsonl"), "x".repeat(0));
    }
    // 直接灌大一点的日志，确保触发多次轮转
    for (let round = 0; round < 10; round += 1) {
      fs.appendFileSync(path.join(auditDir, "analysis-audit.jsonl"), JSON.stringify({ type: "filler", pad: "y".repeat(2500) }) + "\n");
      await harness.call("PUT", "/v1/default-model", { token: admin, body: { model: "" } });
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    const files = fs.readdirSync(auditDir);
    const archives = files.filter(name => /^analysis-audit\..+\.jsonl$/.test(name));
    assert.ok(archives.length >= 1 && archives.length <= 5, `归档数量应在 1 到 5 之间，实际 ${archives.length}`);
    assert.ok(fs.statSync(path.join(auditDir, "analysis-audit.jsonl")).size < 2000 + 3000, "当前日志文件应保持在上限附近");
    assert.equal((await harness.call("GET", "/v1/audit", { token: admin })).status, 200, "轮转后审计查询仍然可用");
  });
});

describe("会话 cookie（httpOnly）", () => {
  let harness;
  before(async () => { harness = await startHarness(); });
  after(async () => { await harness.stop(); });

  const login = () => fetch(`${harness.baseUrl}/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "李雨航", password: harness.PASSWORD }) });
  const cookieOf = response => String(response.headers.get("set-cookie") || "");

  test("登录会下发 httpOnly + SameSite=Lax 的 cookie，经 HTTPS 代理访问时带 Secure", async () => {
    const response = await login();
    const cookie = cookieOf(response);
    assert.match(cookie, /^gxt_session=[^;]+;/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.doesNotMatch(cookie, /Secure/);
    const proxied = await fetch(`${harness.baseUrl}/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https" }, body: JSON.stringify({ name: "李雨航", password: harness.PASSWORD }) });
    assert.match(cookieOf(proxied), /Secure/);
  });

  test("只带 cookie（不带 Authorization）也能访问；无效 cookie 被拒绝", async () => {
    const cookie = cookieOf(await login()).split(";")[0];
    const me = await fetch(`${harness.baseUrl}/v1/auth/me`, { headers: { Cookie: cookie } });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).name, "李雨航");
    assert.equal((await fetch(`${harness.baseUrl}/v1/auth/me`, { headers: { Cookie: "gxt_session=bogus" } })).status, 401);
  });

  test("带了无效的 Authorization 头时不回退到 cookie", async () => {
    const cookie = cookieOf(await login()).split(";")[0];
    assert.equal((await fetch(`${harness.baseUrl}/v1/auth/me`, { headers: { Cookie: cookie, Authorization: "Bearer forged.token" } })).status, 401);
  });

  test("cookie 身份的写请求如果来自别的站点会被拒绝；同源和不带 Origin 的正常", async () => {
    const cookie = cookieOf(await login()).split(";")[0];
    const post = origin => fetch(`${harness.baseUrl}/v1/feedback`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify({}) });
    assert.equal((await post("https://evil.example")).status, 403);
    assert.notEqual((await post(harness.baseUrl)).status, 403);
    assert.notEqual((await post("")).status, 403);
  });

  test("退出登录会清除 cookie（无需已登录即可调用）", async () => {
    const response = await fetch(`${harness.baseUrl}/v1/auth/logout`, { method: "POST" });
    assert.equal(response.status, 200);
    assert.match(cookieOf(response), /Max-Age=0/);
  });
});
