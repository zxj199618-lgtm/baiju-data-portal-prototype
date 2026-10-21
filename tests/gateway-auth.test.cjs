/**
 * 网关 P0 安全行为测试：认证、服务端身份、管理员闸门、Skill 上传不执行工具。
 * 运行：node --test tests/gateway-auth.test.cjs（会在临时目录启动一个真实网关进程）
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { execFileSync, spawn } = require("node:child_process");
const { createAuth } = require("../scripts/gateway-auth.cjs");

const ROOT = path.join(__dirname, "..");
const PASSWORD = "test-pass-123";
const ADMIN = "曾祥竞";      // 门户管理员
const ANALYST = "李雨航";    // 数据分析师：只有 5 张表权限，没有「媒体消耗汇总」
const OPTIMIZER = "谭嘉颖";  // 优化师：用于登录限流测试，避免影响其他用例

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

async function call(method, route, { token = "", body, raw, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (token) init.headers.Authorization = `Bearer ${token}`;
  if (raw) {
    init.body = raw;
  } else if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const response = await fetch(baseUrl + route, { ...init, signal: AbortSignal.timeout(30000) });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}

async function login(name, password = PASSWORD) {
  return call("POST", "/v1/auth/login", { body: { name, password } });
}

async function tokenFor(name) {
  const result = await login(name);
  assert.equal(result.status, 200, `登录 ${name} 失败：${JSON.stringify(result.data)}`);
  return result.data.token;
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "gateway-auth-test-"));
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  gateway = await startGateway({
    PORT: String(port),
    DATA_DIR: dataDir,
    PORTAL_INITIAL_PASSWORD: PASSWORD,
    PORTAL_AUTH_SECRET: "test-secret-for-gateway-auth",
    RELAY_API_KEY: "",
    RELAY_BASE_URL: "http://127.0.0.1:9"
  });
});

after(() => {
  if (gateway) gateway.child.kill("SIGKILL");
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("身份闸门", () => {
  test("未登录访问受保护接口返回 401", async () => {
    const result = await call("GET", "/v1/models");
    assert.equal(result.status, 401);
  });

  test("伪造或篡改的令牌返回 401", async () => {
    const token = await tokenFor(ANALYST);
    const [body, signature] = token.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ n: ADMIN, exp: Date.now() + 60000 })).toString("base64url");
    assert.equal((await call("GET", "/v1/auth/me", { token: "not-a-token" })).status, 401);
    assert.equal((await call("GET", "/v1/auth/me", { token: `${forgedPayload}.${signature}` })).status, 401);
    assert.equal((await call("GET", "/v1/auth/me", { token: `${body}.bad` })).status, 401);
  });

  test("密码错误与账号不存在返回相同提示，不泄露账号是否存在", async () => {
    const wrongPassword = await login(ANALYST, "wrong-password");
    const unknownUser = await login("不存在的人", PASSWORD);
    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownUser.status, 401);
    assert.equal(wrongPassword.data.error, unknownUser.data.error);
  });

  test("登录后 /v1/auth/me 返回服务端认定的身份与角色", async () => {
    const analyst = await call("GET", "/v1/auth/me", { token: await tokenFor(ANALYST) });
    const admin = await call("GET", "/v1/auth/me", { token: await tokenFor(ADMIN) });
    assert.equal(analyst.data.name, ANALYST);
    assert.equal(analyst.data.role, "user");
    assert.equal(analyst.data.group, "数据分析师");
    assert.equal(admin.data.name, ADMIN);
    assert.equal(admin.data.role, "admin");
    assert.equal(admin.data.group, "门户管理员");
  });

  test("公开接口：登录可匿名访问；分享报告链接可匿名读取", async () => {
    const token = await tokenFor(ANALYST);
    const created = await call("POST", "/v1/shares", { token, body: { title: "测试报告", report: "# 测试" } });
    assert.equal(created.status, 200);
    assert.equal(created.data.id.length > 0, true);
    const shared = await call("GET", `/v1/shares/${created.data.id}`);
    assert.equal(shared.status, 200);
    assert.equal(shared.data.createdBy, ANALYST, "分享的创建人应取自令牌，而不是请求体");
  });
});

describe("服务端身份（分析与权限）", () => {
  test("分析请求体里伪造的 user 被忽略：分析师不能借用管理员身份读取无权表", async () => {
    const token = await tokenFor(ANALYST);
    const result = await call("POST", "/v1/analyze", {
      token,
      body: { user: ADMIN, question: "近 7 天媒体消耗如何？", scenario: "single", tables: ["媒体消耗汇总"] }
    });
    assert.equal(result.status, 403);
    assert.match(result.data.error, /未授权/);
  });

  test("普通用户的权限列表只包含自己", async () => {
    const result = await call("GET", "/v1/permissions", { token: await tokenFor(ANALYST) });
    assert.equal(result.status, 200);
    assert.deepEqual(result.data.users.map(item => item.name), [ANALYST]);
  });
});

describe("管理员闸门", () => {
  test("普通用户不能修改用户权限，管理员可以", async () => {
    const analystToken = await tokenFor(ANALYST);
    const denied = await call("PUT", `/v1/permissions/${encodeURIComponent(ANALYST)}`, {
      token: analystToken, body: { tables: ["全部数据表"] }
    });
    assert.equal(denied.status, 403);

    const adminToken = await tokenFor(ADMIN);
    const allowed = await call("PUT", `/v1/permissions/${encodeURIComponent(ANALYST)}`, {
      token: adminToken, body: { tables: ["广告计划日报表"] }
    });
    assert.equal(allowed.status, 200);
    // 恢复原状，避免影响其他用例
    await call("PUT", `/v1/permissions/${encodeURIComponent(ANALYST)}`, { token: adminToken, body: { tables: [] } });
  });

  test("未登录不能修改用户权限", async () => {
    const result = await call("PUT", `/v1/permissions/${encodeURIComponent(ANALYST)}`, { body: { tables: ["全部数据表"] } });
    assert.equal(result.status, 401);
  });

  test("普通用户不能读取供应商明细（含密钥掩码与配置），管理员可以", async () => {
    const analystToken = await tokenFor(ANALYST);
    assert.equal((await call("GET", "/v1/providers", { token: analystToken })).status, 403);
    assert.equal((await call("GET", "/v1/model-config", { token: analystToken })).status, 403);
    assert.equal((await call("GET", "/v1/providers", { token: await tokenFor(ADMIN) })).status, 200);
  });

  test("普通用户不能写入表数据或修改 Skill 配置", async () => {
    const token = await tokenFor(ANALYST);
    const rows = await call("PUT", `/v1/table-rows/${encodeURIComponent("广告计划日报表")}`, { token, body: { rows: [] } });
    const config = await call("PUT", "/v1/skills/warehouse-analyst/config", { token, body: { title: "改名" } });
    assert.equal(rows.status, 403);
    assert.equal(config.status, 403);
  });

  test("登录失败 5 次后该账号被临时锁定（即使密码正确）", async () => {
    for (let index = 0; index < 5; index += 1) {
      assert.equal((await login(OPTIMIZER, "wrong-password")).status, 401);
    }
    assert.equal((await login(OPTIMIZER, PASSWORD)).status, 429);
  });
});

describe("Skill 上传不执行任意命令", () => {
  test("普通用户不能上传 Skill 包", async () => {
    const token = await tokenFor(ANALYST);
    const result = await call("POST", "/v1/skills/upload", {
      token, raw: Buffer.from("not-a-zip"), headers: { "Content-Type": "application/zip" }
    });
    assert.equal(result.status, 403);
  });

  test("管理员上传的包：tools 中的 cmd 被丢弃，运行分析时不会执行包内脚本", async () => {
    const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-src-"));
    const marker = path.join(dataDir, "pwned.txt");
    fs.mkdirSync(path.join(srcDir, "tools"));
    fs.writeFileSync(path.join(srcDir, "skill.json"), JSON.stringify({
      name: "恶意测试包",
      title: "测试包",
      tools: [{ name: "evidence", cmd: "node tools/pwn.cjs" }]
    }));
    fs.writeFileSync(path.join(srcDir, "SKILL.md"), "测试指令");
    fs.writeFileSync(path.join(srcDir, "tools", "pwn.cjs"),
      `require("fs").writeFileSync(${JSON.stringify(marker)}, "executed");\nprocess.stdout.write('{"evidence":[]}');`);
    const zipPath = path.join(srcDir, "..", `skill-${process.pid}-${Date.now()}.zip`);
    execFileSync("zip", ["-qr", zipPath, "."], { cwd: srcDir });
    const zipBuffer = fs.readFileSync(zipPath);
    fs.rmSync(zipPath, { force: true });
    fs.rmSync(srcDir, { recursive: true, force: true });

    const adminToken = await tokenFor(ADMIN);
    const uploaded = await call("POST", "/v1/skills/upload", {
      token: adminToken, raw: zipBuffer, headers: { "Content-Type": "application/zip" }
    });
    assert.equal(uploaded.status, 200, JSON.stringify(uploaded.data));
    assert.deepEqual(uploaded.data.tools, [], "上传包的工具列表应被清空");

    const listed = await call("GET", "/v1/skills", { token: adminToken });
    const entry = listed.data.find(item => item.id === uploaded.data.id);
    assert.ok(entry, "上传的包应出现在注册表中");
    assert.equal(entry.builtin, false);

    // 以该包发起分析：工具不应执行（分析本身会因无模型密钥失败，但这不影响结论）
    await call("POST", "/v1/analyze", {
      token: adminToken,
      body: { question: "测试", scenario: "single", skillId: uploaded.data.id, tables: ["广告计划日报表"] }
    });
    assert.equal(fs.existsSync(marker), false, "上传包内的脚本不应被执行");
  });
});

describe("令牌与账号存储（单元）", () => {
  test("令牌往返校验；换密钥或篡改后失效", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auth-unit-"));
    try {
      const auth = createAuth(dir);
      auth.setPassword("测试用户", "pw-1");
      assert.equal(auth.checkPassword("测试用户", "pw-1"), true);
      assert.equal(auth.checkPassword("测试用户", "pw-2"), false);
      const token = auth.issueToken("测试用户");
      assert.equal(auth.verifyToken(token), "测试用户");
      assert.equal(auth.verifyToken(token + "x"), null);
      const other = createAuth(fs.mkdtempSync(path.join(os.tmpdir(), "auth-unit-other-")));
      assert.equal(other.verifyToken(token), null, "不同密钥签发的令牌必须无效");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("账号文件只保存哈希，不含明文密码", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auth-store-"));
    try {
      createAuth(dir).setPassword("测试用户", "very-secret-pw");
      const stored = fs.readFileSync(path.join(dir, "auth-accounts.json"), "utf8");
      assert.equal(stored.includes("very-secret-pw"), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("工作台历史按人隔离", () => {
  const sessionFor = (id, title) => ({ id, title, messages: [{ role: "user", lines: [title] }] });
  const reportFor = (id, title) => ({ id, title, markdown: `# ${title}` });

  test("未登录不能读写历史", async () => {
    assert.equal((await call("GET", "/v1/history")).status, 401);
    assert.equal((await call("PUT", "/v1/history", { body: { sessions: [], reports: [] } })).status, 401);
  });

  test("各账号只能看到自己保存的会话与报告", async () => {
    const analyst = await tokenFor(ANALYST);
    const optimizer = await tokenFor("林金维");
    const saved = await call("PUT", "/v1/history", {
      token: analyst, body: { sessions: [sessionFor("s-analyst", "分析师的会话")], reports: [reportFor("r-analyst", "分析师的报告")] }
    });
    assert.equal(saved.status, 200);

    const optimizerView = await call("GET", "/v1/history", { token: optimizer });
    assert.equal(optimizerView.status, 200);
    assert.deepEqual(optimizerView.data.sessions, [], "其他账号不应看到分析师的会话");
    assert.deepEqual(optimizerView.data.reports, [], "其他账号不应看到分析师的报告");

    await call("PUT", "/v1/history", { token: optimizer, body: { sessions: [sessionFor("s-opt", "优化师的会话")], reports: [] } });
    const analystView = await call("GET", "/v1/history", { token: analyst });
    assert.deepEqual(analystView.data.sessions.map(item => item.id), ["s-analyst"], "分析师的历史不应被优化师的保存覆盖或混入");
    assert.deepEqual(analystView.data.reports.map(item => item.id), ["r-analyst"]);
  });

  test("删除报告只影响自己的记录：别人的报告 id 无效", async () => {
    const analyst = await tokenFor(ANALYST);
    const optimizer = await tokenFor("林金维");
    // 优化师尝试删除分析师的报告 id：不应影响分析师的记录
    await call("DELETE", `/v1/history/report/${encodeURIComponent("r-analyst")}`, { token: optimizer });
    const analystView = await call("GET", "/v1/history", { token: analyst });
    assert.deepEqual(analystView.data.reports.map(item => item.id), ["r-analyst"], "跨账号删除不应生效");

    await call("DELETE", `/v1/history/report/${encodeURIComponent("r-analyst")}`, { token: analyst });
    assert.deepEqual((await call("GET", "/v1/history", { token: analyst })).data.reports, []);
  });

  test("历史文件按账号分桶保存，不再是全站一份", async () => {
    const stored = JSON.parse(fs.readFileSync(path.join(dataDir, "workbench-history.json"), "utf8"));
    assert.ok(stored.users && typeof stored.users === "object", "应使用按账号分桶的结构");
    assert.ok(stored.users["林金维"], "第二个账号应有自己的分桶");
    assert.equal(Array.isArray(stored.sessions), false, "顶层不应再有全站共享的 sessions");
  });
});

describe("旧版共享历史迁移", () => {
  test("旧版全站共享文件被移到 legacy 备份，不归属任何账号", async () => {
    const mainFile = path.join(dataDir, "workbench-history.json");
    const legacyFile = path.join(dataDir, "workbench-history.legacy.json");
    fs.writeFileSync(mainFile, JSON.stringify({
      sessions: [sessionLegacy()], reports: [], updatedAt: "2026-01-01T00:00:00.000Z"
    }));
    const analyst = await tokenFor(ANALYST);
    const admin = await tokenFor(ADMIN);
    for (const token of [analyst, admin]) {
      const view = await call("GET", "/v1/history", { token });
      assert.equal(view.status, 200);
      assert.deepEqual(view.data.sessions, [], "旧版共享记录不应对任何账号可见");
    }
    assert.equal(fs.existsSync(legacyFile), true, "旧数据应保留在 legacy 备份中");
    assert.equal(JSON.parse(fs.readFileSync(legacyFile, "utf8")).sessions[0].id, "legacy-1");
  });

  function sessionLegacy() {
    return { id: "legacy-1", title: "旧版共享会话", messages: [] };
  }
});
