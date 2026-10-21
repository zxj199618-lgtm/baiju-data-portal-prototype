/**
 * 工具取数测试：单元（权限、聚合、输出上限、审计）+ 经网关的端到端（假中转站按脚本发起工具调用）。
 * 运行：node --test tests/analysis-tools.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { createAnalysisToolkit } = require("../scripts/analysis-tools.cjs");

const ROOT = path.join(__dirname, "..");
const MODEL = "gpt-5.4-mini";

/* ---------- 单元 ---------- */

const shift = (day, offset) => new Date(Date.parse(`${day}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
const ANCHOR = "2026-08-31";

const tables = [
  {
    cnName: "广告计划日报表", desc: "广告计划日粒度消耗", owner: "黄佩贤",
    fields: [{ name: "stat_date", type: "DATE", comment: "日期" }, { name: "media_source", type: "VARCHAR", comment: "媒体" }, { name: "cost", type: "DECIMAL(18,2)", comment: "消耗" }],
    agg: { dateKey: "stat_date", groupBy: ["media_source"], metric: "cost" }
  },
  {
    cnName: "媒体消耗汇总", desc: "媒体消耗汇总", owner: "黄佩贤",
    fields: [{ name: "stat_date", type: "DATE", comment: "日期" }, { name: "media_source", type: "VARCHAR", comment: "媒体" }, { name: "cost", type: "DECIMAL(18,2)", comment: "消耗" }],
    agg: { dateKey: "stat_date", groupBy: ["media_source"], metric: "cost" }
  }
];

const rowsByTable = {
  "广告计划日报表": [
    { stat_date: shift(ANCHOR, 0), media_source: "巨量", cost: 100 },
    { stat_date: shift(ANCHOR, -6), media_source: "快手", cost: 50 },
    { stat_date: shift(ANCHOR, -7), media_source: "巨量", cost: 40 },
    { stat_date: shift(ANCHOR, -13), media_source: "快手", cost: 10 },
    { stat_date: shift(ANCHOR, -14), media_source: "巨量", cost: 999 }
  ],
  "媒体消耗汇总": [{ stat_date: shift(ANCHOR, 0), media_source: "巨量", cost: 777 }]
};

function makeToolkit(allowedTables, audit = () => {}) {
  return createAnalysisToolkit({
    userName: "测试用户",
    allowedTables,
    tables,
    rowsOf: name => rowsByTable[name] || [],
    audit
  });
}

describe("工具箱（单元）", () => {
  test("search_tables 只列出有权限的表，无权限的表不出现", () => {
    const toolkit = makeToolkit(["广告计划日报表"]);
    const outcome = toolkit.execute("search_tables", "{}");
    assert.equal(outcome.ok, true);
    assert.deepEqual(outcome.data.候选表.map(item => item.表名), ["广告计划日报表"]);
  });

  test("无权限的表与不存在的表返回同一条提示，不泄露表是否存在", () => {
    const toolkit = makeToolkit(["广告计划日报表"]);
    const denied = toolkit.execute("get_schema", JSON.stringify({ table: "媒体消耗汇总" }));
    const missing = toolkit.execute("get_schema", JSON.stringify({ table: "根本不存在的表" }));
    assert.equal(denied.ok, false);
    assert.equal(denied.error.replace("媒体消耗汇总", "X"), missing.error.replace("根本不存在的表", "X"));
  });

  test("search_tables 没有匹配时给出提示，引导模型如实说明而不是反复换关键词", () => {
    const toolkit = makeToolkit(["广告计划日报表"]);
    const outcome = toolkit.execute("search_tables", JSON.stringify({ keyword: "完全不存在的关键词" }));
    assert.equal(outcome.data.总数, 0);
    assert.match(outcome.data.提示, /无权限或不存在/);
    assert.equal(toolkit.execute("search_tables", "{}").data.提示, undefined, "有结果时不带提示");
  });

  test("run_metric 按最近 N 天与前 N 天聚合，结果由代码计算", () => {
    const toolkit = makeToolkit(["广告计划日报表"]);
    const outcome = toolkit.execute("run_metric", JSON.stringify({ table: "广告计划日报表", group: "media_source", days: 7 }));
    assert.equal(outcome.ok, true);
    assert.equal(outcome.data.近N天合计, 150, "近 7 天：巨量 100 + 快手 50");
    assert.equal(outcome.data.前N天合计, 50, "前 7 天：巨量 40 + 快手 10");
    assert.equal(outcome.data.环比百分比, 200);
    const groups = Object.fromEntries(outcome.data.分组.明细.map(item => [item.组, item]));
    assert.equal(groups["巨量"].近N天, 100);
    assert.equal(groups["快手"].前N天, 10);
  });

  test("run_metric 拒绝非数值指标与不存在的分组字段", () => {
    const toolkit = makeToolkit(["广告计划日报表"]);
    assert.equal(toolkit.execute("run_metric", JSON.stringify({ table: "广告计划日报表", metric: "media_source" })).ok, false);
    assert.equal(toolkit.execute("run_metric", JSON.stringify({ table: "广告计划日报表", group: "cost" })).ok, false);
    assert.equal(toolkit.execute("run_metric", JSON.stringify({ table: "广告计划日报表", group: "nope" })).ok, false);
  });

  test("样例行最多 5 行，输出字符数有上限", () => {
    const big = { ...tables[0], cnName: "大表" };
    const toolkit = createAnalysisToolkit({
      userName: "测试用户",
      allowedTables: ["大表"],
      tables: [big],
      rowsOf: () => Array.from({ length: 500 }, (_, index) => ({ stat_date: ANCHOR, media_source: "x".repeat(200) + index, cost: index })),
      audit: () => {}
    });
    const outcome = toolkit.execute("get_sample_rows", JSON.stringify({ table: "大表", limit: 50 }));
    assert.equal(outcome.data.样例.length, 5);
    const huge = toolkit.execute("get_sample_rows", JSON.stringify({ table: "大表", limit: 5 }));
    assert.ok(huge.content.length <= 6000, "单次返回不超过上限");
  });

  test("参数不是合法 JSON、工具名未知时返回错误而不是抛异常", () => {
    const toolkit = makeToolkit(["广告计划日报表"]);
    assert.equal(toolkit.execute("run_metric", "{not json").ok, false);
    assert.equal(toolkit.execute("drop_tables", "{}").ok, false);
  });

  test("每次调用（包括被拒绝的）都写入审计", () => {
    const entries = [];
    const toolkit = makeToolkit(["广告计划日报表"], entry => entries.push(entry));
    toolkit.execute("search_tables", "{}");
    toolkit.execute("get_schema", JSON.stringify({ table: "媒体消耗汇总" }));
    assert.equal(entries.length, 2);
    assert.equal(entries[0].user, "测试用户");
    assert.equal(entries[0].ok, true);
    assert.equal(entries[1].ok, false);
    assert.equal(entries[1].table, "媒体消耗汇总");
  });
});

/* ---------- 端到端：假中转站按脚本发起工具调用 ---------- */

let fakeRelay = null;
let gateway = null;
let baseUrl = "";
let dataDir = "";
let requests = [];
let toolScript = [];
let tokenCache = {};

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
          requests.push(body);
          if (body.tools && toolScript.length && toolScript[0].status) {
            const next = toolScript.shift();
            res.writeHead(next.status, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: { message: "tools not supported" } }));
          }
          if (body.tools && toolScript.length) {
            const next = toolScript.shift();
            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ choices: [{ message: { content: "", tool_calls: next.calls } }], usage: {} }));
          }
          if (body.stream) {
            res.writeHead(200, { "Content-Type": "text/event-stream" });
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "最终结论（测试）" } }] })}\n\n`);
            res.write("data: [DONE]\n\n");
            return res.end();
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ choices: [{ message: { content: "最终结论（测试）" } }], usage: {} }));
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
      if (output.includes("观星台分析网关已启动")) { clearTimeout(timer); resolve(child); }
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

