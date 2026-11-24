const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createFeedbackStore, sanitizeContext } = require("../scripts/feedback-store.cjs");

test("上下文清洗：只留白名单字段，字符串和数组按上限截断，对话最多 6 条", () => {
  const out = sanitizeContext({
    question: "问".repeat(500), businessLine: "权益", model: "gpt", reasoning: "high", skill: "asset-qa", sessionId: "AN1", page: "#/analysis", userAgent: "UA".repeat(300), appVersion: "20261124e",
    viewport: "1440x900", elapsedSeconds: 8.64, tables: Array.from({ length: 30 }, (_, i) => `表${i}`.padEnd(100, "x")),
    conversation: Array.from({ length: 9 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", text: `第${i}条`.padEnd(500, "字") })),
    password: "不该出现", __proto__: { polluted: true }, evil: { nested: 1 }
  });
  assert.equal(out.question.length, 300);
  assert.equal(out.userAgent.length, 200);
  assert.equal(out.tables.length, 20);
  assert.ok(out.tables.every(name => name.length <= 60));
  assert.equal(out.conversation.length, 6, "对话只留最近 6 条");
  assert.equal(out.conversation[0].text.startsWith("第3条"), true, "留的是最后 6 条");
  assert.ok(out.conversation.every(item => item.text.length <= 300 && ["user", "assistant"].includes(item.role)));
  assert.equal(out.elapsedSeconds, 8.6);
  assert.equal(out.password, undefined);
  assert.equal(out.evil, undefined);
  assert.equal(out.polluted, undefined);
});

test("上下文清洗：不是对象或字段类型不对时给空值，不抛错", () => {
  assert.deepEqual(sanitizeContext(null), {});
  assert.deepEqual(sanitizeContext("x"), {});
  assert.deepEqual(sanitizeContext([1, 2]), {});
  const out = sanitizeContext({ question: 123, tables: "不是数组", conversation: [null, "x", { role: "system", text: "越权" }, { role: "user", text: 5 }], elapsedSeconds: "abc" });
  assert.equal(out.question, "");
  assert.deepEqual(out.tables, []);
  assert.deepEqual(out.conversation, [], "角色不是 user / assistant 或文字不是字符串的条目丢掉");
  assert.equal(out.elapsedSeconds, undefined);
});

test("反馈存储：踩时保存截图 id 和上下文；改评价时旧截图 id 被替换并返回待删除列表；赞不保留截图", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gxt-fb-"));
  try {
    const store = createFeedbackStore({ dataDir: dir });
    const a = "a".repeat(24) + ".png";
    const b = "b".repeat(24) + ".jpg";
    const first = store.set({ requestId: "r1", user: "甲", rating: "down", comment: "不对", images: [a, b, "../坏.png", 5], context: { question: "问", model: "m" } });
    assert.deepEqual(first.saved.images, [a, b], "只收合法的图片 id");
    assert.equal(first.saved.context.question, "问");
    assert.deepEqual(first.removedImages, []);
    const second = store.set({ requestId: "r1", user: "甲", rating: "up" });
    assert.deepEqual(second.saved.images, []);
    assert.deepEqual(second.removedImages.sort(), [a, b].sort(), "覆盖后旧截图要交给调用方删除");
    assert.equal(second.saved.context && Object.keys(second.saved.context).length, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
