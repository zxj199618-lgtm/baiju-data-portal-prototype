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
