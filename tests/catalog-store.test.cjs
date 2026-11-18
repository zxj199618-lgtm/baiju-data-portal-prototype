/**
 * 数据资产目录测试：读写权限、校验、版本冲突、密钥掩码，以及经网关的端到端。
 * 运行：node --test tests/catalog-store.test.cjs
 */
const { test, describe, beforeEach, afterEach, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createOrgStore } = require("../scripts/org-store.cjs");
const { createCatalogStore, MASK } = require("../scripts/catalog-store.cjs");
const { startHarness } = require("./helpers/gateway-harness.cjs");

const group = (name, extra = {}) => ({ name, tables: [], menus: ["表管理"], ...extra });
const asset = (table, extra = {}) => ({ assetId: `A_${table}`, database: "db", table, cnName: `${table}中文`, fields: [], ...extra });

describe("数据资产目录（单元）", () => {
  let dir, catalog;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-"));
    const org = createOrgStore({
      dataDir: dir,
      defaultGroups: [group("门户管理员", { tables: ["全部数据表"] }), group("表管理员", { menuEdits: ["表管理"] }), group("字典员", { menuEdits: ["字典管理"] }), group("访客")],
      defaultUserGroups: { 管理: "门户管理员", 表员: "表管理员", 字典员甲: "字典员", 访客甲: "访客" },
      accounts: ["管理", "表员", "字典员甲", "访客甲"], tableNames: []
    });
    catalog = createCatalogStore({ dataDir: dir, orgStore: org });
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("没保存过：saved=false，编辑权限按集合对应的菜单判断", () => {
    const view = name => catalog.view(name).collections;
    assert.equal(view("管理").assets.saved, false);
    assert.equal(view("管理").assets.canEdit, true);
    assert.equal(view("表员").assets.canEdit, true);
    assert.equal(view("表员").dictionaries.canEdit, false);
    assert.equal(view("字典员甲").dictionaries.canEdit, true);
    assert.equal(view("访客甲").assets.canEdit, false);
  });

  test("没有对应菜单编辑权限不能保存（403）", () => {
    assert.equal(catalog.save("访客甲", "assets", { items: [] }).status, 403);
    assert.equal(catalog.save("表员", "dictionaries", { items: [] }).status, 403);
    assert.equal(catalog.save("管理", "nope", { items: [] }).status, 404);
  });

  test("保存后读出一致，rev 递增，各集合互不影响", () => {
    assert.deepEqual(catalog.save("表员", "assets", { items: [asset("t1"), asset("t2")] }), { ok: true, rev: 1, issued: [] });
    assert.deepEqual(catalog.save("字典员甲", "dictionaries", { items: [{ dictId: "D1", code: "c", name: "字典" }] }), { ok: true, rev: 1, issued: [] });
    const view = catalog.view("访客甲").collections;
    assert.equal(view.assets.items.length, 2);
    assert.equal(view.dictionaries.items[0].name, "字典");
    assert.equal(view.tags.saved, false);
  });

  test("校验：必填、重复、数量、危险键、非对象", () => {
    assert.match(catalog.save("管理", "assets", { items: [{ table: "", cnName: "x" }] }).error, /不能为空/);
    assert.match(catalog.save("管理", "assets", { items: [asset("t"), asset("t")] }).error, /重复/);
    assert.match(catalog.save("管理", "assets", { items: ["x"] }).error, /不合法/);
    assert.match(catalog.save("管理", "assets", { items: [JSON.parse('{"table":"t","cnName":"c","__proto__":{"x":1}}')] }).error, /不合法/);
    assert.equal(catalog.save("管理", "assets", { items: "x" }).status, 400);
  });

  test("版本冲突：旧 rev 保存返回 409", () => {
    catalog.save("管理", "tags", { items: [{ name: "t", cn: "标签" }] });
    const stale = catalog.save("管理", "tags", { rev: 0, items: [] });
    assert.equal(stale.status, 409);
    assert.ok(catalog.save("管理", "tags", { rev: 1, items: [] }).ok);
  });

  test("菜单树：编号与权限标识全树唯一，层级与结构校验，需要「菜单管理」编辑权限", () => {
    const node = (id, permission, children = []) => ({ id, name: id, path: `/${id}`, permission, children });
    assert.equal(catalog.save("访客甲", "menus", { items: [] }).status, 403);
    assert.ok(catalog.save("管理", "menus", { items: [node("M1", "p1", [node("M11", "p11")]), node("M2", "p2")] }).ok);
    assert.match(catalog.save("管理", "menus", { items: [node("M1", "p1", [node("M1", "p2")])] }).error, /编号重复/);
    assert.match(catalog.save("管理", "menus", { items: [node("M1", "p1", [node("M2", "p1")])] }).error, /权限标识重复/);
    assert.match(catalog.save("管理", "menus", { items: [node("M1", "p1", [node("M2", "p2", [node("M3", "p3", [node("M4", "p4")])])])] }).error, /层级/);
    assert.match(catalog.save("管理", "menus", { items: [{ ...node("M1", "p1"), children: "x" }] }).error, /数组/);
  });

  test("开放 API：Token 由服务端签发，只返回一次，库里只存哈希；重置后旧 Token 失效；客户端传的 token 被忽略", () => {
    const org = createOrgStore({ dataDir: dir, defaultGroups: [group("门户管理员", { tables: ["全部数据表"] }), group("接口员", { menuEdits: ["数据开放平台"] }), group("访客")], defaultUserGroups: { 管理: "门户管理员", 接口员甲: "接口员", 访客甲: "访客" }, accounts: ["管理", "接口员甲", "访客甲"], tableNames: [] });
    const apis = createCatalogStore({ dataDir: dir, orgStore: org });
    const created = apis.save("接口员甲", "apis", { items: [{ name: "订单查询", tokenStatus: "启用", token: "bjgw_live_forged" }] });
    assert.ok(created.ok);
    assert.equal(created.issued.length, 1);
    const full = created.issued[0].token;
    assert.match(full, /^bjgw_live_.{20,}/);
    const read = apis.view("访客甲").collections.apis.items[0];
    assert.match(read.token, /^bjgw_live_.{3}\*{4}$|^bjgw_live_\S{0,6}\*{4}$/);
    assert.equal(read.tokenHash, undefined, "哈希不出服务端");
    assert.ok(read.apiId.startsWith("API_"), "服务端补稳定编号");
    assert.ok(!fs.readFileSync(path.join(dir, "catalog.json"), "utf8").includes(full), "库里不存完整 Token");
    assert.deepEqual(apis.findApiByToken(full), { apiId: read.apiId, name: "订单查询" });
    assert.equal(apis.findApiByToken("bjgw_live_forged"), null);
    // 改名、再次保存：沿用原 Token，不再签发
    const renamed = apis.save("接口员甲", "apis", { items: [{ ...read, name: "订单查询v2", token: "篡改" }] });
    assert.equal(renamed.issued.length, 0);
    assert.equal(apis.findApiByToken(full).name, "订单查询v2");
    // 重置：旧 Token 失效，新 Token 有效；没有权限的人不能重置
    assert.equal(apis.resetToken("访客甲", "apis", read.apiId).status, 403);
    const reset = apis.resetToken("接口员甲", "apis", read.apiId);
    assert.ok(reset.ok);
    assert.equal(apis.findApiByToken(full), null);
    assert.equal(apis.findApiByToken(reset.token).apiId, read.apiId);
    // 停用后 Token 不再有效
    apis.save("接口员甲", "apis", { items: [{ ...apis.view("管理").collections.apis.items[0], tokenStatus: "停用" }] });
    assert.equal(apis.findApiByToken(reset.token), null);
    assert.equal(apis.resetToken("管理", "apis", "不存在").status, 404);
  });

  test("推送目标的 sk 只存服务端：读出来是掩码，掩码交回表示不改，传新值才更新", () => {
    catalog.save("管理", "targets", { items: [{ name: "巨量", bucket: "b", sk: "real-secret" }] });
    const read = catalog.view("管理").collections.targets.items[0];
    assert.equal(read.sk, MASK);
    catalog.save("管理", "targets", { items: [{ ...read, bucket: "b2" }] });
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "catalog.json"), "utf8")).targets.items[0].sk, "real-secret");
    catalog.save("管理", "targets", { items: [{ name: "巨量", bucket: "b2", sk: "new-secret" }] });
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "catalog.json"), "utf8")).targets.items[0].sk, "new-secret");
  });
});

describe("数据资产目录（经网关）", () => {
  let harness;
  before(async () => { harness = await startHarness(); });
  after(async () => { await harness.stop(); });
  const as = async (name, method, route, body) => harness.call(method, route, { token: await harness.tokenFor(name), body });

  test("未登录 401；管理员保存后所有登录用户可读；无权限者 403；冲突 409", async () => {
    assert.equal((await harness.call("GET", "/v1/portal-data")).status, 401);
    const saved = await as("曾祥竞", "PUT", "/v1/portal-data/dictionaries", { items: [{ dictId: "D1", code: "c", name: "状态字典", items: [] }] });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.rev, 1);
    const read = await as("李雨航", "GET", "/v1/portal-data");
    assert.equal(read.data.collections.dictionaries.items[0].name, "状态字典");
    assert.equal(read.data.collections.dictionaries.canEdit, false);
    assert.equal((await as("李雨航", "PUT", "/v1/portal-data/dictionaries", { items: [] })).status, 403);
    assert.equal((await as("曾祥竞", "PUT", "/v1/portal-data/dictionaries", { rev: 0, items: [] })).status, 409);
    assert.equal((await as("曾祥竞", "PUT", "/v1/portal-data/nope", { items: [] })).status, 404);
  });
});
