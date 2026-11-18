/**
 * 看板与访问记录（经网关）：登录用户按权限看到看板、管理员保存、收藏、访问上报与查看权限。
 * 运行：node --test tests/board-gateway.test.cjs
 */
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startHarness } = require("./helpers/gateway-harness.cjs");

describe("看板与访问记录（经网关）", () => {
  let harness;
  before(async () => { harness = await startHarness(); });
  after(async () => { await harness.stop(); });
  const as = async (name, method, route, body) => harness.call(method, route, { token: await harness.tokenFor(name), body });
  const board = (id, name, extra = {}) => ({ quickBiId: id, name, category: "大盘数据", owner: "曾祥竞", groups: ["门户管理员"], users: [], status: "已上线", type: "quickbi", ...extra });

  test("未登录不能读看板与访问记录", async () => {
    assert.equal((await harness.call("GET", "/v1/boards")).status, 401);
    assert.equal((await harness.call("POST", "/v1/events", { body: { event: "page_view" } })).status, 401);
  });

  test("还没保存过：管理员看到 saved=false；初始化后按权限可见", async () => {
    const empty = await as("曾祥竞", "GET", "/v1/boards");
    assert.equal(empty.status, 200);
    assert.equal(empty.data.saved, false);
    const saved = await as("曾祥竞", "PUT", "/v1/boards", { categories: ["大盘数据", "新媒体"], boards: [board("QB_1", "经营日报"), board("QB_2", "新媒体看板", { category: "新媒体" }), board("CB_1", "自定义", { type: "custom", url: "https://x.example/v?k=secret", users: ["谭嘉颖"] })] });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.boards.length, 3);
    const admin = await as("曾祥竞", "GET", "/v1/boards");
    assert.equal(admin.data.saved, true);
    assert.equal(admin.data.boards.find(item => item.quickBiId === "CB_1").url, "https://x.example/v?k=secret");
    // 谭嘉颖（优化师）：权限组里没有这些看板，只能看到直接授权给他的那一个
    const tan = await as("谭嘉颖", "GET", "/v1/boards");
    assert.deepEqual(tan.data.boards.map(item => item.quickBiId), ["CB_1"]);
    // 李雨航：没有任何授权
    assert.deepEqual((await as("李雨航", "GET", "/v1/boards")).data.boards, []);
  });

  test("没有「看板管理」编辑权限的人保存被拒绝（403）；非法数据返回 400", async () => {
    assert.equal((await as("李雨航", "PUT", "/v1/boards", { categories: ["大盘数据"], boards: [] })).status, 403);
    assert.equal((await as("曾祥竞", "PUT", "/v1/boards", { categories: ["大盘数据"], boards: [board("QB_1", "甲", { category: "没有的分类" })] })).status, 400);
  });

  test("收藏：只能收藏看得到的；他人看不到我的收藏", async () => {
    const mine = await as("谭嘉颖", "PUT", "/v1/boards/favorites", { favorites: ["CB_1", "QB_1"] });
    assert.deepEqual(mine.data.favorites, ["CB_1"]);
    assert.deepEqual((await as("谭嘉颖", "GET", "/v1/boards")).data.favorites, ["CB_1"]);
    assert.deepEqual((await as("曾祥竞", "GET", "/v1/boards")).data.favorites, []);
  });

  test("版本冲突返回 409", async () => {
    const view = (await as("曾祥竞", "GET", "/v1/boards")).data;
    const stale = await as("曾祥竞", "PUT", "/v1/boards", { rev: view.rev - 1, categories: view.categories, boards: view.boards });
    assert.equal(stale.status, 409);
  });

  test("访问上报：用户由服务端确定；心跳只能报自己看得到的看板，名称以服务端为准", async () => {
    assert.equal((await as("谭嘉颖", "POST", "/v1/events", { event: "page_view", menuName: "数据看板", pageUrl: "https://gxt/#/dashboard" })).status, 200);
    assert.equal((await as("谭嘉颖", "POST", "/v1/events", { event: "dashboard_view_heartbeat", visitId: "visit_abc123", dashboardId: "QB_1", dashboardName: "冒充" })).status, 404);
    assert.equal((await as("谭嘉颖", "POST", "/v1/events", { event: "dashboard_view_heartbeat", visitId: "visit_abc123", dashboardId: "CB_1", dashboardName: "冒充", durationSeconds: 10 })).status, 200);
    assert.equal((await as("谭嘉颖", "POST", "/v1/events", { event: "evil" })).status, 400);
  });

  test("查看访问记录需要权限：管理员可看并按条件筛选；没有菜单权限的人 403", async () => {
    const all = await as("曾祥竞", "GET", "/v1/events");
    assert.equal(all.status, 200);
    assert.equal(all.data.total, 2);
    const heartbeat = all.data.rows.find(row => row.event === "dashboard_view_heartbeat");
    assert.equal(heartbeat.values.user_name, "谭嘉颖");
    assert.equal(heartbeat.values.dashboard_name, "自定义", "名称以服务端为准，不信任客户端传的");
    assert.equal(heartbeat.values.category, "大盘数据");
    assert.equal((await as("曾祥竞", "GET", "/v1/events?event=page_view")).data.total, 1);
    assert.equal((await as("曾祥竞", "GET", "/v1/events?user=李雨航")).data.total, 0);
    assert.equal((await as("李雨航", "GET", "/v1/events")).status, 403);
  });

  test("AI 对话记录的报告地址：分享这次分析生成的报告后，记录里出现分享链接；不能挂到别人的分析上", async () => {
    const analyzed = await as("李雨航", "POST", "/v1/analyze", { question: "订单？", scenario: "single", model: harness.MODEL, tables: ["用户订单明细"], toolMode: false });
    const requestId = analyzed.data?.meta?.requestId;
    assert.ok(requestId, "分析应返回 requestId");
    const before = (await as("曾祥竞", "GET", "/v1/audit?type=analysis&limit=200")).data.items.find(item => item.requestId === requestId);
    assert.ok(before, "审计里应有这次分析");
    assert.equal(before.reportUrl, undefined, "没分享前没有报告地址");
    // 别人拿着这个 requestId 分享，不会挂到这条记录上
    await as("谭嘉颖", "POST", "/v1/shares", { title: "冒领", report: "x", requestId });
    assert.equal((await as("曾祥竞", "GET", "/v1/audit?type=analysis&limit=200")).data.items.find(item => item.requestId === requestId).reportUrl, undefined);
    const shared = await as("李雨航", "POST", "/v1/shares", { title: "订单分析", report: "# 报告", requestId });
    assert.equal(shared.status, 200);
    const after = (await as("曾祥竞", "GET", "/v1/audit?type=analysis&limit=200")).data.items.find(item => item.requestId === requestId);
    assert.equal(after.reportUrl, shared.data.url);
  });
});
