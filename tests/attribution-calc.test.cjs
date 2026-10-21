/**
 * 归因确定性计算测试：单元用例（手算结果）+ 经网关的端到端用例（假中转站捕获提示词）。
 * 运行：node --test tests/attribution-calc.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { computeAttribution, windowsFor } = require("../scripts/attribution-calc.cjs");

const ROOT = path.join(__dirname, "..");
const MODEL = "gpt-5.4-mini";
const ANCHOR = "2026-08-31";

/** 构造一行：日期偏移（相对锚点往前几天） */
const row = (daysBack, values) => ({ stat_date: shiftDay(ANCHOR, -daysBack), ...values });
function shiftDay(day, offset) {
  const ms = Date.parse(`${day}T00:00:00Z`) + offset * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

describe("归因计算（单元，手算结果）", () => {
  test("窗口边界：近 7 天含锚点，前 7 天紧邻其前，更早的数据不参与", () => {
    const windows = windowsFor(ANCHOR, 7);
    assert.deepEqual(windows.current, { start: "2026-08-25", end: "2026-08-31" });
    assert.deepEqual(windows.baseline, { start: "2026-08-18", end: "2026-08-24" });
    const rows = [row(0, { media_source: "A", cost: 1 }), row(6, { media_source: "A", cost: 1 }), row(7, { media_source: "A", cost: 1 }), row(13, { media_source: "A", cost: 1 }), row(14, { media_source: "A", cost: 1000 })];
    const result = computeAttribution(rows, { dateKey: "stat_date", metric: "cost", dimensions: ["media_source"] });
    assert.equal(result.total.current, 2);
    assert.equal(result.total.baseline, 2);
  });

  test("加法指标：各分组变化之和等于总变化，贡献 = 分组变化 / 总变化", () => {
    const rows = [
      row(0, { media_source: "A", cost: 100 }), row(8, { media_source: "A", cost: 50 }),
      row(1, { media_source: "B", cost: 20 }), row(9, { media_source: "B", cost: 40 })
    ];
    const result = computeAttribution(rows, { dateKey: "stat_date", metric: "cost", dimensions: ["media_source"] });
    const [dimension] = result.dimensions;
    assert.equal(result.total.delta, 30);
    const a = dimension.drivers.find(item => item.group === "A");
    const b = dimension.drivers.find(item => item.group === "B");
    assert.equal(a.delta, 50);
    assert.equal(b.delta, -20);
    assert.equal(a.shareOfChange, 1.6667);
    assert.equal(b.shareOfChange, -0.6667);
    assert.equal(dimension.reconciled, true);
  });

  test("CPA 拆解：结构效应 + 效率效应 = CPA 变化（手算 -7.5）", () => {
    // 前期：G1 消耗 100 / 激活 10（CPA 10），G2 消耗 300 / 激活 10（CPA 30），CPA = 20
    // 本期：G1 消耗 300 / 激活 30（CPA 10），G2 消耗 100 / 激活 2（CPA 50），CPA = 12.5
    const rows = [
      row(8, { media_source: "G1", cost: 100, activate_cnt: 10 }), row(9, { media_source: "G2", cost: 300, activate_cnt: 10 }),
      row(0, { media_source: "G1", cost: 300, activate_cnt: 30 }), row(1, { media_source: "G2", cost: 100, activate_cnt: 2 })
    ];
    const result = computeAttribution(rows, { dateKey: "stat_date", metric: "cost", dimensions: ["media_source"], activateKey: "activate_cnt" });
    assert.equal(result.ratio.total.delta, -7.5);
    const [dimension] = result.ratio.dimensions;
    assert.equal(dimension.mixEffect, -8.75);
    assert.equal(dimension.rateEffect, 1.25);
    assert.equal(dimension.uninvestedCostEffect, 0);
    assert.equal(dimension.reconciled, true);
  });

  test("无激活花费残差：没有激活的分组花费计入残差，且仍然精确对平", () => {
    const rows = [
      row(8, { media_source: "G1", cost: 100, activate_cnt: 10 }), row(9, { media_source: "G2", cost: 300, activate_cnt: 10 }),
      row(0, { media_source: "G1", cost: 300, activate_cnt: 30 }), row(1, { media_source: "G2", cost: 100, activate_cnt: 2 }),
      row(0, { media_source: "G3", cost: 50, activate_cnt: 0 })
    ];
    const result = computeAttribution(rows, { dateKey: "stat_date", metric: "cost", dimensions: ["media_source"], activateKey: "activate_cnt" });
    const [dimension] = result.ratio.dimensions;
    // 本期 CPA = 450 / 32 = 14.0625，前期 20，变化 -5.9375；残差 = 50 / 32 = 1.5625
    assert.ok(Math.abs(result.ratio.total.delta - (-5.9375)) < 0.01, "总变化四舍五入到两位小数");
    assert.equal(dimension.uninvestedCostEffect, 1.5625);
    assert.equal(dimension.reconciled, true);
  });

  test("某一窗口没有激活时不给出 CPA 拆解，而不是把 0 当成 CPA", () => {
    const rows = [row(8, { media_source: "A", cost: 100, activate_cnt: 0 }), row(0, { media_source: "A", cost: 100, activate_cnt: 5 })];
    const result = computeAttribution(rows, { dateKey: "stat_date", metric: "cost", dimensions: ["media_source"], activateKey: "activate_cnt" });
    assert.equal(result.ratio, undefined);
    assert.equal(result.available, true);
  });

  test("数据不足（前期没有数据）时明确说明原因，不输出伪造的贡献", () => {
    const rows = [row(0, { media_source: "A", cost: 100 })];
    const result = computeAttribution(rows, { dateKey: "stat_date", metric: "cost", dimensions: ["media_source"] });
    assert.equal(result.available, false);
    assert.match(result.reason, /没有数据/);
  });

  test("分组超过 8 个时，其余合并为「其他」，合计仍然精确", () => {
    const rows = [];
    for (let index = 0; index < 10; index += 1) {
      rows.push(row(0, { media_source: `M${index}`, cost: 100 + index }));
      rows.push(row(8, { media_source: `M${index}`, cost: 50 }));
    }
    const result = computeAttribution(rows, { dateKey: "stat_date", metric: "cost", dimensions: ["media_source"] });
    const [dimension] = result.dimensions;
    assert.equal(dimension.drivers.length, 9);
    assert.match(dimension.drivers.at(-1).group, /其他/);
    assert.equal(dimension.reconciled, true);
  });
});

/* ---------- 端到端：假中转站捕获提示词 ---------- */

let captured = [];
let fakeRelay = null;
let gateway = null;
let baseUrl = "";
let dataDir = "";
let tokenCache = "";

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function startFakeRelay() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", chunk => { raw += chunk; });
      req.on("end", () => {
        if (req.method === "GET" && req.url.startsWith("/v1/models")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ data: [{ id: MODEL }] }));
        }
        if (req.method === "POST" && req.url.startsWith("/v1/chat/completions")) {
          captured.push(JSON.parse(raw || "{}"));
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ choices: [{ message: { content: "归因解释（测试）" } }], usage: { total_tokens: 1 } }));
        }
        res.writeHead(404);
        res.end("{}");
      });
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function startGateway(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, "scripts", "analysis-gateway.cjs")], {
      env: { PATH: process.env.PATH, ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    const timer = setTimeout(() => reject(new Error("网关启动超时：" + output)), 20000);
    child.stdout.on("data", chunk => {
      output += chunk;
      if (output.includes("观星台分析网关已启动")) {
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.stderr.on("data", chunk => { output += chunk; });
    child.on("exit", code => { clearTimeout(timer); reject(new Error(`网关提前退出（${code}）：${output}`)); });
  });
}

async function call(method, route, { token = "", body } = {}) {
  const init = { method, headers: {} };
  if (token) init.headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const response = await fetch(baseUrl + route, { ...init, signal: AbortSignal.timeout(60000) });
  const text = await response.text();
  let data = text;
  try { data = JSON.parse(text); } catch { /* 非 JSON */ }
  return { status: response.status, data, text };
}

async function adminToken() {
  if (tokenCache) return tokenCache;
  const result = await call("POST", "/v1/auth/login", { body: { name: "曾祥竞", password: "attr-pass-1" } });
  tokenCache = result.data.token;
  return tokenCache;
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "attribution-test-"));
  fakeRelay = await startFakeRelay();
  const relayPort = fakeRelay.address().port;
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  gateway = await startGateway({
    PORT: String(port),
    DATA_DIR: dataDir,
    PORTAL_INITIAL_PASSWORD: "attr-pass-1",
    PORTAL_AUTH_SECRET: "attribution-test-secret",
    RELAY_API_KEY: "fake-key",
    RELAY_BASE_URL: `http://127.0.0.1:${relayPort}/v1`
  });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const models = await call("GET", "/v1/models", { token: await adminToken() });
    if (models.data.models?.includes(MODEL)) break;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
});

