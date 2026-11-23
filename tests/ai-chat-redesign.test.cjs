const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const exists = relative => fs.existsSync(path.join(root, relative));

test("新样式文件已接入页面和单文件构建", () => {
  const html = read("index.html");
  assert.ok(exists("assets/portal-ai-chat.css"), "缺少 assets/portal-ai-chat.css");
  const chat = html.indexOf("assets/portal-ai-chat.css");
  const lanhu = html.indexOf("assets/portal-lanhu-theme.css");
  assert.ok(chat > -1 && lanhu > -1 && chat > lanhu, "新样式文件必须在 portal-lanhu-theme.css 之后加载");
  assert.ok(read("scripts/build-standalone.cjs").includes("assets/portal-ai-chat.css"), "单文件构建需要内联新样式文件");
});

const workbench = () => {
  const source = read("assets/portal/page-analysis-workbench.js");
  const start = source.indexOf("const BASIS_TPL");
  const end = source.indexOf("data:()=>({");
  assert.ok(start > -1 && end > start, "找不到工作台模板");
  return source.slice(start, end);
};

test("布局：模板里没有 emoji，关键入口与 data-test 保持不变", () => {
  const template = workbench();
  assert.equal(template.match(/\p{Extended_Pictographic}/gu), null, "模板里不应再有 emoji：" + (template.match(/\p{Extended_Pictographic}/gu) || []).join(""));
  for (const needle of ["＋ 新的分析", 'data-test="ai-line-select"', 'data-test="model-chip"', 'class="portal-vue-ai-model-chip"', "ai-composer-card"]) {
    assert.ok(template.includes(needle), "模板缺少：" + needle);
  }
});

test("布局：会话栏收窄、对话列居中、输入卡片有样式", () => {
  const css = read("assets/portal-ai-chat.css");
  assert.match(css, /\.portal-vue-ai-layout\s*\{[^}]*grid-template-columns:\s*168px/);
  assert.match(css, /\.ai-composer-card/);
  assert.match(css, /max-width:\s*760px/);
});

test("消息：依据收成一行，原有功能与 data-test 保留", () => {
  const template = workbench();
  assert.ok(template.includes('v-if="basisSummary(msg)"'), "依据折叠区必须由 basisSummary(msg) 控制，没有依据的历史 / 飞书消息不渲染空壳");
  assert.ok(template.includes("msg.basisOpen"), "缺少展开状态 msg.basisOpen");
  for (const needle of ['data-test="ai-plan"', 'data-test="plan-change"', 'data-test="plan-to-report"', 'data-test="ai-scope"', 'data-test="ai-basis-toggle"', 'data-test="ai-followups"', 'data-test="ai-followup"', "rateMessage(msg, 'up')", "rateMessage(msg, 'down')"]) {
    assert.ok(template.includes(needle), "模板缺少：" + needle);
  }
  assert.ok(template.includes('v-if="msg.requestId && !msg.streaming" class="portal-vue-ai-feedback"'), "反馈按钮仍只在有 requestId 且生成完成后出现");
  assert.equal(template.split('data-test="ai-plan"').length - 1, 1, "ai-plan 只在共用的 BASIS_TPL 里定义一次");
  assert.equal(template.split("${BASIS_TPL}").length - 1, 2, "报告类与回答类消息都要引用 BASIS_TPL");
});

test("消息：助手回答无气泡背景，用户气泡无渐变", () => {
  const css = read("assets/portal-ai-chat.css");
  const block = selector => {
    const match = css.match(new RegExp(selector.replace(/[.]/g, "\\.") + "\\s*\\{([^}]*)\\}"));
    assert.ok(match, "缺少样式：" + selector);
    return match[1];
  };
  assert.match(block(".portal-vue-ai-message.assistant .portal-vue-ai-bubble"), /background:\s*transparent/);
  assert.doesNotMatch(block(".portal-vue-ai-message.user .portal-vue-ai-bubble"), /gradient/);
});
