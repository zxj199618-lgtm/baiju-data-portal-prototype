const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const plain = value => JSON.parse(JSON.stringify(value));
function load() {
  const context = { window: { PortalVue: {} } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "assets/portal/ai-attachments.js"), "utf8"), context);
  return context.window.PortalVue.aiAttachments;
}
const file = (type, size = 10, name = "x") => ({ type, size, name });

test("缩放：长边超过 1600 等比缩小，不放大；宽高至少为 1", () => {
  const { scaleToFit } = load();
  assert.deepEqual(plain(scaleToFit(3200, 1600, 1600)), { width: 1600, height: 800 });
  assert.deepEqual(plain(scaleToFit(1200, 3000, 1600)), { width: 640, height: 1600 });
  assert.deepEqual(plain(scaleToFit(800, 600, 1600)), { width: 800, height: 600 }, "小图不放大");
  assert.deepEqual(plain(scaleToFit(10000, 1, 1600)), { width: 1600, height: 1 }, "极端长条图高度至少 1");
  assert.deepEqual(plain(scaleToFit(0, 0, 1600)), { width: 1, height: 1 });
});

test("挑图片：只收图片类型，不超过剩余名额，超出的数量单独返回；单个文件超过 20 MB 直接跳过", () => {
  const { pickImageFiles, MAX_IMAGES } = load();
  assert.equal(MAX_IMAGES, 3);
  const mixed = [file("image/png"), file("text/plain"), file("image/jpeg"), file("application/pdf"), file("image/webp"), file("image/gif")];
  const result = plain(pickImageFiles(mixed, 0));
  assert.deepEqual(result.accepted.map(item => item.type), ["image/png", "image/jpeg", "image/webp"]);
  assert.equal(result.overflow, 1, "第 4 张图（gif）超出名额");
  assert.deepEqual(plain(pickImageFiles([file("image/png")], 3)), { accepted: [], overflow: 1, tooBig: 0 });
  assert.equal(plain(pickImageFiles([file("image/png", 30 * 1024 * 1024)], 0)).tooBig, 1);
  assert.deepEqual(plain(pickImageFiles([], 0)), { accepted: [], overflow: 0, tooBig: 0 });
  assert.deepEqual(plain(pickImageFiles(null, 0)), { accepted: [], overflow: 0, tooBig: 0 });
});

test("从剪贴板 / 拖入的条目里取出图片文件，文字条目忽略", () => {
  const { filesFromClipboard } = load();
  const items = [
    { kind: "string", type: "text/plain", getAsFile: () => null },
    { kind: "file", type: "image/png", getAsFile: () => file("image/png", 5, "a") },
    { kind: "file", type: "application/zip", getAsFile: () => file("application/zip", 5, "b") },
    { kind: "file", type: "image/jpeg", getAsFile: () => null }
  ];
  assert.deepEqual(plain(filesFromClipboard({ items })).map(item => item.name), ["a"]);
  assert.deepEqual(plain(filesFromClipboard({ files: [file("image/png", 1, "z"), file("text/plain", 1, "t")] })).map(item => item.name), ["z"], "没有 items 时看 files");
  assert.deepEqual(plain(filesFromClipboard(null)), []);
  assert.deepEqual(plain(filesFromClipboard({})), []);
});

test("data URL 体积估算：按 base64 解码后的字节数", () => {
  const { dataUrlBytes } = load();
  assert.equal(dataUrlBytes("data:image/jpeg;base64,QUJD"), 3);
  assert.equal(dataUrlBytes("data:image/jpeg;base64,QUI="), 2);
  assert.equal(dataUrlBytes("data:image/jpeg;base64,QQ=="), 1);
  assert.equal(dataUrlBytes("不是 data url"), 0);
});

test("反馈上下文：问题取这条回答前面最近的用户消息，对话取最近 6 条，去掉图片和空消息；字段齐全", () => {
  const { buildFeedbackContext } = load();
  const messages = [
    { role: "user", lines: ["第一问"] }, { role: "assistant", html: "<p>第一答</p>" },
    { role: "user", lines: ["第二问"], images: ["data:.."] }, { role: "assistant", lines: [], html: "" },
    { role: "user", lines: ["第三问"] }, { role: "assistant", html: "<p>第三答 <b>加粗</b></p>", reasoning: "不该进上下文" },
    { role: "user", lines: ["第四问"] }, { role: "assistant", html: "<p>第四答</p>" }
  ];
  const ctx = plain(buildFeedbackContext({
    messages, index: 5, businessLine: "权益", tables: ["表A", "表B"], model: "gpt-x", reasoning: "high", skill: "asset-qa",
    sessionId: "AN1", page: "#/analysis", userAgent: "UA", appVersion: "20261124e", viewport: "1440x900", elapsedSeconds: 8.6,
    textOf: msg => (msg.html ? msg.html.replace(/<[^>]+>/g, "") : (msg.lines || []).join("\n"))
  }));
  assert.equal(ctx.question, "第三问", "问题 = 这条回答前面最近的用户消息");
  assert.deepEqual(ctx.conversation.map(item => item.text), ["第一问", "第一答", "第二问", "第三问", "第三答 加粗"], "空消息被去掉，且只到这条回答为止（含）");
  assert.equal(ctx.conversation.length <= 6, true);
  assert.deepEqual([ctx.businessLine, ctx.model, ctx.reasoning, ctx.skill, ctx.sessionId, ctx.page, ctx.appVersion, ctx.viewport, ctx.elapsedSeconds], ["权益", "gpt-x", "high", "asset-qa", "AN1", "#/analysis", "20261124e", "1440x900", 8.6]);
  assert.deepEqual(ctx.tables, ["表A", "表B"]);
  assert.ok(!JSON.stringify(ctx).includes("不该进上下文"), "思考过程不带进上下文");
});