after(() => {
  if (gateway) gateway.kill("SIGKILL");
  if (fakeRelay) fakeRelay.close();
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("归因计算（经网关：进入模型提示词，模型只解释）", () => {
  test("指标异动请求的证据里带有「归因计算」，且维度对平", async () => {
    captured = [];
    const result = await call("POST", "/v1/analyze", {
      token: await adminToken(),
      body: { question: "近 7 天消耗为什么上涨？", scenario: "attribution", model: MODEL, tables: ["广告计划日报表"] }
    });
    assert.equal(result.status, 200, result.text);
    assert.equal(captured.length, 1);
    const userMessage = captured[0].messages.find(message => message.role === "user").content;
    assert.match(userMessage, /"归因计算"/);
    assert.match(userMessage, /"dimension": "media_source"/);
    assert.match(userMessage, /"reconciled": true/);
    assert.doesNotMatch(userMessage, /"reconciled": false/);
    const systemMessage = captured[0].messages.find(message => message.role === "system").content;
    assert.match(systemMessage, /不是重新计算/);
  });

  test("指定指标异动 Skill 时同样附加归因计算，提示词来自 SKILL.md 的解释约束", async () => {
    captured = [];
    const result = await call("POST", "/v1/analyze", {
      token: await adminToken(),
      body: { question: "消耗为什么变化？", scenario: "attribution", skillId: "attribution-analyst", model: MODEL, tables: ["广告计划日报表"] }
    });
    assert.equal(result.status, 200, result.text);
    assert.equal(result.data.meta.skillRuntime, "package:attribution-analyst", "应走 Skill 包运行时");
    const userMessage = captured[0].messages.find(message => message.role === "user").content;
    assert.match(userMessage, /"reconciled": true/);
    const systemMessage = captured[0].messages.find(message => message.role === "system").content;
    assert.match(systemMessage, /不是重新计算/);
  });

  test("非指标异动请求不附加归因计算", async () => {
    captured = [];
    await call("POST", "/v1/analyze", {
      token: await adminToken(),
      body: { question: "广告计划表有哪些字段？", scenario: "single", model: MODEL, tables: ["广告计划日报表"] }
    });
    const userMessage = captured[0].messages.find(message => message.role === "user").content;
    assert.doesNotMatch(userMessage, /"归因计算"/);
  });
});
