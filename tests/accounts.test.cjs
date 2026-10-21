/**
 * 账号管理：新增、停用 / 启用（立即生效）、重置密码，以及防止管理员把自己或系统锁死。
 * 运行：node --test tests/accounts.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { startHarness, PASSWORD } = require("./helpers/gateway-harness.cjs");

describe("账号管理", () => {
  let harness, admin;
  before(async () => { harness = await startHarness(); admin = await harness.tokenFor("曾祥竞"); });
  after(async () => { await harness.stop(); });

  const call = (method, route, body, token = admin) => harness.call(method, route, { token, body });
  const login = (name, password) => harness.call("POST", "/v1/auth/login", { body: { name, password } });

  test("管理员能看到全部账号；普通用户不能", async () => {
    const list = await call("GET", "/v1/accounts");
    assert.equal(list.status, 200);
    assert.equal(list.data.accounts.length, 5);
    assert.deepEqual(list.data.accounts.find(item => item.name === "曾祥竞"), { name: "曾祥竞", status: "active", group: "门户管理员", role: "admin", createdAt: null });
    assert.equal((await call("GET", "/v1/accounts", undefined, await harness.tokenFor("李雨航"))).status, 403);
    assert.equal((await call("POST", "/v1/accounts", { name: "新人" }, await harness.tokenFor("李雨航"))).status, 403);
  });

  test("新增账号：生成随机初始密码（只在这次响应里），能立刻登录，默认未分配权限组", async () => {
    const created = await call("POST", "/v1/accounts", { name: "王小明" });
    assert.equal(created.status, 200);
    assert.ok(created.data.password.length >= 10, "应返回随机初始密码");
    assert.deepEqual({ status: created.data.account.status, group: created.data.account.group, role: created.data.account.role }, { status: "active", group: "未分配", role: "user" });
    assert.equal((await login("王小明", created.data.password)).status, 200);
    assert.equal((await login("王小明", PASSWORD)).status, 401, "不是全员共用的初始密码");
    const org = await call("GET", "/v1/org");
    assert.ok(org.data.accounts.includes("王小明"));
    assert.equal(org.data.userGroups["王小明"], "未分配");
    assert.ok(fs.existsSync(path.join(harness.dataDir, "accounts.json")));
  });

  test("新增时可以指定权限组；权限组不存在时账号仍创建成功并给出提示", async () => {
    const good = await call("POST", "/v1/accounts", { name: "分析员甲", group: "数据分析师" });
    assert.equal(good.data.account.group, "数据分析师");
    assert.equal(good.data.warning, "");
    const bad = await call("POST", "/v1/accounts", { name: "分析员乙", group: "不存在的组" });
    assert.equal(bad.status, 200);
    assert.match(bad.data.warning, /权限组没有设置成功/);
    assert.equal(bad.data.account.group, "未分配");
  });

  test("账号名不合法或重复被拒绝", async () => {
    for (const name of ["", "   ", "a b", "含~波浪", "x".repeat(21), "未分配", "a/b", "李雨航"]) {
      const result = await call("POST", "/v1/accounts", { name });
      assert.equal(result.status, 400, `「${name}」应被拒绝`);
    }
    assert.match((await call("POST", "/v1/accounts", { name: "李雨航" })).data.error, /账号已存在/);
  });

  test("停用立即生效：已签发的令牌下一次请求就被拒绝，登录也被拒绝；启用后恢复", async () => {
    const token = await harness.tokenFor("谭嘉颖");
    assert.equal((await call("GET", "/v1/auth/me", undefined, token)).status, 200);
    const disabled = await call("PATCH", "/v1/accounts/谭嘉颖", { status: "disabled" });
    assert.equal(disabled.data.account.status, "disabled");
    const rejected = await call("GET", "/v1/auth/me", undefined, token);
    assert.equal(rejected.status, 401);
    assert.match(rejected.data.error, /账号已停用/);
    const loginAttempt = await login("谭嘉颖", PASSWORD);
    assert.equal(loginAttempt.status, 403);
    assert.match(loginAttempt.data.error, /账号已停用/);
    assert.equal((await login("谭嘉颖", "wrong")).status, 401, "密码错误时不透露账号是否停用");

    await call("PATCH", "/v1/accounts/谭嘉颖", { status: "active" });
    assert.equal((await login("谭嘉颖", PASSWORD)).status, 200);
    assert.equal((await call("GET", "/v1/auth/me", undefined, token)).status, 200, "同一个令牌恢复可用");
  });

  test("不能停用自己；非法状态与不存在的账号被拒绝", async () => {
    assert.match((await call("PATCH", "/v1/accounts/曾祥竞", { status: "disabled" })).data.error, /不能停用自己/);
    assert.equal((await call("PATCH", "/v1/accounts/林金维", { status: "banana" })).status, 400);
    assert.equal((await call("PATCH", "/v1/accounts/不存在", { status: "disabled" })).status, 404);
  });

  test("防锁死：另一个管理员被停用后，唯一在岗的管理员不能把自己降级", async () => {
    await call("PATCH", "/v1/accounts/黄佩贤", { status: "disabled" });
    const org = await call("GET", "/v1/org");
    const demote = await call("PUT", "/v1/org", { userGroups: { 曾祥竞: "优化师" } });
    assert.equal(demote.status, 400, JSON.stringify(org.data.userGroups));
    assert.match(demote.data.error, /至少需要保留一个/);
    await call("PATCH", "/v1/accounts/黄佩贤", { status: "active" });
  });

  test("重置密码：返回新的随机密码，旧密码失效，锁定状态被清除；普通用户不能重置", async () => {
    for (let index = 0; index < 5; index += 1) await login("林金维", "wrong");
    assert.equal((await login("林金维", PASSWORD)).status, 429, "先被锁定");
    const reset = await call("POST", "/v1/accounts/林金维/reset-password");
    assert.equal(reset.status, 200);
    assert.equal((await login("林金维", PASSWORD)).status, 401);
    assert.equal((await login("林金维", reset.data.password)).status, 200, "重置同时解除锁定");
    assert.equal((await call("POST", "/v1/accounts/林金维/reset-password", undefined, await harness.tokenFor("李雨航"))).status, 403);
    assert.equal((await call("POST", "/v1/accounts/不存在/reset-password")).status, 404);
  });

  test("新增 / 停用 / 重置都写入审计（不含密码）", async () => {
    const audits = harness.readJsonLines("analysis-audit.jsonl");
    for (const type of ["account-create", "account-status", "account-reset-password"]) {
      assert.ok(audits.some(entry => entry.type === type && entry.user === "曾祥竞"), `缺少 ${type} 审计`);
    }
    assert.equal(JSON.stringify(audits).includes(PASSWORD), false);
  });
});

describe("账号管理（演示模式）", () => {
  let harness;
  before(async () => { harness = await startHarness({ env: { PORTAL_DEMO_LOGIN_PASSWORD: PASSWORD } }); });
  after(async () => { await harness.stop(); });

  test("新增账号直接使用共用的演示密码，不返回密码；不允许重置密码；停用的账号不再出现在快捷登录里", async () => {
    const admin = await harness.tokenFor("曾祥竞");
    const created = await harness.call("POST", "/v1/accounts", { token: admin, body: { name: "访客甲" } });
    assert.equal(created.data.password, "");
    assert.equal((await harness.call("POST", "/v1/auth/login", { body: { name: "访客甲", password: PASSWORD } })).status, 200);
    assert.equal((await harness.call("POST", "/v1/accounts/访客甲/reset-password", { token: admin })).status, 403);
    assert.ok((await harness.call("GET", "/v1/auth/demo")).data.accounts.some(item => item.name === "访客甲"));
    await harness.call("PATCH", "/v1/accounts/访客甲", { token: admin, body: { status: "disabled" } });
    assert.equal((await harness.call("GET", "/v1/auth/demo")).data.accounts.some(item => item.name === "访客甲"), false);
  });
});
