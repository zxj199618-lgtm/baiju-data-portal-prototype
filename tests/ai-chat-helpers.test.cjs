const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const plain = value => JSON.parse(JSON.stringify(value));
function load() {
  const context = { window: { PortalVue: {} } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "assets/portal/ai-chat-helpers.js"), "utf8"), context);
  return context.window.PortalVue.aiChatHelpers;
}

const NOW = new Date(2026, 10, 23, 15, 0); // 2026-11-23 15:00
const session = (id, time, status = "已完成") => ({ id, time, status });

test("会话按「进行中 / 今天 / 昨天 / 近 7 天 / 更早」分组，组内保持原顺序，空组不返回", () => {
  const { groupSessions } = load();
  const groups = plain(groupSessions([
    session("a", "2026-11-23 14:50", "进行中"),
    session("b", "2026-11-23 09:00"),
    session("c", "2026-11-22 23:00"),
    session("d", "2026-11-20 10:00"),
    session("e", "2026-11-23 08:00"),
    session("f", "2026-08-31 10:24")
  ], NOW));
  assert.deepEqual(groups.map(group => group.key), ["running", "today", "yesterday", "week", "older"]);
  assert.deepEqual(groups.map(group => group.label), ["进行中", "今天", "昨天", "近 7 天", "更早"]);
  assert.deepEqual(groups.find(group => group.key === "today").items.map(item => item.id), ["b", "e"]);
});

test("时间无法解析的会话归到「更早」，不会丢失；没有任何会话时返回空数组", () => {
  const { groupSessions } = load();
  assert.deepEqual(plain(groupSessions([session("x", "")], NOW)).map(group => group.key), ["older"]);
  assert.deepEqual(plain(groupSessions([], NOW)), []);
});
