/**
 * 用量统计与每人每日配额。
 *
 * - 统计口径：按「服务器本地日期」分桶，记录每人的请求数与 token 数；只保留最近 30 天。
 * - 限额：默认值来自环境变量 PORTAL_DAILY_REQUEST_LIMIT / PORTAL_DAILY_TOKEN_LIMIT；
 *   管理员可通过接口为全员或个人覆盖（0 表示不限）。覆盖值保存在 DATA_DIR/quota-config.json。
 * - 检查发生在请求开始前：请求数达到上限即拒绝；token 数达到上限即拒绝（最后一次请求允许小幅超出）。
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_REQUEST_LIMIT = 200;
const DEFAULT_TOKEN_LIMIT = 2000000;
const KEEP_DAYS = 30;

const toCount = (value, fallback) => {
  // 空字符串（例如 compose 里 ${VAR:-} 传进来的空值）不是「0 = 不限」，按未设置处理
  if (value === "" || value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};

function createUsageTracker({ dataDir, env = process.env, now = () => new Date() }) {
  const usageFile = path.join(dataDir, "usage.json");
  const configFile = path.join(dataDir, "quota-config.json");

  const todayKey = () => {
    const date = now();
    const pad = value => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };

  function readJson(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
  }

  function writeJson(file, data) {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  }

  function loadUsage() {
    const data = readJson(usageFile, { days: {} });
    return data && typeof data.days === "object" ? data : { days: {} };
  }

  function saveUsage(data) {
    const keys = Object.keys(data.days).sort();
    keys.slice(0, Math.max(0, keys.length - KEEP_DAYS)).forEach(key => delete data.days[key]);
    writeJson(usageFile, data);
  }

  /** 生效限额：个人覆盖 > 全员覆盖 > 环境变量默认值 */
  function limitsFor(user) {
    const config = readJson(configFile, {});
    const base = {
      requests: toCount(config.requests, toCount(env.PORTAL_DAILY_REQUEST_LIMIT, DEFAULT_REQUEST_LIMIT)),
      tokens: toCount(config.tokens, toCount(env.PORTAL_DAILY_TOKEN_LIMIT, DEFAULT_TOKEN_LIMIT))
    };
    const personal = config.perUser?.[user] || {};
    return { requests: toCount(personal.requests, base.requests), tokens: toCount(personal.tokens, base.tokens) };
  }

  function usageOf(user) {
    const entry = loadUsage().days[todayKey()]?.[user] || {};
    return { date: todayKey(), requests: entry.requests || 0, tokens: entry.tokens || 0 };
  }

  /** 请求开始前检查；通过返回 { ok: true }，否则给出可直接展示的原因 */
  function check(user) {
    const usage = usageOf(user);
    const limits = limitsFor(user);
    if (limits.requests > 0 && usage.requests >= limits.requests) {
      return { ok: false, error: `今日分析次数已达上限（${limits.requests} 次），请明天再试或联系管理员调整额度`, usage, limits };
    }
    if (limits.tokens > 0 && usage.tokens >= limits.tokens) {
      return { ok: false, error: `今日 token 用量已达上限（${limits.tokens}），请明天再试或联系管理员调整额度`, usage, limits };
    }
    return { ok: true, usage, limits };
  }

  function bump(user, field, amount) {
    if (!(amount > 0)) return;
    const data = loadUsage();
    const day = (data.days[todayKey()] = data.days[todayKey()] || {});
    const entry = (day[user] = day[user] || { requests: 0, tokens: 0 });
    entry[field] += Math.floor(amount);
    saveUsage(data);
  }

  const recordRequest = user => bump(user, "requests", 1);
  const recordTokens = (user, tokens) => bump(user, "tokens", tokens);

  /** 管理员视图：今日全员用量 + 生效限额 */
  function snapshot(userNames) {
    const day = loadUsage().days[todayKey()] || {};
    return {
      date: todayKey(),
      users: userNames.map(name => ({ name, requests: day[name]?.requests || 0, tokens: day[name]?.tokens || 0, limits: limitsFor(name) }))
    };
  }

  /** 保存限额覆盖：{ requests, tokens, perUser: { 姓名: { requests, tokens } } }，只接受非负整数 */
  function setLimits(input, validUsers) {
    const config = readJson(configFile, {});
    if (input.requests !== undefined) config.requests = toCount(input.requests, config.requests);
    if (input.tokens !== undefined) config.tokens = toCount(input.tokens, config.tokens);
    if (input.perUser && typeof input.perUser === "object") {
      config.perUser = config.perUser || {};
      Object.entries(input.perUser).forEach(([name, value]) => {
        if (!validUsers.includes(name)) return;
        if (value === null) { delete config.perUser[name]; return; }
        config.perUser[name] = {
          ...(config.perUser[name] || {}),
          ...(value.requests !== undefined ? { requests: toCount(value.requests, 0) } : {}),
          ...(value.tokens !== undefined ? { tokens: toCount(value.tokens, 0) } : {})
        };
      });
    }
    writeJson(configFile, config);
    return config;
  }

  return { limitsFor, usageOf, check, recordRequest, recordTokens, snapshot, setLimits };
}

module.exports = { createUsageTracker, DEFAULT_REQUEST_LIMIT, DEFAULT_TOKEN_LIMIT };
