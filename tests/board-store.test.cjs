/**
 * 看板存储与访问记录测试：可见范围、编辑权限、编辑者只改自己看得到的部分、收藏、事件落库与筛选。
 * 运行：node --test tests/board-store.test.cjs
 */
const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createOrgStore } = require("../scripts/org-store.cjs");
const { createBoardStore } = require("../scripts/board-store.cjs");
const { createEventStore, platformOf } = require("../scripts/event-store.cjs");

const group = (name, extra = {}) => ({ name, tables: [], menus: ["数据看板"], ...extra });
const board = (id, name, extra = {}) => ({ quickBiId: id, name, category: "大盘", owner: "甲", groups: ["门户管理员"], users: [], status: "已上线", type: "quickbi", ...extra });

describe("看板存储", () => {
  let dir, boards;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "board-"));
    const org = createOrgStore({
      dataDir: dir,
      defaultGroups: [group("门户管理员", { tables: ["全部数据表"] }), group("分析师", { boards: ["大盘"] }), group("看板运营", { boards: ["大盘"], menuEdits: ["看板管理"] }), group("访客", { boards: [] })],
      defaultUserGroups: { 管理: "门户管理员", 分析: "分析师", 运营: "看板运营", 访客甲: "访客", 直授: "访客" },
      accounts: ["管理", "分析", "运营", "访客甲", "直授"], tableNames: []
    });
    boards = createBoardStore({ dataDir: dir, orgStore: org });
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const seed = () => boards.save("管理", { categories: ["大盘", "新媒体"], boards: [board("QB_1", "经营日报"), board("QB_2", "新媒体看板", { category: "新媒体" }), board("QB_3", "直授看板", { category: "新媒体", users: ["直授"] })] });

  test("还没保存过：saved=false，编辑权限按角色判断", () => {
    assert.equal(boards.view("管理").saved, false);
    assert.equal(boards.view("管理").canEdit, true);
    assert.equal(boards.view("分析").canEdit, false);
    assert.equal(boards.view("运营").canEdit, true);
  });

  test("可见范围：管理员全部；权限组按看板名或分类；直接授权的用户可见；没授权的看不到", () => {
    assert.ok(seed().ok);
    assert.deepEqual(boards.view("管理").boards.map(item => item.quickBiId).sort(), ["QB_1", "QB_2", "QB_3"]);
    assert.deepEqual(boards.view("分析").boards.map(item => item.quickBiId), ["QB_1"]);
    assert.deepEqual(boards.view("直授").boards.map(item => item.quickBiId), ["QB_3"]);
    assert.deepEqual(boards.view("访客甲").boards, []);
  });

  test("没有看板管理编辑权限的人不能保存", () => {
    assert.equal(seed().ok, true);
    const outcome = boards.save("分析", { categories: ["大盘"], boards: [] });
    assert.equal(outcome.ok, false);
  });

  test("编辑者只能改自己看得到的看板，看不到的保持原样；也不能碰它们", () => {
    seed();
    const mine = boards.view("运营");
    assert.deepEqual(mine.boards.map(item => item.quickBiId), ["QB_1"]);
    const renamed = { ...mine.boards[0], name: "经营日报 v2" };
    assert.ok(boards.save("运营", { categories: mine.categories, boards: [renamed] }).ok);
    assert.deepEqual(boards.view("管理").boards.map(item => item.name).sort(), ["新媒体看板", "直授看板", "经营日报 v2"]);
    const clash = boards.save("运营", { categories: mine.categories, boards: [renamed, board("QB_2", "想覆盖别人的")] });
    assert.equal(clash.ok, false);
    assert.match(clash.error, /没有权限/);
  });

  test("校验：名称、编号、分类、自定义地址、重名", () => {
    const base = { categories: ["大盘"] };
    assert.match(boards.save("管理", { ...base, boards: [board("QB_1", "")] }).error, /名称/);
    assert.match(boards.save("管理", { ...base, boards: [board("QB 1", "甲")] }).error, /编号/);
    assert.match(boards.save("管理", { ...base, boards: [board("QB_1", "甲", { category: "不存在" })] }).error, /分类/);
    assert.match(boards.save("管理", { ...base, boards: [board("CB_1", "甲", { type: "custom", url: "javascript:alert(1)" })] }).error, /地址/);
    assert.match(boards.save("管理", { ...base, boards: [board("QB_1", "甲"), board("QB_2", "甲")] }).error, /重复/);
    assert.ok(boards.save("管理", { ...base, boards: [board("CB_1", "自定义", { type: "custom", url: "https://example.com/v?k=1" })] }).ok);
  });

  test("版本冲突：带旧 rev 保存会被拒绝", () => {
    seed();
    const view = boards.view("管理");
    assert.ok(boards.save("管理", { rev: view.rev, categories: view.categories, boards: view.boards }).ok);
    const stale = boards.save("管理", { rev: view.rev, categories: view.categories, boards: view.boards });
    assert.equal(stale.ok, false);
    assert.equal(stale.conflict, true);
  });

  test("收藏：只能收藏看得到的看板；看板被删掉后收藏一并清除", () => {
    seed();
    assert.deepEqual(boards.setFavorites("分析", ["QB_1", "QB_2"]).favorites, ["QB_1"]);
    assert.deepEqual(boards.view("分析").favorites, ["QB_1"]);
    const view = boards.view("管理");
    boards.save("管理", { rev: view.rev, categories: view.categories, boards: view.boards.filter(item => item.quickBiId !== "QB_1") });
    assert.deepEqual(boards.view("分析").favorites, []);
  });

  test("看板详情只给看得到的人；没初始化时不会因为收藏落盘", () => {
    assert.deepEqual(boards.setFavorites("管理", ["QB_1"]), { ok: true, favorites: [] });
    assert.equal(boards.view("管理").saved, false);
    seed();
    assert.equal(boards.boardFor("分析", "QB_1").name, "经营日报");
    assert.equal(boards.boardFor("分析", "QB_2"), null);
  });

  test("自定义看板地址只返回给看得到的人", () => {
    boards.save("管理", { categories: ["大盘"], boards: [board("CB_1", "AB", { type: "custom", url: "https://x.example/v?k=secret" })] });
    assert.equal(boards.view("管理").boards[0].url, "https://x.example/v?k=secret");
    assert.equal(boards.view("访客甲").boards.length, 0);
  });
});

