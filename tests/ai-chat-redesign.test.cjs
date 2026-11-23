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
  const start = source.indexOf("template: `");
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