async function tokenFor(name) {
  if (!tokenCache[name]) {
    const result = await call("POST", "/v1/auth/login", { body: { name, password: "tools-pass-1" } });
    tokenCache[name] = result.data.token;
  }
  return tokenCache[name];
}

function toolCall(id, name, args) {
  return { id, type: "function", function: { name, arguments: JSON.stringify(args) } };
}

function streamBody(question, tableNames, extra = {}) {
  return { question, scenario: "single", model: MODEL, tables: tableNames, stream: true, ...extra };
}

async function analyzeStream(token, body) {
  const response = await fetch(`${baseUrl}/v1/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000)
  });
  const text = await response.text();
  const events = text.split("\n").filter(line => line.startsWith("data: ")).map(line => JSON.parse(line.slice(6)));
  return { status: response.status, events, done: events.find(event => event.done) };
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "analysis-tools-test-"));
  fakeRelay = await startFakeRelay();
  const relayPort = fakeRelay.address().port;
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  gateway = await startGateway({
    PORT: String(port),
    DATA_DIR: dataDir,
    PORTAL_INITIAL_PASSWORD: "tools-pass-1",
    PORTAL_AUTH_SECRET: "tools-test-secret",
    RELAY_API_KEY: "fake-key",
    RELAY_BASE_URL: `http://127.0.0.1:${relayPort}/v1`
  });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const models = await call("GET", "/v1/models", { token: await tokenFor("曾祥竞") });
    if (models.data.models?.includes(MODEL)) break;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
});

