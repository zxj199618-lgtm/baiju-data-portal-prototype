/**
 * 路由端到端：真实 Chrome + 真实网关。覆盖新地址直达、旧地址重定向、前进后退、
 * 详情页刷新后仍是同一对象、对象不存在 / 无权限的提示、未登录先登录再跳回。
 * 需要本机装有 Chrome；没有时整组跳过。运行：node --test tests/e2e-routes.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { startHarness } = require("./helpers/gateway-harness.cjs");

let chromium = null;
try { ({ chromium } = require("playwright-core")); } catch { /* 未安装 playwright-core */ }

describe("路由端到端", () => {
  let harness, browser, skipReason = "";

  before(async () => {
    if (!chromium) { skipReason = "未安装 playwright-core"; return; }
    try { browser = await chromium.launch({ channel: "chrome", headless: true }); }
    catch (error) { skipReason = `无法启动 Chrome：${error.message.split("\n")[0]}`; return; }
    harness = await startHarness({});
  });
  after(async () => { if (browser) await browser.close(); if (harness) await harness.stop(); });

  async function withPage(t, run) {
    if (skipReason) return t.skip(skipReason);
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    try { await run(page); } finally { await context.close(); }
  }
  async function login(page, name) {
    await page.fill('#gatewayLoginForm input[name="name"]', name);
    await page.fill('#gatewayLoginForm input[name="password"]', harness.PASSWORD);
    await page.click("#gatewayLoginBtn");
  }
  const appVisible = async page => {
    await page.waitForSelector("#portalApp:not(.hidden)");
    await page.waitForFunction(() => window.portalVueModuleApi && window.portalVueModuleApi.orgSync.ready);
    await page.waitForLoadState("networkidle");
  };
  /** 登录后直接用地址进入（hash 变化不会自动重载，所以显式 reload，模拟「把链接发给别人打开」） */
  async function openAs(page, name, hash) {
    await page.goto(harness.baseUrl + "/");
    await login(page, name);
    await appVisible(page);
    await reloadAt(page, hash);
  }
  /** 不触发 hashchange，直接把地址换掉再重载，模拟「用链接新开页面」 */
  const reloadAt = async (page, hash) => { await page.evaluate(h => history.replaceState(null, "", h), hash); await page.reload(); await appVisible(page); };
  const hashOf = page => page.evaluate(() => decodeURIComponent(location.hash));
  const pageOf = page => page.evaluate(() => window.portalVueBridge.getPage());
  const toastText = page => page.evaluate(() => [...document.querySelectorAll(".el-message")].map(el => el.textContent).join("|"));
  const waitHash = (page, value) => page.waitForFunction(v => decodeURIComponent(location.hash) === v, value);

  test("新地址直达：#/permission/users 与 #/permission/groups", async t => withPage(t, async page => {
    await openAs(page, "曾祥竞", "#/permission/users");
    assert.equal(await pageOf(page), "用户管理");
    assert.equal(await hashOf(page), "#/permission/users");
    await reloadAt(page, "#/permission/groups/" + encodeURIComponent("优化师"));
    assert.equal(await pageOf(page), "权限组");
    assert.equal(await hashOf(page), "#/permission/groups/优化师");
    assert.match(await page.locator(".portal-vue-split-head").nth(1).textContent(), /优化师/);
  }));

  test("详情页地址带对象：配置权限 / 查看权限 / 表详情 / 看板 刷新后仍是同一对象", async t => withPage(t, async page => {
    await openAs(page, "曾祥竞", "#/permission/users/ou_5bca72/config");
    assert.equal(await pageOf(page), "配置权限");
    assert.equal(await page.evaluate(() => window.portalVueBridge.users[window.portalVueBridge.getActiveUserIndex()].name), "刘盾");
    await page.reload();
    await appVisible(page);
    assert.equal(await page.evaluate(() => window.portalVueBridge.users[window.portalVueBridge.getActiveUserIndex()].name), "刘盾");
    assert.match(await page.locator("#permissionConfigView").textContent(), /刘盾/);
    assert.equal(await hashOf(page), "#/permission/users/ou_5bca72/config");

    await reloadAt(page, "#/permission/users/ou_2a90de/view");
    assert.equal(await pageOf(page), "查看权限");
    assert.match(await page.locator("#permissionReadView").textContent(), /林金维/);

    const { database, table } = await page.evaluate(() => { const a = window.portalVueBridge.assets[1]; return { database: a.database, table: a.table }; });
    await reloadAt(page, `#/asset/tables/${database}.${table}`);
    assert.equal(await pageOf(page), "表详情");
    assert.equal(await page.evaluate(() => window.portalVueBridge.getTableDetailAsset().table), table);
    assert.equal(await hashOf(page), `#/asset/tables/${database}.${table}`);

    await reloadAt(page, "#/dashboard/boards/QB_002");
    assert.equal(await pageOf(page), "Quick BI 展示");
    assert.equal(await page.evaluate(() => window.portalVueBridge.getActiveBoard().quickBiId), "QB_002");
  }));

  test("在页面里点进详情：地址随对象变化，且每个对象的地址不同", async t => withPage(t, async page => {
    await openAs(page, "曾祥竞", "#/permission/users");
    const openConfigOf = name => page.locator("tr", { hasText: name }).getByRole("button", { name: "配置权限" }).first().click();
    await openConfigOf("黄佩贤");
    await page.waitForFunction(() => window.portalVueBridge.getPage() === "配置权限");
    const first = await hashOf(page);
    assert.match(first, /^#\/permission\/users\/ou_[^/]+\/config$/);
    await page.goBack();
    await waitHash(page, "#/permission/users");
    await openConfigOf("林金维");
    await page.waitForFunction(() => window.portalVueBridge.getPage() === "配置权限");
    assert.notEqual(await hashOf(page), first, "不同用户的配置权限页地址应不同");
  }));

  test("旧地址 #page= 重定向到新地址（带对象的还原对象，没有对象的退回列表并提示）", async t => withPage(t, async page => {
    await openAs(page, "曾祥竞", "#page=" + encodeURIComponent("用户管理"));
    assert.equal(await hashOf(page), "#/permission/users");

    const { database, table } = await page.evaluate(() => { const a = window.portalVueBridge.assets[0]; return { database: a.database, table: a.table }; });
    await reloadAt(page, `#page=${encodeURIComponent("表详情")}&db=${database}&table=${table}`);
    assert.equal(await hashOf(page), `#/asset/tables/${database}.${table}`);
    assert.equal(await pageOf(page), "表详情");

    await reloadAt(page, "#page=" + encodeURIComponent("配置权限"));
    assert.equal(await hashOf(page), "#/permission/users");
    await page.waitForFunction(() => /没有指定具体对象/.test([...document.querySelectorAll(".el-message")].map(el => el.textContent).join("|")));

    await reloadAt(page, "#page=" + encodeURIComponent("看板管理"));
    assert.equal(await hashOf(page), "#/asset/boards");
  }));

  test("前进 / 后退：地址与页面同步，标签栏跟着切换", async t => withPage(t, async page => {
    await openAs(page, "曾祥竞", "#/analysis");
    await page.evaluate(() => window.portalVueBridge.setPage("用户管理"));
    await page.evaluate(() => window.portalVueBridge.setPage("权限组"));
    await page.evaluate(() => window.portalVueBridge.setPage("表管理"));
    await waitHash(page, "#/asset/tables");
    await page.goBack();
    await page.waitForFunction(() => window.portalVueBridge.getPage() === "权限组");
    assert.match(await hashOf(page), /^#\/permission\/groups/);
    await page.goBack();
    await page.waitForFunction(() => window.portalVueBridge.getPage() === "用户管理");
    assert.equal(await hashOf(page), "#/permission/users");
    assert.match(await page.locator(".portal-vue-tab.active").first().textContent(), /用户管理/);
    await page.goForward();
    await page.waitForFunction(() => window.portalVueBridge.getPage() === "权限组");
    assert.match(await page.locator(".portal-vue-tab.active").first().textContent(), /权限组/);
  }));

  test("点标签栏：地址与标签一致", async t => withPage(t, async page => {
    await openAs(page, "曾祥竞", "#/permission/users");
    await page.evaluate(() => window.portalVueBridge.setPage("表管理"));
    await waitHash(page, "#/asset/tables");
    await page.locator(".portal-vue-tab", { hasText: "用户管理" }).first().click();
    await waitHash(page, "#/permission/users");
    assert.equal(await pageOf(page), "用户管理");
  }));

  test("对象不存在：回到列表页并给出明确提示，不白屏", async t => withPage(t, async page => {
    await openAs(page, "曾祥竞", "#/permission/users/ou_not_exist/config");
    assert.equal(await pageOf(page), "用户管理");
    assert.equal(await hashOf(page), "#/permission/users");
    await page.waitForFunction(() => /用户不存在或已移除/.test([...document.querySelectorAll(".el-message")].map(el => el.textContent).join("|")));

    await reloadAt(page, "#/asset/tables/no_db.no_table");
    assert.equal(await hashOf(page), "#/asset/tables");
    await page.waitForFunction(() => /数据表不存在或已删除/.test([...document.querySelectorAll(".el-message")].map(el => el.textContent).join("|")));
    assert.equal(await page.locator("#tableDetailView.hidden").count(), 1, "不应打开空白详情页");

    await reloadAt(page, "#/dashboard/boards/QB_NOPE");
    assert.equal(await hashOf(page), "#/dashboard/QB_001", "不存在的看板：显示默认看板并把地址改成它");

    await reloadAt(page, "#/no/such/page");
    assert.equal(await hashOf(page), "#/analysis");
    await page.waitForFunction(() => /地址无法识别/.test([...document.querySelectorAll(".el-message")].map(el => el.textContent).join("|")));
  }));

  test("没有权限：提示并回到有权限的页面", async t => withPage(t, async page => {
    await openAs(page, "李雨航", "#/permission/users");
    await page.waitForFunction(() => /没有「用户管理」的访问权限/.test([...document.querySelectorAll(".el-message")].map(el => el.textContent).join("|")));
    assert.notEqual(await pageOf(page), "用户管理");
    assert.notEqual(await hashOf(page), "#/permission/users");
  }));

  test("未登录先登录，再回到目标地址", async t => withPage(t, async page => {
    await page.goto(harness.baseUrl + "/#/permission/users/ou_7f31c9/config");
    await page.waitForSelector("#loginView:not(.hidden)");
    assert.equal(await page.locator("#portalApp.hidden").count(), 1);
    await login(page, "曾祥竞");
    await appVisible(page);
    assert.equal(await pageOf(page), "配置权限");
    assert.equal(await hashOf(page), "#/permission/users/ou_7f31c9/config");
    assert.equal(await page.evaluate(() => window.portalVueBridge.users[window.portalVueBridge.getActiveUserIndex()].name), "黄佩贤");
  }));
  test("数据看板页：地址带看板、点选看板写回地址、看不到的看板给提示", async t => withPage(t, async page => {
    await openAs(page, "曾祥竞", "#/dashboard/QB_002");
    assert.equal(await pageOf(page), "数据看板");
    assert.equal(await hashOf(page), "#/dashboard/QB_002");
    assert.match(await page.locator("#dataBoardView .portal-vue-board-hero h2").textContent(), /存量全部渠道收入/);
    await page.locator(".portal-vue-board-item", { hasText: "号卡订单数据" }).first().click();
    await waitHash(page, "#/dashboard/QB_003");
    await reloadAt(page, "#/dashboard/QB_NOPE");
    assert.equal(await hashOf(page), "#/dashboard/QB_001", "不存在的看板：显示默认看板并把地址改成它");
    await page.waitForFunction(() => /看板不存在或已下线/.test([...document.querySelectorAll(".el-message")].map(el => el.textContent).join("|")));
  }));

  test("API 改名后，旧名字的编辑链接仍能打开改名后的 API（别名）", async t => withPage(t, async page => {
    await openAs(page, "曾祥竞", "#/service/open-api");
    const names = await page.evaluate(() => {
      const bridge = window.portalVueBridge;
      const api = bridge.apis[0];
      const old = api.name;
      bridge.recordRouteAlias("api", old, "改名后的接口");
      api.name = "改名后的接口";
      return { old };
    });
    // 原型的 API 数据不落库，改名只在本次会话内有效：用旧链接在页内跳转（hashchange）验证别名
    await page.evaluate(h => { location.hash = h; }, "#/service/open-api/" + encodeURIComponent(names.old) + "/edit");
    assert.equal(await pageOf(page), "新增API");
    assert.equal(await hashOf(page), "#/service/open-api/改名后的接口/edit");
    assert.equal(await page.evaluate(() => window.portalApiEditingIndex), 0);
    await page.waitForFunction(() => /已改名为「改名后的接口」/.test([...document.querySelectorAll(".el-message")].map(el => el.textContent).join("|")));
  }));
});
