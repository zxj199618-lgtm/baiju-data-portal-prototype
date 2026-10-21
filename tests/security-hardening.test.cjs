/**
 * 安全加固测试：CORS 来源控制、安全响应头、修改密码。
 * 运行：node --test tests/security-hardening.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { startHarness } = require("./helpers/gateway-harness.cjs");

/** 用 http.request 发请求：fetch 不允许自定义 Origin 头 */
function rawRequest(baseUrl, { method = "GET", route = "/v1/models", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(baseUrl + route);
    const req = http.request({ hostname: target.hostname, port: target.port, path: target.pathname, method, headers }, res => {
      let body = "";
      res.on("data", chunk => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("CORS 来源控制（默认）", () => {
  let harness;
  before(async () => { harness = await startHarness(); });
  after(async () => { await harness.stop(); });

  test("陌生来源被拒绝，不返回 Allow-Origin", async () => {
    const result = await rawRequest(harness.baseUrl, { headers: { Origin: "https://evil.example.com" } });
    assert.equal(result.status, 403);
    assert.equal(result.headers["access-control-allow-origin"], undefined);
  });

  test("陌生来源的预检请求同样被拒绝", async () => {
    const result = await rawRequest(harness.baseUrl, { method: "OPTIONS", headers: { Origin: "https://evil.example.com", "Access-Control-Request-Method": "POST" } });
    assert.equal(result.status, 403);
  });

  test("同源页面与本机开发页被允许，并回显具体来源而不是 *", async () => {
    const sameOrigin = await rawRequest(harness.baseUrl, { headers: { Origin: harness.baseUrl } });
    assert.equal(sameOrigin.headers["access-control-allow-origin"], harness.baseUrl);
    const devPage = await rawRequest(harness.baseUrl, { headers: { Origin: "http://localhost:8080" } });
    assert.equal(devPage.status, 401, "来源被允许后继续走登录校验");
    assert.equal(devPage.headers["access-control-allow-origin"], "http://localhost:8080");
    assert.match(devPage.headers.vary, /Origin/);
  });

  test("没有 Origin 头的请求（curl / 服务端调用）不受影响", async () => {
    const result = await rawRequest(harness.baseUrl, {});
    assert.equal(result.status, 401);
    assert.equal(result.headers["access-control-allow-origin"], undefined);
  });

  test("页面与接口都带安全响应头", async () => {
    const page = await rawRequest(harness.baseUrl, { route: "/" });
    assert.equal(page.status, 200);
    assert.equal(page.headers["x-content-type-options"], "nosniff");
    assert.match(page.headers["content-security-policy"], /frame-ancestors 'self'/);
    assert.match(page.headers["content-security-policy"], /object-src 'none'/);
    assert.equal(page.headers["referrer-policy"], "same-origin");
    const api = await rawRequest(harness.baseUrl, {});
    assert.equal(api.headers["x-content-type-options"], "nosniff");
  });
});

describe("CORS 白名单（PORTAL_ALLOWED_ORIGINS）", () => {
  let harness;
  before(async () => { harness = await startHarness({ env: { PORTAL_ALLOWED_ORIGINS: "https://portal.example.com" } }); });
  after(async () => { await harness.stop(); });

  test("名单内的来源被允许，名单外仍被拒绝", async () => {
    const allowed = await rawRequest(harness.baseUrl, { headers: { Origin: "https://portal.example.com" } });
    assert.equal(allowed.headers["access-control-allow-origin"], "https://portal.example.com");
    const denied = await rawRequest(harness.baseUrl, { headers: { Origin: "https://other.example.com" } });
    assert.equal(denied.status, 403);
  });
});

describe("CORS 显式放开（PORTAL_ALLOWED_ORIGINS=*）", () => {
  let harness;
  before(async () => { harness = await startHarness({ env: { PORTAL_ALLOWED_ORIGINS: "*" } }); });
  after(async () => { await harness.stop(); });

  test("显式配置 * 时恢复不限制来源", async () => {
    const result = await rawRequest(harness.baseUrl, { headers: { Origin: "https://anything.example.com" } });
    assert.equal(result.headers["access-control-allow-origin"], "*");
  });
});

describe("演示登录（默认关闭）", () => {
  test("默认不开启：接口返回 404，不会泄露账号或密码", async () => {
    const harness = await startHarness();
    try {
      const result = await harness.call("GET", "/v1/auth/demo");
      assert.equal(result.status, 404);
      assert.equal(JSON.stringify(result.data).includes(harness.PASSWORD), false);
    } finally { await harness.stop(); }
  });

  test("显式设置 PORTAL_DEMO_LOGIN_PASSWORD 后，匿名可获取账号清单与该密码（仅用于本机演示）", async () => {
    const harness = await startHarness({ env: { PORTAL_DEMO_LOGIN_PASSWORD: "harness-pass-1" } });
    try {
      const result = await harness.call("GET", "/v1/auth/demo");
      assert.equal(result.status, 200);
      assert.equal(result.data.accounts.length, 5);
      assert.deepEqual(result.data.accounts.find(item => item.name === "曾祥竞"), { name: "曾祥竞", role: "admin" });
      assert.equal(result.data.password, "harness-pass-1");
    } finally { await harness.stop(); }
  });
});

describe("演示登录模式下禁止改密码", () => {
  test("开启演示登录后，修改密码接口返回 403（共享的公开密码不能被改掉）", async () => {
    const harness = await startHarness({ env: { PORTAL_DEMO_LOGIN_PASSWORD: "harness-pass-1" } });
    try {
      const result = await harness.call("POST", "/v1/auth/password", { token: await harness.tokenFor("李雨航"), body: { oldPassword: "harness-pass-1", newPassword: "brand-new-pass-9" } });
      assert.equal(result.status, 403);
      assert.match(result.data.error, /不允许修改密码/);
      assert.equal((await harness.call("POST", "/v1/auth/login", { body: { name: "李雨航", password: "harness-pass-1" } })).status, 200, "密码应保持不变");
    } finally { await harness.stop(); }
  });
});

describe("修改密码", () => {
  let harness;
  before(async () => { harness = await startHarness(); });
  after(async () => { await harness.stop(); });

  const change = async (name, body) => harness.call("POST", "/v1/auth/password", { token: await harness.tokenFor(name), body });

  test("未登录不能修改密码", async () => {
    assert.equal((await harness.call("POST", "/v1/auth/password", { body: { oldPassword: harness.PASSWORD, newPassword: "new-password-1" } })).status, 401);
  });

  test("旧密码不对被拒绝；新密码太短或与旧密码相同被拒绝", async () => {
    assert.equal((await change("李雨航", { oldPassword: "wrong", newPassword: "new-password-1" })).status, 401);
    assert.equal((await change("李雨航", { oldPassword: harness.PASSWORD, newPassword: "short" })).status, 400);
    assert.equal((await change("李雨航", { oldPassword: harness.PASSWORD, newPassword: harness.PASSWORD })).status, 400);
  });

  test("修改成功后旧密码失效、新密码可用，且写入审计（不含密码）", async () => {
    const changed = await change("林金维", { oldPassword: harness.PASSWORD, newPassword: "brand-new-pass-9" });
    assert.equal(changed.status, 200);
    assert.equal((await harness.call("POST", "/v1/auth/login", { body: { name: "林金维", password: harness.PASSWORD } })).status, 401);
    assert.equal((await harness.call("POST", "/v1/auth/login", { body: { name: "林金维", password: "brand-new-pass-9" } })).status, 200);
    const audit = harness.readJsonLines("analysis-audit.jsonl").find(entry => entry.type === "password-change");
    assert.equal(audit.user, "林金维");
    assert.equal(JSON.stringify(audit).includes("brand-new-pass-9"), false);
  });

  test("旧密码连续输错会被锁定", async () => {
    for (let index = 0; index < 5; index += 1) {
      assert.equal((await change("谭嘉颖", { oldPassword: "wrong", newPassword: "new-password-1" })).status, 401);
    }
    assert.equal((await change("谭嘉颖", { oldPassword: harness.PASSWORD, newPassword: "new-password-1" })).status, 429);
  });
});