after(() => {
  if (gateway) gateway.kill("SIGKILL");
  if (fakeRelay) fakeRelay.close();
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("工具取数（经网关）", () => {
  test("模型调用工具后，平台执行并把结果交给最终回答", async () => {
    requests = [];
    toolScript = [
      { calls: [toolCall("c1", "search_tables", { keyword: "广告" })] },
      { calls: [toolCall("c2", "run_metric", { table: "广告计划日报表", group: "media_source" })] }
    ];
    const result = await analyzeStream(await tokenFor("曾祥竞"), streamBody("近 7 天消耗怎么样？", []));
    assert.equal(result.status, 200);
    assert.equal(result.done.meta.toolMode, "used:2");
    const final = requests.at(-1);
    assert.equal(final.tools, undefined, "最终回答阶段不再携带工具定义");
    const finalUser = final.messages.find(message => message.role === "user").content;
    assert.match(finalUser, /"近N天合计": [\d.]+/, "最终回答拿到的是平台计算的聚合数字");
    assert.match(finalUser, /"分组"/, "分组拆解也由平台计算后交给模型");
    // 工具阶段就打开了流：界面能实时看到每次工具调用，且在最终回答之前
    const toolEvents = result.events.filter(event => event.tool);
    assert.deepEqual(toolEvents.map(event => event.tool.name), ["search_tables", "run_metric"]);
    assert.equal(result.events[0].started, true, "流应在工具阶段之前就开始");
    assert.ok(result.events.findIndex(event => event.tool) < result.events.findIndex(event => event.delta), "工具事件先于回答文本");
  });

  test("无权限的表被拒绝，且拒绝写入审计", async () => {
    requests = [];
    toolScript = [{ calls: [toolCall("d1", "run_metric", { table: "媒体消耗汇总" })] }];
    const result = await analyzeStream(await tokenFor("李雨航"), streamBody("媒体消耗怎么样？", []));
    assert.equal(result.status, 200);
    const toolMessages = requests.flatMap(body => body.messages.filter(message => message.role === "tool"));
    assert.match(toolMessages[0].content, /数据表不存在或无权访问：媒体消耗汇总/);
    const audit = fs.readFileSync(path.join(dataDir, "analysis-audit.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
    const entry = audit.find(item => item.table === "媒体消耗汇总");
    assert.ok(entry, "拒绝的调用也应留下审计记录");
    assert.equal(entry.user, "李雨航");
    assert.equal(entry.ok, false);
  });

  test("模型不支持工具（返回错误）时回到原证据方式，并在 meta 中说明", async () => {
    requests = [];
    toolScript = [{ status: 400 }];
    const result = await analyzeStream(await tokenFor("曾祥竞"), streamBody("广告计划表的字段有哪些？", ["广告计划日报表"]));
    assert.equal(result.done.meta.toolMode.startsWith("fallback:工具调用不可用"), true);
  });

  test("模型不调用工具时同样回到原证据方式", async () => {
    requests = [];
    toolScript = [];
    const result = await analyzeStream(await tokenFor("曾祥竞"), streamBody("你好", []));
    assert.equal(result.done.meta.toolMode, "fallback:模型未调用工具");
  });

  test("调用次数有上限：超出的调用不执行，并告知模型", async () => {
    requests = [];
    const many = Array.from({ length: 4 }, (_, index) => toolCall(`m${index}`, "search_tables", { keyword: "" }));
    toolScript = [{ calls: many }, { calls: many }, { calls: many }, { calls: many }];
    const result = await analyzeStream(await tokenFor("曾祥竞"), streamBody("列出所有表", []));
    assert.equal(result.done.meta.toolMode, "used:8", "最多执行 8 次");
    const limited = requests.flatMap(body => body.messages.filter(message => message.role === "tool" && /上限/.test(message.content)));
    assert.ok(limited.length > 0, "超出的调用应收到上限提示");
  });

  test("toolMode=false 时不使用工具取数", async () => {
    requests = [];
    toolScript = [];
    const result = await analyzeStream(await tokenFor("曾祥竞"), streamBody("广告计划表", ["广告计划日报表"], { toolMode: false }));
    assert.equal(result.done.meta.toolMode, "off");
    assert.equal(requests.some(body => body.tools), false);
  });
});
