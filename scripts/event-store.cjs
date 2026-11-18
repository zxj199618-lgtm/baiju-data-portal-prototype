/**
 * 访问记录（埋点事件）存储：页面访问 page_view、看板访问心跳 dashboard_view_heartbeat。
 * 追加写入 DATA_DIR/portal-events.jsonl（一行一条），不改写历史；用户、时间、IP、UA 全部由服务端填，不信任客户端。
 * 读取时按时间倒序，支持按事件、用户、终端、时间范围、关键词筛选。
 */
const fs = require("node:fs");
const path = require("node:path");

const EVENTS = ["page_view", "dashboard_view_heartbeat"];
const MAX_FILE_LINES = 200000; // 超过后读取只看最近这么多行，避免文件无限增大拖慢查询
const text = (value, max) => String(value ?? "").trim().slice(0, max);
const pad = value => String(value).padStart(2, "0");
const formatTime = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

/** 终端：移动设备 UA 记为 h5，其余 web */
function platformOf(userAgent) {
  return /iPhone|iPad|Android|Mobile|MicroMessenger/i.test(String(userAgent || "")) ? "h5" : "web";
}

function createEventStore({ dataDir, userIdOf, now = () => new Date() }) {
  const file = path.join(dataDir, "portal-events.jsonl");

  /** 记录一条事件。ctx: { user, ip, userAgent }；body 里只取允许的字段。返回 { ok, record } */
  function record(ctx, body) {
    const event = text(body?.event, 40);
    if (!EVENTS.includes(event)) return { ok: false, error: "不支持的事件类型" };
    const time = now();
    const values = {
      event_time: formatTime(time),
      user_name: ctx.user,
      user_id: userIdOf ? userIdOf(ctx.user) : ctx.user,
      is_login: true,
      distinct_id: text(body?.distinctId, 60),
      user_agent: text(ctx.userAgent, 300),
      platform: platformOf(ctx.userAgent),
      env: "prod",
      app_name: "观星台",
      ip: text(ctx.ip, 60)
    };
    if (event === "page_view") {
      values.menu_name = text(body?.menuName, 60);
      values.page_url = text(body?.pageUrl, 500);
      values.referrer_url = text(body?.referrerUrl, 500);
    } else {
      const visitId = text(body?.visitId, 60);
      if (!/^[A-Za-z0-9_-]{6,60}$/.test(visitId)) return { ok: false, error: "看板心跳需要 visitId" };
      values.visit_id = visitId;
      values.dashboard_id = text(body?.dashboardId, 60);
      values.dashboard_name = text(body?.dashboardName, 80);
      values.category = text(body?.category, 40);
      values.duration_seconds = Math.max(0, Math.min(86400, Math.round(Number(body?.durationSeconds) || 0)));
      values.page_type = text(body?.pageType, 40) || "quick_bi_dashboard";
      values.url = text(body?.pageUrl, 500);
    }
    const row = { id: `${event === "page_view" ? "pv" : "hb"}_${time.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`, event, ts: time.getTime(), values };
    if (event === "dashboard_view_heartbeat") row.visitId = values.visit_id;
    fs.mkdirSync(dataDir, { recursive: true });
    fs.appendFileSync(file, JSON.stringify(row) + "\n");
    return { ok: true, record: row };
  }

  function readAll() {
    let raw = "";
    try { raw = fs.readFileSync(file, "utf8"); } catch { return []; }
    const lines = raw.split("\n").filter(Boolean);
    const rows = [];
    for (const line of lines.slice(-MAX_FILE_LINES)) { try { rows.push(JSON.parse(line)); } catch { /* 跳过损坏行 */ } }
    return rows;
  }

  /** 查询：filters { event, user, platform, from, to, keyword, limit }；from/to 为 ms 时间戳或「YYYY-MM-DD HH:mm」文本 */
  function query(filters = {}) {
    const toTs = value => {
      if (value === undefined || value === "") return NaN;
      if (/^\d+$/.test(String(value))) return Number(value);
      const parsed = new Date(String(value).replace(" ", "T"));
      return parsed.getTime();
    };
    const from = toTs(filters.from), to = toTs(filters.to);
    const keyword = text(filters.keyword, 60).toLowerCase();
    const limit = Math.max(1, Math.min(2000, Number(filters.limit) || 500));
    const rows = readAll().filter(row => {
      if (filters.event && row.event !== filters.event) return false;
      if (filters.user && row.values.user_name !== filters.user) return false;
      if (filters.platform && row.values.platform !== filters.platform) return false;
      if (!Number.isNaN(from) && row.ts < from) return false;
      if (!Number.isNaN(to) && row.ts > to) return false;
      if (keyword && !JSON.stringify(row.values).toLowerCase().includes(keyword)) return false;
      return true;
    }).sort((a, b) => b.ts - a.ts);
    return { total: rows.length, rows: rows.slice(0, limit) };
  }

  return { record, query, platformOf };
}

module.exports = { createEventStore, platformOf, EVENTS };
