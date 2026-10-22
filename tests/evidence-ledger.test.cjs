/**
 * 证据账本：保存、读取（仅限本人）、不存参考资料、容量与过期清理。
 * 运行：node --test tests/evidence-ledger.test.cjs
 */
const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createEvidenceLedger } = require("../scripts/evidence-ledger.cjs");

const ID = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("证据账本", () => {
  let dir, ledger;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-")); ledger = createEvidenceLedger({ dir, ttlDays: 14, maxFiles: 5 }); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const entry = (n, extra = {}) => ({
    requestId: ID(n), scope: "李雨航", user: "李雨航", question: "近 7 天消耗", model: "m", skill: "s", resolvedTerms: [{ term: "任哥", means: "部门口径" }],
    evidence: [{ 工具: "query_metric", 参数: "{}", 结果: { 近N天: 123 } }], answer: "消耗 123", ...extra
  });

  test("保存后本人能读到；别人（scope 不同）读不到，且不区分「不存在」与「不是你的」", () => {
    assert.equal(ledger.save(entry(1)), true);
    assert.equal(ledger.load(ID(1), "李雨航").evidence[0].结果.近N天, 123);
    assert.equal(ledger.load(ID(1), "谭嘉颖"), null);
    assert.equal(ledger.load(ID(99), "李雨航"), null);
  });

  test("演示模式下 scope 带访客 id：同一账号的不同访客互相看不到", () => {
    ledger.save(entry(2, { scope: "曾祥竞~abc12345" }));
    assert.ok(ledger.load(ID(2), "曾祥竞~abc12345"));
    assert.equal(ledger.load(ID(2), "曾祥竞~zzz99999"), null);
  });

  test("参考资料与追问不是事实：不保存；没有任何事实时不留账本", () => {
    ledger.save(entry(3, { evidence: [{ 工具: "read_reference", 结果: { 内容: "x".repeat(5000) } }, { 工具: "query_metric", 结果: { 近N天: 1 } }] }));
    assert.deepEqual(ledger.load(ID(3), "李雨航").evidence.map(item => item.工具), ["query_metric"]);
    assert.equal(ledger.save(entry(4, { evidence: [{ 工具: "ask_user", 结果: {} }] })), false);
    assert.equal(ledger.load(ID(4), "李雨航"), null);
  });

  test("requestId 必须是 uuid（防路径穿越）", () => {
    assert.equal(ledger.save(entry(5, { requestId: "../../etc/passwd" })), false);
    assert.equal(ledger.load("../../etc/passwd", "李雨航"), null);
  });

  test("单条超过大小上限时只保留前面的取数；回答摘要被截断并去掉代码块", () => {
    const big = Array.from({ length: 30 }, (_, i) => ({ 工具: "query_metric", 参数: String(i), 结果: { pad: "y".repeat(6000) } }));
    ledger.save(entry(6, { evidence: big, answer: "```ask\n{}\n```" + "a".repeat(5000) }));
    const saved = ledger.load(ID(6), "李雨航");
    assert.ok(saved.evidence.length > 3 && saved.evidence.length < 30, `保留了 ${saved.evidence.length} 次取数`);
    assert.equal(saved.evidence[0].参数, "0");
    assert.ok(saved.answer.length <= 1500 && !saved.answer.includes("ask"));
  });

  test("loadMany 按给定顺序读取、去重、跳过读不到的，并限制条数", () => {
    for (let n = 10; n < 16; n += 1) ledger.save(entry(n));
    const many = ledger.loadMany([ID(12), ID(11), ID(12), ID(77), ID(13), ID(14), ID(15)], "李雨航", 4);
    assert.deepEqual(many.map(item => item.requestId), [ID(12), ID(11), ID(13), ID(14)]);
  });

  test("清理：过期的删除；超过总数上限时删最旧的", () => {
    for (let n = 20; n < 28; n += 1) { ledger.save(entry(n)); fs.utimesSync(path.join(dir, `${ID(n)}.json`), new Date(Date.now() - (30 - n) * 1000), new Date(Date.now() - (30 - n) * 1000)); }
    ledger.save(entry(40)); fs.utimesSync(path.join(dir, `${ID(40)}.json`), new Date(Date.now() - 20 * 86400000), new Date(Date.now() - 20 * 86400000));
    ledger.prune();
    const left = fs.readdirSync(dir).filter(name => name.endsWith(".json"));
    assert.equal(left.length, 5, "总数不超过上限");
    assert.ok(!left.includes(`${ID(40)}.json`), "过期的被删除");
    assert.ok(left.includes(`${ID(27)}.json`), "最新的保留");
  });
});
