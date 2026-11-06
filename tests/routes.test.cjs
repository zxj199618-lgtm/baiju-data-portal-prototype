/**
 * 页面路由表单元测试：页面名 ⇄ 英文地址、旧地址兼容、对象参数编码。
 * 运行：node --test tests/routes.test.cjs
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const R = require("../assets/portal-routes.js");

test("每条路由：地址唯一、能还原成同一个页面与参数", () => {
  const seen = new Set();
  R.ROUTES.forEach(route => {
    assert.ok(!seen.has(route.path), `地址重复：${route.path}`);
    seen.add(route.path);
    assert.match(route.path, /^\/[a-z0-9\-/:]+$/, `地址只用小写英文：${route.path}`);
    const params = Object.fromEntries(route.params.map(key => [key, `值 ${key}/1`]));
    const hash = R.toHash(route.page, params);
    assert.ok(hash.startsWith("#/"), route.page);
    const back = R.parsePath(hash);
    assert.deepEqual(back, { page: route.page, params }, `${route.page} 往返不一致：${hash}`);
  });
});

test("带参数的详情页必须声明回退列表页", () => {
  R.ROUTES.filter(route => route.params.length && !route.optional).forEach(route => {
    assert.ok(route.list && R.hasPage(route.list), `${route.page} 缺少 list`);
  });
});

test("示例地址", () => {
  assert.equal(R.toHash("用户管理"), "#/permission/users");
  assert.equal(R.toHash("权限组"), "#/permission/groups");
  assert.equal(R.toHash("配置权限", { user: "ou_7f31c9" }), "#/permission/users/ou_7f31c9/config");
  assert.equal(R.toHash("表详情", { table: "prod_callup.dm_x" }), "#/asset/tables/prod_callup.dm_x");
  assert.equal(R.toHash("配置权限"), "", "详情页缺对象参数时没有地址");
  assert.equal(R.toHash("不存在的页面"), "");
});

test("静态段优先于参数段（new 不会被当成对象）", () => {
  assert.deepEqual(R.parsePath("#/service/open-api/new"), { page: "新增API", params: {} });
  assert.deepEqual(R.parsePath("#/service/open-api/%E6%8E%A5%E5%8F%A3/edit"), { page: "新增API", params: { api: "接口" } });
});

test("旧地址 #page= 兼容：能还原对象的还原，不能的退回列表页", () => {
  assert.deepEqual(R.parseHash("#page=" + encodeURIComponent("用户管理")), { page: "用户管理", params: {}, legacy: true });
  assert.deepEqual(R.parseHash("#page=%E8%A1%A8%E8%AF%A6%E6%83%85&db=prod&table=t1"), { page: "表详情", params: { table: "prod.t1" }, legacy: true });
  const lost = R.parseHash("#page=" + encodeURIComponent("配置权限"));
  assert.equal(lost.page, "用户管理");
  assert.equal(lost.unresolved, true);
  assert.equal(R.parseHash("#page=" + encodeURIComponent("表详情")).page, "表管理");
  assert.equal(R.parseHash("#page=" + encodeURIComponent("不存在")).invalid, true);
  assert.equal(R.parseHash("#/no/such/page"), null);
});

test("旧版所有页面名都有新地址（无遗漏）", () => {
  const legacyPages = ["灵犀智析", "数据看板", "数据告警", "Skill 配置", "菜单管理", "模型配置", "运营中心", "看板访问记录", "大数据工具箱", "业务工具箱", "补数据", "消耗对比", "环境域名", "生成人群包", "短剧投放账户上报", "表详情", "看板管理", "表管理", "维表管理", "维表数据维护", "字典管理", "数据开放平台", "新增API", "人群包管理", "新建人群包", "标签管理", "人群包推送渠道", "用户管理", "权限组", "配置权限", "查看权限", "Quick BI 展示"];
  legacyPages.forEach(page => assert.ok(R.hasPage(page), `缺少 ${page}`));
});

test("菜单权限：详情页继承所属菜单", () => {
  assert.equal(R.menuOf("配置权限"), "用户管理");
  assert.equal(R.menuOf("Quick BI 展示"), "数据看板");
  assert.equal(R.menuOf("补数据"), "补数据");
  assert.equal(R.listOf("表详情"), "表管理");
});

test("数据看板页可带看板：#/dashboard/<id>，旧的 &board= 也能还原", () => {
  assert.equal(R.toHash("数据看板", { board: "QB_002" }), "#/dashboard/QB_002");
  assert.equal(R.toHash("数据看板"), "#/dashboard");
  assert.deepEqual(R.parsePath("#/dashboard/QB_002"), { page: "数据看板", params: { board: "QB_002" } });
  assert.deepEqual(R.parsePath("#/dashboard/boards/QB_002"), { page: "Quick BI 展示", params: { board: "QB_002" } });
  assert.deepEqual(R.parseHash("#page=" + encodeURIComponent("数据看板") + "&board=QB_003"), { page: "数据看板", params: { board: "QB_003" }, legacy: true });
});
