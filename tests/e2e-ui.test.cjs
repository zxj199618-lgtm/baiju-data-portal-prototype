/**
 * 浏览器端到端测试：真实 Chrome + 真实网关（假模型），覆盖登录、会话、分析、反馈、权限同步与历史隔离。
 * 需要本机装有 Chrome（Playwright 通过 channel: "chrome" 驱动）；没有时整组用例自动跳过，不影响 npm test。
 * 运行：node --test tests/e2e-ui.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { startHarness, PASSWORD } = require("./helpers/gateway-harness.cjs");

let chromium = null;
try { ({ chromium } = require("playwright-core")); } catch { /* 未安装 playwright-core */ }

describe("浏览器端到端", () => {
  let harness, browser, skipReason = "";

  before(async () => {
    if (!chromium) { skipReason = "未安装 playwright-core"; return; }
    try {
      browser = await chromium.launch({ channel: "chrome", headless: true });
    } catch (error) {
      skipReason = `无法启动 Chrome：${error.message.split("\n")[0]}`;
      return;
    }
    // 开启演示登录（密码与测试账号一致），用来验证登录页的快捷按钮
    harness = await startHarness({ env: { PORTAL_DEMO_LOGIN_PASSWORD: PASSWORD } });
    harness.relay.report = "# 测试回答\n\n近 7 天总消耗 100 元。";
  });

  after(async () => {
    if (browser) await browser.close();
    if (harness) await harness.stop();
  });

  /** 每个用例一个独立的浏览器上下文（独立的 localStorage） */
  async function withPage(t, run) {
    if (skipReason) return t.skip(skipReason);
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    try { await run(page); } finally { await context.close(); }
  }

  async function login(page, name, password = harness.PASSWORD) {
    await page.goto(harness.baseUrl + "/");
    await page.fill('#gatewayLoginForm input[name="name"]', name);
    await page.fill('#gatewayLoginForm input[name="password"]', password);
    await page.click("#gatewayLoginBtn");
  }
  /** 进入系统并等待启动加载（模型列表、历史、权限同步）完成，避免过早操作 */
  const appVisible = async page => {
    await page.waitForSelector("#portalApp:not(.hidden)");
    await page.waitForFunction(() => window.portalVueModuleApi && window.portalVueModuleApi.orgSync.ready);
    await page.waitForLoadState("networkidle");
  };

  test("登录：密码错误提示且不进入系统；正确登录后进入系统并显示账号", async t => withPage(t, async page => {
    await login(page, "李雨航", "wrong-password");
    await page.waitForSelector("#gatewayLoginError:not([hidden])");
    assert.match(await page.textContent("#gatewayLoginError"), /账号或密码错误/);
    assert.equal(await page.locator("#portalApp.hidden").count(), 1, "密码错误不应进入系统");

    await login(page, "李雨航");
    await appVisible(page);
    assert.equal((await page.locator(".portal-vue-user-name").first().textContent()).trim(), "李雨航", "页头应显示当前登录账号，而不是写死的名字");
    assert.ok(await page.evaluate(() => window.portalAuth.token()));
  }));

  test("登录页默认是「密码登录」；点「扫码登录」只给出未接入提示，表单仍在", async t => withPage(t, async page => {
    await page.goto(harness.baseUrl + "/");
    assert.equal(await page.locator('[data-login-tab="password"].active').count(), 1, "默认应停在密码登录");
    assert.equal(await page.locator('[data-login-tab="qr"].active').count(), 0);
    await page.click('[data-login-tab="qr"]');
    assert.match(await page.textContent("#gatewayLoginError"), /扫码登录尚未接入/);
    assert.equal(await page.locator('[data-login-tab="password"].active').count(), 1, "不应切走密码登录");
    assert.equal(await page.locator("#gatewayLoginForm").isVisible(), true);
  }));

  test("记住上次登录的账号（不记密码）：退出后账号已填好，光标在密码框", async t => withPage(t, async page => {
    await login(page, "李雨航");
    await appVisible(page);
    await page.locator(".portal-vue-user").first().click();
    await page.getByRole("menuitem", { name: "退出系统" }).click();
    await page.waitForSelector("#loginView:not(.hidden)");
    await page.reload();
    await page.waitForSelector("#loginView:not(.hidden)");
    assert.equal(await page.inputValue('#gatewayLoginForm input[name="name"]'), "李雨航");
    assert.equal(await page.inputValue('#gatewayLoginForm input[name="password"]'), "", "密码不应被记住");
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.name), "password");
  }));

  test("演示快捷登录：点账号按钮自动填好密码并登录", async t => withPage(t, async page => {
    await page.goto(harness.baseUrl + "/");
    await page.getByRole("button", { name: "李雨航" }).click();
    await appVisible(page);
    assert.equal((await page.locator(".portal-vue-user-name").first().textContent()).trim(), "李雨航");
  }));

  test("不能绕过登录：直接带 #page= 访问仍停在登录页", async t => withPage(t, async page => {
    await page.goto(harness.baseUrl + "/#page=" + encodeURIComponent("系统管理"));
    await page.waitForSelector("#loginView:not(.hidden)");
    assert.equal(await page.locator("#portalApp.hidden").count(), 1);
  }));

  test("令牌失效：回到登录页并提示已过期", async t => withPage(t, async page => {
    await login(page, "李雨航");
    await appVisible(page);
    await page.evaluate(() => { localStorage.setItem("portalAuthToken", "forged.token"); });
    await page.reload();
    await page.waitForSelector("#loginView:not(.hidden)");
    assert.match(await page.textContent("#gatewayLoginError"), /登录已过期/);
    assert.equal(await page.evaluate(() => window.portalAuth.token()), "");
  }));

  test("退出系统：清除令牌并回到登录页", async t => withPage(t, async page => {
    await login(page, "李雨航");
    await appVisible(page);
    await page.locator(".portal-vue-user").first().click();
    await page.getByRole("menuitem", { name: "退出系统" }).click();
    await page.waitForSelector("#loginView:not(.hidden)");
    assert.equal(await page.evaluate(() => window.portalAuth.token()), "");
  }));

  test("分析 + 反馈：答案出现并带反馈按钮，点赞后服务端有记录，且重新加载后仍保留", async t => withPage(t, async page => {
    await login(page, "曾祥竞");
    await appVisible(page);
    await page.getByPlaceholder(/输入分析问题/).fill("E2E 反馈测试问题 7788");
    await page.keyboard.press("Enter");
    const bar = page.locator(".portal-vue-ai-feedback").first();
    await bar.waitFor();
    await bar.locator('button[title="有帮助"]').click();
    await page.waitForSelector('.portal-vue-ai-feedback button[title="有帮助"].on');

    const admin = await harness.tokenFor("曾祥竞");
    const feedback = await harness.call("GET", "/v1/feedback", { token: admin });
    const item = feedback.data.items.find(entry => entry.question.includes("E2E 反馈测试问题 7788"));
    assert.equal(item.rating, "up");
    assert.equal(item.user, "曾祥竞");

    await page.reload();
    await appVisible(page);
    // 会话标题在侧栏里是可见元素；页面里还有隐藏的同文本节点，所以按可见元素匹配
    await page.locator("strong:visible", { hasText: "E2E 反馈测试问题 7788" }).first().waitFor();
  }));

  test("历史按账号隔离：A 问的问题在 B 的界面里看不到", async t => withPage(t, async pageA => {
    await login(pageA, "曾祥竞");
    await appVisible(pageA);
    await pageA.getByPlaceholder(/输入分析问题/).fill("E2E 隔离测试问题 4321");
    await pageA.keyboard.press("Enter");
    await pageA.locator(".portal-vue-ai-feedback").first().waitFor();

    const contextB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pageB = await contextB.newPage();
    pageB.setDefaultTimeout(30000);
    try {
      await login(pageB, "李雨航");
      await appVisible(pageB);
      await pageB.waitForTimeout(1500);
      assert.equal(await pageB.locator("body").evaluate(body => body.innerText.includes("E2E 隔离测试问题 4321")), false, "其他账号不应看到别人的会话");
    } finally {
      await contextB.close();
    }
  }));

  test("权限同步：界面里账号的权限组来自服务端，菜单随之变化", async t => withPage(t, async page => {
    await login(page, "李雨航");
    await appVisible(page);
    await page.waitForFunction(() => window.portalVueModuleApi && window.portalVueModuleApi.orgSync.ready);
    const group = await page.evaluate(() => window.portalVueModuleApi.state.users.find(user => user.name === "李雨航").group);
    assert.equal(group, "数据分析师", "服务端是 数据分析师，界面自带的演示数据是 只读访客");
    const sidebar = await page.textContent("#sidebar");
    assert.match(sidebar, /数据看板/);
    assert.doesNotMatch(sidebar, /系统管理/, "数据分析师没有系统管理菜单");
  }));

  test("冒烟：管理员依次打开全部菜单页，没有脚本报错，且每页都有内容显示（重构前端的安全网）", async t => withPage(t, async page => {
    const errors = [];
    page.on("pageerror", error => errors.push(`PAGEERROR ${error.message}`));
    page.on("console", message => { if (message.type() === "error" && !message.text().includes("401")) errors.push(`CONSOLE ${message.text()}`); });
    await login(page, "曾祥竞");
    await appVisible(page);
    const names = await page.evaluate(() => (window.portalVueBridge.nav || []).flatMap(group => (group.items || []).map(item => item.name)));
    assert.ok(names.length >= 20, `菜单页数量异常：${names.length}`);
    for (const name of names) {
      const before = errors.length;
      await page.evaluate(target => window.portalVueBridge.setPage(target), name);
      await page.waitForTimeout(300);
      const visible = await page.evaluate(() => [...document.querySelectorAll("[data-element-component]")].filter(node => node.offsetParent).length);
      assert.ok(visible > 0, `「${name}」页没有任何可见内容`);
      assert.deepEqual(errors.slice(before), [], `打开「${name}」时出现脚本错误`);
    }
  }));

  test("管理员误操作被服务端拒绝：提示并回退到服务端配置（防止把所有管理员降级）", async t => withPage(t, async page => {
    await login(page, "曾祥竞");
    await appVisible(page);
    await page.waitForFunction(() => window.portalVueModuleApi && window.portalVueModuleApi.orgSync.ready);
    const result = await page.evaluate(async () => {
      const api = window.portalVueModuleApi;
      const users = api.state.users;
      ["曾祥竞", "黄佩贤"].forEach(name => { users.find(user => user.name === name).group = "优化师"; });
      await api.orgSync.push();
      await new Promise(resolve => setTimeout(resolve, 800));
      return {
        groups: ["曾祥竞", "黄佩贤"].map(name => users.find(user => user.name === name).group),
        toast: [...document.querySelectorAll(".el-message")].map(node => node.innerText).join("|")
      };
    });
    assert.deepEqual(result.groups, ["门户管理员", "门户管理员"], "界面应回退到服务端配置");
    assert.match(result.toast, /至少需要保留一个/);
  }));
});
