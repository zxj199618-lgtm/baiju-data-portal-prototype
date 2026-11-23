const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const plain = value => JSON.parse(JSON.stringify(value));
function load() {
  const context = { window: { PortalVue: {} } };
  vm.createContext(context);
  vm.runInContext(read("assets/portal/ai-ui.js"), context);
  return context.window.PortalVue.aiUi;
}

test("组件库导出 shadcn 对应的 10 个组件和图标函数", () => {
  const ui = load();
  assert.deepEqual(Object.keys(ui.components).sort(), ["AiBubble", "AiButton", "AiEmpty", "AiMarker", "AiMessage", "AiPromptInput", "AiQuestionnaire", "AiTrace", "AiTraceCollapsible", "AiTraceLine"]);
  assert.match(ui.icon("check"), /^<svg[^>]+aria-hidden="true"><path d="M5 12\.5/);
  assert.match(ui.icon("不存在的图标"), /<path d=""\/>/, "未知图标返回空 path，不能抛错");
});

test("问卷：回答 = 已选项 + 去空白后的自定义输入；没有 draft 时为空", () => {
  const { questionnaire } = load();
  const q = { key: "line", multiple: false };
  const ask = { draft: { line: { picked: ["权益"], custom: "  " } } };
  assert.deepEqual(plain(questionnaire.answerOf(ask, q)), ["权益"]);
  ask.draft.line.custom = " 保险 ";
  assert.deepEqual(plain(questionnaire.answerOf(ask, q)), ["权益", "保险"]);
  assert.deepEqual(plain(questionnaire.answerOf({ draft: {} }, q)), []);
  assert.deepEqual(plain(questionnaire.answerOf({}, q)), []);
});

test("问卷：已回答题数、上一题 / 下一题下标不越界、选项 A B C 标记", () => {
  const { questionnaire } = load();
  const ask = { questions: [{ key: "a" }, { key: "b" }, { key: "c" }], draft: { a: { picked: ["x"], custom: "" }, b: { picked: [], custom: "" }, c: { picked: [], custom: "自填" } } };
  assert.equal(questionnaire.answeredCount(ask), 2);
  assert.equal(questionnaire.clampStep(5, 3), 2);
  assert.equal(questionnaire.clampStep(-1, 3), 0);
  assert.equal(questionnaire.clampStep(0, 0), 0);
  assert.deepEqual([0, 1, 25, 26, -1].map(questionnaire.optionKey), ["A", "B", "Z", "", ""]);
});

test("组件模板：Trace 用 Element Plus 的展开动画并带 aria-expanded；Marker 是 status；问卷保留旧类名", () => {
  const source = read("assets/portal/ai-ui.js");
  for (const needle of ["<el-collapse-transition>", ':aria-expanded="open"', 'role="status"', "portal-vue-ai-ask-q", "portal-vue-ai-ask-option", "<el-input", 'aria-label="发送"', 'data-variant="variant"']) {
    assert.ok(source.includes(needle), "ai-ui.js 缺少：" + needle);
  }
});

test("页面已全量换用组件库：消息、Trace、Marker、问卷、欢迎、输入框都是 ai-* 组件", () => {
  const source = read("assets/portal/page-analysis-workbench.js");
  const template = source.slice(source.indexOf("template: `"), source.indexOf("data:()=>({"));
  for (const tag of ["<ai-trace", "<ai-trace-collapsible", "<ai-marker", "<ai-message", "<ai-bubble", "<ai-empty", "<ai-questionnaire", "<ai-prompt-input", "<ai-button"]) {
    assert.ok(template.includes(tag), "页面模板缺少组件：" + tag);
  }
  for (const gone of ['class="portal-vue-ai-ask-head"', 'class="portal-vue-ai-context-reset"', 'class="ai-trace-row"', 'class="portal-vue-ai-composer ai-composer-card"', "portal-vue-ai-avatar", "portal-vue-ai-welcome-tips"]) {
    assert.ok(!template.includes(gone), "旧的手写结构应已删除：" + gone);
  }
  assert.match(source, /components:\s*aiUi\.components/, "工作台要注册组件库");
  assert.match(source, /icon:\s*aiUi\.icon/, "图标函数来自组件库");
  assert.ok(!source.includes("const AI_ICON_PATHS"), "图标表已搬进组件库");
});
