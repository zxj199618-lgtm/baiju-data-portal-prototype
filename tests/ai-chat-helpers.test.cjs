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

test("预计时长：取最近若干次耗时的中位数，没有记录时返回 null，异常值不计入、结果限制在 3–300 秒", () => {
  const { estimateSeconds } = load();
  assert.equal(estimateSeconds([]), null);
  assert.equal(estimateSeconds(undefined), null);
  assert.equal(estimateSeconds([10, 20, 30]), 20);
  assert.equal(estimateSeconds([10, 20, 30, 40]), 25);
  assert.equal(estimateSeconds([0, -5, "x", NaN, 12]), 12, "非正数和非数字不计入");
  assert.equal(estimateSeconds([1]), 3, "最少 3 秒");
  assert.equal(estimateSeconds([900]), 300, "最多 300 秒");
  assert.equal(estimateSeconds([1000, 1000, 1000, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8]), 8, "只看最近 10 次");
});

test("预计时长：记录最近 10 次，非法值不写入", () => {
  const { pushDuration } = load();
  assert.deepEqual(plain(pushDuration([], 8.64)), [8.6]);
  assert.deepEqual(plain(pushDuration([1, 2], 0)), [1, 2]);
  assert.deepEqual(plain(pushDuration([1, 2], NaN)), [1, 2]);
  const full = Array.from({ length: 10 }, (_, i) => i + 5);
  assert.deepEqual(plain(pushDuration(full, 99)), [6, 7, 8, 9, 10, 11, 12, 13, 14, 99]);
});

test("预计时长：文案——有历史显示「预计约 N 秒」，没有历史显示范围，超时提示「比平常久一点」，超过 1 分钟用分秒", () => {
  const { formatEta, formatDuration } = load();
  assert.equal(formatDuration(8), "8 秒");
  assert.equal(formatDuration(60), "1 分钟");
  assert.equal(formatDuration(65), "1 分 5 秒");
  assert.equal(formatEta(5, 12), "已用 5 秒 · 预计约 12 秒");
  assert.equal(formatEta(0, 12), "已用 0 秒 · 预计约 12 秒");
  assert.equal(formatEta(-3, 12), "已用 0 秒 · 预计约 12 秒", "时钟回拨不出现负数");
  assert.equal(formatEta(5, null), "已用 5 秒 · 预计 10–30 秒");
  assert.equal(formatEta(40, 12), "已用 40 秒 · 比平常久一点，还在处理");
  assert.equal(formatEta(50, null), "已用 50 秒 · 比平常久一点，还在处理");
});

test("引用的 skill：来自 plan 和 skillId，去重；生成中和旧消息不返回", () => {
  const { skillsUsed } = load();
  assert.deepEqual(plain(skillsUsed({ role: "assistant", html: "x", plan: { skillId: "asset-qa", skillName: "数据资产问答" } })), [{ id: "asset-qa", name: "数据资产问答" }]);
  assert.deepEqual(plain(skillsUsed({ role: "assistant", html: "x", skillId: "lineage-analyst" })), [{ id: "lineage-analyst", name: "" }]);
  assert.deepEqual(plain(skillsUsed({ role: "assistant", html: "x", skillId: "asset-qa", plan: { skillId: "asset-qa", skillName: "数据资产问答" } })).length, 1, "同一个 skill 只出现一次");
  assert.deepEqual(plain(skillsUsed({ role: "assistant", streaming: true, html: "x", skillId: "asset-qa" })), [], "生成中不显示");
  assert.deepEqual(plain(skillsUsed({ role: "assistant", lines: ["旧消息"] })), []);
  assert.deepEqual(plain(skillsUsed({ role: "user", lines: ["问"] })), []);
});

test("buildTraceRows：生成中的思考行可带预计时长文案", () => {
  const { buildTraceRows } = load();
  const rows = plain(buildTraceRows({ role: "assistant", streaming: true, reasoning: "x" }, () => [], "已用 5 秒 · 预计约 12 秒"));
  assert.equal(rows[0].desc, "已用 5 秒 · 预计约 12 秒");
  const done = plain(buildTraceRows({ role: "assistant", html: "x", reasoning: "一二三" }, () => [], "不该出现"));
  assert.equal(done[0].desc, "3 字");
});
