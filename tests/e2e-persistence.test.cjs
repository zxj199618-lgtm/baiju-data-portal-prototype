/**
 * 页面数据落到后端：看板、字典等修改后，刷新页面仍在（服务器是唯一数据源）。
 * 需要本机装有 Chrome；没有时整组跳过。运行：node --test tests/e2e-persistence.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { startHarness } = require("./helpers/gateway-harness.cjs");

let chromium = null;
try { ({ chromium } = require("playwright-core")); } catch { /* 未安装 playwright-core */ }

describe("修改落到后端，刷新后仍在", () => {
  let harness, browser, skipReason = "";
  before(async () => {
    if (!chromium) { skipReason = "未安装 playwright-core"; return; }
    try { browser = await chromium.launch({ channel: "chrome", headless: true }); }
    catch (error) { skipReason = `无法启动 Chrome：${error.message.split("\n")[0]}`; return; }
    harness = await startHarness({});
  });
  after(async () => { if (browser) await browser.close(); if (harness) await harness.stop(); });

  async function login(page) {
    await page.goto(harness.baseUrl + "/");
    await page.fill('#gatewayLoginForm input[name="name"]', "曾祥竞");
    await page.fill('#gatewayLoginForm input[name="password"]', harness.PASSWORD);
    await page.click("#gatewayLoginBtn");
    await page.waitForSelector("#portalApp:not(.hidden)");
    await page.waitForFunction(() => window.portalVueModuleApi?.boardSync?.ready && window.portalVueModuleApi?.catalogSync?.ready);
  }

  test("首次登录把页面默认数据存到服务器；改字典和看板后刷新仍在", async t => {
    if (skipReason) return t.skip(skipReason);
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    try {
      await login(page);
      const token = await harness.tokenFor("曾祥竞");
      const initial = await harness.call("GET", "/v1/boards", { token });
      assert.equal(initial.data.saved, true, "有编辑权限的人首次登录应把默认看板存到服务器");
      const catalog = (await harness.call("GET", "/v1/portal-data", { token })).data.collections;
      assert.ok(catalog.dictionaries.saved);
      assert.ok(catalog.menus.saved && catalog.menus.items.length > 3, "默认菜单应已存到服务器");

      // 改字典（经页面的同步通道保存）、改看板名
      await page.evaluate(async () => {
        const api = window.portalVueModuleApi;
        api.state.dictionaries.push({ dictId: "D_E2E", code: "e2e_dict", name: "E2E 字典", desc: "", owner: "曾祥竞", status: "启用", updatedAt: "", items: [] });
        api.state.boards[0].desc = "E2E 备注";
        api.state.menus[0].children.push({ id: "M_E2E", name: "E2E 菜单", icon: "--", sort: 1, path: "/e2e", cache: true, permission: "e2e_menu", children: [], parentId: api.state.menus[0].id });
        api.catalogSync.schedulePush();
        api.boardSync.schedulePush();
        await new Promise(resolve => setTimeout(resolve, 1500));
      });
      const stored = await harness.call("GET", "/v1/portal-data", { token });
      assert.ok(stored.data.collections.dictionaries.items.some(item => item.dictId === "D_E2E"), "字典应已保存到服务器");
      assert.equal((await harness.call("GET", "/v1/boards", { token })).data.boards[0].desc, "E2E 备注");

      await page.reload();
      await page.waitForSelector("#portalApp:not(.hidden)");
      await page.waitForFunction(() => window.portalVueModuleApi?.catalogSync?.ready && window.portalVueModuleApi?.boardSync?.ready);
      const after = await page.evaluate(() => ({ menu: window.portalVueModuleApi.state.menus[0].children.some(item => item.id === "M_E2E"), dict: window.portalVueModuleApi.state.dictionaries.some(item => item.dictId === "D_E2E"), desc: window.portalVueModuleApi.state.boards[0].desc }));
      assert.equal(after.dict, true, "刷新后字典仍在");
      assert.equal(after.menu, true, "刷新后菜单仍在");
      assert.equal(after.desc, "E2E 备注", "刷新后看板修改仍在");
    } finally { await context.close(); }
  });

  test("开放 API：新建后服务端签发 Token（只返回一次），刷新后只剩前缀；重置后旧 Token 失效", async t => {
    if (skipReason) return t.skip(skipReason);
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    try {
      await login(page);
      const issued = await page.evaluate(async () => {
        const api = window.portalVueModuleApi;
        api.state.apis.unshift({ name: "E2E 接口", usage: "测试", assetTable: "t", database: "d", fieldNames: ["a"], assets: [], rateLimit: "每分钟 60 次", tokenStatus: "启用", creator: "曾祥竞", createdAt: "", lastCall: "尚未调用", callCount: 0, callCount30d: 0, token: "" });
        const result = await api.catalogSync.pushNow("apis");
        return result?.issued?.find(item => item.name === "E2E 接口") || null;
      });
      assert.ok(issued?.token?.startsWith("bjgw_live_"), "新建 API 应拿到服务端签发的 Token");
      const token = await harness.tokenFor("曾祥竞");
      const listed = (await harness.call("GET", "/v1/portal-data", { token })).data.collections.apis.items.find(item => item.name === "E2E 接口");
      assert.ok(listed.token.endsWith("****") && !listed.token.includes(issued.token.slice(16)), "读出来只有前缀");
      assert.equal(listed.tokenHash, undefined);
      const reset = await page.evaluate(id => window.portalVueModuleApi.catalogSync.resetApiToken(id), listed.apiId);
      assert.ok(reset.startsWith("bjgw_live_") && reset !== issued.token, "重置应得到新的 Token");
    } finally { await context.close(); }
  });
});
