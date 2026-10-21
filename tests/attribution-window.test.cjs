/**
 * 归因窗口：从问题解析「近 N 天」，证据工具以数据最新日期为锚点，内置工具脚本随代码刷新。
 * 运行：node --test tests/attribution-window.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { parseWindowDays } = require("../scripts/attribution-calc.cjs");
const { startHarness } = require("./helpers/gateway-harness.cjs");

describe("解析问题里的窗口（单元）", () => {
  const cases = [
    ["近 7 天消耗怎么样", 7], ["近14天", 14], ["最近两周的 CPA", 14], ["过去 30 日", 30], ["近一个月", 30],
    ["近十四天", 14], ["近二十一天", 21], ["近三个月", 90], ["近 999 天", 90],
    ["近 0 天", 7], ["消耗为什么涨", 7], ["昨天和前天对比", 7]
  ];
  for (const [question, days] of cases) test(`「${question}」→ ${days} 天`, () => assert.equal(parseWindowDays(question), days));
});

describe("经网关", () => {
  let harness;
  before(async () => {
    harness = await startHarness({
      // 预置一份过期的内置工具脚本：启动后应被代码里的版本覆盖
      prepare: dir => {
        const toolDir = path.join(dir, "skills", "warehouse-analyst", "tools");
        fs.mkdirSync(toolDir, { recursive: true });
        fs.writeFileSync(path.join(dir, "skills", "warehouse-analyst", "skill.json"), JSON.stringify({ id: "warehouse-analyst", name: "旧", tools: [{ name: "evidence", cmd: "node tools/evidence.cjs" }] }));
        fs.writeFileSync(path.join(toolDir, "evidence.cjs"), "// 过期的脚本");
      }
    });
  });
  after(async () => { await harness.stop(); });

  test("问题里的「近 14 天」进入归因计算的窗口（默认是 7 天）", async () => {
    harness.relay.requests.length = 0;
    await harness.call("POST", "/v1/analyze", { token: await harness.tokenFor("曾祥竞"), body: { question: "近 14 天消耗为什么变化？", scenario: "attribution", model: harness.MODEL, tables: ["广告计划日报表"], toolMode: false } });
    const prompt = harness.relay.requests.at(-1).messages.find(message => message.role === "user").content;
    assert.match(prompt, /"start": "2026-08-18"/, "14 天窗口：锚点 8-31 往前 13 天 = 8-18");
    assert.match(prompt, /"start": "2026-08-04"/, "前 14 天窗口的起点");

    harness.relay.requests.length = 0;
    await harness.call("POST", "/v1/analyze", { token: await harness.tokenFor("曾祥竞"), body: { question: "消耗为什么变化？", scenario: "attribution", model: harness.MODEL, tables: ["广告计划日报表"], toolMode: false } });
    assert.match(harness.relay.requests.at(-1).messages.find(message => message.role === "user").content, /"start": "2026-08-25"/, "没写窗口时仍是 7 天");
  });

  test("过期的内置工具脚本在启动时被代码里的版本覆盖，且不再写死日期", () => {
    const tool = fs.readFileSync(path.join(harness.dataDir, "skills", "warehouse-analyst", "tools", "evidence.cjs"), "utf8");
    assert.doesNotMatch(tool, /过期的脚本/);
    assert.doesNotMatch(tool, /Date\.UTC\(2026, 7, 31\)/);
    assert.match(tool, /anchorDay/);
  });

  test("证据工具以表里最新日期为锚点：数据换到 2027 年，环比窗口跟着走（写死 2026-08-31 时前 7 天会是 0）", () => {
    // 用网关正常生成的内置 Skill（归因）里的同一份通用证据脚本
    const toolFile = path.join(harness.dataDir, "skills", "attribution-analyst", "tools", "evidence.cjs");
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-anchor-"));
    try {
      const rows = [];
      for (let offset = 0; offset < 16; offset += 1) {
        const day = new Date(Date.parse("2027-03-31T00:00:00Z") - offset * 86400000).toISOString().slice(0, 10);
        rows.push({ stat_date: day, media_source: "巨量", plan_name: "P", account_name: "a", product_name: "x", cost: 100, activate_cnt: 10 });
      }
      fs.writeFileSync(path.join(scratch, "sample-data.json"), JSON.stringify({ tables: { 广告计划日报表: rows } }));
      const output = execFileSync(process.execPath, [toolFile], { input: JSON.stringify({ tables: ["广告计划日报表"] }), env: { PATH: process.env.PATH, GATEWAY_DATA_DIR: scratch }, cwd: path.dirname(path.dirname(toolFile)) });
      const group = JSON.parse(output.toString()).evidence[0].media_source分组[0];
      assert.ok(group.前7天 > 0, `前 7 天应有数据，实际 ${group.前7天}`);
      assert.ok(group.近7天 > 0);
    } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
  });
});
