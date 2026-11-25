const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const plain = value => JSON.parse(JSON.stringify(value));

function loadHelpers() {
  const context = { window: { PortalVue: {} } };
  vm.createContext(context);
  vm.runInContext(read("assets/portal/ai-chat-helpers.js"), context);
  vm.runInContext(read("assets/portal/ai-rich-view.js"), context);
  return context.window.PortalVue;
}

test("会话管理：支持关键词搜索、渠道筛选和置顶分组", () => {
  const { aiChatHelpers } = loadHelpers();
  const list = [
    { id: "1", title: "近 7 天消耗趋势", channel: "飞书机器人", status: "已完成", time: "2026-11-25 10:00", pinned: false, messages: [] },
    { id: "2", title: "CPA 归因分析", channel: "工作台对话", status: "已完成", time: "2026-11-24 10:00", pinned: true, messages: [] },
    { id: "3", title: "新的分析", channel: "工作台对话", status: "进行中", time: "2026-11-25 11:00", pinned: false, messages: [] }
  ];
  assert.deepEqual(plain(aiChatHelpers.filterSessions(list, { keyword: "cpa" }).map(s => s.id)), ["2"]);
  assert.deepEqual(plain(aiChatHelpers.filterSessions(list, { channel: "feishu" }).map(s => s.id)), ["1"]);
  const groups = plain(aiChatHelpers.groupSessionsWithPin(list, new Date("2026-11-25T12:00:00")));
  assert.deepEqual(groups.map(g => g.key), ["running", "pinned", "today"]);
  assert.equal(groups[1].label, "已置顶");
  assert.deepEqual(groups[1].items.map(s => s.id), ["2"]);
});

test("数字核验徽章与引用表提取：准确反映核验状态和引用列表", () => {
  const { aiChatHelpers } = loadHelpers();
  assert.equal(aiChatHelpers.formatVerification(null), null);
  assert.equal(aiChatHelpers.formatVerification({ checked: 0, grounded: 0, ungrounded: [] }), null);
  assert.deepEqual(plain(aiChatHelpers.formatVerification({ checked: 8, grounded: 8, ungrounded: [] })), {
    status: "ok", label: "8 项数据已核验", ungrounded: []
  });
  assert.deepEqual(plain(aiChatHelpers.formatVerification({ checked: 8, grounded: 6, ungrounded: ["12.3%", "50万"] })), {
    status: "warn", label: "2 项派生数字建议复核", ungrounded: ["12.3%", "50万"]
  });
  assert.deepEqual(
    plain(aiChatHelpers.extractMentionedTables("对比 @广告计划日报表 和 @渠道归因明细 的趋势，再看 @广告计划日报表", ["广告计划日报表", "渠道归因明细", "其他表"])),
    ["广告计划日报表", "渠道归因明细"]
  );
  assert.ok(aiChatHelpers.SLASH_COMMANDS.length >= 5);
});

test("富交互视图：数值解析、涨跌识别、CSV 导出、SVG 图表与大纲提取", () => {
  const { aiRichView } = loadHelpers();
  assert.equal(aiRichView.parseNumericValue("286.4万"), 2864000);
  assert.equal(aiRichView.parseNumericValue("1,234.5"), 1234.5);
  assert.equal(aiRichView.parseNumericValue("+12.3%"), 12.3);
  assert.equal(Number.isNaN(aiRichView.parseNumericValue("—")), true);
  assert.equal(aiRichView.trendKind("+12.3%"), "up");
  assert.equal(aiRichView.trendKind("-5.4%"), "down");
  assert.equal(aiRichView.trendKind("12.3%"), "");
  assert.equal(aiRichView.toCsv(["媒体", "消耗"], [["巨量", "100,000"]]), '媒体,消耗\n巨量,"100,000"');

  const chartHtml = aiRichView.renderChartBlock(JSON.stringify({
    type: "bar",
    title: "各媒体消耗对比",
    labels: ["巨量", "广点通", "快手"],
    series: [{ name: "消耗", values: [120000, 80000, 45000] }]
  }));
  assert.ok(chartHtml.includes('data-rich-chart="1"') && chartHtml.includes("<svg") && chartHtml.includes("各媒体消耗对比"));

  const outline = plain(aiRichView.extractOutline("# 总览\n正文\n## 趋势分析\n### 巨量渠道"));
  assert.deepEqual(outline.map(i => i.text), ["总览", "趋势分析", "巨量渠道"]);
});

test("工作台专业升级：停止生成、完整操作栏、分屏报告画布、表溯源抽屉、/ 指令均已接入", () => {
  const source = read("assets/portal/page-analysis-workbench.js");
  const uiKit = read("assets/portal/ai-ui.js");
  assert.ok(uiKit.includes('data-test="ai-stop-btn"') && uiKit.includes("is-stop"), "停止按钮应位于输入框右下角替代发送按钮");
  for (const needle of [
    'data-test="ai-session-search"',
    ':on-stop="abortGeneration"',
    'data-test="ai-copy-btn"',
    'data-test="ai-regen-btn"',
    'data-test="ai-to-report-btn"',
    'data-test="ai-verify-badge"',
    'data-test="ai-canvas-pane"',
    'data-test="ai-canvas-outline"',
    'data-test="ai-table-drawer"',
    'data-test="ai-slash-menu"',
    'data-test="ai-input-refs"',
    'data-test="ai-upload-btn"',
    "abortGeneration()",
    "openReportInCanvas(",
    "inspectTable(",
    "enhanceRichViews()"
  ]) {
    assert.ok(source.includes(needle), "page-analysis-workbench.js 缺少：" + needle);
  }
});
