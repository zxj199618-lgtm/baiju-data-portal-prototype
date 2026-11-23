const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
/** vm 里创建的数组原型和本文件不同，deepStrictEqual 会失败，先转成普通对象 */
const plain = value => JSON.parse(JSON.stringify(value));
function load() {
  const context = { window: { PortalVue: {} } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "assets/portal/ai-capabilities.js"), "utf8"), context);
  return context.window.PortalVue.aiCapabilities;
}

test("Skill 列表还没加载（null）时，所有能力卡片都显示", () => {
  const { list, visibleCapabilities } = load();
  assert.equal(visibleCapabilities(list, null).length, list.length);
});

test("Skill 下线后对应卡片隐藏，不依赖 Skill 的能力保留，空组不再返回", () => {
  const { list, visibleCapabilities, groupCapabilities } = load();
  const shown = visibleCapabilities(list, ["asset", "lineage"]);
  assert.ok(!shown.some(item => item.skillKey === "data-query" || item.skillKey === "attribution"));
  assert.ok(shown.some(item => item.group === "need"));
  assert.ok(shown.some(item => item.group === "cannot"));
  const groups = groupCapabilities(visibleCapabilities(list, []));
  assert.deepEqual(plain(groups.map(group => group.key)), ["need", "cannot"], "没有任何 Skill 在线时，「直接能做」整组不显示");
  assert.ok(groups.every(group => group.items.length > 0));
});

test("groupCapabilities 按 直接能做 / 要你补充信息 / 暂时做不了 的顺序分组", () => {
  const { list, groupCapabilities, GROUPS } = load();
  assert.deepEqual(plain(GROUPS.map(group => group.label)), ["直接能做", "要你补充信息", "暂时做不了"]);
  assert.deepEqual(plain(groupCapabilities(list).map(group => group.key)), ["can", "need", "cannot"]);
});

test("试一试：输入框为空时直接填入，有草稿时追加到新的一行，不丢草稿", () => {
  const { mergeDraft } = load();
  assert.equal(mergeDraft("", "A"), "A");
  assert.equal(mergeDraft("  \n", "A"), "A");
  assert.equal(mergeDraft("已有内容\n", "A"), "已有内容\nA");
  assert.equal(mergeDraft("已有内容", "A"), "已有内容\nA");
});

test("能力数据结构完整：字段齐全、id 不重复、每项 3 步图文、4 个直接能做对应 4 个 Skill", () => {
  const { list } = load();
  assert.equal(new Set(list.map(item => item.id)).size, list.length);
  for (const item of list) {
    for (const field of ["id", "group", "title", "summary", "example", "boundary"]) assert.ok(item[field], `${item.id} 缺少 ${field}`);
    assert.ok(["can", "need", "cannot"].includes(item.group), item.id);
    assert.equal(item.steps.length, 3, `${item.id} 应有 3 步图文`);
    for (const step of item.steps) assert.ok(step.image && step.text, `${item.id} 的图文步骤不完整`);
  }
  assert.deepEqual(plain(list.filter(item => item.group === "can").map(item => item.skillKey).sort()), ["asset", "attribution", "data-query", "lineage"]);
});

test("图文示意图：每个步骤的图片都存在，且是有效的 SVG", () => {
  const { list } = load();
  for (const item of list) {
    for (const step of item.steps) {
      const file = path.join(root, step.image);
      assert.ok(fs.existsSync(file), "缺少示意图：" + step.image);
      const svg = fs.readFileSync(file, "utf8");
      assert.match(svg, /^<svg[^>]+viewBox="0 0 640 360"/, step.image + " 应是 640×360 的 SVG");
      assert.ok(svg.trim().endsWith("</svg>"), step.image + " 没有闭合");
    }
  }
});
