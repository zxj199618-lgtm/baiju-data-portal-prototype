/**
 * Skill 配置保存规则（单元）+ 权限组新增规则：规则在服务端，绕过界面直接调接口也一样。
 * 运行：node --test tests/skill-rules.test.cjs
 */
const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { validateSkillConfig } = require("../scripts/skill-config.cjs");
const { createOrgStore } = require("../scripts/org-store.cjs");

const ctx = { skillIds: ["a", "b", "router"], accountNames: ["甲", "乙"] };
const entry = { id: "a", versions: [{ version: "v4", current: false }, { version: "v3", current: true }, { version: "v2" }, { version: "v1" }, { version: "v0" }] };
const keepAll = ["v4", "v3", "v2", "v1", "v0"].map(version => ({ version, current: version === "v3" }));

describe("Skill 配置保存规则", () => {
  test("字段类型与长度：文本、布尔、排序、对象；名称不能清空", () => {
    assert.equal(validateSkillConfig(entry, { title: 5 }, ctx).ok, false);
    assert.match(validateSkillConfig(entry, { title: "  " }, ctx).error, /名称/);
    assert.match(validateSkillConfig(entry, { prompt: "x".repeat(100001) }, ctx).error, /不能超过/);
    assert.match(validateSkillConfig(entry, { enabled: "yes" }, ctx).error, /布尔/);
    assert.match(validateSkillConfig(entry, { sort: "abc" }, ctx).error, /排序/);
    assert.match(validateSkillConfig(entry, { clarification: [] }, ctx).error, /对象/);
    const ok = validateSkillConfig(entry, { title: "新名称", enabled: false, sort: "12", prompt: "提示词" }, ctx);
    assert.deepEqual(ok.patch, { title: "新名称", enabled: false, sort: 12, prompt: "提示词" });
  });

  test("兜底 Skill 必须存在且不能是自己；灰度用户必须是已有账号", () => {
    assert.match(validateSkillConfig(entry, { fallbackSkillId: "a" }, ctx).error, /自己/);
    assert.match(validateSkillConfig(entry, { fallbackSkillId: "zzz" }, ctx).error, /不存在/);
    assert.ok(validateSkillConfig(entry, { fallbackSkillId: "b" }, ctx).ok);
    assert.match(validateSkillConfig(entry, { grayUsers: ["丙"] }, ctx).error, /不是已有账号/);
    assert.deepEqual(validateSkillConfig(entry, { grayUsers: ["甲", "甲", "乙"] }, ctx).patch.grayUsers, ["甲", "乙"]);
  });

  test("版本：号不重复、至多一个线上版本、线上版本必须在列表里", () => {
    const base = keepAll.map(item => ({ ...item }));
    assert.match(validateSkillConfig(entry, { versions: [...base, { version: "v1" }] }, ctx).error, /重复/);
    assert.match(validateSkillConfig(entry, { versions: base.map(item => ({ ...item, current: true })) }, ctx).error, /只能有一个线上版本/);
    assert.match(validateSkillConfig(entry, { versions: base, currentVersion: "v9" }, ctx).error, /不在版本列表/);
    const switched = validateSkillConfig(entry, { versions: base, currentVersion: "v4" }, ctx);
    assert.equal(switched.patch.version, "v4");
    assert.deepEqual(switched.patch.versions.filter(item => item.current).map(item => item.version), ["v4"]);
  });

  test("受保护版本不能删：线上版本和最近 3 个；更早的非线上版本可以删", () => {
    const without = names => keepAll.filter(item => !names.includes(item.version));
    assert.match(validateSkillConfig(entry, { versions: without(["v3"]) }, ctx).error, /不能删除/);
    assert.match(validateSkillConfig(entry, { versions: without(["v4"]) }, ctx).error, /不能删除/);
    assert.match(validateSkillConfig(entry, { versions: without(["v2"]) }, ctx).error, /不能删除/);
    assert.ok(validateSkillConfig(entry, { versions: without(["v1", "v0"]) }, ctx).ok);
  });

  test("新增一个版本（放在最前）不会触发保护", () => {
    const next = [{ version: "v5", current: false }, ...keepAll];
    assert.ok(validateSkillConfig(entry, { versions: next }, ctx).ok);
  });
});

describe("权限组：菜单与看板授权规则", () => {
  let dir, store, boardNames;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "org-rules-"));
    boardNames = new Set(["全部看板", "经营日报", "大盘"]);
    store = createOrgStore({
      dataDir: dir, defaultGroups: [{ name: "门户管理员", tables: ["全部数据表"] }, { name: "分析师", tables: [] }],
      defaultUserGroups: { 甲: "门户管理员", 乙: "分析师" }, accounts: ["甲", "乙"], tableNames: [], knownBoardGrants: () => boardNames
    });
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const admin = { name: "门户管理员", tables: ["全部数据表"], menus: ["灵犀智析"] };

  test("有编辑权限的菜单自动带上查看权限（管理员组不动）", () => {
    assert.ok(store.save({ groups: [{ ...admin, menuEdits: ["任意菜单"] }, { name: "分析师", tables: [], menus: ["数据看板"], menuEdits: ["数据看板", "表管理"] }] }).ok);
    const groups = store.effective().groups;
    assert.deepEqual(groups.find(group => group.name === "分析师").menus, ["数据看板", "表管理"]);
    assert.deepEqual(groups.find(group => group.name === "门户管理员").menus, ["灵犀智析"]);
  });

  test("看板授权只认存在的看板 / 分类 / 全部看板，其余自动清掉", () => {
    assert.ok(store.save({ groups: [admin, { name: "分析师", tables: [], menus: ["数据看板"], boards: ["经营日报", "大盘", "已删除的看板", "指定看板"] }] }).ok);
    assert.deepEqual(store.effective().groups.find(group => group.name === "分析师").boards, ["经营日报", "大盘"]);
  });
});
