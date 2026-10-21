#!/usr/bin/env node
/**
 * Skill / 模型评测：用一组黄金问题跑真实的分析接口，按可确定的标准打分。
 *
 * 用法：
 *   EVAL_PASSWORD=<账号密码> node scripts/run-evals.cjs --base http://localhost:8787 --models gpt-5.6-sol,gpt-6-sol
 *   选项：--cases evals/cases.json  --filter <id 子串>  --out evals/results  --baseline evals/baseline.json
 *   退出码：有用例失败、或相对基线出现回退（基线里通过、现在失败）时为 1。
 *
 * 判分尽量不靠字符串：「标准答案」由平台按口径算出（POST /v1/metrics/query，用有权限的管理员账号取），
 * 再检查报告里是否引用了这个数字；权限类用例检查「无权限的数字不能出现」。
 */

const fs = require("fs");
const path = require("path");
const { mentionsNumber, checkNumericGrounding } = require("./numeric-check.cjs");

async function http(baseUrl, route, { method = "GET", token = "", body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(baseUrl + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(300000) });
  const text = await response.text();
  let data = text;
  try { data = JSON.parse(text); } catch { /* 非 JSON */ }
  return { status: response.status, data };
}

/** 一个用例的全部检查，返回 [{ name, ok, detail }] */
async function checkCase({ testCase, defaults, response, elapsedMs, truth }) {
  const expect = testCase.expect || {};
  const checks = [];
  const add = (name, ok, detail = "") => checks.push({ name, ok: Boolean(ok), detail: ok ? "" : detail });

  const expectedStatus = expect.expectStatus || 200;
  add("HTTP 状态", response.status === expectedStatus, `期望 ${expectedStatus}，实际 ${response.status}：${JSON.stringify(response.data).slice(0, 160)}`);
  if (response.status !== 200 || !response.data?.report) return { checks, tokens: 0, toolNames: [] };

  const { report, meta = {} } = response.data;
  const toolNames = (meta.toolCalls || []).map(call => call.tool);
  const tokens = Number(meta.totalTokens) || Number(meta.usage?.total_tokens) || 0;

  if (expect.anyTool) add("调用了应调用的工具", expect.anyTool.some(name => toolNames.includes(name)), `期望其中之一 ${expect.anyTool.join("/")}，实际 ${toolNames.join("、") || "无"}`);
  if (expect.askUser) add("先向用户提问", /```ask/.test(report), "报告里没有 ```ask 问题卡片");
  (expect.mustMatch || []).forEach(pattern => add(`包含 /${pattern}/`, new RegExp(pattern).test(report), "报告里没有匹配的内容"));
  if (expect.mustMatchAny) add(`包含其中之一 ${expect.mustMatchAny.map(pattern => `/${pattern}/`).join(" 或 ")}`, expect.mustMatchAny.some(pattern => new RegExp(pattern).test(report)), "报告里没有任何一个匹配的内容");
  (expect.mustNotMatch || []).forEach(pattern => add(`不包含 /${pattern}/`, !new RegExp(pattern).test(report), "报告里出现了不该出现的内容"));

  for (const spec of expect.cites || []) {
    const value = await truth(spec);
    add(`引用了标准答案 ${spec.metric}.${spec.field}=${value}`, value !== null && mentionsNumber(report, value), `报告里没有找到 ${value}`);
  }
  for (const spec of expect.mustNotCite || []) {
    const value = await truth(spec);
    add(`没有泄露 ${spec.metric}.${spec.field}（无权限的数字）`, value === null || !mentionsNumber(report, value), `报告里出现了无权限的数字 ${value}`);
  }
  if (expect.topGroupMentioned) {
    const top = await truth({ ...expect.topGroupMentioned, field: "__topGroup" });
    add(`提到了变化最大的分组「${top}」`, Boolean(top) && report.includes(top), `报告里没有提到 ${top}`);
  }

  const maxUngrounded = expect.maxUngrounded ?? defaults.maxUngrounded;
  if (maxUngrounded !== undefined) {
    const ungrounded = meta.numericCheck?.ungrounded?.length ?? checkNumericGrounding(report, [], "").ungrounded.length;
    add(`证据外的数字不超过 ${maxUngrounded} 个`, ungrounded <= maxUngrounded, `实际 ${ungrounded} 个：${(meta.numericCheck?.ungrounded || []).join("、")}`);
  }
  if (expect.maxTokens) add(`token 不超过 ${expect.maxTokens}`, tokens <= expect.maxTokens, `实际 ${tokens}`);
  if (expect.maxLatencyMs) add(`耗时不超过 ${expect.maxLatencyMs}ms`, elapsedMs <= expect.maxLatencyMs, `实际 ${elapsedMs}ms`);
  return { checks, tokens, toolNames };
}

/**
 * @param {{ baseUrl: string, password: string, cases: object, models?: string[], filter?: string, truthUser?: string, log?: Function }} options
 */
async function runEvals({ baseUrl, password, cases, models = [], filter = "", truthUser = "曾祥竞", log = () => {} }) {
  const defaults = cases.defaults || {};
  const tokens = {};
  const login = async name => {
    if (!tokens[name]) {
      const result = await http(baseUrl, "/v1/auth/login", { method: "POST", body: { name, password } });
      if (result.status !== 200) throw new Error(`登录 ${name} 失败：${JSON.stringify(result.data)}`);
      tokens[name] = result.data.token;
    }
    return tokens[name];
  };

  const modelList = models.length ? models : [(await http(baseUrl, "/v1/models", { token: await login(truthUser) })).data.default];
  const selected = (cases.cases || []).filter(item => !filter || item.id.includes(filter));
  const truthCache = new Map();

  /** 取标准答案：field = 指标窗口字段；__topGroup = 变化量最大的分组名 */
  const truth = async spec => {
    const key = JSON.stringify(spec);
    if (!truthCache.has(key)) {
      const result = await http(baseUrl, "/v1/metrics/query", { method: "POST", token: await login(spec.as || truthUser), body: { metric: spec.metric, table: spec.table, group: spec.group, days: spec.days, filters: spec.filters } });
      let value = null;
      if (result.status === 200) value = spec.field === "__topGroup" ? result.data.分组?.明细?.[0]?.组 ?? null : result.data[spec.field] ?? null;
      truthCache.set(key, value);
    }
    return truthCache.get(key);
  };

  const results = [];
  for (const model of modelList) {
    for (const testCase of selected) {
      const user = testCase.user || defaults.user || truthUser;
      const started = Date.now();
      let response;
      try {
        response = await http(baseUrl, "/v1/analyze", {
          method: "POST",
          token: await login(user),
          body: { question: testCase.question, scenario: testCase.scenario || defaults.scenario || "single", skillId: testCase.skillId || "", tables: testCase.tables || [], model, stream: false }
        });
      } catch (error) {
        response = { status: 0, data: { error: error.message } };
      }
      const elapsedMs = Date.now() - started;
      const { checks, tokens: used, toolNames } = await checkCase({ testCase, defaults, response, elapsedMs, truth });
      const passed = checks.every(check => check.ok);
      results.push({ id: testCase.id, title: testCase.title, model, user, passed, checks, tokens: used, latencyMs: elapsedMs, tools: toolNames });
      log(`${passed ? "通过" : "失败"}  ${model}  ${testCase.id}  (${elapsedMs}ms, ${used} tokens)${passed ? "" : "\n" + checks.filter(check => !check.ok).map(check => `    ✗ ${check.name}：${check.detail}`).join("\n")}`);
    }
  }
  return { at: new Date().toISOString(), baseUrl, models: modelList, results, summary: summarize(results) };
}

function summarize(results) {
  const byModel = {};
  results.forEach(result => {
    const entry = (byModel[result.model] = byModel[result.model] || { passed: 0, total: 0, tokens: 0, latencyMs: 0 });
    entry.total += 1;
    entry.passed += result.passed ? 1 : 0;
    entry.tokens += result.tokens;
    entry.latencyMs += result.latencyMs;
  });
  Object.values(byModel).forEach(entry => { entry.avgLatencyMs = Math.round(entry.latencyMs / entry.total); delete entry.latencyMs; });
  return byModel;
}

/** 相对基线：基线里通过、现在失败的用例就是回退 */
function findRegressions(current, baseline) {
  const passedBefore = new Set((baseline.results || []).filter(result => result.passed).map(result => `${result.model}::${result.id}`));
  return current.results.filter(result => !result.passed && passedBefore.has(`${result.model}::${result.id}`)).map(result => `${result.model}::${result.id}`);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index].startsWith("--")) args[argv[index].slice(2)] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : "true";
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const password = process.env.EVAL_PASSWORD;
  if (!password) { console.error("请设置环境变量 EVAL_PASSWORD（评测账号的密码，所有评测账号需使用同一个密码）"); process.exit(2); }
  const casesFile = path.resolve(args.cases || path.join(__dirname, "..", "evals", "cases.json"));
  const report = await runEvals({
    baseUrl: (args.base || "http://localhost:8787").replace(/\/$/, ""),
    password,
    cases: JSON.parse(fs.readFileSync(casesFile, "utf8")),
    models: args.models ? args.models.split(",").map(item => item.trim()).filter(Boolean) : [],
    filter: args.filter || "",
    truthUser: process.env.EVAL_ADMIN || "曾祥竞",
    log: console.log
  });

  console.log("\n汇总（按模型）：");
  Object.entries(report.summary).forEach(([model, entry]) => console.log(`  ${model}：通过 ${entry.passed}/${entry.total}，累计 ${entry.tokens} tokens，平均耗时 ${entry.avgLatencyMs}ms`));

  const outDir = path.resolve(args.out || path.join(__dirname, "..", "evals", "results"));
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `eval-${report.at.replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(`\n明细已写入 ${outFile}`);

  let failed = report.results.some(result => !result.passed);
  if (args.baseline) {
    const regressions = findRegressions(report, JSON.parse(fs.readFileSync(path.resolve(args.baseline), "utf8")));
    if (regressions.length) { console.log(`\n相对基线出现回退：\n  ${regressions.join("\n  ")}`); failed = true; }
    else console.log("\n相对基线没有回退。");
  }
  process.exit(failed ? 1 : 0);
}

if (require.main === module) main().catch(error => { console.error(error); process.exit(2); });

module.exports = { runEvals, findRegressions, summarize };
