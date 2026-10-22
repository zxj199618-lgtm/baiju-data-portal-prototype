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

  /** 以管理员身份打开「运营中心」页面 */
  async function openOpsCenter(page) {
    await login(page, "曾祥竞");
    await appVisible(page);
    await page.evaluate(() => window.portalVueBridge.setPage("运营中心"));
    await page.waitForSelector("#opsCenterPanel");
  }

  test("运营中心：普通用户的菜单里没有它；管理员能打开", async t => withPage(t, async page => {
    await login(page, "李雨航");
    await appVisible(page);
    assert.doesNotMatch(await page.textContent("#sidebar"), /运营中心/);
    await page.context().clearCookies();
    await page.evaluate(() => window.portalAuth.clear());
    await login(page, "曾祥竞");
    await appVisible(page);
    assert.match(await page.textContent("#sidebar"), /运营中心/);
  }));

  test("运营中心 · 用量与配额：列出全部账号，并能在界面里调整某个账号的额度（服务端立即生效）", async t => withPage(t, async page => {
    await openOpsCenter(page);
    const rows = page.locator('[data-test="usage-table"] .el-table__body tr');
    await rows.first().waitFor();
    assert.ok(await rows.count() >= 5, "应列出 5 个以上账号");
    const target = rows.filter({ hasText: "谭嘉颖" });
    await target.getByText("调整额度").click();
    await page.locator(".el-dialog:visible .el-input-number input").first().fill("37");
    await page.locator(".el-dialog:visible").getByRole("button", { name: "保存" }).click();
    await page.waitForSelector(".el-dialog:visible", { state: "detached" });
    await target.getByText("/ 37").first().waitFor();
    const usage = await harness.call("GET", "/v1/usage/all", { token: await harness.tokenFor("曾祥竞") });
    assert.equal(usage.data.users.find(item => item.name === "谭嘉颖").limits.requests, 37);
  }));

  test("运营中心 · 账号管理（演示环境）：新增账号用共用密码登录、不能重置密码；界面里停用后立即无法登录；审计里有记录", async t => withPage(t, async page => {
    await openOpsCenter(page);
    await page.getByRole("tab", { name: "账号管理" }).click();
    await page.locator('[data-test="accounts-table"] .el-table__body tr').first().waitFor();
    await page.locator('[data-test="create-account"]').click();
    await page.locator('input[data-test="new-account-name"]').fill("界面新建的人");
    await page.locator('[data-test="confirm-create"]').click();
    await page.locator(".el-dialog:visible").getByText("使用演示环境共用的密码登录").waitFor();
    assert.equal(await page.locator('[data-test="initial-password"]').count(), 0, "演示环境不生成单独的密码");
    await page.getByRole("button", { name: "我已记下" }).click();
    assert.equal((await harness.call("POST", "/v1/auth/login", { body: { name: "界面新建的人", password: PASSWORD } })).status, 200);

    const row = page.locator('[data-test="accounts-table"] .el-table__body tr').filter({ hasText: "界面新建的人" });
    assert.equal(await row.getByText("重置密码").locator("xpath=ancestor-or-self::button").isDisabled(), true, "演示环境不允许重置密码");
    await row.getByText("停用").click();
    await page.getByRole("button", { name: "确认" }).click();
    await row.getByText("已停用").waitFor();
    assert.equal((await harness.call("POST", "/v1/auth/login", { body: { name: "界面新建的人", password: PASSWORD } })).status, 403, "停用后立即无法登录");

    await page.getByRole("tab", { name: "审计日志" }).click();
    await page.locator('[data-test="audit-table"]').getByText("新增账号「界面新建的人」").first().waitFor();
  }));

  test("运营中心 · 账号管理（正式环境）：新增账号后密码只显示一次且能登录；重置密码后旧密码失效", async t => {
    if (skipReason) return t.skip(skipReason);
    const plain = await startHarness(); // 没有开启演示登录的网关
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    try {
      await page.goto(plain.baseUrl + "/");
      await page.fill('#gatewayLoginForm input[name="name"]', "曾祥竞");
      await page.fill('#gatewayLoginForm input[name="password"]', plain.PASSWORD);
      await page.click("#gatewayLoginBtn");
      await appVisible(page);
      await page.evaluate(() => window.portalVueBridge.setPage("运营中心"));
      await page.getByRole("tab", { name: "账号管理" }).click();
      await page.locator('[data-test="accounts-table"] .el-table__body tr').first().waitFor();
      await page.locator('[data-test="create-account"]').click();
      await page.locator('input[data-test="new-account-name"]').fill("正式新人");
      await page.locator('[data-test="confirm-create"]').click();
      const password = (await page.locator('[data-test="initial-password"]').textContent()).trim();
      assert.ok(password.length >= 10);
      await page.getByRole("button", { name: "我已记下" }).click();
      assert.equal((await plain.call("POST", "/v1/auth/login", { body: { name: "正式新人", password } })).status, 200);

      const row = page.locator('[data-test="accounts-table"] .el-table__body tr').filter({ hasText: "正式新人" });
      await row.getByText("重置密码").click();
      await page.getByRole("button", { name: "确认" }).click();
      // 关闭后的弹窗 DOM 还在，等界面换成新密码再读
      await page.waitForFunction(previous => { const node = document.querySelector('[data-test="initial-password"]'); return node && node.textContent.trim() && node.textContent.trim() !== previous; }, password);
      const newPassword = (await page.locator('[data-test="initial-password"]').textContent()).trim();
      assert.notEqual(newPassword, password);
      assert.equal((await plain.call("POST", "/v1/auth/login", { body: { name: "正式新人", password } })).status, 401, "旧密码应失效");
      assert.equal((await plain.call("POST", "/v1/auth/login", { body: { name: "正式新人", password: newPassword } })).status, 200);
    } finally {
      await context.close();
      await plain.stop();
    }
  });

  test("运营中心 · 审计日志与回答反馈：能看到分析记录、工具调用和用户的差评", async t => withPage(t, async page => {
    const token = await harness.tokenFor("李雨航");
    const analysis = await harness.call("POST", "/v1/analyze", { token, body: { question: "运营中心测试问题 9911", scenario: "single", model: harness.MODEL, tables: ["广告计划日报表"], toolMode: false } });
    await harness.call("POST", "/v1/feedback", { token, body: { requestId: analysis.data.meta.requestId, rating: "down", comment: "数字对不上 9911" } });
    await openOpsCenter(page);
    await page.getByRole("tab", { name: "审计日志" }).click();
    await page.locator('[data-test="audit-table"]').getByText("运营中心测试问题 9911").first().waitFor();
    await page.getByRole("tab", { name: "回答反馈" }).click();
    await page.locator('[data-test="feedback-table"]').getByText("数字对不上 9911").first().waitFor();
    assert.match(await page.textContent("#opsCenterPanel"), /👎 \d+/);
  }));

  test("运营中心 · 默认模型：在界面里选择并保存后，服务端的默认模型随之改变", async t => withPage(t, async page => {
    harness.relay.models = [harness.MODEL, "alt-model"];
    await harness.call("POST", "/v1/providers/prov-relay/refresh", { token: await harness.tokenFor("曾祥竞") });
    await openOpsCenter(page);
    await page.getByRole("tab", { name: "默认模型" }).click();
    await page.locator('[data-test="effective-default"]').getByText(harness.MODEL).waitFor();
    await page.locator(".el-select:visible").last().click();
    await page.getByRole("option", { name: "alt-model" }).click();
    await page.locator('[data-test="save-default-model"]').click();
    await page.locator('[data-test="effective-default"]').getByText("alt-model").waitFor();
    assert.equal((await harness.call("GET", "/v1/models", { token: await harness.tokenFor("曾祥竞") })).data.default, "alt-model");
    await harness.call("PUT", "/v1/default-model", { token: await harness.tokenFor("曾祥竞"), body: { model: "" } });
  }));

  test("模型还在工作时，界面实时显示「工具取数：…」，最终回答出来后才出现反馈按钮", async t => withPage(t, async page => {
    harness.relay.toolScript = [{ calls: [{ id: "live1", type: "function", function: { name: "search_tables", arguments: "{}" } }] }];
    harness.relay.finalDelayMs = 2500; // 最终回答故意慢一点，给界面留出显示进度的时间
    try {
      await login(page, "曾祥竞");
      await appVisible(page);
      await page.getByPlaceholder(/输入分析问题/).fill("实时进度测试问题 6677");
      await page.keyboard.press("Enter");
      await page.locator("#analysisWorkbenchView").getByText("工具取数：search_tables").first().waitFor({ timeout: 15000 });
      assert.equal(await page.locator(".portal-vue-ai-feedback").count(), 0, "最终回答还没出来，不应有反馈按钮");
      await page.locator(".portal-vue-ai-feedback").first().waitFor();
      assert.match(await page.locator(".portal-vue-ai-report-meta").first().textContent(), /工具取数 1 次（成功 1）：search_tables/);
    } finally {
      harness.relay.finalDelayMs = 0;
    }
  }));

  test("权益场景：口径提示显示在回答上方，短回答直接显示在对话里；追问带上前一轮并沿用技能与口径", async t => withPage(t, async page => {
    harness.relay.requests.length = 0;
    harness.relay.report = "任哥近 7 天消耗 10 万元。\n\n口径：部门口径（投放一部权益一组 + 二组）· 近 7 天。";
    try {
      await login(page, "林金维");
      await appVisible(page);
      await page.getByPlaceholder(/输入分析问题/).fill("任哥近 7 天消耗多少");
      await page.keyboard.press("Enter");
      const scope = page.locator('[data-test="ai-scope"]').first();
      await scope.waitFor({ timeout: 20000 });
      assert.match(await scope.textContent(), /任哥 → 投放一部-权益一组 \+ 投放一部-权益二组/);
      await page.locator(".portal-vue-ai-feedback").first().waitFor();
      assert.equal(await page.locator(".portal-vue-ai-report-card").count(), 0, "短回答不应被折叠成报告卡片");
      assert.match(await page.locator("#analysisWorkbenchView").innerText(), /任哥近 7 天消耗 10 万元/);

      harness.relay.requests.length = 0;
      await page.getByPlaceholder(/输入分析问题/).fill("那昨天呢");
      await page.keyboard.press("Enter");
      await page.locator('[data-test="ai-scope"]').nth(1).waitFor({ timeout: 20000 });
      assert.match(await page.locator('[data-test="ai-scope"]').nth(1).textContent(), /任哥.*沿用/);
      const followUp = harness.relay.requests.find(request => request.tools);
      const userMessage = followUp.messages.find(message => message.role === "user").content;
      assert.match(userMessage, /对话上下文/);
      assert.match(userMessage, /任哥近 7 天消耗 10 万元/);
    } finally {
      harness.relay.report = "默认测试回答";
    }
  }));

  test("报告按需生成：默认是简短回答；点「整理成报告」选模板后，基于已有事实生成报告卡片，不再取数", async t => withPage(t, async page => {
    harness.relay.requests.length = 0;
    harness.relay.toolScript = [{ calls: [{ id: "rq1", type: "function", function: { name: "query_metric", arguments: JSON.stringify({ metric: "cost", table: "权益-账号维度消耗统计表" }) } }] }];
    harness.relay.report = "近 7 天消耗 44 万元。";
    try {
      await login(page, "林金维");
      await appVisible(page);
      await page.getByPlaceholder(/输入分析问题/).fill("权益近 7 天消耗多少");
      await page.keyboard.press("Enter");
      const makeReport = page.locator('[data-test="make-report"]').first();
      await makeReport.waitFor({ timeout: 20000 });
      assert.equal(await page.locator(".portal-vue-ai-report-card").count(), 0, "默认不是报告卡片");

      harness.relay.requests.length = 0;
      harness.relay.report = "# 权益投放周报\n\n## 本周概览\n\n近 7 天消耗 44 万元，较上期基本持平，各部门表现稳定，未发现需要立即处理的异常。\n\n## 口径说明\n\n时间窗为近 7 天，范围为全部部门。";
      await makeReport.click();
      await page.locator('[data-test="report-template-weekly"]').click();
      await page.locator(".portal-vue-ai-report-card").first().waitFor({ timeout: 20000 });
      assert.equal(harness.relay.requests.filter(request => request.tools).length, 0, "整理成报告不应再取数");
      const systemPrompt = harness.relay.requests.at(-1).messages.find(message => message.role === "system").content;
      assert.match(systemPrompt, /## 报告模板：周报/);
      assert.match(await page.locator("#analysisWorkbenchView").innerText(), /基于对话里 1 次已核实的取数/);
    } finally {
      harness.relay.report = "默认测试回答";
      harness.relay.toolScript = [];
    }
  }));

  test("规划可见可改：没有关键词时模型判断技能，回答上方显示「本次用了什么」；点「换一个 → 改为生成报告」按报告重答", async t => withPage(t, async page => {
    harness.relay.requests.length = 0;
    harness.relay.toolScript = [];
    harness.relay.report = body => (String(body.messages[0]?.content || "").includes("规划助手")
      ? '{"skill":"equity-union-analyst","output":"answer","confidence":0.9,"reason":"问的是各部门回本，属于权益投放"}'
      : body.messages[0].content.includes("报告撰写助手") ? "# 各部门回本报告\n\n## 概览\n\n各部门整体回本情况稳定，近 7 天自营 ROI 在 1 上下波动，没有需要立即处理的异常。\n\n## 口径\n\n时间窗为近 7 天，范围为全部部门。" : "各部门整体回本稳定，自营 ROI 约 1.0。");
    try {
      await login(page, "林金维");
      await appVisible(page);
      await page.getByPlaceholder(/输入分析问题/).fill("帮我看下各部门的回本情况怎么样");
      await page.keyboard.press("Enter");
      const plan = page.locator('[data-test="ai-plan"]').first();
      await plan.waitFor({ timeout: 20000 });
      assert.match(await plan.textContent(), /权益投放分析 · 回答/);
      assert.match(await plan.textContent(), /问的是各部门回本，属于权益投放/);
      assert.equal(await page.locator(".portal-vue-ai-report-card").count(), 0);

      await plan.locator('[data-test="plan-change"]').click();
      await page.locator('[data-test="plan-to-report"]').click();
      await page.locator(".portal-vue-ai-report-card").first().waitFor({ timeout: 20000 });
      const reportRequest = harness.relay.requests.filter(request => !request.tools && String(request.messages[0].content).includes("报告撰写助手")).at(-1);
      assert.ok(reportRequest, "改为报告后应调用报告生成");
    } finally {
      harness.relay.report = "默认测试回答";
    }
  }));

  test("同源登录后令牌只在 httpOnly cookie 里：localStorage 与 document.cookie 都看不到，刷新后仍是登录态，退出后失效", async t => withPage(t, async page => {
    await login(page, "李雨航");
    await appVisible(page);
    const exposed = await page.evaluate(() => ({ stored: localStorage.getItem("portalAuthToken"), cookie: document.cookie }));
    assert.equal(exposed.stored, null, "同源模式下不应把令牌存进 localStorage");
    assert.doesNotMatch(exposed.cookie, /gxt_session/, "cookie 必须是 httpOnly，脚本读不到");
    await page.reload();
    await appVisible(page);
    assert.ok((await page.context().cookies()).some(cookie => cookie.name === "gxt_session" && cookie.httpOnly));
    await page.locator(".portal-vue-user").first().click();
    await page.getByRole("menuitem", { name: "退出系统" }).click();
    await page.locator("#gatewayLoginForm").waitFor();
    assert.ok(!(await page.context().cookies()).some(cookie => cookie.name === "gxt_session" && cookie.value), "退出后 cookie 应被清除");
  }));

  test("页头菜单「修改密码」：输入旧密码和新密码后，旧密码失效、新密码可用（正式环境）", async t => {
    if (skipReason) return t.skip(skipReason);
    const plain = await startHarness();
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    try {
      await page.goto(plain.baseUrl + "/");
      await page.fill('#gatewayLoginForm input[name="name"]', "李雨航");
      await page.fill('#gatewayLoginForm input[name="password"]', plain.PASSWORD);
      await page.click("#gatewayLoginBtn");
      await appVisible(page);
      await page.locator(".portal-vue-user").first().click();
      await page.getByRole("menuitem", { name: "修改密码" }).click();
      await page.getByRole("textbox", { name: "请输入当前密码" }).fill(plain.PASSWORD);
      await page.getByRole("button", { name: "下一步" }).last().click();
      await page.getByRole("textbox", { name: "请输入新密码（至少 8 位）" }).fill("brand-new-pass-77");
      await page.getByRole("button", { name: "下一步" }).last().click();
      await page.getByText("密码已修改").first().waitFor();
      assert.equal((await plain.call("POST", "/v1/auth/login", { body: { name: "李雨航", password: plain.PASSWORD } })).status, 401);
      assert.equal((await plain.call("POST", "/v1/auth/login", { body: { name: "李雨航", password: "brand-new-pass-77" } })).status, 200);
    } finally {
      await context.close();
      await plain.stop();
    }
  });

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
