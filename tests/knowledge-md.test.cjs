const { test } = require("node:test");
const assert = require("node:assert/strict");
const md = require("../assets/portal/knowledge-md.js");

test("渲染：标题降一级、加粗、行内代码、https 链接；<script> 被转义", () => {
  const html = md.renderKnowledgeMarkdown("# 标题\n\n**粗** 和 `code` 与 [链接](https://example.com)\n\n<script>alert(1)</script>");
  assert.match(html, /<h2>标题<\/h2>/);
  assert.match(html, /<strong>粗<\/strong>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<a href="https:\/\/example.com" target="_blank" rel="noopener">链接<\/a>/);
  assert.ok(!html.includes("<script>"));
  assert.match(html, /&lt;script&gt;/);
});

test("规范化：「【标题】」「一、标题」「键：值」转成二级标题与列表项；代码块内容保持原样", () => {
  const out = md.normalizeToMarkdown("【业务概述】\n一、口径\n用途：投放\n```\n【不变】\n一、不变\n```");
  assert.match(out, /^## 业务概述$/m);
  assert.match(out, /^## 口径$/m);
  assert.match(out, /^- 用途：投放$/m);
  assert.match(out, /^【不变】$/m);
  assert.match(out, /^一、不变$/m);
});

test("businessLineTemplate 含 业务概述 / 术语与口径 / 核心指标 / 表地图 / 常见分析套路 / 注意事项 六个二级标题", () => {
  const t = md.businessLineTemplate("保险");
  assert.match(t, /^# 保险$/m);
  for (const h of ["业务概述", "术语与口径", "核心指标", "表地图", "常见分析套路", "注意事项"]) assert.match(t, new RegExp(`^## ${h}$`, "m"));
  assert.equal(typeof md.knowledgeTemplate("x"), "string");
  assert.equal(typeof md.knowledgeNow(), "string");
});
