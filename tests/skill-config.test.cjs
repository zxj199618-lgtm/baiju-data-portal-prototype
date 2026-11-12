/**
 * Skill 配置：引用的表写回注册表覆盖值，重启后仍在。
 * 运行：node --test tests/skill-config.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PASSWORD = "test-pass-123";
const ADMIN = "曾祥竞";
const ANALYST = "李雨航";
const SKILL_ID = "equity-union-analyst";
const TABLE = "权益-账号维度消耗统计表";

let baseUrl = "";
let gateway = null;
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
        resolve({ child, output: () => output });
      }
    });
    child.stderr.on("data", chunk => { output += chunk; });
    child.on("exit", code => {
      clearTimeout(timer);
      reject(new Error(`网关提前退出（${code}）：${output}`));
    });
  });
}

function gatewayEnv(port) {
  return {
    PORT: String(port),
    DATA_DIR: dataDir,
    PORTAL_INITIAL_PASSWORD: PASSWORD,
    PORTAL_AUTH_SECRET: "test-secret-for-skill-config",
    RELAY_API_KEY: "",
    RELAY_BASE_URL: "http://127.0.0.1:9"
  };
}

async function boot() {
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  gateway = await startGateway(gatewayEnv(port));
}

async function call(method, route, { token = "", body } = {}) {
  const init = { method, headers: {} };
  if (token) init.headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const response = await fetch(baseUrl + route, { ...init, signal: AbortSignal.timeout(30000) });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}

async function tokenFor(name) {
  const result = await call("POST", "/v1/auth/login", { body: { name, password: PASSWORD } });
  assert.equal(result.status, 200, `登录 ${name} 失败：${JSON.stringify(result.data)}`);
  return result.data.token;
}

function skillFrom(list, id = SKILL_ID) {
  assert.ok(Array.isArray(list), "GET /v1/skills 应返回数组");
  const skill = list.find(item => item.id === id);
  assert.ok(skill, `找不到 Skill：${id}`);
  return skill;
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-config-test-"));
  await boot();
});

after(() => {
  if (gateway) gateway.child.kill("SIGKILL");
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("Skill 引用的表", () => {
  test("管理员可以写入 tables，GET 能读到覆盖值", async () => {
    const token = await tokenFor(ADMIN);
    const saved = await call("PUT", `/v1/skills/${SKILL_ID}/config`, { token, body: { tables: [TABLE] } });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    const list = await call("GET", "/v1/skills", { token });
    assert.equal(list.status, 200);
    assert.deepEqual(skillFrom(list.data).tables, [TABLE]);
  });

  test("未知表名返回 400 并带上表名", async () => {
    const token = await tokenFor(ADMIN);
    const result = await call("PUT", `/v1/skills/${SKILL_ID}/config`, { token, body: { tables: [TABLE, "不存在的表"] } });
    assert.equal(result.status, 400);
    assert.match(String(result.data.error || ""), /不存在的表/);
  });

  test("普通用户不能修改 Skill 配置", async () => {
    const token = await tokenFor(ANALYST);
    const result = await call("PUT", `/v1/skills/${SKILL_ID}/config`, { token, body: { tables: [TABLE] } });
    assert.equal(result.status, 403);
  });

  test("空数组会覆盖规范包默认值，不会掉回去", async () => {
    const token = await tokenFor(ADMIN);
    const saved = await call("PUT", `/v1/skills/${SKILL_ID}/config`, { token, body: { tables: [] } });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    const list = await call("GET", "/v1/skills", { token });
    assert.deepEqual(skillFrom(list.data).tables, []);
  });

  test("重启网关后覆盖值还在", async () => {
    const token = await tokenFor(ADMIN);
    const saved = await call("PUT", `/v1/skills/${SKILL_ID}/config`, { token, body: { tables: [TABLE] } });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    gateway.child.kill("SIGKILL");
    await new Promise(resolve => setTimeout(resolve, 300));
    await boot();
    const list = await call("GET", "/v1/skills", { token: await tokenFor(ADMIN) });
    assert.equal(list.status, 200);
    assert.deepEqual(skillFrom(list.data).tables, [TABLE]);
  });
});
