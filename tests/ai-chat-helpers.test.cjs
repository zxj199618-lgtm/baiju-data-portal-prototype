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

const metaItemsStub = line => {
  const out = [];
  String(line || "").split(" · ").forEach(part => {
    const m = part.match(/^引用表\s+(.+)$/);
    if (m) out.push({ k: "引用表", list: m[1].split("、") });
    else if (/^耗时/.test(part)) out.push({ k: "耗时", v: part.replace(/^耗时\s*/, "") });
  });
  return out;
};

test("Trace 行：生成中只有一行「正在思考…」（running），没有别的行", () => {
  const { buildTraceRows } = load();
  const rows = plain(buildTraceRows({ role: "assistant", streaming: true, reasoning: "先看看表结构" }, metaItemsStub));
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].key, rows[0].status, rows[0].title], ["reasoning", "running", "正在思考…"]);
});

test("Trace 行：完成后按 思考 → 技能 → 查表 → 口径 → 运行详情 的顺序，标题写成完整句子", () => {
  const { buildTraceRows } = load();
  const rows = plain(buildTraceRows({
    role: "assistant", html: "<p>x</p>", reasoning: "一二三四五",
    plan: { source: "auto", skillName: "数据查询与指标解答", output: "answer" },
    resolved: [{ term: "消耗", means: "广告消耗" }],
    meta: "数据查询 · 引用表 广告计划日报表、广告账户日报 · 耗时 6.2s"
  }, metaItemsStub));
  assert.deepEqual(rows.map(row => row.key), ["reasoning", "skill", "sources", "scope", "details"]);
  assert.equal(rows[0].title, "思考过程");
  assert.equal(rows[0].desc, "5 字");
  assert.equal(rows[1].title, "已使用「数据查询与指标解答」");
  assert.equal(rows[1].desc, "回答");
  assert.equal(rows[2].title, "查了 2 张表");
  assert.deepEqual(rows[2].tables, ["广告计划日报表", "广告账户日报"]);
  assert.equal(rows[3].title, "按你的口径理解了 1 个词");
  assert.equal(rows[4].title, "运行详情");
});

test("Trace 行：历史会话、飞书来源这类没有任何过程信息的旧消息不生成任何行；手动选的技能不显示技能行", () => {
  const { buildTraceRows } = load();
  assert.deepEqual(plain(buildTraceRows({ role: "assistant", lines: ["这是一条旧消息"] }, metaItemsStub)), []);
  const rows = plain(buildTraceRows({ role: "assistant", html: "x", plan: { source: "manual", skillName: "单表分析" } }, metaItemsStub));
  assert.ok(!rows.some(row => row.key === "skill"));
});
