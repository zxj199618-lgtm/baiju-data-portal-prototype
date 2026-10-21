/**
 * 报告数字回查测试：单元用例 + 经网关的端到端用例（用本地假中转站替代真实模型）。
 * 运行：node --test tests/numeric-check.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { checkNumericGrounding } = require("../scripts/numeric-check.cjs");

const ROOT = path.join(__dirname, "..");
const MODEL = "gpt-5.4-mini";
const TABLE = "广告计划日报表";

describe("数字回查（单元）", () => {
  const evidence = [{ 表名: TABLE, 整体合计: { cost: 2864123.4, activate_cnt: 5210, 环比: 0.1231 } }];

  test("证据里有的数字（含万级换算与百分比）算作有依据", () => {
    const result = checkNumericGrounding("总消耗 286.4 万，环比 12.3%，激活 5210 次。", evidence, "");
    assert.deepEqual(result.ungrounded, []);
    assert.equal(result.grounded, 3);
  });

  test("证据里没有的数字被列出（含模型自己算出的派生数字）", () => {
    const result = checkNumericGrounding("CPA 为 18.5 元，较上期多出 9999 次。", evidence, "");
    assert.deepEqual(result.ungrounded, ["18.5", "9999"]);
  });

  test("日期、时间段、列表序号、代码块与编码中的数字不参与校验", () => {
    const report = "1. 2026-08-31 的数据显示，近 7 天趋势平稳。\n计划编号 DR20260907001。\n```\n424242\n```\n";
    const result = checkNumericGrounding(report, evidence, "");
    assert.equal(result.checked, 0);
    assert.deepEqual(result.ungrounded, []);
  });

  test("省略年份的日期（08-25、8/25、8月25日）不参与校验，但像 10-20 这样的区间外数字仍然检查", () => {
    const result = checkNumericGrounding("08-25 至 08-31 对比 08-18 至 08-24，8/25 与 8月31日也是日期，另有 9999 次。", evidence, "");
    assert.deepEqual(result.ungrounded, ["9999"]);
  });

  test("问题里出现的数字视为有依据", () => {
    const result = checkNumericGrounding("目标 CPA 控制在 18.5 元以内。", evidence, "CPA 能不能压到 18.5 元？");
    assert.deepEqual(result.ungrounded, []);
  });

  test("容差按报告写出的小数位取半个最小单位：286.41 万 是 2864123.4 的两位小数舍入，286.45 万 与 286.9 万 都不通过", () => {
    assert.deepEqual(checkNumericGrounding("286.41 万", evidence, "").ungrounded, []);
    assert.deepEqual(checkNumericGrounding("286.9 万", evidence, "").ungrounded, ["286.9 万"]);
    assert.deepEqual(checkNumericGrounding("286.45 万", evidence, "").ungrounded, ["286.45 万"]);
  });

  test("未在证据中找到的数字最多列出 10 个，且去重", () => {
    const report = Array.from({ length: 15 }, (_, index) => `${1000 + index} 次`).join("，") + "，重复 1000 次";
    const result = checkNumericGrounding(report, evidence, "");
    assert.equal(result.ungrounded.length, 10);
  });
});

/* ---------- 端到端：假中转站 + 真实网关 ---------- */

let currentReport = "";
let fakeRelay = null;
let gateway = null;
let baseUrl = "";
let dataDir = "";

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
          const body = JSON.parse(raw || "{}");
          if (body.stream) {
            res.writeHead(200, { "Content-Type": "text/event-stream" });
            const half = Math.floor(currentReport.length / 2);
            [currentReport.slice(0, half), currentReport.slice(half)].forEach(part => {
              res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: part } }] })}\n\n`);
            });
            res.write("data: [DONE]\n\n");
            return res.end();
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ choices: [{ message: { content: currentReport } }], usage: { total_tokens: 1 } }));
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
  try { data = JSON.parse(text); } catch { /* 流式或非 JSON 响应 */ }
  return { status: response.status, data, text };
}

async function waitForModel() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const response = await call("GET", "/v1/models", { token: await adminToken() });
    if (response.status === 200 && response.data.models?.includes(MODEL)) return;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error("中转站模型未就绪");
}

let tokenCache = "";
async function adminToken() {
  if (tokenCache) return tokenCache;
  const result = await call("POST", "/v1/auth/login", { body: { name: "曾祥竞", password: "numeric-pass-1" } });
  tokenCache = result.data.token;
  return tokenCache;
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "numeric-check-test-"));
  fakeRelay = await startFakeRelay();
  const relayPort = fakeRelay.address().port;
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  gateway = await startGateway({
    PORT: String(port),
    DATA_DIR: dataDir,
    PORTAL_INITIAL_PASSWORD: "numeric-pass-1",
    PORTAL_AUTH_SECRET: "numeric-test-secret",
    RELAY_API_KEY: "fake-key",
    RELAY_BASE_URL: `http://127.0.0.1:${relayPort}/v1`
  });
  await waitForModel();
});

after(() => {
  if (gateway) gateway.kill("SIGKILL");
  if (fakeRelay) fakeRelay.close();
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
});

async function tableRowCount(name) {
  const catalog = await call("GET", "/v1/catalog", { token: await adminToken() });
  return catalog.data.tables.find(item => item.name === name).rows;
}

describe("数字回查（经网关的端到端）", () => {
  test("非流式：报告里证据外的数字进入 meta.numericCheck", async () => {
    const rows = await tableRowCount(TABLE);
    currentReport = `## 结论\n${TABLE}共 ${rows} 行，近 7 天总消耗 98765432.1 万。`;
    const result = await call("POST", "/v1/analyze", {
      token: await adminToken(),
      body: { question: "广告计划表有多少数据？", scenario: "single", model: MODEL, tables: [TABLE] }
    });
    assert.equal(result.status, 200, result.text);
    const check = result.data.meta.numericCheck;
    assert.ok(check.checked >= 2, "应至少校验两个数字");
    assert.deepEqual(check.ungrounded, ["98765432.1 万"], "证据内的行数应通过，编造的数字应被列出");
  });

  test("流式：done 事件的 meta 同样带上回查结果", async () => {
    const rows = await tableRowCount(TABLE);
    currentReport = `${TABLE}共 ${rows} 行，另有编造的 424242 次激活。`;
    const response = await fetch(`${baseUrl}/v1/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await adminToken()}` },
      body: JSON.stringify({ question: "广告计划表有多少数据？", scenario: "single", model: MODEL, tables: [TABLE], stream: true }),
      signal: AbortSignal.timeout(60000)
    });
    const text = await response.text();
    const events = text.split("\n").filter(line => line.startsWith("data: ")).map(line => JSON.parse(line.slice(6)));
    const done = events.find(event => event.done);
    assert.ok(done, "流式响应应以 done 事件结束");
    assert.deepEqual(done.meta.numericCheck.ungrounded, ["424242"]);
  });
});
