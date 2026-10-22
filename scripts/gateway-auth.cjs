/**
 * 网关身份认证：账号密码 + HMAC 签名的会话令牌
 *
 * - 账号：DATA_DIR/auth-accounts.json，只存 scrypt 哈希（不存明文密码）
 * - 令牌：`base64url(payload).hmac`，payload = { n: 用户名, exp: 过期时间戳 }，默认 12 小时
 * - 签名密钥：环境变量 PORTAL_AUTH_SECRET；未设置时首次生成并写入 DATA_DIR/auth-secret.key（0600）
 * - 角色不落盘：每次请求按当前权限组计算（见 analysis-gateway.cjs 的 roleOf），调整权限组即刻生效
 *
 * 命令行（运维重置密码）：node scripts/gateway-auth.cjs set-password <用户名> <新密码>
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function createAuth(dataDir) {
  const accountsFile = path.join(dataDir, "auth-accounts.json");
  const secretFile = path.join(dataDir, "auth-secret.key");
  const failures = new Map();
  let secret = null;

  function loadSecret() {
    if (secret) return secret;
    if (process.env.PORTAL_AUTH_SECRET) {
      secret = process.env.PORTAL_AUTH_SECRET;
      return secret;
    }
    try {
      secret = fs.readFileSync(secretFile, "utf8").trim();
    } catch {
      secret = crypto.randomBytes(32).toString("hex");
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(secretFile, secret, { mode: 0o600 });
    }
    return secret;
  }

  function loadAccounts() {
    try { return JSON.parse(fs.readFileSync(accountsFile, "utf8")); } catch { return {}; }
  }

  function saveAccounts(accounts) {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2), { mode: 0o600 });
  }

  function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
    const hash = crypto.scryptSync(String(password), salt, 64, SCRYPT_OPTIONS).toString("hex");
    return { salt, hash };
  }

  function setPassword(name, password) {
    const accounts = loadAccounts();
    accounts[name] = { ...hashPassword(password), updatedAt: new Date().toISOString() };
    saveAccounts(accounts);
  }

  /** 为名单内每个用户补齐账号；首次创建时密码取自 initialPassword，否则随机生成并返回（仅本次打印一次） */
  function bootstrapAccounts(names, initialPassword) {
    const accounts = loadAccounts();
    const generated = [];
    let changed = false;
    names.forEach(name => {
      if (accounts[name]) return;
      const password = initialPassword || crypto.randomBytes(9).toString("base64url");
      accounts[name] = { ...hashPassword(password), updatedAt: new Date().toISOString() };
      if (!initialPassword) generated.push({ name, password });
      changed = true;
    });
    if (changed) saveAccounts(accounts);
    return generated;
  }

  function checkPassword(name, password) {
    const account = loadAccounts()[name];
    if (!account) {
      // 用户不存在时也做一次哈希计算，避免通过响应时间探测账号是否存在
      hashPassword(String(password), "0".repeat(32));
      return false;
    }
    const actual = Buffer.from(hashPassword(String(password), account.salt).hash, "hex");
    const expected = Buffer.from(account.hash, "hex");
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }

  function isLocked(name) {
    const record = failures.get(name);
    return Boolean(record && record.lockedUntil > Date.now());
  }

  function recordFailure(name) {
    const record = failures.get(name) || { count: 0, lockedUntil: 0 };
    record.count += 1;
    if (record.count >= MAX_FAILURES) {
      record.lockedUntil = Date.now() + LOCK_MS;
      record.count = 0;
    }
    failures.set(name, record);
  }

  function clearFailures(name) {
    failures.delete(name);
  }

  function sign(body) {
    return crypto.createHmac("sha256", loadSecret()).update(body).digest("base64url");
  }

  function issueToken(name) {
    const body = Buffer.from(JSON.stringify({ n: name, exp: Date.now() + TOKEN_TTL_MS })).toString("base64url");
    return `${body}.${sign(body)}`;
  }

  /** 校验令牌，返回用户名；无效或过期返回 null */
  function verifyToken(token) {
    if (typeof token !== "string") return null;
    const [body, signature] = token.split(".");
    if (!body || !signature) return null;
    const expected = Buffer.from(sign(body));
    const actual = Buffer.from(signature);
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
      if (!payload.n || !(payload.exp > Date.now())) return null;
      return payload.n;
    } catch {
      return null;
    }
  }

  /** 从请求头 Authorization: Bearer <token> 取出用户名 */
  function userFromRequest(req) {
    const header = String(req.headers.authorization || "");
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? verifyToken(match[1].trim()) : null;
  }

  /** 从 Cookie 头取出会话令牌（浏览器端同源使用 httpOnly cookie，页面脚本读不到） */
  function tokenFromCookie(req) {
    const match = String(req.headers.cookie || "").match(/(?:^|;\s*)gxt_session=([^;]+)/);
    return match ? match[1].trim() : "";
  }

  function userFromCookie(req) {
    const token = tokenFromCookie(req);
    return token ? verifyToken(token) : null;
  }

  return {
    setPassword, bootstrapAccounts, checkPassword,
    isLocked, recordFailure, clearFailures,
    issueToken, verifyToken, userFromRequest, userFromCookie
  };
}

module.exports = { createAuth };

if (require.main === module) {
  const [command, name, password] = process.argv.slice(2);
  const dataDir = process.env.DATA_DIR || path.join(__dirname, "..", "data");
  if (command !== "set-password" || !name || !password) {
    console.error("用法：node scripts/gateway-auth.cjs set-password <用户名> <新密码>");
    process.exit(1);
  }
  createAuth(dataDir).setPassword(name, password);
  console.log(`已更新账号「${name}」的密码。`);
}
