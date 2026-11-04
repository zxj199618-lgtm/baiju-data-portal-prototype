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

  const admin = () => group("门户管理员", { tables: ["全部数据表"] });

  test("保存 hiddenFields 后 hiddenFieldsOf 返回该组被隐藏的字段", () => {
    const saved = store.save({ groups: [admin(), group("分析师", { tables: ["表甲", "表乙"], hiddenFields: { 表甲: ["phone"] }, confirmedFields: { 表甲: ["phone", "name"] } })] });
    assert.equal(saved.ok, true);
    assert.deepEqual(store.hiddenFieldsOf("乙"), { 表甲: ["phone"] });
    assert.deepEqual(store.hiddenFieldsOf("甲"), {});
    assert.deepEqual(store.hiddenFieldsOf("不存在的账号"), {});
    assert.deepEqual(store.effective().groups.find(item => item.name === "分析师").confirmedFields, { 表甲: ["phone", "name"] });
    store.save({ userGroups: { 乙: "未分配" } });
    assert.deepEqual(store.hiddenFieldsOf("乙"), {});
  });

  test("hiddenFields 里的表不在该组 tables 内会被拒绝", () => {
    assert.match(store.save({ groups: [admin(), group("分析师", { tables: ["表甲"], hiddenFields: { 表乙: ["phone"] } })] }).error, /未授权/);
    assert.match(store.save({ groups: [admin(), group("分析师", { tables: ["表甲"], confirmedFields: { 表乙: ["phone"] } })] }).error, /未授权/);
  });

  test("门户管理员组不允许设置 hiddenFields", () => {
    assert.match(store.save({ groups: [group("门户管理员", { tables: ["全部数据表"], hiddenFields: { 表甲: ["phone"] } })] }).error, /门户管理员/);
    assert.match(store.save({ groups: [admin(), group("全量组", { tables: ["全部数据表"], hiddenFields: { 表甲: ["phone"] } })] }).error, /全部数据表/);
  });

  test("取消表授权时清除该表的 hiddenFields 与 confirmedFields", () => {
    store.save({ groups: [admin(), group("分析师", { tables: ["表甲", "表乙"], hiddenFields: { 表甲: ["a"], 表乙: ["b"] }, confirmedFields: { 表甲: ["a"], 表乙: ["b"] } })] });
    store.save({ groups: [admin(), group("分析师", { tables: ["表乙"], hiddenFields: { 表乙: ["b"] }, confirmedFields: { 表乙: ["b"] } })] });
    const analyst = store.effective().groups.find(item => item.name === "分析师");
    assert.equal(Object.keys(analyst.hiddenFields || {}).includes("表甲"), false);
    assert.equal(Object.keys(analyst.confirmedFields || {}).includes("表甲"), false);
    const raw = JSON.parse(fs.readFileSync(path.join(dir, "org.json"), "utf8"));
    assert.equal(JSON.stringify(raw).includes("\"a\""), false);
    assert.deepEqual(store.hiddenFieldsOf("乙"), { 表乙: ["b"] });
  });

  test("保存权限组时不带 hiddenFields / confirmedFields 会沿用已保存的值", () => {
    store.save({ groups: [admin(), group("分析师", { tables: ["表甲"], hiddenFields: { 表甲: ["phone"] }, confirmedFields: { 表甲: ["phone"] } })] });
    assert.equal(store.save({ groups: [admin(), group("分析师", { tables: ["表甲", "表乙"], desc: "改了描述" })] }).ok, true);
    const analyst = store.effective().groups.find(item => item.name === "分析师");
    assert.deepEqual(analyst.hiddenFields, { 表甲: ["phone"] });
    assert.deepEqual(analyst.confirmedFields, { 表甲: ["phone"] });
    assert.deepEqual(store.hiddenFieldsOf("乙"), { 表甲: ["phone"] });
  });

  test("显式传 {} 会清空 hiddenFields 与 confirmedFields", () => {
    store.save({ groups: [admin(), group("分析师", { tables: ["表甲"], hiddenFields: { 表甲: ["phone"] }, confirmedFields: { 表甲: ["phone"] } })] });
    store.save({ groups: [admin(), group("分析师", { tables: ["表甲"], hiddenFields: {}, confirmedFields: {} })] });
    const analyst = store.effective().groups.find(item => item.name === "分析师");
    assert.deepEqual(analyst.hiddenFields, {});
    assert.deepEqual(analyst.confirmedFields, {});
  });

  test("沿用旧值时，同一次保存里被移除授权的表的键会被丢弃", () => {
    store.save({ groups: [admin(), group("分析师", { tables: ["表甲", "表乙"], hiddenFields: { 表甲: ["a"], 表乙: ["b"] }, confirmedFields: { 表甲: ["a"], 表乙: ["b"] } })] });
    assert.equal(store.save({ groups: [admin(), group("分析师", { tables: ["表乙"] })] }).ok, true);
    const analyst = store.effective().groups.find(item => item.name === "分析师");
    assert.deepEqual(analyst.hiddenFields, { 表乙: ["b"] });
    assert.deepEqual(analyst.confirmedFields, { 表乙: ["b"] });
  });

  test("字段名必须是 60 字符以内的非空字符串", () => {
    const bad = value => store.save({ groups: [admin(), group("分析师", { tables: ["表甲"], hiddenFields: { 表甲: value } })] });
    assert.match(bad(["x".repeat(61)]).error, /字段名/);
    assert.match(bad([""]).error, /字段名/);
    assert.match(bad([5]).error, /字段名/);
    assert.equal(bad(["x".repeat(60)]).ok, true);
    assert.equal(bad([]).ok, true);
    assert.equal(store.effective().groups.find(item => item.name === "分析师").hiddenFields?.表甲, undefined);
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

describe("字段权限：个人覆盖与有效隐藏字段（经网关）", () => {
  let harness;
  before(async () => { harness = await startHarness(); });
  after(async () => { await harness.stop(); });

  const fullGroup = (name, tables, extra = {}) => ({ name, desc: "", menus: ["灵犀智析"], menuEdits: [], boards: [], tables, status: "启用", ...extra });
  const saveGroups = async (optimizerHidden, optimizerTables = ["广告计划日报表", "广告账户日报"]) => {
    const groups = [
      fullGroup("门户管理员", ["全部数据表"], { menus: ["灵犀智析", "AI 中心"] }),
      fullGroup("投放组长", ["广告计划日报表"]),
      fullGroup("优化师", optimizerTables, { hiddenFields: optimizerHidden }),
      fullGroup("数据分析师", ["广告计划日报表"]),
      fullGroup("只读访客", [])
    ];
    const result = await harness.call("PUT", "/v1/org", { token: await harness.tokenFor("曾祥竞"), body: { groups } });
    assert.equal(result.status, 200, JSON.stringify(result.data));
  };
  const putOverride = async body => harness.call("PUT", `/v1/permissions/${encodeURIComponent("谭嘉颖")}`, { token: await harness.tokenFor("曾祥竞"), body });
  const effective = async name => (await harness.call("GET", "/v1/permissions", { token: await harness.tokenFor("曾祥竞") })).data.users.find(item => item.name === name).effectiveHiddenFields;

  test("hiddenFields / grantedFields 形状非法返回 400", async () => {
    const tables = ["广告计划日报表", "广告账户日报", "媒体消耗汇总"];
    for (const bad of [
      { hiddenFields: ["plan_name"] },
      { hiddenFields: { 媒体消耗汇总: "media_source" } },
      { grantedFields: { 广告计划日报表: [5] } },
      { grantedFields: { 广告计划日报表: ["x".repeat(61)] } },
      { grantedFields: { 广告计划日报表: ["  "] } },
      { hiddenFields: { 媒体消耗汇总: Array.from({ length: 201 }, (_, i) => `f${i}`) } },
      { hiddenFields: { 不存在的表: ["a"] } },
      { hiddenFields: { 用户订单明细: ["a"] } }
    ]) {
      const result = await putOverride({ tables, ...bad });
      assert.equal(result.status, 400, JSON.stringify(bad));
    }
    assert.equal((await putOverride({ tables, grantedFields: { 广告计划日报表: ["x".repeat(60)] } })).status, 200);
    assert.equal((await putOverride({ tables: [] })).status, 200);
  });

  test("有效隐藏字段：组授予的表 = 组隐藏 − 个人追加；只由个人授予的表 = 个人隐藏；管理员为空", async () => {
    await saveGroups({ 广告计划日报表: ["plan_name", "campaign_id"], 广告账户日报: ["balance"] });
    assert.deepEqual(await effective("谭嘉颖"), { 广告计划日报表: ["plan_name", "campaign_id"], 广告账户日报: ["balance"] });
    assert.deepEqual(await effective("曾祥竞"), {});

    const saved = await putOverride({
      tables: ["广告计划日报表", "广告账户日报", "媒体消耗汇总"],
      grantedFields: { 广告计划日报表: [" campaign_id "] },
      hiddenFields: { 媒体消耗汇总: ["media_source"] }
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.deepEqual(await effective("谭嘉颖"), { 广告计划日报表: ["plan_name"], 广告账户日报: ["balance"], 媒体消耗汇总: ["media_source"] });

    const list = await harness.call("GET", "/v1/permissions", { token: await harness.tokenFor("曾祥竞") });
    const entry = list.data.users.find(item => item.name === "谭嘉颖");
    assert.deepEqual(entry.grantedFields, { 广告计划日报表: ["campaign_id"] }, "个人追加的字段名存储时去掉空格");
    assert.deepEqual(entry.hiddenFields, { 媒体消耗汇总: ["media_source"] });
    assert.deepEqual(entry.groupHiddenFields, { 广告计划日报表: ["plan_name", "campaign_id"], 广告账户日报: ["balance"] });

    // 只改表、不带字段映射（现有界面的保存方式）：沿用已保存的字段设置；被取消的表的设置一并丢弃
    assert.equal((await putOverride({ tables: ["广告计划日报表", "广告账户日报"] })).status, 200);
    const after = (await harness.call("GET", "/v1/permissions", { token: await harness.tokenFor("曾祥竞") })).data.users.find(item => item.name === "谭嘉颖");
    assert.deepEqual(after.grantedFields, { 广告计划日报表: ["campaign_id"] });
    assert.deepEqual(after.hiddenFields, {});
    assert.ok(harness.readJsonLines("analysis-audit.jsonl").some(item => item.type === "permission-change" && item.target === "谭嘉颖"), "保存个人权限写审计");
    assert.equal((await putOverride({ tables: [] })).status, 200);
  });

  const adminEntry = async name => (await harness.call("GET", "/v1/permissions", { token: await harness.tokenFor("曾祥竞") })).data.users.find(item => item.name === name);

  test("个人覆盖只存个人追加的表：组收回某表后，靠个人追加字段的用户也一并失去该表，不会有字段因此变得可见", async () => {
    await saveGroups({ 广告计划日报表: ["plan_name", "campaign_id"] });
    try {
      // 界面按有效表保存（含组授予的表），只把 campaign_id 追加回来
      const saved = await putOverride({ tables: ["广告计划日报表", "广告账户日报"], grantedFields: { 广告计划日报表: ["campaign_id"] } });
      assert.equal(saved.status, 200, JSON.stringify(saved.data));
      const entry = await adminEntry("谭嘉颖");
      assert.deepEqual(entry.override.tables, [], "组已授予的表不进入个人覆盖");
      assert.deepEqual(entry.grantedFields, { 广告计划日报表: ["campaign_id"] });
      assert.deepEqual(entry.effectiveHiddenFields, { 广告计划日报表: ["plan_name"] });

      await saveGroups({}, ["广告账户日报"]);
      const after = await adminEntry("谭嘉颖");
      assert.deepEqual(after.effectiveTables, ["广告账户日报"], "组收回后用户失去该表");
      assert.deepEqual(after.effectiveHiddenFields, {});
      const rows = await harness.call("GET", `/v1/table-rows?name=${encodeURIComponent("广告计划日报表")}&limit=3`, { token: await harness.tokenFor("谭嘉颖") });
      assert.equal(rows.status, 404, "用户不能再读取该表，plan_name 不会因此可见");
    } finally {
      await putOverride({ tables: [] });
      await saveGroups({});
    }
  });

  test("个人覆盖存在时，组新增的表实时生效", async () => {
    await saveGroups({});
    try {
      assert.equal((await putOverride({ tables: ["广告计划日报表", "广告账户日报", "媒体消耗汇总"] })).status, 200);
      await saveGroups({}, ["广告计划日报表", "广告账户日报", "用户订单明细"]);
      const entry = await adminEntry("谭嘉颖");
      assert.ok(entry.effectiveTables.includes("用户订单明细"), JSON.stringify(entry.effectiveTables));
      assert.ok(entry.effectiveTables.includes("媒体消耗汇总"));
      assert.deepEqual(entry.override.tables, ["媒体消耗汇总"]);
    } finally {
      await putOverride({ tables: [] });
      await saveGroups({});
    }
  });

  test("只有个人追加字段（没有个人表）也能保存，并在组保留该表的调整后继续生效", async () => {
    await saveGroups({ 广告计划日报表: ["plan_name", "campaign_id"] });
    try {
      const saved = await putOverride({ tables: [], grantedFields: { 广告计划日报表: ["campaign_id"] } });
      assert.equal(saved.status, 200, JSON.stringify(saved.data));
      assert.deepEqual(saved.data.hiddenFields, { 广告计划日报表: ["plan_name"] });
      await saveGroups({ 广告计划日报表: ["plan_name", "campaign_id"] }, ["广告计划日报表", "媒体消耗汇总"]);
      const entry = await adminEntry("谭嘉颖");
      assert.deepEqual(entry.effectiveTables.sort(), ["媒体消耗汇总", "广告计划日报表"].sort());
      assert.deepEqual(entry.effectiveHiddenFields, { 广告计划日报表: ["plan_name"] });
      // 字段映射的表必须合法：追加字段只能在组授予的表上，个人隐藏只能在个人表上
      assert.equal((await putOverride({ tables: [], grantedFields: { 广告账户日报: ["balance"] } })).status, 400);
      assert.equal((await putOverride({ tables: [], hiddenFields: { 广告计划日报表: ["plan_name"] } })).status, 400);
      // 全部清空才删除个人覆盖
      assert.equal((await putOverride({ tables: [], hiddenFields: {}, grantedFields: {} })).status, 200);
      assert.equal((await adminEntry("谭嘉颖")).override, null);
    } finally {
      await putOverride({ tables: [] });
      await saveGroups({});
    }
  });

  test("个人追加的表不受组调整影响，个人隐藏字段照常生效", async () => {
    await saveGroups({});
    try {
      assert.equal((await putOverride({ tables: ["广告计划日报表", "媒体消耗汇总"], hiddenFields: { 媒体消耗汇总: ["media_source"] } })).status, 200);
      await saveGroups({}, ["广告账户日报"]);
      const entry = await adminEntry("谭嘉颖");
      assert.deepEqual(entry.effectiveTables.sort(), ["媒体消耗汇总", "广告账户日报"].sort());
      assert.deepEqual(entry.effectiveHiddenFields, { 媒体消耗汇总: ["media_source"] });
      // 同时属于组的表以组为准：组之后授予该表时，个人隐藏不再作用于它
      await saveGroups({}, ["广告账户日报", "媒体消耗汇总"]);
      assert.deepEqual((await adminEntry("谭嘉颖")).effectiveHiddenFields, {});
    } finally {
      await putOverride({ tables: [] });
      await saveGroups({});
    }
  });

  test("GET /v1/table-rows：普通用户只能读有权限的表，且不含被隐藏的列；管理员不受影响", async () => {
    await saveGroups({ 广告计划日报表: ["campaign_id"] });
    const route = name => `/v1/table-rows?name=${encodeURIComponent(name)}&limit=3`;
    const user = await harness.call("GET", route("广告计划日报表"), { token: await harness.tokenFor("谭嘉颖") });
    assert.equal(user.status, 200);
    assert.ok(user.data.rows.length > 0);
    assert.equal(user.text.includes("campaign_id"), false);
    assert.equal(/CMP\d{3}/.test(user.text), false);
    const denied = await harness.call("GET", route("用户订单明细"), { token: await harness.tokenFor("谭嘉颖") });
    const missing = await harness.call("GET", route("根本不存在的表"), { token: await harness.tokenFor("谭嘉颖") });
    assert.equal(denied.status, 404);
    assert.equal(denied.data.error.replace("用户订单明细", "?"), missing.data.error.replace("根本不存在的表", "?"));
    const admin = await harness.call("GET", route("广告计划日报表"), { token: await harness.tokenFor("曾祥竞") });
    assert.ok(admin.text.includes("campaign_id"));
    await saveGroups({});
  });

  test("普通用户的 /v1/auth/me、/v1/permissions、/v1/org 不含自己被隐藏的字段名；管理员仍能看到", async () => {
    await saveGroups({ 广告计划日报表: ["plan_name", "campaign_id"] });
    const userToken = await harness.tokenFor("谭嘉颖");
    for (const route of ["/v1/auth/me", "/v1/permissions", "/v1/org"]) {
      const result = await harness.call("GET", route, { token: userToken });
      assert.equal(result.status, 200, route);
      assert.equal(/plan_name|campaign_id/.test(result.text), false, `${route}: ${result.text.slice(0, 300)}`);
    }
    assert.equal(Object.prototype.hasOwnProperty.call((await harness.call("GET", "/v1/auth/me", { token: userToken })).data, "hiddenFields"), false);
    const ownGroup = (await harness.call("GET", "/v1/org", { token: userToken })).data.groups[0];
    assert.equal(ownGroup.name, "优化师");
    assert.equal("hiddenFields" in ownGroup || "confirmedFields" in ownGroup, false);
    const adminToken = await harness.tokenFor("曾祥竞");
    assert.match((await harness.call("GET", "/v1/permissions", { token: adminToken })).text, /campaign_id/);
    assert.match((await harness.call("GET", "/v1/org", { token: adminToken })).text, /campaign_id/);
    await saveGroups({});
  });

  test("/v1/catalog 按用户的视图生成：被隐藏的日期字段不再给出时间范围，表清单不变", async () => {
    await saveGroups({ 广告计划日报表: ["stat_date"] });
    const user = await harness.call("GET", "/v1/catalog", { token: await harness.tokenFor("谭嘉颖") });
    const admin = await harness.call("GET", "/v1/catalog", { token: await harness.tokenFor("曾祥竞") });
    assert.deepEqual(user.data.tables.map(item => item.name), admin.data.tables.map(item => item.name));
    const pick = (result, name) => result.data.tables.find(item => item.name === name);
    assert.ok(pick(admin, "广告计划日报表").range);
    assert.equal(pick(user, "广告计划日报表").range, null);
    assert.equal(pick(user, "广告计划日报表").rows, pick(admin, "广告计划日报表").rows);
    assert.deepEqual(pick(user, "广告账户日报"), pick(admin, "广告账户日报"));
    await saveGroups({});
  });

  test("/v1/metrics 与 /v1/metrics/query 按用户的隐藏字段裁剪", async () => {
    await saveGroups({ 广告计划日报表: ["plan_name"] });
    const userToken = await harness.tokenFor("谭嘉颖");
    const adminToken = await harness.tokenFor("曾祥竞");
    const userMetrics = await harness.call("GET", "/v1/metrics", { token: userToken });
    const adminMetrics = await harness.call("GET", "/v1/metrics", { token: adminToken });
    assert.equal(userMetrics.status, 200);
    assert.ok(JSON.stringify(adminMetrics.data).includes("plan_name"));
    assert.equal(JSON.stringify(userMetrics.data).includes("plan_name"), false);
    const hiddenGroup = await harness.call("POST", "/v1/metrics/query", { token: userToken, body: { metric: "cost", table: "广告计划日报表", group: "plan_name" } });
    const bogusGroup = await harness.call("POST", "/v1/metrics/query", { token: userToken, body: { metric: "cost", table: "广告计划日报表", group: "zz_nope" } });
    assert.equal(hiddenGroup.status, 400);
    assert.equal(hiddenGroup.data.error.replace("plan_name", "?"), bogusGroup.data.error.replace("zz_nope", "?"));
    assert.equal((await harness.call("POST", "/v1/metrics/query", { token: adminToken, body: { metric: "cost", table: "广告计划日报表", group: "plan_name" } })).status, 200);
    await saveGroups({});
  });
});
