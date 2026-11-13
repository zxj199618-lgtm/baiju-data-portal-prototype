/**
 * 表权限 · 按 Skill 配置：Skill 引用的表很多时，默认只露出前几张，点「展开全部」能看到完整清单。
 * 需要本机装有 Chrome；没有时整组跳过。运行：node --test tests/e2e-skill-grant.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { startHarness } = require("./helpers/gateway-harness.cjs");

let chromium = null;
try { ({ chromium } = require("playwright-core")); } catch { /* 未安装 playwright-core */ }

describe("按 Skill 配置：展开看表", () => {
  let harness, browser, skipReason = "";
  before(async () => {
    if (!chromium) { skipReason = "未安装 playwright-core"; return; }
    try { browser = await chromium.launch({ channel: "chrome", headless: true }); }
    catch (error) { skipReason = `无法启动 Chrome：${error.message.split("\n")[0]}`; return; }
    harness = await startHarness({});
  });
  after(async () => { if (browser) await browser.close(); if (harness) await harness.stop(); });

  test("表多时默认收起，展开后列出全部，收起后恢复", async t => {
    if (skipReason) return t.skip(skipReason);
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    try {
      const tables = ["表甲", "表乙", "表丙", "表丁", "表戊", "表己"];
      await page.route("**/v1/skills", route => route.request().method() === "GET"
        ? route.fulfill({ json: [{ id: "sk_many", title: "引用很多表的 Skill", tables }, { id: "sk_few", title: "只引用两张表", tables: ["表甲", "表乙"] }] })
        : route.continue());
      await page.goto(harness.baseUrl + "/");
      await page.fill('#gatewayLoginForm input[name="name"]', "曾祥竞");
      await page.fill('#gatewayLoginForm input[name="password"]', harness.PASSWORD);
      await page.click("#gatewayLoginBtn");
      await page.waitForSelector("#portalApp:not(.hidden)");
      await page.waitForFunction(() => window.portalVueModuleApi && window.portalVueModuleApi.orgSync.ready);
      await page.evaluate(() => window.portalVueBridge.setPage("用户管理"));
      await page.locator("tr", { hasText: "黄佩贤" }).getByRole("button", { name: "配置权限" }).first().click();
      await page.getByRole("tab", { name: "表权限" }).or(page.getByText("表权限", { exact: true })).first().click();
      await page.getByRole("tab", { name: "按 Skill 配置" }).click();
      const list = page.locator('[data-test="skill-grant-list"]');
      const many = list.locator(".portal-vue-table-perm", { hasText: "引用很多表的 Skill" });
      const few = list.locator(".portal-vue-table-perm", { hasText: "只引用两张表" });
      assert.equal(await many.locator(".el-tag").count(), 3, "默认只露出前 3 张");
      assert.equal(await few.locator('[data-test="skill-expand"]').count(), 0, "表不多的 Skill 没有展开按钮");
      await many.locator('[data-test="skill-expand"]').click();
      assert.equal(await many.locator(".el-tag").count(), 6, "展开后显示全部");
      // Element Plus 的标签有入场动画，等宽度稳定后再检查可见性
      await page.waitForFunction(() => [...document.querySelectorAll('[data-test="skill-grant-list"] .el-tag')].every(tag => tag.getBoundingClientRect().width >= 30));
      for (const name of tables) assert.ok(await many.getByText(name, { exact: true }).isVisible(), `${name} 应可见`);
      assert.match(await many.locator('[data-test="skill-expand"]').textContent(), /收起/);
      await many.locator('[data-test="skill-expand"]').click();
      await page.waitForFunction(() => [...document.querySelectorAll('[data-test="skill-grant-list"] .portal-vue-table-perm')].find(row => row.textContent.includes("引用很多表的 Skill")).querySelectorAll(".el-tag").length === 3);
    } finally { await context.close(); }
  });
});
