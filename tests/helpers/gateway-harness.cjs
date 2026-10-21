/**
 * 端到端测试脚手架：真实网关进程（临时数据目录）+ 本地假中转站。
 *
 *   const harness = await startHarness({ env: { PORTAL_DAILY_REQUEST_LIMIT: "2" } });
 *   harness.relay.report = "测试报告";                 // 假模型的回答
 *   harness.relay.toolScript = [{ calls: [...] }];     // 先按脚本发起工具调用，脚本用完后给出最终回答
 *   const token = await harness.tokenFor("曾祥竞");
 *   const result = await harness.call("POST", "/v1/analyze", { token, body: {...} });
 *   await harness.stop();
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const http = require("node:http");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..", "..");
const MODEL = "gpt-5.4-mini";
const PASSWORD = "harness-pass-1";

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

function startFakeRelay(state) {
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
          state.requests.push(body);
          // 可编程的假模型：respond(body) 返回 { calls } 发起工具调用，或 { content } 直接作答；返回 undefined 则走默认逻辑
          const scripted = body.tools && typeof state.respond === "function" ? state.respond(body) : undefined;
          if (scripted?.calls) {
            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ choices: [{ message: { content: "", tool_calls: scripted.calls } }], usage: state.usage }));
          }
          if (scripted && scripted.content !== undefined) {
            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ choices: [{ message: { content: scripted.content } }], usage: state.usage }));
          }
          if (body.tools && state.toolScript.length) {
            const next = state.toolScript.shift();
            if (next.status) {
              res.writeHead(next.status, { "Content-Type": "application/json" });
              return res.end(JSON.stringify({ error: { message: "tools not supported" } }));
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ choices: [{ message: { content: "", tool_calls: next.calls } }], usage: state.usage }));
          }
          const content = typeof state.report === "function" ? state.report(body) : state.report;
          if (body.stream) {
            res.writeHead(200, { "Content-Type": "text/event-stream" });
            const half = Math.floor(content.length / 2);
            [content.slice(0, half), content.slice(half)].forEach(part => {
              res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: part } }] })}\n\n`);
            });
            res.write(`data: ${JSON.stringify({ choices: [], usage: state.usage })}\n\n`);
            res.write("data: [DONE]\n\n");
            return res.end();
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ choices: [{ message: { content } }], usage: state.usage }));
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

async function startHarness({ env = {} } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "gateway-harness-"));
  const relayState = { requests: [], toolScript: [], report: "默认测试回答", usage: { prompt_tokens: 6, completion_tokens: 4, total_tokens: 10 } };
  const fakeRelay = await startFakeRelay(relayState);
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const gateway = await startGateway({
    PORT: String(port),
    DATA_DIR: dataDir,
    PORTAL_INITIAL_PASSWORD: PASSWORD,
    PORTAL_AUTH_SECRET: "harness-secret",
    RELAY_API_KEY: "fake-key",
    RELAY_BASE_URL: `http://127.0.0.1:${fakeRelay.address().port}/v1`,
    ...env
  });

  const tokens = {};
  async function call(method, route, { token = "", body, raw, headers = {} } = {}) {
    const init = { method, headers: { ...headers } };
    if (token) init.headers.Authorization = `Bearer ${token}`;
    if (raw) init.body = raw;
    else if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const response = await fetch(baseUrl + route, { ...init, signal: AbortSignal.timeout(60000) });
    const text = await response.text();
    let data = text;
    try { data = JSON.parse(text); } catch { /* 流式或非 JSON */ }
    return { status: response.status, data, text, headers: response.headers };
  }

  async function tokenFor(name) {
    if (!tokens[name]) {
      const result = await call("POST", "/v1/auth/login", { body: { name, password: PASSWORD } });
      tokens[name] = result.data.token;
    }
    return tokens[name];
  }

  /** 流式分析：返回 { status, events, done, text } */
  async function analyzeStream(name, body) {
    const response = await fetch(`${baseUrl}/v1/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await tokenFor(name)}` },
      body: JSON.stringify({ stream: true, model: MODEL, scenario: "single", ...body }),
      signal: AbortSignal.timeout(60000)
    });
    const text = await response.text();
    let events = [];
    if (response.headers.get("content-type")?.includes("event-stream")) {
      events = text.split("\n").filter(line => line.startsWith("data: ")).map(line => JSON.parse(line.slice(6)));
    }
    return { status: response.status, events, done: events.find(event => event.done), text };
  }

  // 等中转站模型同步完成
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const models = await call("GET", "/v1/models", { token: await tokenFor("曾祥竞") });
    if (models.data.models?.includes(MODEL)) break;
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  return {
    baseUrl, dataDir, MODEL, PASSWORD, relay: relayState, call, tokenFor, analyzeStream,
    readJsonLines: file => {
      try { return fs.readFileSync(path.join(dataDir, file), "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)); } catch { return []; }
    },
    stop: async () => {
      gateway.kill("SIGKILL");
      fakeRelay.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  };
}

module.exports = { startHarness, MODEL, PASSWORD };
