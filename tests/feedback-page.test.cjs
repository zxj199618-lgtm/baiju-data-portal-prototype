const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "..", "assets/portal/page-ai-feedback.js"), "utf8");

test("AI 反馈页：详情里显示截图（带登录态取图，不直接用 img src 指向网关）和自动带上的上下文", () => {
  for (const needle of ['data-test="feedback-images"', 'data-test="feedback-context"', "/v1/feedback/images/", "URL.createObjectURL", "URL.revokeObjectURL", "最近对话", "引用的表", "思考档位", "浏览器", "页面"]) {
    assert.ok(source.includes(needle), "页面缺少：" + needle);
  }
  assert.ok(!/<img[^>]*:src="[^"]*analysisGatewayBase/.test(source), "图片不能用 <img src> 直连网关：跨域部署时不带登录令牌");
  assert.match(source, /async loadImages\(row\)/, "要有带登录态取图的方法");
  assert.match(source, /openDetail\(row\)\s*\{[^}]*loadImages\(row\)/, "打开详情时加载截图");
  assert.match(source, /closeDetail\(\)|@closed="/, "关闭详情时释放图片地址");
});

test("AI 反馈页：列表里标出带截图的反馈", () => {
  assert.ok(source.includes("截图 ") && source.includes("row.images"), "列表里要能看出哪些反馈带了截图");
});

test("AI 反馈页与 AI 对话记录：支持点击详情/问题查看完整上下文定位，反馈页支持直接跳转定位", () => {
  assert.ok(source.includes('data-test="feedback-jump-context"') && source.includes("auditContextFocus") && source.includes('setPage("访问记录")'));
  const chatLog = fs.readFileSync(path.join(__dirname, "..", "assets/portal/page-ai-chat-log.js"), "utf8");
  for (const needle of ['data-test="audit-question-link"', 'data-test="audit-detail-btn"', 'data-test="audit-context-dialog"', 'data-test="audit-target-msg"', "/v1/audit/context", "scrollToTarget", "consumeFocus"]) {
    assert.ok(chatLog.includes(needle), "page-ai-chat-log.js 缺少：" + needle);
  }
});
