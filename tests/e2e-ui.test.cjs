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

  test("推荐问题：首屏先推平台能回答的；回答下面出现推荐问题，点一下就是一次提问，只显示在最后一条回答下", async t => withPage(t, async page => {
    harness.relay.requests.length = 0;
    harness.relay.toolScript = [{ calls: [{ id: "f1", type: "function", function: { name: "query_metric", arguments: JSON.stringify({ metric: "roi_self", table: "权益-账号维度消耗统计表" }) } }] }];
    harness.relay.report = "近 7 天自营 ROI 约 1.0。";
    try {
      await login(page, "林金维");
      await appVisible(page);
      await page.getByText("＋ 新的分析").first().click(); // 同账号在本文件前面的用例里已有历史，先开一个空白会话才会显示首屏推荐
      await page.locator('[data-test="ai-starter"]').filter({ hasText: "任哥近 7 天的消耗和自营 ROI" }).first().waitFor({ timeout: 15000 }); // 表权限异步加载
      const starters = await page.locator('[data-test="ai-starter"]').allTextContents();
      assert.ok(!starters.some(text => /超过目标值/.test(text)), "首屏不推荐平台回答不了的问题");

      await page.getByPlaceholder(/输入分析问题/).fill("权益近 7 天自营 ROI 怎么样");
      await page.keyboard.press("Enter");
      const followups = page.locator('[data-test="ai-followups"]').first();
      await followups.waitFor({ timeout: 20000 });
      const chips = await followups.locator('[data-test="ai-followup"]').allTextContents();
      assert.ok(chips.length >= 2 && chips.length <= 3, chips.join(" | "));
      assert.ok(chips.some(text => /各部门的自营 ROI 对比/.test(text)), chips.join(" | "));

      harness.relay.requests.length = 0;
      harness.relay.toolScript = [];
      harness.relay.report = "各部门对比如下。";
      await followups.locator('[data-test="ai-followup"]').filter({ hasText: "各部门的自营 ROI 对比" }).click();
      await page.locator("#analysisWorkbenchView").getByText("各部门对比如下。").first().waitFor({ timeout: 20000 });
      await page.locator('[data-test="ai-followups"]').first().waitFor({ timeout: 20000 });
      const asked = harness.relay.requests.find(request => request.tools).messages.find(message => message.role === "user").content;
      assert.match(asked, /各部门的自营 ROI 对比/);
      assert.equal(await page.locator('[data-test="ai-followups"]').count(), 1, "旧回答下面的推荐问题要收起，只保留最后一条");
    } finally {
      harness.relay.report = "默认测试回答";
      harness.relay.toolScript = [];
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

  // 放在最后：保存权限组会把界面里的整套组配置写回服务端（之后服务端以界面保存的为准），会影响其他用例的表范围
  test("字段权限 · 权限组页：表行出现「全部字段」标签，取消字段后变为「字段 n-1/n」，保存后服务端带上 hiddenFields；勾选「全部数据表」不会放开已隐藏的字段", async t => withPage(t, async page => {
    const admin = skipReason ? "" : await harness.tokenFor("曾祥竞");
    const serverGroup = async () => (await harness.call("GET", "/v1/org", { token: admin })).data.groups.find(group => group.name === "数据分析师") || { hiddenFields: {} };
    const pollServer = async predicate => {
      let group;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        group = await serverGroup();
        if (predicate(group)) return group;
        await page.waitForTimeout(500);
      }
      return group;
    };
    try {
      await login(page, "曾祥竞");
      await appVisible(page);
      await page.evaluate(() => window.portalVueBridge.setPage("权限组"));
      await page.waitForSelector("#permissionGroupView .portal-vue-group-card");
      const target = await page.evaluate(async () => {
        // 字段面板以网关的真实字段为准（/v1/table-fields），不是门户资产里的演示字段
        const api = window.PortalVue;
        await api.loadGatewayFields();
        const state = api.state;
        const fieldsOf = name => api.permissionFieldsOf(name);
        const list = api.permissionTables();
        const index = state.groups.findIndex(group => group.name === "数据分析师");
        const granted = state.groups[index].tables;
        // 只用组里本来就授权的表，避免改动该组的表范围而影响后面共用网关的用例
        const asset = list.find(item => fieldsOf(item.cnName).length > 1 && (granted.includes("全部数据表") || granted.includes(item.cnName)));
        return {
          index, table: asset.cnName, total: fieldsOf(asset.cnName).length, field: fieldsOf(asset.cnName)[0].name, tableCount: list.length, taggedCount: list.filter(item => fieldsOf(item.cnName).length).length,
          orderFields: fieldsOf("用户订单明细").map(field => field.name), orderFull: fieldsOf("用户订单明细").map(field => ({ name: field.name, comment: field.comment || "" })), types: fieldsOf(asset.cnName).map(field => field.type).filter(Boolean), portalOrderFields: (state.assets.find(item => item.cnName === "用户订单明细")?.fields || []).map(field => field.name)
        };
      });
      assert.ok(target.index >= 0);
      assert.ok(target.orderFields.includes("user_id") && !target.orderFields.includes("metric_value"), `应取到网关字段：${target.orderFields}`);
      assert.notDeepEqual(target.orderFields, target.portalOrderFields, "前提：门户演示字段与网关字段不同");
      await page.locator("#permissionGroupView .portal-vue-group-card").nth(target.index).click();
      await page.getByRole("tab", { name: /数据表权限/ }).click();
      const row = page.locator(".portal-vue-table-perm", { has: page.locator(`label[title="${target.table}"]`) }).first();
      await row.scrollIntoViewIfNeeded();
      assert.equal(await row.locator("input[type=checkbox]").first().isChecked(), true, "该表应已被权限组授权");
      const tag = row.locator('[data-test="field-tag"]');
      assert.equal((await tag.textContent()).trim(), "全部字段");
      await tag.focus();
      await page.keyboard.press("Space");
      const dialog = page.locator(".portal-vue-field-dialog");
      await dialog.waitFor();
      assert.equal(await tag.getAttribute("aria-haspopup"), "dialog");
      assert.match(await dialog.locator(".el-dialog__title").textContent(), new RegExp(`设置字段权限 · ${target.table}`));
      await page.waitForFunction(() => document.activeElement?.getAttribute("placeholder") === "搜索字段名或中文名");
      assert.equal(await dialog.locator('[data-test="field-all"]').textContent(), "全选");
      // 不展示数据类型：每一行只有字段名与中文名
      const extra = await dialog.locator(".portal-vue-field-dialog-row").evaluateAll(rows => rows.map(row => row.textContent.trim().replace(row.querySelector("code").textContent, "").replace(row.querySelector(".portal-vue-field-dialog-comment")?.textContent || "", "").trim()).filter(Boolean));
      assert.deepEqual(extra, [], "字段行里除字段名与中文名不应有数据类型等其他文字");
      assert.equal(await page.locator('[data-test="hidden-fields-hint"]').count(), 0);
      // 取消：草稿被丢弃
      await dialog.locator(`[data-field="${target.field}"] label`).click();
      await dialog.getByRole("button", { name: "取消" }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal((await tag.textContent()).trim(), "全部字段", "取消不应改动字段");
      // Esc 同样丢弃
      await tag.click();
      await dialog.waitFor();
      await dialog.locator(`[data-field="${target.field}"] label`).click();
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.equal((await tag.textContent()).trim(), "全部字段");
      await tag.focus();
      await page.keyboard.press("Enter");
      await dialog.waitFor();
      await dialog.locator(`[data-field="${target.field}"] label`).click();
      await dialog.getByRole("button", { name: "确定" }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal((await tag.textContent()).trim(), `字段 ${target.total - 1}/${target.total}`);
      assert.match(await page.locator('[data-test="hidden-fields-hint"]').textContent(), /有隐藏字段时按表名授权/);
      await page.getByRole("button", { name: "保存", exact: true }).click();
      const saved = await page.evaluate(({ index }) => JSON.parse(JSON.stringify(window.portalVueModuleApi.state.groups[index])), target);
      assert.deepEqual(saved.hiddenFields[target.table], [target.field]);
      assert.ok(Array.isArray(saved.confirmedFields[target.table]));
      const afterSave = await pollServer(group => Object.keys(group?.hiddenFields || {}).length > 0);
      assert.deepEqual(afterSave.hiddenFields[target.table], [target.field]);

      // 勾选「全部数据表」只补齐其余表，已隐藏的字段仍然隐藏；其他表全部字段勾选
      await page.locator("label", { hasText: "全部数据表" }).first().click();
      assert.equal(await page.locator("#permissionGroupView .portal-vue-table-perm-row input[type=checkbox]:checked").count(), target.tableCount, "所有表都应被勾选");
      assert.equal((await tag.textContent()).trim(), `字段 ${target.total - 1}/${target.total}`);
      assert.equal(await page.locator('#permissionGroupView [data-test="field-tag"]').count(), target.taggedCount, "每张有字段的表都应显示字段标签");
      const others = await page.locator('#permissionGroupView [data-test="field-tag"]').allTextContents();
      assert.equal(others.filter(text => text.trim() === "全部字段").length, target.taggedCount - 1);
      // 用户订单明细：面板里列的是网关的真实字段，不是门户的演示字段
      const orderRow = page.locator(".portal-vue-table-perm", { has: page.locator('label[title="用户订单明细"]') }).first();
      await orderRow.locator('[data-test="field-tag"]').click();
      await dialog.waitFor();
      const rowNames = () => dialog.locator(".portal-vue-field-dialog-row").evaluateAll(items => items.map(item => item.dataset.field));
      assert.deepEqual(await rowNames(), target.orderFields);
      // 搜索：按中文名、按字段名过滤（不区分大小写）；全选当前结果只动过滤出的行
      const sample = target.orderFull.find(field => field.comment) || target.orderFull[0];
      const matches = word => target.orderFull.filter(field => field.name.toLowerCase().includes(word.toLowerCase()) || field.comment.toLowerCase().includes(word.toLowerCase())).map(field => field.name);
      const search = dialog.locator('input[data-test="field-search"]');
      if (sample.comment) {
        await search.fill(sample.comment);
        assert.deepEqual(await rowNames(), matches(sample.comment));
        assert.ok((await rowNames()).includes(sample.name));
      }
      await search.fill(sample.name.toUpperCase());
      assert.deepEqual(await rowNames(), matches(sample.name));
      assert.equal(await dialog.locator('[data-test="field-all"]').textContent(), "全选当前结果");
      await search.press("Enter");
      assert.equal(await dialog.count(), 1, "搜索框回车不应提交或关闭弹窗");
      await dialog.locator('[data-test="field-all"]').click();
      const matched = matches(sample.name);
      assert.equal((await dialog.locator('[data-test="field-count"]').textContent()).trim(), `已选 ${target.orderFields.length - matched.length}/${target.orderFields.length}`, "全选当前结果只取消过滤出的行");
      await search.fill("");
      assert.equal(await dialog.locator('[data-test="field-all"]').textContent(), "全选");
      assert.equal(await dialog.locator(".portal-vue-field-dialog-row input[type=checkbox]:checked").count(), target.orderFields.length - matched.length);
      await dialog.locator(".el-switch").click();
      assert.deepEqual(await rowNames(), matched, "只看已隐藏");
      await dialog.locator(".el-switch").click();
      await search.fill("zzz-not-exist-zzz");
      assert.equal((await dialog.locator(".portal-vue-field-dialog-empty").textContent()).trim(), "没有匹配的字段");
      await dialog.getByRole("button", { name: "取消" }).click();
      await dialog.waitFor({ state: "hidden" });
      // 字段很多的表：弹窗不超出视口，列表内部滚动
      const long = await page.evaluate(() => { const api = window.PortalVue; return api.permissionTables().map(item => ({ name: item.cnName, count: api.permissionFieldsOf(item.cnName).length })).sort((a, b) => b.count - a.count)[0]; });
      await page.locator(".portal-vue-table-perm", { has: page.locator(`label[title="${long.name}"]`) }).first().locator('[data-test="field-tag"]').click();
      await dialog.waitFor();
      await page.waitForTimeout(400);
      const box = await dialog.boundingBox();
      assert.ok(box.y >= 0 && box.y + box.height <= 900, `弹窗应在视口内：${JSON.stringify(box)}`);
      const list = await dialog.locator('[data-test="field-list"]').evaluate(node => ({ overflowY: getComputedStyle(node).overflowY, scroll: node.scrollHeight, client: node.clientHeight }));
      assert.equal(list.overflowY, "auto");
      if (long.count >= 14) assert.ok(list.scroll > list.client, `长列表应内部滚动：${JSON.stringify(list)}`);
      // 桌面宽度两列：前两个格子同一行、第三个换行；窄屏退回一列
      const tops = await dialog.locator(".portal-vue-field-dialog-row").evaluateAll(items => items.slice(0, 3).map(item => ({ top: item.offsetTop, left: item.offsetLeft })));
      assert.equal(tops[0].top, tops[1].top, "前两个字段应在同一行");
      assert.ok(tops[1].left > tops[0].left && tops[2].top > tops[0].top && tops[2].left === tops[0].left, `按行优先两列排布：${JSON.stringify(tops)}`);
      assert.ok(box.width >= 800, `桌面宽度弹窗应约 860px：${box.width}`);
      await page.screenshot({ path: process.env.FIELD_DIALOG_SHOT || "/private/tmp/claude-501/-Users-zengdada-Documents------/d0f78dce-86cf-4f82-b0ec-ffad6e191c5a/scratchpad/field-dialog-2col.png" });
      await page.setViewportSize({ width: 640, height: 900 });
      await page.waitForTimeout(300);
      const narrow = await dialog.locator(".portal-vue-field-dialog-row").evaluateAll(items => items.slice(0, 2).map(item => item.offsetTop));
      assert.ok(narrow[1] > narrow[0], "窄屏应为一列");
      assert.ok((await dialog.boundingBox()).width <= 640 * 0.9 + 1, "窄屏弹窗不超过 90vw");
      await page.setViewportSize({ width: 1280, height: 900 });
      await dialog.getByRole("button", { name: "取消" }).click();
    } finally {
      // 恢复：清掉隐藏字段，避免影响共用同一网关的后续用例（隐藏字段会让指标不可用），失败也会执行
      if (!skipReason) {
        const org = (await harness.call("GET", "/v1/org", { token: admin })).data;
        const groups = org.groups.map(group => ({ ...group, hiddenFields: {}, ...(group.name === "数据分析师" ? { confirmedFields: {} } : {}) }));
        if (groups.length) await harness.call("PUT", "/v1/org", { token: admin, body: { groups } });
      }
    }
    assert.deepEqual((await serverGroup()).hiddenFields, {});
  }));
  // 同样放在最后：会写入个人字段设置与权限组隐藏字段，finally 里全部恢复
  test("字段权限 · 用户页：刷新页面后从服务端回显个人表与字段设置；不做改动直接保存，服务端的个人覆盖不变", async t => withPage(t, async page => {
    const admin = skipReason ? "" : await harness.tokenFor("曾祥竞");
    const userName = "李雨航";
    const adminView = async () => (await harness.call("GET", "/v1/permissions", { token: admin })).data.users.find(user => user.name === userName);
    const rowOf = name => page.locator("#permissionConfigView .portal-vue-table-perm").filter({ has: page.getByText(name, { exact: true }) }).first();
    const dialog = page.locator(".portal-vue-field-dialog");
    try {
      await login(page, "曾祥竞");
      await appVisible(page);
      const target = await page.evaluate(async name => {
        const api = window.portalVueModuleApi;
        await window.PortalVue.loadGatewayFields();
        const withFields = window.PortalVue.permissionTables().map(item => ({ cnName: item.cnName, fields: window.PortalVue.permissionFieldsOf(item.cnName) }));
        const group = api.state.groups.find(item => item.name === "数据分析师");
        const groupAsset = withFields.find(item => item.fields.length > 2 && group.tables.includes(item.cnName));
        const personalAsset = withFields.find(item => item.fields.length > 2 && !group.tables.includes(item.cnName));
        group.hiddenFields = { [groupAsset.cnName]: [groupAsset.fields[0].name, groupAsset.fields[1].name] };
        group.confirmedFields = { [groupAsset.cnName]: groupAsset.fields.map(field => field.name) };
        await api.orgSync.push();
        return {
          index: api.state.users.findIndex(user => user.name === name),
          groupTable: groupAsset.cnName, groupTotal: groupAsset.fields.length, granted: groupAsset.fields[0].name, stillHidden: groupAsset.fields[1].name,
          personalTable: personalAsset.cnName, personalTotal: personalAsset.fields.length, personalField: personalAsset.fields[0].name
        };
      }, userName);
      assert.ok(target.index >= 0);
      for (let attempt = 0; attempt < 20 && !(await adminView()).groupHiddenFields[target.groupTable]; attempt += 1) await page.waitForTimeout(300);
      const put = await harness.call("PUT", `/v1/permissions/${encodeURIComponent(userName)}`, { token: admin, body: {
        tables: [target.personalTable], hiddenFields: { [target.personalTable]: [target.personalField] }, grantedFields: { [target.groupTable]: [target.granted] }
      } });
      assert.equal(put.status, 200, JSON.stringify(put.data));
      const before = (await adminView()).override;
      assert.equal(before.grantedGroup, "数据分析师");
      assert.deepEqual(before.grantedFields, { [target.groupTable]: [target.granted] });

      // 全新加载页面：个人状态只能来自服务端
      await page.reload();
      await appVisible(page);
      await page.evaluate(i => { window.portalVueBridge.setActiveUserIndex(i); window.portalVueBridge.setPage("配置权限"); }, target.index);
      await page.getByRole("tab", { name: /表权限/ }).click();
      const personalBox = rowOf(target.personalTable).locator("input[type=checkbox]").first();
      for (let attempt = 0; attempt < 20 && !(await personalBox.isChecked()); attempt += 1) await page.waitForTimeout(300);
      assert.equal(await personalBox.isChecked(), true, "个人追加的表已勾选");
      const personalTag = rowOf(target.personalTable).locator('[data-test="field-tag"]');
      assert.equal((await personalTag.textContent()).trim(), `字段 ${target.personalTotal - 1}/${target.personalTotal}`);
      await personalTag.click();
      await dialog.waitFor();
      assert.equal(await dialog.locator(`[data-field="${target.personalField}"] input[type=checkbox]`).isChecked(), false, "个人隐藏的字段未勾选");
      await dialog.getByRole("button", { name: "取消" }).click();
      await dialog.waitFor({ state: "hidden" });
      const groupTag = rowOf(target.groupTable).locator('[data-test="field-tag"]');
      assert.equal((await groupTag.textContent()).trim(), `字段 ${target.groupTotal - 1}/${target.groupTotal}`);
      await groupTag.click();
      await dialog.waitFor();
      assert.equal(await dialog.locator(`[data-field="${target.granted}"] input[type=checkbox]`).isChecked(), true, "组隐藏、个人追加回来的字段已勾选");
      assert.equal(await dialog.locator(`[data-field="${target.stillHidden}"] input[type=checkbox]`).isChecked(), false);
      await dialog.getByRole("button", { name: "取消" }).click();
      await dialog.waitFor({ state: "hidden" });

      // 不做任何改动直接保存：服务端的个人覆盖保持不变
      await Promise.all([
        page.waitForResponse(res => res.request().method() === "PUT" && res.url().includes("/v1/permissions/")),
        page.getByRole("button", { name: "保存权限" }).click()
      ]);
      const after = (await adminView()).override;
      for (const key of ["tables", "hiddenFields", "grantedFields", "grantedGroup"]) assert.deepEqual(after[key], before[key], key);
    } finally {
      if (!skipReason) {
        await harness.call("PUT", `/v1/permissions/${encodeURIComponent(userName)}`, { token: admin, body: { tables: [] } });
        const org = (await harness.call("GET", "/v1/org", { token: admin })).data;
        const groups = org.groups.map(group => ({ ...group, hiddenFields: {}, ...(group.name === "数据分析师" ? { confirmedFields: {} } : {}) }));
        if (groups.length) await harness.call("PUT", "/v1/org", { token: admin, body: { groups } });
      }
    }
  }));
  test("字段权限 · 用户页：读取已保存权限超时后「保存权限」恢复可点，并提示管理员保存会按当前页面内容覆盖", async t => withPage(t, async page => {
    const userName = "李雨航";
    // 测试用的短超时（页面启动时读取一次），不是生产配置
    await page.addInitScript(() => { window.__portalGatewayTimeoutMs = 800; });
    await login(page, "曾祥竞");
    await appVisible(page);
    const index = await page.evaluate(name => window.portalVueModuleApi.state.users.findIndex(user => user.name === name), userName);
    await page.evaluate(() => window.PortalVue.loadGatewayFields());
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route(url => url.pathname === "/v1/permissions", async route => { await gate; await route.continue().catch(() => {}); });
    try {
      await page.evaluate(i => { window.portalVueBridge.setActiveUserIndex(i); window.portalVueBridge.setPage("配置权限"); }, index);
      const saveButton = page.getByRole("button", { name: "保存权限" });
      assert.equal(await saveButton.isDisabled(), true);
      assert.equal(await saveButton.getAttribute("aria-busy"), "true");
      await page.waitForFunction(() => {
        const button = [...document.querySelectorAll("#permissionConfigView button")].find(item => item.textContent.includes("保存权限"));
        return button && !button.disabled;
      }, null, { timeout: 5000 });
      assert.notEqual(await saveButton.getAttribute("aria-busy"), "true");
      await page.locator(".el-message", { hasText: "未能读取该用户已保存的个人权限" }).first().waitFor({ timeout: 3000 });
    } finally {
      release();
      await page.unrouteAll({ behavior: "ignoreErrors" });
    }
  }));
  test("字段权限 · 用户页：个人覆盖存的是「全部数据表」时，不改动保存仍是该标记；取消一张表后改存明确的表清单", async t => withPage(t, async page => {
    const admin = skipReason ? "" : await harness.tokenFor("曾祥竞");
    const userName = "李雨航";
    const adminView = async () => (await harness.call("GET", "/v1/permissions", { token: admin })).data.users.find(user => user.name === userName);
    const rowOf = name => page.locator("#permissionConfigView .portal-vue-table-perm").filter({ has: page.getByText(name, { exact: true }) }).first();
    const saveButton = page.getByRole("button", { name: "保存权限" });
    const openFresh = async index => {
      await page.reload();
      await appVisible(page);
      await page.evaluate(i => { window.portalVueBridge.setActiveUserIndex(i); window.portalVueBridge.setPage("配置权限"); }, index);
      await page.getByRole("tab", { name: /表权限/ }).click();
    };
    const savedRequest = async () => {
      const [request] = await Promise.all([
        page.waitForRequest(req => req.method() === "PUT" && req.url().includes("/v1/permissions/")),
        saveButton.click()
      ]);
      await request.response();
      return request.postDataJSON();
    };
    try {
      await login(page, "曾祥竞");
      await appVisible(page);
      const target = await page.evaluate(async name => {
        const api = window.portalVueModuleApi;
        await window.PortalVue.loadGatewayFields();
        const group = api.state.groups.find(item => item.name === "数据分析师");
        const personal = window.PortalVue.permissionTables().map(item => ({ cnName: item.cnName, fields: window.PortalVue.permissionFieldsOf(item.cnName) })).filter(item => item.fields.length > 2 && !group.tables.includes(item.cnName));
        return { index: api.state.users.findIndex(user => user.name === name), hiddenTable: personal[0].cnName, field: personal[0].fields[0].name, untick: personal[1].cnName };
      }, userName);
      const put = await harness.call("PUT", `/v1/permissions/${encodeURIComponent(userName)}`, { token: admin, body: { tables: ["全部数据表"], hiddenFields: { [target.hiddenTable]: [target.field] } } });
      assert.equal(put.status, 200, JSON.stringify(put.data));
      assert.deepEqual((await adminView()).override.tables, ["全部数据表"], "前提：服务端存的是标记");

      // 读取已保存权限的请求慢一些：读完之前「保存权限」不可点
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      await page.route(url => url.pathname === "/v1/permissions", async route => { await gate; await route.continue(); });
      await openFresh(target.index);
      assert.equal(await saveButton.isDisabled(), true, "回显完成前不能保存");
      release();
      await page.waitForFunction(() => ![...document.querySelectorAll("#permissionConfigView button")].find(button => button.textContent.includes("保存权限"))?.disabled);
      await page.unrouteAll({ behavior: "ignoreErrors" });
      const body = await savedRequest();
      assert.deepEqual(body.tables, ["全部数据表"], JSON.stringify(body.tables));
      const kept = (await adminView()).override;
      assert.deepEqual(kept.tables, ["全部数据表"]);
      assert.deepEqual(kept.hiddenFields, { [target.hiddenTable]: [target.field] });

      await openFresh(target.index);
      const box = rowOf(target.untick).locator("input[type=checkbox]").first();
      for (let attempt = 0; attempt < 20 && !(await box.isChecked()); attempt += 1) await page.waitForTimeout(300);
      await rowOf(target.untick).locator(".el-checkbox").first().click();
      assert.equal(await box.isChecked(), false);
      const second = await savedRequest();
      assert.ok(!second.tables.includes("全部数据表") && !second.tables.includes(target.untick) && second.tables.includes(target.hiddenTable), JSON.stringify(second.tables));
      const explicit = (await adminView()).override;
      // 服务端会去掉组已授予的表，所以存下的是提交清单的子集
      assert.ok(explicit.tables.length > 0 && explicit.tables.every(name => second.tables.includes(name)), JSON.stringify(explicit.tables));
      assert.ok(!explicit.tables.includes("全部数据表") && !explicit.tables.includes(target.untick) && explicit.tables.includes(target.hiddenTable));
      assert.deepEqual(explicit.hiddenFields, { [target.hiddenTable]: [target.field] });
    } finally {
      if (!skipReason) await harness.call("PUT", `/v1/permissions/${encodeURIComponent(userName)}`, { token: admin, body: { tables: [] } });
    }
  }));
  test("字段权限 · 用户页：组授予表上被组隐藏的字段可个人追加、其余字段锁定；个人追加的表可取消字段；保存带上 grantedFields / hiddenFields 并可回显", async t => withPage(t, async page => {
    const admin = skipReason ? "" : await harness.tokenFor("曾祥竞");
    const userName = "李雨航";
    const adminView = async () => (await harness.call("GET", "/v1/permissions", { token: admin })).data.users.find(user => user.name === userName);
    const openTables = async index => {
      await page.evaluate(i => { window.portalVueBridge.setActiveUserIndex(i); window.portalVueBridge.setPage("配置权限"); }, index);
      await page.getByRole("tab", { name: /表权限/ }).click();
    };
    const rowOf = name => page.locator("#permissionConfigView .portal-vue-table-perm").filter({ has: page.getByText(name, { exact: true }) }).first();
    const save = async () => {
      const [request] = await Promise.all([
        page.waitForRequest(req => req.method() === "PUT" && req.url().includes("/v1/permissions/")),
        page.getByRole("button", { name: "保存权限" }).click()
      ]);
      return request.postDataJSON();
    };
    try {
      await login(page, "曾祥竞");
      await appVisible(page);
      const target = await page.evaluate(async name => {
        const api = window.portalVueModuleApi;
        const state = api.state;
        // 字段来源与界面一致：网关的真实字段
        await window.PortalVue.loadGatewayFields();
        const withFields = window.PortalVue.permissionTables().map(item => ({ cnName: item.cnName, fields: window.PortalVue.permissionFieldsOf(item.cnName) }));
        const group = state.groups.find(item => item.name === "数据分析师");
        const groupAsset = withFields.find(item => item.fields.length > 2 && group.tables.includes(item.cnName));
        const personalAsset = withFields.find(item => item.fields.length > 2 && !group.tables.includes(item.cnName));
        group.hiddenFields = { [groupAsset.cnName]: [groupAsset.fields[0].name] };
        group.confirmedFields = { [groupAsset.cnName]: groupAsset.fields.map(field => field.name) };
        await api.orgSync.push();
        await new Promise(resolve => setTimeout(resolve, 800));
        return {
          index: state.users.findIndex(user => user.name === name),
          groupTable: groupAsset.cnName, groupTotal: groupAsset.fields.length, hidden: groupAsset.fields[0].name, visible: groupAsset.fields[1].name,
          personalTable: personalAsset.cnName, personalTotal: personalAsset.fields.length, personalField: personalAsset.fields[0].name
        };
      }, userName);
      assert.ok(target.index >= 0);
      await openTables(target.index);

      // 组授予的表：被组隐藏的字段不勾选但可勾；组可见的字段灰色锁定并带权限组名
      const groupRow = rowOf(target.groupTable);
      const groupTag = groupRow.locator('[data-test="field-tag"]');
      assert.equal((await groupTag.textContent()).trim(), `字段 ${target.groupTotal - 1}/${target.groupTotal}`);
      await groupTag.click();
      const dialog = page.locator(".portal-vue-field-dialog");
      await dialog.waitFor();
      assert.match(await dialog.textContent(), /用户：李雨航 · 权限组：数据分析师/);
      const groupItem = field => dialog.locator(`[data-field="${field}"]`);
      assert.equal(await groupItem(target.hidden).locator("input[type=checkbox]").isChecked(), false);
      assert.equal(await groupItem(target.hidden).locator("input[type=checkbox]").isDisabled(), false);
      assert.equal(await groupItem(target.visible).locator("input[type=checkbox]").isChecked(), true);
      assert.equal(await groupItem(target.visible).locator("input[type=checkbox]").isDisabled(), true);
      assert.match(await groupItem(target.visible).textContent(), /数据分析师/, "锁定字段应显示权限组名");
      await groupItem(target.hidden).locator("label").click();
      await dialog.getByRole("button", { name: "取消" }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal((await groupTag.textContent()).trim(), `字段 ${target.groupTotal - 1}/${target.groupTotal}`, "取消不应改动字段");
      await groupTag.click();
      await dialog.waitFor();
      await groupItem(target.hidden).locator("label").click();
      await dialog.getByRole("button", { name: "确定" }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal((await groupTag.textContent()).trim(), "全部字段");

      // 个人追加的表：默认全部字段，取消一个字段后变为 n-1/n
      await rowOf(target.personalTable).locator(".el-checkbox").first().click();
      const personalTag = rowOf(target.personalTable).locator('[data-test="field-tag"]');
      assert.equal((await personalTag.textContent()).trim(), "全部字段");
      await personalTag.click();
      await dialog.waitFor();
      await dialog.locator(`[data-field="${target.personalField}"] label`).click();
      await dialog.getByRole("button", { name: "确定" }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal((await personalTag.textContent()).trim(), `字段 ${target.personalTotal - 1}/${target.personalTotal}`);

      const body = await save();
      assert.deepEqual(body.grantedFields, { [target.groupTable]: [target.hidden] });
      assert.deepEqual(body.hiddenFields, { [target.personalTable]: [target.personalField] });
      assert.ok(body.tables.includes(target.personalTable) && !body.tables.includes(target.groupTable), "只提交个人追加的表");
      let view;
      for (let attempt = 0; attempt < 20; attempt += 1) { view = await adminView(); if (view.grantedFields[target.groupTable]) break; await page.waitForTimeout(300); }
      assert.deepEqual(view.grantedFields, { [target.groupTable]: [target.hidden] });
      assert.deepEqual(view.hiddenFields, { [target.personalTable]: [target.personalField] });
      assert.ok(!view.effectiveHiddenFields[target.groupTable]?.includes(target.hidden), "追加后该字段对用户有效可见");

      // 回显：重新打开页面，两种设置都还在；取消个人追加的表会同时清掉它的字段设置
      await page.evaluate(() => window.portalVueBridge.setPage("用户管理"));
      await openTables(target.index);
      assert.equal((await rowOf(target.groupTable).locator('[data-test="field-tag"]').textContent()).trim(), "全部字段");
      assert.equal((await rowOf(target.personalTable).locator('[data-test="field-tag"]').textContent()).trim(), `字段 ${target.personalTotal - 1}/${target.personalTotal}`);
      await rowOf(target.personalTable).locator(".el-checkbox").first().click();
      assert.equal(await rowOf(target.personalTable).locator('[data-test="field-tag"]').count(), 0);
      const second = await save();
      assert.deepEqual(second.hiddenFields, {});
      assert.deepEqual(second.grantedFields, { [target.groupTable]: [target.hidden] });
      assert.ok(!second.tables.includes(target.personalTable));

      // 门户管理员不显示字段面板
      await openTables(await page.evaluate(() => window.portalVueModuleApi.state.users.findIndex(user => user.group === "门户管理员")));
      assert.equal(await page.locator('#permissionConfigView [data-test="field-tag"]').count(), 0);
    } finally {
      // 恢复：清掉个人覆盖与权限组隐藏字段，避免影响共用网关的后续用例
      if (!skipReason) {
        await harness.call("PUT", `/v1/permissions/${encodeURIComponent(userName)}`, { token: admin, body: { tables: [] } });
        const org = (await harness.call("GET", "/v1/org", { token: admin })).data;
        const groups = org.groups.map(group => ({ ...group, hiddenFields: {}, ...(group.name === "数据分析师" ? { confirmedFields: {} } : {}) }));
        if (groups.length) await harness.call("PUT", "/v1/org", { token: admin, body: { groups } });
      }
    }
    const after = await adminView();
    assert.deepEqual(after.hiddenFields, {});
    assert.deepEqual(after.grantedFields, {});
  }));
  /* ===== 业务线知识库：表知识库与业务线选项读写服务端 ===== */
  const openTableDetail = async (page, cnName) => {
    await page.evaluate(name => {
      const asset = window.portalVueModuleApi.state.assets.find(item => item.cnName === name);
      window.portalVueBridge.setTableDetailAsset(asset);
      window.portalVueBridge.setPage("表详情");
    }, cnName);
    await page.getByRole("tab", { name: "知识库" }).click();
  };
  test("表详情：编辑并保存知识库后刷新页面仍在（证明落到了服务端）", async t => withPage(t, async page => {
    const admin = skipReason ? "" : await harness.tokenFor("曾祥竞");
    const marker = `E2E-KB-${Date.now()}`;
    try {
      await login(page, "曾祥竞");
      await appVisible(page);
      await page.waitForFunction(() => window.PortalVue.knowledgeData.ready);
      await openTableDetail(page, "广告计划日报表");
      await page.getByRole("button", { name: "编辑知识库" }).click();
      await page.locator(".portal-vue-md-textarea").fill(`# 广告计划日报表\n\n${marker}`);
      await page.getByRole("button", { name: "保存知识库" }).click();
      await page.locator(".portal-vue-knowledge-doc", { hasText: marker }).waitFor();
      await page.reload();
      await appVisible(page);
      await openTableDetail(page, "广告计划日报表");
      await page.locator(".portal-vue-knowledge-doc", { hasText: marker }).waitFor();
      const server = await harness.call("GET", `/v1/knowledge/tables/${encodeURIComponent("广告计划日报表")}`, { token: admin });
      assert.match(server.data.knowledge.markdown, new RegExp(marker));
    } finally {
      if (!skipReason) await harness.call("PUT", `/v1/knowledge/tables/${encodeURIComponent("广告计划日报表")}`, { token: admin, body: { markdown: "# 广告计划日报表\n恢复" } });
    }
  }));
  test("表管理的业务线筛选下拉包含 公共 与 种子业务线", async t => withPage(t, async page => {
    await login(page, "曾祥竞");
    await appVisible(page);
    await page.waitForFunction(() => window.PortalVue.knowledgeData.ready);
    await page.evaluate(() => window.portalVueBridge.setPage("表管理"));
    await page.locator(".el-select", { hasText: "全部业务线" }).first().click();
    await page.locator(".el-select-dropdown__item:visible").first().waitFor();
    const options = await page.locator(".el-select-dropdown__item:visible").allTextContents();
    const labels = options.map(text => text.trim());
    for (const name of ["公共", "权益", "存量", "号卡", "保险"]) assert.ok(labels.includes(name), `${name} 不在 ${JSON.stringify(labels)}`);
  }));
  test("没有「表管理」编辑权限的账号看不到「编辑知识库」按钮", async t => withPage(t, async page => {
    const admin = skipReason ? "" : await harness.tokenFor("曾祥竞");
    const before = skipReason ? null : (await harness.call("GET", "/v1/org", { token: admin })).data;
    let baseGroups = [];
    try {
      // 只给「表管理」查看权限（不给编辑权限）
      const full = (name, tables, extra = {}) => ({ name, desc: "", menus: ["灵犀智析"], menuEdits: [], boards: [], tables, status: "启用", ...extra });
      baseGroups = before.groups.length ? before.groups : [
        full("门户管理员", ["全部数据表"], { menus: ["灵犀智析", "AI 中心", "表管理"], menuEdits: ["表管理"] }), full("投放组长", ["广告计划日报表"]), full("优化师", ["广告计划日报表"]),
        full("数据分析师", ["广告计划日报表", "用户订单明细"], { menus: ["灵犀智析", "数据看板"], boards: ["大盘数据"] }), full("只读访客", [])
      ];
      const groups = baseGroups.map(group => group.name === "数据分析师" ? { ...group, menus: [...new Set([...group.menus, "表管理"])], menuEdits: group.menuEdits.filter(name => name !== "表管理") } : group);
      const put = await harness.call("PUT", "/v1/org", { token: admin, body: { groups } });
      assert.equal(put.status, 200, JSON.stringify(put.data));
      await login(page, "李雨航");
      await appVisible(page);
      await page.waitForFunction(() => window.PortalVue.knowledgeData.ready);
      await openTableDetail(page, "广告计划日报表");
      await page.locator(".portal-vue-knowledge-bar").waitFor();
      assert.equal(await page.getByRole("button", { name: "编辑知识库" }).count(), 0);
      assert.equal(await page.evaluate(() => window.PortalVue.knowledgeData.canEdit), false);
    } finally {
      if (!skipReason && baseGroups.length) await harness.call("PUT", "/v1/org", { token: admin, body: { groups: baseGroups } });
    }
  }));
  test("表详情：知识库读取失败时显示错误与重试，不出现新建/编辑按钮；重试成功后恢复", async t => withPage(t, async page => {
    await login(page, "曾祥竞");
    await appVisible(page);
    await page.waitForFunction(() => window.PortalVue.knowledgeData.ready);
    const pattern = /\/v1\/knowledge\/tables\//;
    await page.route(pattern, route => route.request().method() === "GET" ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "服务暂时不可用" }) }) : route.continue());
    await openTableDetail(page, "广告计划日报表");
    await page.locator(".portal-vue-knowledge-error").waitFor();
    assert.match(await page.locator(".portal-vue-knowledge-error").textContent(), /服务暂时不可用/);
    assert.equal(await page.getByRole("button", { name: "编辑知识库" }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "新建知识库" }).count(), 0);
    await page.unroute(pattern);
    await page.getByRole("button", { name: "重试" }).click();
    await page.locator(".portal-vue-knowledge-doc").waitFor();
    assert.equal(await page.locator(".portal-vue-knowledge-error").count(), 0);
    await page.getByRole("button", { name: "编辑知识库" }).waitFor();
  }));

  /* ===== 表管理 · 业务线视图 ===== */
  const bizSnapshot = async admin => (await harness.call("GET", "/v1/knowledge", { token: admin })).data;
  /** 把业务线、关联、归属恢复到快照（用服务端当前 rev；快照里没有的表一并写成未分组） */
  const bizRestore = async (admin, snap) => {
    const now = (await bizSnapshot(admin));
    const tableLines = Object.fromEntries(now.knownTables.map(table => [table, snap.tableLines[table] || ""]));
    const businessLines = snap.businessLines.map(line => ({ id: line.id, name: line.name, knowledge: line.knowledge ? { markdown: line.knowledge.markdown } : "", relations: line.relations }));
    const put = await harness.call("PUT", "/v1/knowledge/business-lines", { token: admin, body: { rev: now.rev, businessLines, tableLines } });
    assert.equal(put.status, 200, JSON.stringify(put.data));
  };
  const openBizView = async page => {
    await login(page, "曾祥竞");
    await appVisible(page);
    await page.waitForFunction(() => window.PortalVue.knowledgeData.ready);
    await openBizViewNoLogin(page);
  };
  const openBizViewNoLogin = async page => {
    await page.evaluate(() => window.portalVueBridge.setPage("表管理"));
    await page.locator(".portal-vue-bizline-view-switch").getByText("业务线", { exact: true }).click();
    await page.locator(".portal-vue-bizline-list").waitFor();
  };
  const bizItem = (page, name) => page.locator(".portal-vue-bizline-item", { hasText: name });
  /** 改名 / 删除平时隐藏且点不到：和真实用户一样，先把鼠标移到那一行，再点按钮 */
  const clickRowAction = async (page, lineName, action) => {
    await bizItem(page, lineName).hover();
    await bizItem(page, lineName).getByRole("button", { name: action, exact: true }).click();
  };
  /** 当前展开的下拉里的全部选项文字（收起的下拉仍留在页面里，要排除） */
  const openOptions = async page => {
    const read = () => page.evaluate(() => [...document.querySelectorAll(".el-select-dropdown")].filter(d => getComputedStyle(d.parentElement).display !== "none").flatMap(d => [...d.querySelectorAll(".el-select-dropdown__item")].map(item => item.textContent.trim())));
    await page.waitForFunction(() => [...document.querySelectorAll(".el-select-dropdown")].some(d => getComputedStyle(d.parentElement).display !== "none" && d.querySelector(".el-select-dropdown__item")));
    return read();
  };
  const pickOption = async (page, formLabel, optionName) => {
    await page.locator(".el-dialog:visible .el-form-item", { hasText: formLabel }).locator(".el-select").click();
    await page.getByRole("option", { name: optionName, exact: true }).click();
    await page.waitForFunction(() => ![...document.querySelectorAll(".el-select-dropdown")].some(d => getComputedStyle(d.parentElement).display !== "none"));
  };

  test("业务线视图：新增「AI 短剧」、写知识库、保存后刷新仍在", async t => withPage(t, async page => {
    const admin = skipReason ? "" : await harness.tokenFor("曾祥竞");
    const snap = skipReason ? null : await bizSnapshot(admin);
    const marker = `E2E-LINE-${Date.now()}`;
    try {
      await openBizView(page);
      await page.getByRole("button", { name: "新增业务线" }).click();
      await page.getByPlaceholder("例如：AI 短剧").fill("AI 短剧");
      await page.locator(".el-dialog:visible").getByRole("button", { name: "确定" }).click();
      await bizItem(page, "AI 短剧").waitFor();
      await page.getByRole("button", { name: "新建知识库" }).click();
      assert.match(await page.locator(".portal-vue-md-textarea").inputValue(), /AI 短剧/, "新知识库应带业务线模板");
      await page.locator(".portal-vue-md-textarea").fill(`# AI 短剧\n\n${marker}`);
      await page.getByRole("button", { name: "保存知识库" }).click();
      await page.locator(".portal-vue-knowledge-doc", { hasText: marker }).waitFor();
      await page.reload();
      await appVisible(page);
      await page.waitForFunction(() => window.PortalVue.knowledgeData.ready);
      await openBizViewNoLogin(page);
      await bizItem(page, "AI 短剧").click();
      await page.locator(".portal-vue-knowledge-doc", { hasText: marker }).waitFor();
      assert.match(await page.locator(".portal-vue-knowledge-bar").textContent(), /最近编辑/);
      const server = await bizSnapshot(admin);
      assert.match(server.businessLines.find(line => line.name === "AI 短剧").knowledge.markdown, new RegExp(marker));
    } finally {
      if (!skipReason) await bizRestore(admin, snap);
    }
  }));

  test("表关联：添加一条 订单.product_name N:1 产品维表.product_name 后刷新仍在；表只能选该业务线或「公共」里的；两端字段下拉里只有该表的字段", async t => withPage(t, async page => {
    const admin = skipReason ? "" : await harness.tokenFor("曾祥竞");
    const snap = skipReason ? null : await bizSnapshot(admin);
    try {
      const fields = (await harness.call("GET", "/v1/table-fields", { token: admin })).data.tables;
      const names = table => fields[table].map(field => field.name).sort();
      await openBizView(page);
      await bizItem(page, "号卡").click();
      await page.getByRole("tab", { name: "表关联" }).click();
      await page.getByRole("button", { name: "添加关联" }).click();
      await page.locator(".el-dialog:visible .el-form-item", { hasText: "左表" }).locator(".el-select").click();
      const tableOptions = await openOptions(page);
      await page.keyboard.press("Escape");
      for (const table of ["用户订单明细", "产品维表", "渠道维表"]) assert.ok(tableOptions.includes(table), `号卡 ∪ 公共 的表应可选：${table}`);
      for (const table of ["用户画像标签明细表", "广告计划日报表"]) assert.ok(!tableOptions.includes(table), `其他业务线的表不应可选：${table}`);
      assert.ok(tableOptions.every(table => ["号卡", "公共"].includes(snap.tableLines[table])), `只应有号卡与公共的表：${tableOptions}`);
      await pickOption(page, "左表", "用户订单明细");
      await page.locator(".el-dialog:visible .el-form-item", { hasText: "左字段" }).locator(".el-select").click();
      const leftOptions = (await openOptions(page)).sort();
      assert.deepEqual(leftOptions, names("用户订单明细"), "左字段只应有左表的字段");
      await page.getByRole("option", { name: "product_name", exact: true }).click();
      await page.waitForFunction(() => ![...document.querySelectorAll(".el-select-dropdown")].some(d => getComputedStyle(d.parentElement).display !== "none"));
      await pickOption(page, "关系", "N:1");
      await pickOption(page, "右表", "产品维表");
      await page.locator(".el-dialog:visible .el-form-item", { hasText: "右字段" }).locator(".el-select").click();
      const rightOptions = (await openOptions(page)).sort();
      assert.deepEqual(rightOptions, names("产品维表"), "右字段只应有右表的字段");
      await page.getByRole("option", { name: "product_name", exact: true }).click();
      await page.waitForFunction(() => ![...document.querySelectorAll(".el-select-dropdown")].some(d => getComputedStyle(d.parentElement).display !== "none"));
      await page.locator(".el-dialog:visible").getByRole("button", { name: "保存" }).click();
      const row = () => page.locator(".portal-vue-bizline .el-table__row", { hasText: "N:1" });
      await row().waitFor();
      await page.reload();
      await appVisible(page);
      await page.waitForFunction(() => window.PortalVue.knowledgeData.ready);
      await openBizViewNoLogin(page);
      await bizItem(page, "号卡").click();
      await page.getByRole("tab", { name: "表关联" }).click();
      const text = await row().first().textContent();
      assert.match(text, /product_name/); assert.match(text, /N:1/); assert.match(text, /产品维表/); assert.match(text, /正常/);
      const server = (await bizSnapshot(admin)).businessLines.find(line => line.name === "号卡");
      assert.equal(server.relations.length, 1);
      assert.deepEqual(server.relations[0].left, { table: "用户订单明细", field: "product_name" });
      assert.equal(server.relations[0].type, "N:1");
      assert.ok(server.relations[0].id, "服务端应分配关联 id");
    } finally {
      if (!skipReason) await bizRestore(admin, snap);
    }
  }));

  test("移出被关联引用的表：先确认（取消则不动）；确认后该关联标「失效」并给出原因", async t => withPage(t, async page => {
    const admin = skipReason ? "" : await harness.tokenFor("曾祥竞");
    const snap = skipReason ? null : await bizSnapshot(admin);
    try {
      const relation = { left: { table: "用户订单明细", field: "product_name" }, right: { table: "产品维表", field: "product_name" }, type: "N:1", note: "" };
      const businessLines = snap.businessLines.map(line => ({ id: line.id, name: line.name, knowledge: line.knowledge ? { markdown: line.knowledge.markdown } : "", relations: line.name === "号卡" ? [relation] : line.relations }));
      const seed = await harness.call("PUT", "/v1/knowledge/business-lines", { token: admin, body: { rev: snap.rev, businessLines, tableLines: {} } });
      assert.equal(seed.status, 200, JSON.stringify(seed.data));
      await openBizView(page);
      await bizItem(page, "号卡").click();
      await page.getByRole("tab", { name: "表关联" }).click();
      assert.equal(await page.locator(".portal-vue-bizline-invalid").count(), 0, "移出前关联正常");
      await page.getByRole("tab", { name: "包含的表" }).click();
      const orderRow = () => page.locator(".portal-vue-bizline #pane-tables .el-table__row", { hasText: "用户订单明细" });
      // 取消：不移出
      await orderRow().getByRole("button", { name: "移出" }).click();
      const box = page.locator(".el-message-box");
      await box.waitFor();
      assert.match(await box.textContent(), /该表在 1 条关联里被引用，移出后这些关联将失效/);
      await box.getByRole("button", { name: "取消" }).click();
      await box.waitFor({ state: "hidden" });
      assert.equal(await orderRow().count(), 1, "取消后表仍在");
      assert.equal((await bizSnapshot(admin)).tableLines["用户订单明细"], "号卡", "取消后不应保存");
      // 确认：移出，关联标失效
      await orderRow().getByRole("button", { name: "移出" }).click();
      await box.waitFor();
      await box.getByRole("button", { name: "移出" }).click();
      await orderRow().waitFor({ state: "detached" });
      assert.equal((await bizSnapshot(admin)).tableLines["用户订单明细"], undefined, "确认后应保存为未分组");
      await page.getByRole("tab", { name: "表关联" }).click();
      const tag = page.locator(".portal-vue-bizline-invalid");
      await tag.waitFor();
      assert.equal((await tag.textContent()).trim(), "失效");
      assert.match(await tag.getAttribute("title"), /用户订单明细.*不在「号卡」/);
      assert.match(await page.locator(".portal-vue-bizline-invalid-alert").textContent(), /1 条关联已失效/);
    } finally {
      if (!skipReason) await bizRestore(admin, snap);
    }
  }));

  test("权限组含「表管理」编辑权限的非管理员：添加关联时字段下拉用网关真实字段", async t => withPage(t, async page => {
    const admin = skipReason ? "" : await harness.tokenFor("曾祥竞");
    const before = skipReason ? null : (await harness.call("GET", "/v1/org", { token: admin })).data;
    let baseGroups = [];
    try {
      const full = (name, tables, extra = {}) => ({ name, desc: "", menus: ["灵犀智析"], menuEdits: [], boards: [], tables, status: "启用", ...extra });
      baseGroups = before.groups.length ? before.groups : [
        full("门户管理员", ["全部数据表"], { menus: ["灵犀智析", "AI 中心", "表管理"], menuEdits: ["表管理"] }), full("投放组长", ["广告计划日报表"]), full("优化师", ["广告计划日报表"]),
        full("数据分析师", ["广告计划日报表", "用户订单明细"], { menus: ["灵犀智析", "数据看板"], boards: ["大盘数据"] }), full("只读访客", [])
      ];
      const groups = baseGroups.map(group => group.name === "数据分析师" ? { ...group, menus: [...new Set([...group.menus, "表管理"])], menuEdits: [...new Set([...group.menuEdits, "表管理"])] } : group);
      const put = await harness.call("PUT", "/v1/org", { token: admin, body: { groups } });
      assert.equal(put.status, 200, JSON.stringify(put.data));
      const gatewayFields = (await harness.call("GET", "/v1/table-fields", { token: admin })).data.tables["用户订单明细"].map(field => field.name).sort();
      await login(page, "李雨航");
      await appVisible(page);
      await page.waitForFunction(() => window.PortalVue.knowledgeData.ready);
      assert.equal(await page.evaluate(() => window.PortalVue.knowledgeData.canEdit), true);
      await openBizViewNoLogin(page);
      await bizItem(page, "号卡").click();
      await page.getByRole("tab", { name: "表关联" }).click();
      await page.getByRole("button", { name: "添加关联" }).click();
      await pickOption(page, "左表", "用户订单明细");
      await page.locator(".el-dialog:visible .el-form-item", { hasText: "左字段" }).locator(".el-select").click();
      assert.deepEqual((await openOptions(page)).sort(), gatewayFields, "非管理员编辑者也应看到网关字段");
    } finally {
      if (!skipReason && baseGroups.length) await harness.call("PUT", "/v1/org", { token: admin, body: { groups: baseGroups } });
    }
  }));

  test("包含的表：把一张未分组的表移入业务线后，数据表视图里该表的业务线列显示新业务线", async t => withPage(t, async page => {
    const admin = skipReason ? "" : await harness.tokenFor("曾祥竞");
    const snap = skipReason ? null : await bizSnapshot(admin);
    try {
      // 先把「渠道归因明细」改成未分组
      const ungroup = await harness.call("PUT", "/v1/knowledge/business-lines", { token: admin, body: { rev: snap.rev, businessLines: snap.businessLines.map(line => ({ id: line.id, name: line.name, knowledge: line.knowledge ? { markdown: line.knowledge.markdown } : "", relations: line.relations })), tableLines: { "渠道归因明细": "" } } });
      assert.equal(ungroup.status, 200, JSON.stringify(ungroup.data));
      await openBizView(page);
      await bizItem(page, "存量").click();
      await page.getByRole("tab", { name: "包含的表" }).click();
      await page.locator(".portal-vue-bizline-move-in").click();
      await page.getByRole("option", { name: "渠道归因明细（未分组）", exact: true }).click();
      await page.locator(".portal-vue-bizline .el-table__row", { hasText: "渠道归因明细" }).waitFor();
      assert.equal((await bizSnapshot(admin)).tableLines["渠道归因明细"], "存量");
      await page.locator(".portal-vue-bizline-view-switch").getByText("数据表", { exact: true }).click();
      await page.locator("#dataAssetView").getByRole("tab", { name: "已停用" }).click(); // 「渠道归因明细」的服务状态是停用
      await page.getByPlaceholder("搜索表名、对外表名、表中文名").fill("渠道归因");
      const row = page.locator("#dataAssetView .portal-vue-table .el-table__row", { hasText: "渠道归因明细" }).first();
      await row.waitFor();
      assert.match(await row.textContent(), /存量/);
    } finally {
      if (!skipReason) await bizRestore(admin, snap);
    }
  }));

  test("表详情：基本配置可修改业务线，保存后刷新与列表列都显示新业务线", async t => withPage(t, async page => {
    const admin = skipReason ? "" : await harness.tokenFor("曾祥竞");
    const snap = skipReason ? null : await bizSnapshot(admin);
    try {
      await login(page, "曾祥竞");
      await appVisible(page);
      await page.waitForFunction(() => window.PortalVue.knowledgeData.ready);
      await page.evaluate(() => {
        const asset = window.portalVueModuleApi.state.assets.find(item => item.cnName === "广告计划日报表");
        window.portalVueBridge.setTableDetailAsset(asset);
        window.portalVueBridge.setPage("表详情");
      });
      const header = page.locator(".portal-vue-dim-meta > div").filter({ hasText: "业务线" }).locator("strong");
      await header.waitFor();
      assert.equal((await header.textContent()).trim(), "权益");
      await page.locator(".portal-vue-toolbar .portal-vue-actions").getByRole("button", { name: "编辑" }).click();
      await page.locator(".el-form-item", { hasText: "业务线" }).locator(".el-select").click();
      await page.locator(".el-select-dropdown__item:visible", { hasText: /^存量$/ }).click();
      await page.getByRole("button", { name: "保存配置" }).click();
      const confirm = page.locator(".el-message-box", { hasText: "修改业务线" });
      if (await confirm.waitFor({ timeout: 800 }).then(() => true).catch(() => false)) {
        await confirm.getByRole("button", { name: "确认" }).click();
      }
      await page.locator(".el-message", { hasText: "基本配置已保存" }).waitFor();
      assert.equal((await header.textContent()).trim(), "存量");
      assert.equal((await bizSnapshot(admin)).tableLines["广告计划日报表"], "存量", "服务端归属应已保存");
      await page.reload();
      await appVisible(page);
      await page.waitForFunction(() => window.PortalVue.knowledgeData.ready);
      await page.evaluate(() => {
        const asset = window.portalVueModuleApi.state.assets.find(item => item.cnName === "广告计划日报表");
        window.portalVueBridge.setTableDetailAsset(asset);
        window.portalVueBridge.setPage("表详情");
      });
      await header.waitFor();
      assert.equal((await header.textContent()).trim(), "存量", "刷新后页头应仍是新业务线");
      await page.evaluate(() => window.portalVueBridge.setPage("表管理"));
      await page.getByPlaceholder("搜索表名、对外表名、表中文名").fill("广告计划日报表");
      const row = page.locator("#dataAssetView .portal-vue-table .el-table__row", { hasText: "广告计划日报表" }).first();
      await row.waitFor();
      assert.match(await row.textContent(), /存量/);
    } finally {
      if (!skipReason) await bizRestore(admin, snap);
    }
  }));

  test("删除有表的业务线时被拦并提示表名；「公共」没有删除与改名入口", async t => withPage(t, async page => {
    const admin = skipReason ? "" : await harness.tokenFor("曾祥竞");
    const snap = skipReason ? null : await bizSnapshot(admin);
    try {
      await openBizView(page);
      assert.equal(await bizItem(page, "公共").getByRole("button", { name: "删除" }).count(), 0);
      assert.equal(await bizItem(page, "公共").getByRole("button", { name: "改名" }).count(), 0);
      assert.equal(await bizItem(page, "公共").locator(".portal-vue-bizline-handle[draggable=true]").count(), 0, "「公共」不能被拖动");
      assert.ok((await bizItem(page, "存量").getByRole("button", { name: "删除" }).count()) === 1, "其他业务线每行都有删除入口");
      await clickRowAction(page, "存量", "删除");
      const message = page.locator(".el-message", { hasText: "请先迁出" });
      await message.waitFor();
      assert.match(await message.textContent(), /用户画像标签明细表/);
      assert.equal(await page.locator(".el-message-box").count(), 0, "有表时不应进入删除确认");
      assert.ok((await bizSnapshot(admin)).businessLines.some(line => line.name === "存量"), "业务线不应被删除");
    } finally {
      if (!skipReason) await bizRestore(admin, snap);
    }
  }));

  test("只读账号进入业务线视图：没有任何编辑按钮", async t => withPage(t, async page => {
    const admin = skipReason ? "" : await harness.tokenFor("曾祥竞");
    const before = skipReason ? null : (await harness.call("GET", "/v1/org", { token: admin })).data;
    let baseGroups = [];
    try {
      const full = (name, tables, extra = {}) => ({ name, desc: "", menus: ["灵犀智析"], menuEdits: [], boards: [], tables, status: "启用", ...extra });
      baseGroups = before.groups.length ? before.groups : [
        full("门户管理员", ["全部数据表"], { menus: ["灵犀智析", "AI 中心", "表管理"], menuEdits: ["表管理"] }), full("投放组长", ["广告计划日报表"]), full("优化师", ["广告计划日报表"]),
        full("数据分析师", ["广告计划日报表", "用户订单明细"], { menus: ["灵犀智析", "数据看板"], boards: ["大盘数据"] }), full("只读访客", [])
      ];
      const groups = baseGroups.map(group => group.name === "数据分析师" ? { ...group, menus: [...new Set([...group.menus, "表管理"])], menuEdits: group.menuEdits.filter(name => name !== "表管理") } : group);
      const put = await harness.call("PUT", "/v1/org", { token: admin, body: { groups } });
      assert.equal(put.status, 200, JSON.stringify(put.data));
      await login(page, "李雨航");
      await appVisible(page);
      await page.waitForFunction(() => window.PortalVue.knowledgeData.ready);
      await openBizViewNoLogin(page);
      await bizItem(page, "权益").click();
      const editButtons = ["新增业务线", "改名", "删除", "新建知识库", "编辑知识库", "添加关联", "移出", "编辑"];
      const assertNone = async () => { for (const name of editButtons) assert.equal(await page.getByRole("button", { name, exact: true }).count(), 0, `只读账号不应看到「${name}」`); };
      await assertNone();
      assert.equal(await page.locator(".portal-vue-bizline-handle").count(), 0, "只读账号不应有拖动手柄");
      await page.getByRole("tab", { name: "表关联" }).click();
      await assertNone();
      await page.getByRole("tab", { name: "包含的表" }).click();
      await assertNone();
      assert.equal(await page.locator(".portal-vue-bizline-move-in").count(), 0, "只读账号不应有「移入」下拉");
    } finally {
      if (!skipReason && baseGroups.length) await harness.call("PUT", "/v1/org", { token: admin, body: { groups: baseGroups } });
    }
  }));

  test("业务线：保存遇到网络失败后界面恢复原状，之后别的保存不会把失败的修改一起提交", async t => withPage(t, async page => {
    const admin = skipReason ? "" : await harness.tokenFor("曾祥竞");
    const snap = skipReason ? null : await bizSnapshot(admin);
    const lineBody = line => ({ id: line.id, name: line.name, knowledge: line.knowledge ? { markdown: line.knowledge.markdown } : "", relations: line.relations });
    try {
      // 准备一条没有表的业务线，用来测删除
      const seed = await harness.call("PUT", "/v1/knowledge/business-lines", { token: admin, body: { rev: snap.rev, businessLines: [...snap.businessLines.map(lineBody), { name: "E2E-空线", knowledge: "", relations: [] }], tableLines: {} } });
      assert.equal(seed.status, 200, JSON.stringify(seed.data));
      await openBizView(page);
      const pattern = "**/v1/knowledge/business-lines";
      await page.route(pattern, route => route.request().method() === "PUT" ? route.abort() : route.continue());
      const failed = () => page.locator(".el-message", { hasText: "无法连接分析网关" }).first();
      const names = () => page.locator(".portal-vue-bizline-name").allTextContents();

      // 1) 删除空业务线：失败后仍在列表里
      await clickRowAction(page, "E2E-空线", "删除");
      await page.locator(".el-message-box").getByRole("button", { name: "删除" }).click();
      await failed().waitFor();
      assert.ok((await names()).includes("E2E-空线"), "删除失败后业务线应仍在列表里");

      // 2) 把表移出：失败后仍在「包含的表」里
      await bizItem(page, "存量").click();
      await page.getByRole("tab", { name: "包含的表" }).click();
      await page.locator(".portal-vue-bizline .el-table__row", { hasText: "用户画像标签明细表" }).getByRole("button", { name: "移出" }).click();
      await page.waitForFunction(() => window.PortalVue.knowledgeData.tableLines["用户画像标签明细表"] === "存量" && document.querySelector(".portal-vue-bizline-tabs"));
      assert.equal(await page.locator(".portal-vue-bizline .el-table__row", { hasText: "用户画像标签明细表" }).count(), 1, "移出失败后表应仍在该业务线下");
      assert.equal(await page.evaluate(() => window.PortalVue.knowledgeData.tableLines["用户画像标签明细表"]), "存量");

      // 3) 改名：失败后名称不变，对话框仍开着、输入还在
      await clickRowAction(page, "存量", "改名");
      await page.getByPlaceholder("例如：AI 短剧").fill("存量X");
      await page.locator(".el-dialog:visible").getByRole("button", { name: "确定" }).click();
      await page.waitForFunction(() => !window.PortalVue.knowledgeData.businessLines.some(line => line.name === "存量X"));
      assert.ok((await names()).includes("存量") && !(await names()).includes("存量X"));
      assert.equal(await page.getByPlaceholder("例如：AI 短剧").inputValue(), "存量X", "保存失败时输入应保留");
      await page.locator(".el-dialog:visible").getByRole("button", { name: "取消" }).click();

      // 恢复网络后做一次无关的保存：新增一条业务线
      await page.unroute(pattern);
      await page.getByRole("button", { name: "新增业务线" }).click();
      await page.getByPlaceholder("例如：AI 短剧").fill("E2E-无关");
      await page.locator(".el-dialog:visible").getByRole("button", { name: "确定" }).click();
      await bizItem(page, "E2E-无关").waitFor();
      const server = await bizSnapshot(admin);
      assert.ok(server.businessLines.some(line => line.name === "E2E-无关"), "无关保存应成功");
      assert.ok(server.businessLines.some(line => line.name === "E2E-空线"), "失败的删除不应被提交");
      assert.ok(server.businessLines.some(line => line.name === "存量") && !server.businessLines.some(line => line.name === "存量X"), "失败的改名不应被提交");
      assert.equal(server.tableLines["用户画像标签明细表"], "存量", "失败的移出不应被提交");
    } finally {
      if (!skipReason) await bizRestore(admin, snap);
    }
  }));

  const bizOrder = async admin => (await bizSnapshot(admin)).businessLines.map(line => line.name);

  test("业务线：拖动手柄调整顺序，刷新后保留；「公共」固定第一", async t => withPage(t, async page => {
    const admin = skipReason ? "" : await harness.tokenFor("曾祥竞");
    const snap = skipReason ? null : await bizSnapshot(admin);
    try {
      await openBizView(page);
      const before = await bizOrder(admin);
      assert.deepEqual(before.slice(0, 5), ["公共", "权益", "存量", "号卡", "保险"]);
      // 把「号卡」拖到「权益」上半部分 → 放在「权益」前面
      await bizItem(page, "号卡").locator(".portal-vue-bizline-handle").dragTo(bizItem(page, "权益"), { targetPosition: { x: 40, y: 3 } });
      await page.waitForFunction(() => window.PortalVue.knowledgeData.businessLines.map(line => line.name).indexOf("号卡") === 1);
      assert.deepEqual((await bizOrder(admin)).slice(0, 5), ["公共", "号卡", "权益", "存量", "保险"], "服务端顺序应已保存");
      // 拖到「公共」上面：不能排到它前面，只会放在它后面
      await bizItem(page, "保险").locator(".portal-vue-bizline-handle").dragTo(bizItem(page, "公共"), { targetPosition: { x: 40, y: 2 } });
      await page.waitForFunction(() => window.PortalVue.knowledgeData.businessLines.map(line => line.name).indexOf("保险") === 1);
      assert.equal((await bizOrder(admin))[0], "公共", "「公共」应始终在第一位");
      // 刷新后保留
      await page.reload();
      await appVisible(page);
      await page.waitForFunction(() => window.PortalVue.knowledgeData.ready);
      assert.deepEqual((await page.evaluate(() => window.PortalVue.knowledgeData.businessLines.map(line => line.name))).slice(0, 5), ["公共", "保险", "号卡", "权益", "存量"]);
    } finally {
      if (!skipReason) await bizRestore(admin, snap);
    }
  }));

  test("业务线：保存期间重复拖放只发一次保存请求，不出现版本冲突提示", async t => withPage(t, async page => {
    const admin = skipReason ? "" : await harness.tokenFor("曾祥竞");
    const snap = skipReason ? null : await bizSnapshot(admin);
    try {
      await openBizView(page);
      let puts = 0;
      await page.route("**/v1/knowledge/business-lines", async route => {
        if (route.request().method() === "PUT") { puts += 1; await new Promise(resolve => setTimeout(resolve, 400)); }
        await route.continue();
      });
      // 一次性连续派发两轮"拖动开始 → 放下"：第二轮发生在第一次保存还没结束时
      await page.evaluate(() => {
        const item = name => [...document.querySelectorAll(".portal-vue-bizline-item")].find(el => el.textContent.includes(name));
        const round = () => {
          const dt = new DataTransfer();
          item("号卡").querySelector(".portal-vue-bizline-handle").dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
          const target = item("权益");
          const top = target.getBoundingClientRect().top;
          target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt, clientY: top + 2 }));
          target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt, clientY: top + 2 }));
        };
        round(); round();
      });
      await page.waitForFunction(() => window.PortalVue.knowledgeData.businessLines.map(line => line.name).indexOf("号卡") === 1);
      await page.waitForTimeout(700);
      assert.equal(puts, 1, "重复拖放只应发一次 PUT");
      assert.equal(await page.locator(".el-message", { hasText: "已被其他人更新" }).count(), 0);
      assert.equal((await bizOrder(admin)).indexOf("号卡"), 1);
    } finally {
      if (!skipReason) await bizRestore(admin, snap);
    }
  }));

  test("业务线：改名和删除平时隐藏，鼠标移入才显示；键盘聚焦手柄后按 ↓ 可调整顺序", async t => withPage(t, async page => {
    const admin = skipReason ? "" : await harness.tokenFor("曾祥竞");
    const snap = skipReason ? null : await bizSnapshot(admin);
    try {
      await openBizView(page);
      const actions = bizItem(page, "存量").locator(".portal-vue-bizline-row-actions");
      const opacity = () => actions.evaluate(el => Number(getComputedStyle(el).opacity));
      await page.mouse.move(5, 5);
      assert.equal(await opacity(), 0, "未移入时不显示改名/删除");
      await bizItem(page, "存量").hover();
      await page.waitForFunction(el => Number(getComputedStyle(el).opacity) === 1, await actions.elementHandle());
      assert.equal(await opacity(), 1, "鼠标移入后显示改名/删除");
      // 键盘排序：「权益」下移一格
      await bizItem(page, "权益").locator(".portal-vue-bizline-handle").focus();
      await page.keyboard.press("ArrowDown");
      await page.waitForFunction(() => window.PortalVue.knowledgeData.businessLines.map(line => line.name).indexOf("权益") === 2);
      assert.deepEqual((await bizOrder(admin)).slice(0, 3), ["公共", "存量", "权益"]);
    } finally {
      if (!skipReason) await bizRestore(admin, snap);
    }
  }));

  /* ===== 工作台：选择业务线 ===== */
  const openWorkbench = async (page, name) => {
    await login(page, name);
    await appVisible(page);
    await page.waitForFunction(() => window.PortalVue.knowledgeData.ready);
    await page.getByPlaceholder(/输入分析问题/).waitFor();
  };
  const lineSelect = page => page.locator(".portal-vue-ai-chip-line-select");
  const lineItems = page => page.locator(".portal-vue-ai-select-popper:visible .el-select-dropdown__item");
  const openLineOptions = async page => {
    await lineSelect(page).click();
    await lineItems(page).first().waitFor();
    return (await lineItems(page).allTextContents()).map(item => item.trim());
  };
  const pickLine = async (page, name) => {
    await lineSelect(page).click();
    await page.locator(".portal-vue-ai-select-popper:visible .el-select-dropdown__item", { hasText: name }).first().click();
  };
  /** 拦截 /v1/analyze 记录请求体，其余照常放行 */
  const captureAnalyze = async page => {
    const bodies = [];
    await page.route(url => url.pathname === "/v1/analyze", async route => {
      bodies.push(JSON.parse(route.request().postData() || "{}"));
      await route.continue();
    });
    return bodies;
  };
  const askAndWait = async (page, question) => {
    const before = await page.locator(".portal-vue-ai-feedback").count();
    await page.getByPlaceholder(/输入分析问题/).fill(question);
    await page.getByRole("button", { name: "发送" }).click();
    await page.waitForFunction(n => document.querySelectorAll(".portal-vue-ai-feedback").length > n, before);
  };

  test("工作台输入框下方是「选择业务线」，不再出现「选择数据表」级联", async t => withPage(t, async page => {
    await openWorkbench(page, "曾祥竞");
    assert.equal(await lineSelect(page).count(), 1, "应有业务线选择框");
    assert.match(await lineSelect(page).textContent(), /选择业务线/);
    assert.equal(await page.locator(".portal-vue-ai-composer-bar").getByText("选择数据表").count(), 0, "不应再有选择数据表级联");
    assert.equal(await page.locator(".portal-vue-ai-composer-bar .el-cascader").count(), 0);
    const options = await openLineOptions(page);
    assert.deepEqual(options, ["权益", "存量", "号卡", "保险"], "选项不含「公共」");
  }));

  test("没有权限的业务线不在选项里；选业务线发问时请求体 businessLine 为所选名称、assetCandidates 为空", async t => withPage(t, async page => {
    await openWorkbench(page, "林金维");
    const bodies = await captureAnalyze(page);
    const options = await openLineOptions(page);
    assert.ok(options.includes("权益"), "有权限的业务线应在选项里");
    assert.ok(!options.includes("保险") && !options.includes("存量") && !options.includes("公共"), `无权限的业务线与「公共」不应出现：${options}`);
    await page.keyboard.press("Escape");
    await pickLine(page, "权益");
    await askAndWait(page, "业务线请求体测试 4411");
    assert.equal(bodies.length, 1);
    assert.equal(bodies[0].businessLine, "权益");
    assert.deepEqual(bodies[0].assetCandidates, []);
  }));

  test("@表 仍可引用；同时选业务线时请求体 tables 含该表", async t => withPage(t, async page => {
    await openWorkbench(page, "曾祥竞");
    const bodies = await captureAnalyze(page);
    await pickLine(page, "权益");
    await askAndWait(page, "看一下 @广告计划日报表 的消耗");
    assert.equal(bodies[0].businessLine, "权益");
    assert.ok(bodies[0].tables.includes("广告计划日报表"), "@表 应进入 tables");
  }));

  test("换业务线后上一轮对话不再作为 conversation 上文；同一业务线追问仍带上文", async t => withPage(t, async page => {
    await openWorkbench(page, "曾祥竞");
    const bodies = await captureAnalyze(page);
    await pickLine(page, "权益");
    await askAndWait(page, "切换业务线测试 第一问 5501");
    assert.equal(bodies[0].conversation.length, 0);
    await askAndWait(page, "切换业务线测试 追问 5502");
    assert.equal(bodies[1].conversation.length, 1, "同一业务线追问应带上一轮");
    await pickLine(page, "存量");
    await askAndWait(page, "切换业务线测试 换线 5503");
    assert.equal(bodies[2].businessLine, "存量");
    assert.deepEqual(bodies[2].conversation, [], "换了业务线，之前的对话不应再作为上文");
    await askAndWait(page, "切换业务线测试 换线后追问 5504");
    assert.equal(bodies[3].conversation.length, 1, "换线后的新一轮仍可追问");
    assert.match(bodies[3].conversation[0].question, /5503/);
  }));

  test("澄清卡的业务线选项等于用户可选的业务线（没有权限的保险、技能自带的短剧/其他都不出现）", async t => withPage(t, async page => {
    await openWorkbench(page, "林金维");
    await page.locator(".portal-vue-ai-scenario", { hasText: "数据查询" }).click();
    await page.getByPlaceholder(/输入分析问题/).fill("澄清卡选项测试 7001");
    await page.getByRole("button", { name: "发送" }).click();
    await page.locator(".portal-vue-ai-ask-option").first().waitFor();
    const labels = (await page.locator(".portal-vue-ai-ask-q").first().locator(".portal-vue-ai-ask-option b").allTextContents()).map(item => item.trim());
    assert.deepEqual(labels, ["权益"]);
  }));

  test("选中的业务线从知识库里消失后：选择框清空，下一次请求 businessLine 为空", async t => withPage(t, async page => {
    await openWorkbench(page, "曾祥竞");
    const bodies = await captureAnalyze(page);
    await pickLine(page, "存量");
    assert.match(await lineSelect(page).textContent(), /存量/);
    await page.evaluate(() => {
      const data = window.PortalVue.knowledgeData;
      data.businessLines = data.businessLines.filter(line => line.name !== "存量");
    });
    await page.waitForFunction(() => !/存量/.test(document.querySelector(".portal-vue-ai-chip-line-select").textContent));
    await askAndWait(page, "失效业务线测试 7011");
    assert.equal(bodies[0].businessLine, "");
    assert.deepEqual(bodies[0].assetCandidates, []);
  }));

  test("业务线跟着会话走：回到旧会话时恢复它的业务线，追问仍带完整上文", async t => withPage(t, async page => {
    await openWorkbench(page, "曾祥竞");
    const bodies = await captureAnalyze(page);
    await pickLine(page, "权益");
    await askAndWait(page, "会话甲第一问 7021");
    await page.getByRole("button", { name: /新的分析/ }).click();
    await pickLine(page, "存量");
    await askAndWait(page, "会话乙第一问 7022");
    await page.locator(".portal-vue-ai-session", { hasText: "会话甲第一问" }).first().click();
    await page.waitForFunction(() => /权益/.test(document.querySelector(".portal-vue-ai-chip-line-select").textContent));
    await askAndWait(page, "会话甲追问 7023");
    const last = bodies[bodies.length - 1];
    assert.equal(last.businessLine, "权益");
    assert.equal(last.conversation.length, 1, "回到旧会话后上文不应丢");
    assert.match(last.conversation[0].question, /7021/);
  }));

  test("刷新页面后业务线跟着当前会话恢复：选择框显示原业务线，追问带完整上文和同一 businessLine", async t => withPage(t, async page => {
    await openWorkbench(page, "曾祥竞");
    const bodies = await captureAnalyze(page);
    await pickLine(page, "权益");
    await askAndWait(page, "刷新恢复第一问 7031");
    // 等历史写到服务端（回答完成时立即保存）
    await page.waitForFunction(async () => {
      const response = await fetch("/v1/history");
      const data = await response.json();
      return (data.sessions || []).some(session => (session.messages || []).some(message => /7031/.test(message.text || message.question || JSON.stringify(message))));
    }, null, { polling: 300 });
    await page.reload();
    await appVisible(page);
    await page.waitForFunction(() => window.PortalVue.knowledgeData.ready);
    await page.getByPlaceholder(/输入分析问题/).waitFor();
    await page.waitForFunction(() => /权益/.test(document.querySelector(".portal-vue-ai-chip-line-select").textContent));
    await askAndWait(page, "刷新恢复追问 7032");
    const last = bodies[bodies.length - 1];
    assert.equal(last.businessLine, "权益", "刷新后追问应沿用会话的业务线");
    assert.equal(last.conversation.length, 1, "刷新后追问应带上之前的对话");
    assert.match(last.conversation[0].question, /7031/);
  }));

  /* ===== Skill 详情 ===== */
  const SKILL_ID = "warehouse-analyst";
  const SKILL_NAME = "数据查询与指标解答 Skill";
  const openSkillList = async page => {
    await page.evaluate(() => window.portalVueBridge.setPage("Skill 配置"));
    await page.waitForSelector("#skillManagementView:not(.hidden)");
    await page.locator("#skillManagementView .el-table__body tr").first().waitFor();
  };
  const openSkillDetail = async page => {
    await openSkillList(page);
    await page.locator("#skillManagementView tr", { hasText: SKILL_NAME }).getByRole("button", { name: "详情" }).click();
    await page.waitForFunction(() => window.portalVueBridge.getPage() === "Skill 详情");
    await page.waitForSelector("#skillDetailView:not(.hidden)");
  };
  const backToSkillList = async page => {
    const title = page.locator("#skillDetailView .el-page-header").getByText("返回 Skill 管理");
    if (await title.count()) await title.click();
    else await page.locator("#skillDetailView .el-page-header__back").click();
    await page.waitForFunction(() => window.portalVueBridge.getPage() === "Skill 配置");
  };
  const skillFromGateway = async (admin, id = SKILL_ID) => {
    const list = (await harness.call("GET", "/v1/skills", { token: admin })).data;
    return (Array.isArray(list) ? list : []).find(item => item.id === id);
  };

  test("Skill 详情：从列表进入后侧栏仍高亮 Skill 配置，返回列表，刷新地址仍是同一 Skill", async t => withPage(t, async page => {
    await login(page, "曾祥竞");
    await appVisible(page);
    await openSkillDetail(page);
    assert.equal(await page.evaluate(() => window.portalVueBridge.getPage()), "Skill 详情");
    assert.equal(await page.evaluate(() => decodeURIComponent(location.hash)), `#/ai/skills/${SKILL_ID}`);
    const active = (await page.locator("#sidebar .el-menu-item.is-active").allTextContents()).join(" ");
    assert.match(active, /Skill 配置/, `侧栏高亮应为 Skill 配置，实际：${active}`);
    await backToSkillList(page);
    assert.equal(await page.evaluate(() => decodeURIComponent(location.hash)), "#/ai/skills");
    assert.equal(await page.locator("#skillManagementView.hidden").count(), 0);

    await page.evaluate(hash => { location.hash = hash; }, `#/ai/skills/${SKILL_ID}`);
    await page.waitForFunction(() => window.portalVueBridge.getPage() === "Skill 详情");
    await page.reload();
    await appVisible(page);
    assert.equal(await page.evaluate(() => window.portalVueBridge.getPage()), "Skill 详情");
    assert.equal(await page.evaluate(() => window.portalVueBridge.getSkillDetailId()), SKILL_ID);
    assert.equal(await page.evaluate(() => decodeURIComponent(location.hash)), `#/ai/skills/${SKILL_ID}`);
    assert.match(await page.locator("#skillDetailView:not(.hidden) .el-page-header").textContent(), /数据查询与指标解答/);
  }));

  test("Skill 详情：在基本信息改展示文案并保存后，版本管理出现未发布版本", async t => withPage(t, async page => {
    const admin = skipReason ? "" : await harness.tokenFor("曾祥竞");
    const before = skipReason ? null : await skillFromGateway(admin);
    const marker = `E2E-Skill展示-${Date.now()}`;
    try {
      await login(page, "曾祥竞");
      await appVisible(page);
      await openSkillDetail(page);
      await page.getByRole("tab", { name: "基本信息" }).click();
      await page.locator("#skillDetailView .el-form-item", { hasText: "工作台展示描述" }).locator("input").fill(marker);
      await page.getByRole("button", { name: "保存", exact: true }).click();
      await page.waitForFunction(() => [...document.querySelectorAll(".el-message")].some(el => /已保存为/.test(el.textContent) && /未发布/.test(el.textContent)));
      await page.getByRole("tab", { name: "版本管理" }).click();
      const current = page.locator("#skillDetailView .portal-vue-skill-version.current").first();
      await current.waitFor();
      assert.match(await current.textContent(), /未发布/);
      const saved = await skillFromGateway(admin);
      assert.equal(saved.displayDesc, marker, "展示文案应写到服务端");
    } finally {
      if (!skipReason && before) {
        await harness.call("PUT", `/v1/skills/${SKILL_ID}/config`, { token: admin, body: { displayDesc: before.displayDesc } });
      }
    }
  }));

  test("Skill 详情：引用的表可保存并回显，不存在的表名选不中", async t => withPage(t, async page => {
    const admin = skipReason ? "" : await harness.tokenFor("曾祥竞");
    const before = skipReason ? null : await skillFromGateway(admin);
    const originalTables = before ? [...(before.tables || [])] : [];
    try {
      await login(page, "曾祥竞");
      await appVisible(page);
      await openSkillDetail(page);
      await page.getByRole("tab", { name: "引用的表" }).click();
      const add = await page.evaluate(() => {
        const skill = window.portalVueModuleApi.state.skills.find(item => item.id === "warehouse-analyst");
        const known = (window.portalVueModuleApi.state.assets || []).map(item => item.cnName).filter(Boolean);
        const current = skill.tables || [];
        return known.find(name => !current.includes(name)) || "";
      });
      assert.ok(add, "应有一张尚未引用的已知表可供加入");
      const select = page.locator("#skillDetailView .el-form-item", { hasText: "引用的表" }).locator(".el-select").first();
      await select.click();
      await page.locator(".el-select-dropdown:visible").first().waitFor();
      await page.keyboard.type("不存在的表XYZ123");
      const fake = await page.locator(".el-select-dropdown__item:visible").allTextContents();
      assert.equal(fake.some(text => text.includes("不存在的表XYZ123")), false, "不存在的表名不应出现在选项里");
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await page.evaluate(() => {
        document.querySelectorAll("#skillDetailView .el-select input").forEach(input => {
          input.value = "";
          input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      });
      await select.click();
      await page.getByRole("option", { name: add, exact: true }).waitFor();
      await page.getByRole("option", { name: add, exact: true }).click();
      await page.keyboard.press("Escape");
      await page.locator(".el-select-dropdown:visible").waitFor({ state: "hidden" });
      await page.getByRole("button", { name: "保存引用的表" }).click();
      await page.waitForFunction(() => [...document.querySelectorAll(".el-message")].some(el => el.textContent.includes("引用的表已更新")));
      await backToSkillList(page);
      await openSkillDetail(page);
      await page.getByRole("tab", { name: "引用的表" }).click();
      const tags = (await page.locator("#skillDetailView .el-select__tags, #skillDetailView .el-tag, #skillDetailView .el-select").allTextContents()).join(" ");
      assert.match(tags, new RegExp(add.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `再进入详情应仍看到 ${add}，实际：${tags}`);
      const saved = await skillFromGateway(admin);
      assert.ok((saved.tables || []).includes(add), "引用的表应写到服务端");
    } finally {
      if (!skipReason && before) {
        await harness.call("PUT", `/v1/skills/${SKILL_ID}/config`, { token: admin, body: { tables: originalTables } });
      }
    }
  }));

  test("没有「Skill 配置」编辑权限的账号看不到保存、灰度和发版", async t => withPage(t, async page => {
    const admin = skipReason ? "" : await harness.tokenFor("曾祥竞");
    const before = skipReason ? null : (await harness.call("GET", "/v1/org", { token: admin })).data;
    let baseGroups = [];
    try {
      const full = (name, tables, extra = {}) => ({ name, desc: "", menus: ["灵犀智析"], menuEdits: [], boards: [], tables, status: "启用", ...extra });
      baseGroups = before.groups.length ? before.groups : [
        full("门户管理员", ["全部数据表"], { menus: ["灵犀智析", "AI 中心", "表管理"], menuEdits: ["表管理"] }),
        full("投放组长", ["广告计划日报表"]), full("优化师", ["广告计划日报表"]),
        full("数据分析师", ["广告计划日报表", "用户订单明细"], { menus: ["灵犀智析", "数据看板"], boards: ["大盘数据"] }),
        full("只读访客", [])
      ];
      const groups = baseGroups.map(group => group.name === "数据分析师"
        ? { ...group, menus: [...new Set([...group.menus, "AI 中心", "Skill 配置"])], menuEdits: (group.menuEdits || []).filter(name => name !== "Skill 配置" && name !== "AI 中心") }
        : group);
      const put = await harness.call("PUT", "/v1/org", { token: admin, body: { groups } });
      assert.equal(put.status, 200, JSON.stringify(put.data));
      await login(page, "李雨航");
      await appVisible(page);
      await openSkillDetail(page);
      assert.equal(await page.getByRole("button", { name: "保存", exact: true }).count(), 0, "只读账号不应看到保存");
      assert.equal(await page.getByRole("button", { name: "保存引用的表" }).count(), 0);
      await page.getByRole("tab", { name: "版本管理" }).click();
      assert.equal(await page.getByRole("button", { name: "灰度" }).count(), 0);
      assert.equal(await page.getByRole("button", { name: "调整灰度" }).count(), 0);
      assert.equal(await page.getByRole("button", { name: "发版" }).count(), 0);
    } finally {
      if (!skipReason && baseGroups.length) await harness.call("PUT", "/v1/org", { token: admin, body: { groups: baseGroups } });
    }
  }));
});
