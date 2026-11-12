const { test } = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeSkillTables, resolveSkillTables } = require("../scripts/skill-tables.cjs");

const known = ["广告计划日报表", "权益-账号维度消耗统计表"];

test("空数组和缺省都合法", () => {
  assert.deepEqual(sanitizeSkillTables([], known), { ok: true, tables: [] });
});

test("去空、去重、去两端空白，保留顺序", () => {
  const result = sanitizeSkillTables([" 广告计划日报表 ", "广告计划日报表", "", "权益-账号维度消耗统计表"], known);
  assert.equal(result.ok, true);
  assert.deepEqual(result.tables, ["广告计划日报表", "权益-账号维度消耗统计表"]);
});

test("未知表名返回 400 信息且列出表名", () => {
  const result = sanitizeSkillTables(["广告计划日报表", "不存在的表"], known);
  assert.equal(result.ok, false);
  assert.match(result.error, /不存在的表/);
  assert.deepEqual(result.unknown, ["不存在的表"]);
});

test("超过 100 张被拒绝", () => {
  const result = sanitizeSkillTables(Array.from({ length: 101 }, (_, i) => `表${i}`), Array.from({ length: 101 }, (_, i) => `表${i}`));
  assert.equal(result.ok, false);
  assert.match(result.error, /100/);
});

test("不是数组被拒绝", () => {
  assert.equal(sanitizeSkillTables("广告计划日报表", known).ok, false);
});

test("resolveSkillTables：注册表覆盖优先于规范包，空数组也算已覆盖", () => {
  const pack = { spec: { tables: ["广告计划日报表"] } };
  assert.deepEqual(resolveSkillTables({ tables: ["权益-账号维度消耗统计表"] }, pack), ["权益-账号维度消耗统计表"]);
  assert.deepEqual(resolveSkillTables({ tables: [] }, pack), []);
  assert.deepEqual(resolveSkillTables({}, pack), ["广告计划日报表"]);
  assert.deepEqual(resolveSkillTables({}, null), []);
});
