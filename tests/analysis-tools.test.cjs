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
const { scopeTables, scopeRowsOf } = require("../scripts/field-scope.cjs");

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


/* ---------- 字段权限（单元）：用 scopeTables / scopeRowsOf 裁剪后的表与行构造工具箱 ---------- */

describe("字段权限：裁剪后的工具箱（单元）", () => {
  const SECRET = "secret_margin";
  const fieldTables = [{
    cnName: "利润日报", desc: "利润日报", owner: "测试",
    fields: [
      { name: "stat_date", type: "DATE", comment: "日期" },
      { name: "media_source", type: "VARCHAR", comment: "媒体" },
      { name: "cost", type: "DECIMAL(18,2)", comment: "消耗" },
      { name: SECRET, type: "DECIMAL(18,2)", comment: "内部毛利额" }
    ],
    agg: { dateKey: "stat_date", groupBy: ["media_source", SECRET], metric: "cost" },
    lineage: { upstream: [{ table: "dwd_profit", role: "毛利来源", join: `LEFT JOIN · ${SECRET}` }], downstream: [] }
  }];
  const fieldRows = { 利润日报: [{ stat_date: ANCHOR, media_source: "巨量", cost: 10, [SECRET]: 3 }, { stat_date: shift(ANCHOR, -7), media_source: "快手", cost: 5, [SECRET]: 1 }] };
  const hidden = { 利润日报: [SECRET] };
  const scopedKit = (audit = () => {}) => createAnalysisToolkit({
    userName: "受限用户", allowedTables: ["利润日报"], tables: scopeTables(fieldTables, hidden),
    rowsOf: scopeRowsOf(name => fieldRows[name] || [], hidden), audit
  });

  test("search_tables 用被隐藏字段的注释关键词搜不到该表（未裁剪时能搜到）", () => {
    const raw = createAnalysisToolkit({ userName: "x", allowedTables: ["利润日报"], tables: fieldTables, rowsOf: name => fieldRows[name] || [] });
    assert.equal(raw.execute("search_tables", JSON.stringify({ keyword: "内部毛利" })).data.总数, 1);
    assert.equal(scopedKit().execute("search_tables", JSON.stringify({ keyword: "内部毛利" })).data.总数, 0);
    assert.equal(scopedKit().execute("search_tables", JSON.stringify({ keyword: SECRET })).data.总数, 0);
  });

  test("get_schema 的字段与口径、get_sample_rows 的行、get_lineage 都不含该字段", () => {
    const kit = scopedKit();
    const schema = kit.execute("get_schema", JSON.stringify({ table: "利润日报" }));
    assert.equal(schema.ok, true);
    assert.deepEqual(schema.data.字段.map(field => field.name), ["stat_date", "media_source", "cost"]);
    assert.deepEqual(schema.data.口径.可用分组, ["media_source"]);
    const sample = kit.execute("get_sample_rows", JSON.stringify({ table: "利润日报" }));
    assert.equal(sample.data.样例.length, 2);
    sample.data.样例.forEach(row => assert.equal(Object.prototype.hasOwnProperty.call(row, SECRET), false));
    const lineage = kit.execute("get_lineage", JSON.stringify({ table: "利润日报" }));
    for (const outcome of [schema, sample, lineage]) assert.equal(outcome.content.includes(SECRET), false, outcome.content);
  });

  test("run_metric 以被隐藏字段做指标 / 分组，错误与乱写字段名同一文案模板", () => {
    const kit = scopedKit();
    const same = (hiddenArgs, bogusArgs, name) => {
      const a = kit.execute("run_metric", JSON.stringify(hiddenArgs));
      const b = kit.execute("run_metric", JSON.stringify(bogusArgs));
      assert.equal(a.ok, false);
      assert.equal(b.ok, false);
      assert.equal(a.error.replace(SECRET, "X"), b.error.replace(name, "X"));
    };
    same({ table: "利润日报", metric: SECRET }, { table: "利润日报", metric: "no_such_col" }, "no_such_col");
    same({ table: "利润日报", group: SECRET }, { table: "利润日报", group: "no_such_col" }, "no_such_col");
    assert.equal(kit.execute("run_metric", JSON.stringify({ table: "利润日报", group: "media_source" })).ok, true);
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

/* ---------- 字段权限（经网关）：隐藏字段在工具、证据、推荐问题、审计里都不出现 ---------- */

describe("字段权限（经网关）", () => {
  const X = "campaign_id";
  const X_VALUE = /CMP\d{3}/;
  const TABLE = "广告计划日报表";
  const group = (name, tables, extra = {}) => ({ name, desc: "", menus: ["灵犀智析"], menuEdits: [], boards: [], tables, status: "启用", ...extra });
  const groupsWith = hiddenFields => [
    group("门户管理员", ["全部数据表"], { menus: ["灵犀智析", "AI 中心"] }),
    group("投放组长", ["广告计划日报表", "广告账户日报", "广告组转化日报", "媒体消耗汇总", "产品 ROI 日报"]),
    group("优化师", ["广告计划日报表", "广告账户日报", "权益-账号维度消耗统计表"], { hiddenFields }),
    group("数据分析师", ["广告计划日报表", "用户画像标签明细表", "用户订单明细", "用户生命周期日报", "渠道归因明细"]),
    group("只读访客", [])
  ];
  const saveGroups = async hiddenFields => {
    const result = await call("PUT", "/v1/org", { token: await tokenFor("曾祥竞"), body: { groups: groupsWith(hiddenFields) } });
    assert.equal(result.status, 200, JSON.stringify(result.data));
  };
  const auditText = () => fs.readFileSync(path.join(dataDir, "analysis-audit.jsonl"), "utf8");
  const leakFree = (label, text) => {
    assert.equal(text.includes(X), false, `${label} 不应出现隐藏字段名`);
    assert.equal(X_VALUE.test(text), false, `${label} 不应出现隐藏字段的取值`);
  };
  // 不带隐藏字段名作参数的一组工具调用：模型拿到的每一段结果都要扫描
  const probeCalls = () => [
    { calls: [toolCall("f1", "search_tables", { keyword: "" }), toolCall("f2", "get_schema", { table: TABLE }), toolCall("f3", "get_sample_rows", { table: TABLE })] },
    { calls: [toolCall("f4", "run_metric", { table: TABLE, group: "media_source" }), toolCall("f5", "get_lineage", { table: TABLE }), toolCall("f6", "list_metrics", {})] },
    { calls: [toolCall("f7", "query_metric", { metric: "cost", table: TABLE, group: "media_source" }), toolCall("f8", "attribute_change", { metric: "cost", table: TABLE })] }
  ];

  // 最后一次带工具的请求里包含了本轮所有工具结果（之前的请求是它的前缀）
  const toolMessagesOf = () => [...requests].reverse().find(body => body.tools && body.messages.some(message => message.role === "tool")).messages.filter(message => message.role === "tool");

  after(async () => { await saveGroups({}); });

  test("隐藏字段后：工具结果、最终提示词、SSE 响应与审计的整段文本都不含该字段；恢复后立即可见", async () => {
    await saveGroups({ [TABLE]: [X] });
    const auditBefore = auditText().length;
    requests = [];
    toolScript = probeCalls();
    const result = await analyzeStream(await tokenFor("谭嘉颖"), streamBody("近 7 天消耗怎么样？", [TABLE]));
    assert.equal(result.status, 200);
    assert.equal(result.done.meta.toolMode, "used:8");
    const toolMessages = toolMessagesOf();
    assert.equal(toolMessages.length, 8);
    const schema = JSON.parse(toolMessages[1].content);
    assert.equal(schema.ok, true);
    assert.ok(schema.data.字段.some(field => field.name === "plan_id"), "其余字段照常可见");
    leakFree("发给模型的全部请求", JSON.stringify(requests));
    leakFree("SSE 响应", JSON.stringify(result.events));
    leakFree("本次审计", auditText().slice(auditBefore));

    // 管理员看得到（管理员组不受限）
    requests = [];
    toolScript = [{ calls: [toolCall("a1", "get_schema", { table: TABLE })] }];
    await analyzeStream(await tokenFor("曾祥竞"), streamBody("字段？", [TABLE]));
    assert.ok(JSON.stringify(requests).includes(X), "管理员不受字段权限影响");

    await saveGroups({});
    requests = [];
    toolScript = [{ calls: [toolCall("r1", "get_schema", { table: TABLE })] }];
    await analyzeStream(await tokenFor("谭嘉颖"), streamBody("字段？", [TABLE]));
    const restored = JSON.parse(toolMessagesOf()[0].content);
    assert.ok(restored.data.字段.some(field => field.name === X), "恢复 hiddenFields 后立即可见");
  });

  test("以隐藏字段做分组：run_metric / query_metric 的错误与乱写字段名同一文案", async () => {
    await saveGroups({ [TABLE]: [X] });
    requests = [];
    toolScript = [{ calls: [
      toolCall("g1", "run_metric", { table: TABLE, group: X }), toolCall("g2", "run_metric", { table: TABLE, group: "zz_nope" }),
      toolCall("g3", "query_metric", { metric: "cost", table: TABLE, group: X }), toolCall("g4", "query_metric", { metric: "cost", table: TABLE, group: "zz_nope" })
    ] }];
    await analyzeStream(await tokenFor("谭嘉颖"), streamBody("按广告组拆", [TABLE]));
    const [a, b, c, d] = toolMessagesOf().map(message => JSON.parse(message.content));
    assert.equal(a.ok, false);
    assert.equal(a.error.replace(X, "?"), b.error.replace("zz_nope", "?"));
    assert.equal(c.ok, false);
    assert.equal(c.error.replace(X, "?"), d.error.replace("zz_nope", "?"));
    assert.equal(c.error.split("可用分组")[1].includes(X), false, "可用分组列表里不含隐藏字段");
    await saveGroups({});
  });

  test("证据方式（不走工具）：portalContext 里带隐藏字段，证据与推荐问题仍不含它", async () => {
    await saveGroups({ [TABLE]: [X] });
    requests = [];
    toolScript = [];
    const portalContext = [{
      cnName: TABLE, desc: "门户说明", fields: [{ name: X, comment: "广告组", dict: "广告组字典" }, { name: ` ${X} `, comment: "带空格" }, { name: "media_source", comment: "媒体", dict: "媒体字典" }],
      dictEnums: [{ name: "广告组字典", items: ["CMP001=一组"] }, { name: "媒体字典", items: ["1=巨量"] }],
      tagConfig: { 名称: "标签", 标签字段: [X, "media_source"] },
      dimensionRows: [{ [X]: "CMP001", media_source: "巨量" }]
    }];
    const result = await analyzeStream(await tokenFor("谭嘉颖"), streamBody("看看这张表", [TABLE], { toolMode: false, portalContext }));
    assert.equal(result.status, 200);
    const prompt = requests.at(-1).messages.find(message => message.role === "user").content;
    assert.match(prompt, /media_source/, "可见字段照常进入证据");
    assert.match(prompt, /1=巨量/);
    leakFree("证据提示词", JSON.stringify(requests));
    leakFree("SSE 响应（含推荐问题）", JSON.stringify(result.events));

    // 归因场景同样走裁剪视图
    requests = [];
    const attribution = await analyzeStream(await tokenFor("谭嘉颖"), streamBody("为什么消耗涨了", [TABLE], { toolMode: false, scenario: "attribution" }));
    assert.equal(attribution.status, 200);
    leakFree("归因证据", JSON.stringify(requests));
    await saveGroups({});
  });

  test("内置 Skill 包（证据脚本读原始数据）与归因：有隐藏字段时同样不含它，被隐藏的分组维度不参与归因", async () => {
    await saveGroups({ [TABLE]: [X, "plan_name"] });
    for (const skillId of ["warehouse-analyst", "numa-warehouse", "lineage-analyst"]) {
      requests = [];
      toolScript = [];
      const result = await analyzeStream(await tokenFor("谭嘉颖"), streamBody("看看这张表", [TABLE], { toolMode: false, skillId }));
      assert.equal(result.status, 200, skillId);
      leakFree(`技能 ${skillId} 的证据`, JSON.stringify(requests));
      assert.equal(JSON.stringify(requests).includes("plan_name"), false, skillId);
      assert.match(requests.at(-1).messages.find(message => message.role === "user").content, /media_source/, `${skillId} 仍有可见字段的证据`);
    }
    requests = [];
    const attribution = await analyzeStream(await tokenFor("谭嘉颖"), streamBody("为什么消耗涨了", [TABLE], { toolMode: false, scenario: "attribution" }));
    assert.equal(attribution.status, 200);
    const prompt = requests.at(-1).messages.find(message => message.role === "user").content;
    assert.match(prompt, /归因计算/);
    assert.equal(prompt.includes("plan_name"), false, "被隐藏的维度不参与归因");
    await saveGroups({});
  });

  test("规范包：隐藏 department / cash_cost 后，SKILL.md、read_reference、口径解析、工具结果与响应都不含它们；管理员照常", async () => {
    const EQ = "权益-账号维度消耗统计表";
    const NAMES = /(^|[^A-Za-z0-9_])(department|cash_cost)(?![A-Za-z0-9_])/;
    const script = () => [
      { calls: ["metrics", "table-schema", "playbook", "sql-templates"].map((name, index) => toolCall(`rr${index}`, "read_reference", { name })) },
      { calls: [toolCall("e1", "get_schema", { table: EQ }), toolCall("e2", "list_metrics", {}), toolCall("e3", "get_sample_rows", { table: EQ })] }
    ];
    const body = streamBody("任哥近 7 天消耗怎么样？白驹呢", [EQ], { skillId: "equity-union-analyst" });
    await saveGroups({ [EQ]: ["department", "cash_cost"] });
    requests = [];
    toolScript = script();
    const result = await analyzeStream(await tokenFor("谭嘉颖"), body);
    assert.equal(result.status, 200);
    assert.equal(result.done.meta.toolMode, "used:7");
    const text = JSON.stringify(requests) + JSON.stringify(result.events);
    const hit = text.match(NAMES);
    assert.equal(hit, null, `不应出现隐藏字段名：…${hit ? text.slice(Math.max(0, hit.index - 80), hit.index + 40) : ""}…`);
    assert.equal((result.done.meta.resolvedTerms || []).some(item => item.term === "任哥"), false, "按隐藏字段筛选的口径不解析");
    assert.match(text, /read_reference/);

    await saveGroups({});
    requests = [];
    toolScript = script();
    const admin = await analyzeStream(await tokenFor("曾祥竞"), body);
    assert.equal(admin.status, 200);
    assert.match(JSON.stringify(requests), NAMES, "不受限用户拿到完整资料");
    assert.ok((admin.done.meta.resolvedTerms || []).some(item => item.term === "任哥"));
  });

  test("内置 Skill 包不引用表时，只给有权限的表的证据", async () => {
    await saveGroups({});
    for (const skillId of ["warehouse-analyst", "numa-warehouse"]) {
      requests = [];
      toolScript = [];
      const result = await analyzeStream(await tokenFor("谭嘉颖"), streamBody("有哪些表", [], { toolMode: false, skillId }));
      assert.equal(result.status, 200, skillId);
      const prompt = requests.at(-1).messages.find(message => message.role === "user").content;
      assert.match(prompt, /广告计划日报表/, skillId);
      for (const name of ["用户订单明细", "dwd_user_order_detail", "渠道归因明细", "用户画像标签明细表"]) assert.equal(prompt.includes(name), false, `${skillId} 不应含无权表 ${name}`);
    }
  });

  test("个人 grantedFields 把组里隐藏的字段追加回来后，该用户能看到", async () => {
    await saveGroups({ [TABLE]: [X] });
    const admin = await tokenFor("曾祥竞");
    const put = await call("PUT", `/v1/permissions/${encodeURIComponent("谭嘉颖")}`, { token: admin, body: { tables: ["广告计划日报表", "广告账户日报"], grantedFields: { [TABLE]: [X] } } });
    assert.equal(put.status, 200, JSON.stringify(put.data));
    requests = [];
    toolScript = [{ calls: [toolCall("p1", "get_schema", { table: TABLE })] }];
    await analyzeStream(await tokenFor("谭嘉颖"), streamBody("字段？", [TABLE]));
    const schema = JSON.parse(toolMessagesOf()[0].content);
    assert.ok(schema.data.字段.some(field => field.name === X));
    assert.equal((await call("PUT", `/v1/permissions/${encodeURIComponent("谭嘉颖")}`, { token: admin, body: { tables: [] } })).status, 200);
    await saveGroups({});
  });
});
