/**
 * 审计日志查询接口：筛选、排序、条数上限、权限。
 * 运行：node --test tests/audit-api.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { startHarness } = require("./helpers/gateway-harness.cjs");

describe("审计日志查询", () => {
  let harness, admin;
  before(async () => {
    harness = await startHarness();
    admin = await harness.tokenFor("曾祥竞");
    for (const [name, question] of [["李雨航", "问题一"], ["李雨航", "问题二"], ["谭嘉颖", "问题三"]]) {
      await harness.call("POST", "/v1/analyze", { token: await harness.tokenFor(name), body: { question, scenario: "single", model: harness.MODEL, tables: ["广告计划日报表"], toolMode: false } });
    }
    await harness.call("PUT", "/v1/default-model", { token: admin, body: { model: harness.MODEL } });
  });
  after(async () => { await harness.stop(); });

  const query = async (params = "") => harness.call("GET", `/v1/audit${params}`, { token: admin });

  test("只有管理员能查询", async () => {
    assert.equal((await harness.call("GET", "/v1/audit", { token: await harness.tokenFor("李雨航") })).status, 403);
    assert.equal((await harness.call("GET", "/v1/audit")).status, 401);
  });

  test("按类型筛选，最近的在前，并统计各类型条数", async () => {
    const result = await query("?type=analysis");
    assert.equal(result.status, 200);
    assert.deepEqual(result.data.items.map(item => item.question), ["问题三", "问题二", "问题一"]);
    assert.ok(result.data.items.every(item => item.type === "analysis"));
    const all = await query();
    assert.equal(all.data.counts.analysis, 3);
    assert.equal(all.data.counts["default-model"], 1);
    assert.equal(all.data.matched, all.data.items.length);
  });

  test("按账号、状态筛选", async () => {
    assert.deepEqual((await query("?type=analysis&user=李雨航")).data.items.map(item => item.question), ["问题二", "问题一"]);
    assert.equal((await query("?type=analysis&status=error")).data.items.length, 0);
    assert.equal((await query("?type=analysis&status=ok")).data.items.length, 3);
  });

  test("limit 生效，并限制在 1–200", async () => {
    const one = await query("?type=analysis&limit=1");
    assert.equal(one.data.items.length, 1);
    assert.equal(one.data.matched, 3, "matched 是筛选命中的总数，不受 limit 影响");
    assert.equal((await query("?limit=0")).data.items.length >= 1, true, "非法 limit 回落到默认值而不是返回空");
  });

  test("工具调用记录没有 type 字段，接口统一归为 tool-call，可以筛选和统计", async () => {
    await harness.call("POST", "/v1/analyze", { token: await harness.tokenFor("曾祥竞"), body: { question: "有哪些表", scenario: "single", model: harness.MODEL, tables: [] } });
    harness.relay.toolScript = [{ calls: [{ id: "c1", type: "function", function: { name: "search_tables", arguments: "{}" } }] }];
    await harness.call("POST", "/v1/analyze", { token: await harness.tokenFor("曾祥竞"), body: { question: "有哪些表", scenario: "single", model: harness.MODEL, tables: [] } });
    const tools = await query("?type=tool-call");
    assert.ok(tools.data.items.length >= 1);
    assert.ok(tools.data.items.every(item => item.type === "tool-call" && item.tool));
    assert.ok((await query()).data.counts["tool-call"] >= 1);
  });

  test("日志变大时只读末尾：很长的日志也能返回最近的记录，被截断的第一行不会让解析失败", async () => {
    const file = path.join(harness.dataDir, "analysis-audit.jsonl");
    const filler = Array.from({ length: 6000 }, (_, index) => JSON.stringify({ type: "filler", user: "x", n: index, pad: "p".repeat(1000) })).join("\n") + "\n";
    fs.appendFileSync(file, filler);
    fs.appendFileSync(file, JSON.stringify({ type: "analysis", user: "李雨航", status: "ok", question: "最新的一条" }) + "\n");
    const result = await query("?type=analysis&limit=1");
    assert.equal(result.data.items[0].question, "最新的一条");
  });

  test("对话上下文详情接口：仅管理员可查，按 requestId 从历史中精准定位提问与模型输出", async () => {
    const userToken = await harness.tokenFor("李雨航");
    assert.equal((await harness.call("GET", "/v1/audit/context?requestId=req-1", { token: userToken })).status, 403);
    assert.equal((await harness.call("GET", "/v1/audit/context", { token: admin })).status, 400);

    await harness.call("PUT", "/v1/history", {
      token: userToken,
      body: {
        sessions: [{
          id: "S-CTX-1", title: "消耗异动排查", channel: "工作台对话", time: "2026-11-25 15:00",
          messages: [
            { role: "user", lines: ["第一轮问题"] },
            { role: "assistant", lines: ["第一轮回答"], requestId: "req-turn-1" },
            { role: "user", lines: ["第二轮追问：为什么 CPA 上涨？"] },
            { role: "assistant", lines: [], rawMarkdown: "## 结论\n巨量渠道拉高了整体 CPA。", html: "<h4>结论</h4><p>巨量渠道拉高了整体 CPA。</p>", requestId: "req-turn-2" }
          ]
        }],
        reports: []
      }
    });

    const ctx = await harness.call("GET", "/v1/audit/context?requestId=req-turn-2&user=%E6%9D%8E%E9%9B%A8%E8%88%AA", { token: admin });
    assert.equal(ctx.status, 200);
    assert.equal(ctx.data.found, true);
    assert.equal(ctx.data.source, "history");
    assert.equal(ctx.data.session.id, "S-CTX-1");
    assert.equal(ctx.data.messages.length, 4);
    assert.equal(ctx.data.messages[2].isTargetQuestion, true);
    assert.equal(ctx.data.messages[3].isTargetAnswer, true);
    assert.equal(ctx.data.targetIndex, 3);
    assert.ok(ctx.data.messages[3].markdown.includes("巨量渠道拉高了整体 CPA"));
  });
});
