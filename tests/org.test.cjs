/**
 * 组织与权限存储测试：校验规则（单元）+ 经网关的生效与防锁死（端到端）。
 * 运行：node --test tests/org.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createOrgStore } = require("../scripts/org-store.cjs");
const { startHarness } = require("./helpers/gateway-harness.cjs");

const TABLES = ["表甲", "表乙", "表丙"];
const defaultGroups = [{ name: "门户管理员", tables: ["全部数据表"] }, { name: "分析师", tables: ["表甲"] }];

describe("组织存储（单元）", () => {
  let dir, store;
  test.beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "org-unit-"));
    store = createOrgStore({ dataDir: dir, defaultGroups, defaultUserGroups: { 甲: "门户管理员", 乙: "分析师" }, accounts: ["甲", "乙"], tableNames: TABLES });
  });
  test.afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const group = (name, extra = {}) => ({ name, tables: [], menus: ["灵犀智析"], ...extra });

  test("没保存过时使用默认值：管理员看全部表，分析师只看授权的表", () => {
    assert.deepEqual(store.tablesOf("甲"), TABLES);
    assert.deepEqual(store.tablesOf("乙"), ["表甲"]);
    assert.equal(store.isAdmin("甲"), true);
    assert.equal(store.isAdmin("乙"), false);
    assert.equal(store.effective().customized, false);
  });

  test("只改账号分组时不把默认组落盘（默认组没有菜单信息，不能当成已定制）", () => {
    assert.equal(store.save({ userGroups: { 乙: "门户管理员" } }).ok, true);
    assert.equal(store.isAdmin("乙"), true);
    assert.equal(store.effective().customized, false);
  });

  test("保存权限组后立即生效，并保留菜单等完整字段", () => {
    const saved = store.save({ groups: [group("门户管理员", { tables: ["全部数据表"] }), group("分析师", { tables: ["表乙", "表丙"], menus: ["灵犀智析", "数据看板"], boards: ["大盘"] })] });
    assert.equal(saved.ok, true);
    assert.deepEqual(store.tablesOf("乙"), ["表乙", "表丙"]);
    const analyst = store.effective().groups.find(item => item.name === "分析师");
    assert.deepEqual(analyst.menus, ["灵犀智析", "数据看板"]);
    assert.deepEqual(analyst.boards, ["大盘"]);
    assert.equal(store.effective().customized, true);
  });

  test("校验：未知数据表、重复名称、保留名称、空名称都被拒绝", () => {
    const admin = group("门户管理员", { tables: ["全部数据表"] });
    assert.match(store.save({ groups: [admin, group("甲组", { tables: ["不存在的表"] })] }).error, /未知数据表/);
    assert.match(store.save({ groups: [admin, group("重复"), group("重复")] }).error, /名称重复/);
    assert.match(store.save({ groups: [admin, group("未分配")] }).error, /保留名称/);
    assert.match(store.save({ groups: [admin, group("   ")] }).error, /不能为空/);
    assert.match(store.save({ groups: [] }).error, /数量/);
  });

  test("防锁死：不能把最后一个管理员降级，也不能删掉管理员组", () => {
    assert.match(store.save({ userGroups: { 甲: "分析师" } }).error, /至少需要保留一个/);
    assert.match(store.save({ groups: [group("分析师")] }).error, /至少需要保留一个/);
    assert.equal(store.isAdmin("甲"), true, "被拒绝的修改不应生效");
  });

  test("账号分配到不存在的组被拒绝；删除某个组后其成员落到「未分配」", () => {
    assert.match(store.save({ userGroups: { 乙: "不存在的组" } }).error, /权限组不存在/);
    assert.equal(store.save({ groups: [group("门户管理员", { tables: ["全部数据表"] })] }).ok, true);
    assert.equal(store.groupOf("乙"), "未分配");
    assert.deepEqual(store.tablesOf("乙"), []);
  });

  test("非网关账号（界面里的演示成员）会被忽略，不报错也不保存", () => {
    assert.equal(store.save({ userGroups: { 演示成员: "分析师" } }).ok, true);
    assert.equal(store.effective().userGroups["演示成员"], undefined);
  });
});

describe("组织与权限（经网关）", () => {
  let harness;
  before(async () => { harness = await startHarness(); });
  after(async () => { await harness.stop(); });

  const org = async name => harness.call("GET", "/v1/org", { token: await harness.tokenFor(name) });
  const put = async (name, body) => harness.call("PUT", "/v1/org", { token: await harness.tokenFor(name), body });
  const fullGroup = (name, tables, extra = {}) => ({ name, desc: "", menus: ["灵犀智析"], menuEdits: [], boards: [], tables, status: "启用", ...extra });
  const defaults = () => [
    fullGroup("门户管理员", ["全部数据表"], { menus: ["灵犀智析", "AI 中心"] }),
    fullGroup("投放组长", ["广告计划日报表"]),
    fullGroup("优化师", ["广告计划日报表"]),
    fullGroup("数据分析师", ["广告计划日报表", "用户订单明细"], { menus: ["灵犀智析", "数据看板"], boards: ["大盘数据"] }),
    fullGroup("只读访客", [])
  ];

  test("登录与 /v1/auth/me 返回账号所属权限组和可用数据表", async () => {
    const me = await harness.call("GET", "/v1/auth/me", { token: await harness.tokenFor("李雨航") });
    assert.equal(me.data.group, "数据分析师");
    assert.ok(me.data.tables.includes("广告计划日报表"));
    const login = await harness.call("POST", "/v1/auth/login", { body: { name: "李雨航", password: harness.PASSWORD } });
    assert.equal(login.data.user.group, "数据分析师");
  });

  test("管理员读到全部账号分组；普通用户只读到自己的；未保存过时不下发组配置", async () => {
    const admin = await org("曾祥竞");
    assert.equal(admin.data.customized, false);
    assert.deepEqual(admin.data.groups, []);
    assert.equal(admin.data.userGroups["李雨航"], "数据分析师");
    assert.equal(admin.data.accounts.length, 5);
    const user = await org("李雨航");
    assert.deepEqual(Object.keys(user.data.userGroups), ["李雨航"]);
    assert.deepEqual(user.data.accounts, ["李雨航"]);
  });

  test("普通用户不能修改；非法内容被拒绝", async () => {
    assert.equal((await put("李雨航", { userGroups: { 李雨航: "门户管理员" } })).status, 403, "不能给自己提权");
    assert.equal((await put("曾祥竞", { groups: [fullGroup("门户管理员", ["不存在的表"])] })).status, 400);
  });

  test("管理员修改权限组后立即生效：分析师失去的表马上被拒绝访问", async () => {
    const before = await harness.call("POST", "/v1/analyze", {
      token: await harness.tokenFor("李雨航"), body: { question: "订单？", scenario: "single", model: harness.MODEL, tables: ["用户订单明细"], toolMode: false }
    });
    assert.equal(before.status, 200);

    const groups = defaults();
    groups.find(item => item.name === "数据分析师").tables = ["广告计划日报表"];
    assert.equal((await put("曾祥竞", { groups })).status, 200);

    const after = await harness.call("POST", "/v1/analyze", {
      token: await harness.tokenFor("李雨航"), body: { question: "订单？", scenario: "single", model: harness.MODEL, tables: ["用户订单明细"], toolMode: false }
    });
    assert.equal(after.status, 403, "组里去掉了用户订单明细，应立即无权访问");
    assert.ok(harness.readJsonLines("analysis-audit.jsonl").some(entry => entry.type === "org-change" && entry.user === "曾祥竞"));
  });

  test("保存后：普通用户读到自己那个组的完整配置（菜单、看板），看不到别的组", async () => {
    const user = await org("李雨航");
    assert.equal(user.data.customized, true);
    assert.equal(user.data.groups.length, 1);
    assert.deepEqual(user.data.groups[0].menus, ["灵犀智析", "数据看板"]);
    assert.deepEqual(user.data.groups[0].boards, ["大盘数据"]);
  });

  test("账号分组可以调整：提权后立即成为管理员，降回去后失去管理权限", async () => {
    assert.equal((await put("曾祥竞", { userGroups: { 李雨航: "门户管理员" } })).status, 200);
    assert.equal((await harness.call("GET", "/v1/auth/me", { token: await harness.tokenFor("李雨航") })).data.role, "admin");
    assert.equal((await harness.call("PUT", "/v1/quota", { token: await harness.tokenFor("李雨航"), body: { requests: 100 } })).status, 200);
    assert.equal((await put("曾祥竞", { userGroups: { 李雨航: "数据分析师" } })).status, 200);
    assert.equal((await harness.call("GET", "/v1/auth/me", { token: await harness.tokenFor("李雨航") })).data.role, "user");
  });

  test("防锁死：把两个管理员都降级会被拒绝，系统始终有人能管理", async () => {
    const result = await put("曾祥竞", { userGroups: { 曾祥竞: "优化师", 黄佩贤: "优化师" } });
    assert.equal(result.status, 400);
    assert.match(result.data.error, /至少需要保留一个/);
    assert.equal((await harness.call("GET", "/v1/auth/me", { token: await harness.tokenFor("曾祥竞") })).data.role, "admin");
  });
});