describe("访问记录存储", () => {
  let dir, events, clock;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "events-"));
    clock = new Date("2026-11-18T10:00:00").getTime();
    events = createEventStore({ dataDir: dir, userIdOf: name => `u_${name}`, now: () => new Date(clock) });
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ctx = (user, extra = {}) => ({ user, ip: "1.2.3.4", userAgent: "Mozilla/5.0 (Macintosh) Chrome/126", ...extra });

  test("用户、时间、IP、终端由服务端填写，客户端传的会被忽略", () => {
    const out = events.record(ctx("甲"), { event: "page_view", menuName: "数据看板", pageUrl: "https://gxt/#/dashboard", user_name: "冒充" });
    assert.ok(out.ok);
    assert.equal(out.record.values.user_name, "甲");
    assert.equal(out.record.values.user_id, "u_甲");
    assert.equal(out.record.values.ip, "1.2.3.4");
    assert.equal(out.record.values.platform, "web");
    assert.equal(out.record.values.event_time, "2026-11-18 10:00:00");
  });

  test("看板心跳需要 visitId；未知事件被拒绝；移动端记为 h5", () => {
    assert.equal(events.record(ctx("甲"), { event: "dashboard_view_heartbeat", dashboardId: "QB_1" }).ok, false);
    assert.equal(events.record(ctx("甲"), { event: "evil" }).ok, false);
    const out = events.record(ctx("乙", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) Mobile/15E148" }), { event: "dashboard_view_heartbeat", visitId: "visit_abc123", dashboardId: "QB_1", dashboardName: "经营日报", durationSeconds: 20 });
    assert.equal(out.record.values.platform, "h5");
    assert.equal(platformOf("MicroMessenger"), "h5");
    assert.equal(out.record.values.duration_seconds, 20);
  });

  test("查询：倒序、按事件 / 用户 / 终端 / 时间范围 / 关键词筛选", () => {
    events.record(ctx("甲"), { event: "page_view", menuName: "数据看板" });
    clock += 60000;
    events.record(ctx("乙", { userAgent: "iPhone Mobile" }), { event: "dashboard_view_heartbeat", visitId: "visit_000001", dashboardId: "QB_1", dashboardName: "经营日报" });
    clock += 60000;
    events.record(ctx("甲"), { event: "dashboard_view_heartbeat", visitId: "visit_000002", dashboardId: "QB_2", dashboardName: "新媒体看板" });
    const all = events.query({});
    assert.equal(all.total, 3);
    assert.ok(all.rows[0].ts > all.rows[2].ts);
    assert.equal(events.query({ event: "page_view" }).total, 1);
    assert.equal(events.query({ user: "乙" }).total, 1);
    assert.equal(events.query({ platform: "h5" }).total, 1);
    assert.equal(events.query({ keyword: "新媒体" }).total, 1);
    assert.equal(events.query({ from: "2026-11-18 10:01", to: "2026-11-18 10:01:30" }).total, 1);
    assert.equal(events.query({ limit: 2 }).rows.length, 2);
  });

  test("文件里有损坏行时跳过，不影响查询", () => {
    events.record(ctx("甲"), { event: "page_view" });
    fs.appendFileSync(path.join(dir, "portal-events.jsonl"), "{坏行\n");
    assert.equal(events.query({}).total, 1);
  });
});
