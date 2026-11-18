/**
 * 短剧投放账户上报批次：校验、权限、批次号、只追加；经网关的端到端。
 * 运行：node --test tests/report-batch.test.cjs
 */
const { test, describe, beforeEach, afterEach, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createOrgStore } = require("../scripts/org-store.cjs");
const { createReportBatchStore } = require("../scripts/report-batch-store.cjs");
const { startHarness } = require("./helpers/gateway-harness.cjs");

const group = (name, extra = {}) => ({ name, tables: [], menus: [], ...extra });

describe("上报批次（单元）", () => {
  let dir, store, clock;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "batch-"));
    clock = new Date("2026-11-18T10:05:00");
    const org = createOrgStore({
      dataDir: dir,
      defaultGroups: [group("门户管理员", { tables: ["全部数据表"] }), group("上报员", { menus: ["短剧投放账户上报"], menuEdits: ["短剧投放账户上报"] }), group("核对员", { menus: ["消耗对比"] }), group("访客")],
      defaultUserGroups: { 管理: "门户管理员", 上报员甲: "上报员", 核对员甲: "核对员", 访客甲: "访客" },
      accounts: ["管理", "上报员甲", "核对员甲", "访客甲"], tableNames: []
    });
    store = createReportBatchStore({ dataDir: dir, orgStore: org, now: () => clock });
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const acc = (accountId, media = "巨量") => ({ accountId, media });

  test("提交与查看权限：管理员 / 上报员能提交；核对员只能看；访客两者都不行", () => {
    assert.ok(store.submit("上报员甲", { accounts: [acc("20894517")] }).ok);
    assert.equal(store.submit("核对员甲", { accounts: [acc("20894517")] }).status, 403);
    assert.equal(store.submit("访客甲", { accounts: [acc("20894517")] }).status, 403);
    assert.equal(store.list("核对员甲").canSubmit, false);
    assert.equal(store.list("核对员甲").batches.length, 1);
    assert.equal(store.list("访客甲"), null);
    assert.equal(store.list("管理").canSubmit, true);
  });

  test("校验：账户 ID 格式、媒体取值、空批次、数量上限", () => {
    assert.match(store.submit("管理", { accounts: [acc("abc")] }).error, /6 位以上纯数字/);
    assert.match(store.submit("管理", { accounts: [acc("20894517", "抖音")] }).error, /不在支持的取值/);
    assert.equal(store.submit("管理", { accounts: [] }).status, 400);
    assert.equal(store.submit("管理", {}).status, 400);
    assert.match(store.submit("管理", { accounts: Array.from({ length: 5001 }, (_, i) => acc(String(100000 + i))) }).error, /最多 5000/);
  });

  test("重复账户按一条处理并记警告；媒体汇总；空媒体记未知；上报人与时间由服务端定", () => {
    const out = store.submit("上报员甲", { accounts: [acc("20894517"), acc("20894517"), acc("20894518", "广点通"), acc("20894519", "")], warnings: 1, submitter: "冒充", submittedAt: "2000-01-01" });
    assert.ok(out.ok);
    assert.deepEqual(out.batch.accountIds, ["20894517", "20894518", "20894519"]);
    assert.equal(out.batch.accounts, 3);
    assert.equal(out.batch.media, "巨量 / 广点通 / 未知");
    assert.equal(out.batch.checked, "通过（2 条警告）");
    assert.equal(out.batch.submitter, "上报员甲");
    assert.equal(out.batch.submittedAt, "2026-11-18 10:05");
  });

  test("批次号 DR+日期+当天第几批；只追加，列表最近的在前；落盘重开仍在", () => {
    assert.equal(store.submit("管理", { accounts: [acc("20894517")] }).batch.id, "DR20261118001");
    assert.equal(store.submit("管理", { accounts: [acc("20894518")] }).batch.id, "DR20261118002");
    clock = new Date("2026-11-19T09:00:00");
    assert.equal(store.submit("管理", { accounts: [acc("20894519")] }).batch.id, "DR20261119001");
    assert.deepEqual(store.list("管理").batches.map(batch => batch.id), ["DR20261119001", "DR20261118002", "DR20261118001"]);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "report-batches.json"), "utf8")).batches.length, 3);
  });
});

describe("上报批次（经网关）", () => {
  let harness;
  before(async () => { harness = await startHarness(); });
  after(async () => { await harness.stop(); });
  const as = async (name, method, route, body) => harness.call(method, route, { token: await harness.tokenFor(name), body });

  test("未登录 401；没有菜单权限 403；管理员提交后列表可见；权限组开通后普通用户可看 / 可提交", async () => {
    assert.equal((await harness.call("GET", "/v1/report-batches")).status, 401);
    assert.equal((await as("李雨航", "GET", "/v1/report-batches")).status, 403);
    assert.equal((await as("李雨航", "POST", "/v1/report-batches", { accounts: [{ accountId: "20894517", media: "巨量" }] })).status, 403);
    const submitted = await as("曾祥竞", "POST", "/v1/report-batches", { accounts: [{ accountId: "20894517", media: "巨量" }, { accountId: "20894518", media: "广点通" }] });
    assert.equal(submitted.status, 200);
    assert.match(submitted.data.batch.id, /^DR\d{8}001$/);
    assert.equal(submitted.data.batch.submitter, "曾祥竞");
    assert.equal((await as("曾祥竞", "POST", "/v1/report-batches", { accounts: [{ accountId: "x" }] })).status, 400);

    const full = (name, menus, tables = []) => ({ name, desc: "", menus, menuEdits: [], boards: [], tables, status: "启用" });
    const groups = [full("门户管理员", ["灵犀智析"], ["全部数据表"]), full("投放组长", ["灵犀智析"]), full("优化师", ["灵犀智析"]), full("数据分析师", ["灵犀智析", "消耗对比"]), full("只读访客", [])];
    assert.equal((await as("曾祥竞", "PUT", "/v1/org", { groups })).status, 200);
    const read = await as("李雨航", "GET", "/v1/report-batches");
    assert.equal(read.status, 200);
    assert.equal(read.data.canSubmit, false);
    assert.equal(read.data.batches.length, 1);
    assert.equal((await as("李雨航", "POST", "/v1/report-batches", { accounts: [{ accountId: "20894519" }] })).status, 403);
  });
});
