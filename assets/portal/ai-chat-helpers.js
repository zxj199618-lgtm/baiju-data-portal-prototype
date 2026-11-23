/**
 * 灵犀智析对话页的纯函数（不碰界面）：会话列表按时间分组。
 * 依赖 core.js（window.PortalVue）；必须先于 page-analysis-workbench.js 加载。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;

  const LABELS = { running: "进行中", today: "今天", yesterday: "昨天", week: "近 7 天", older: "更早" };

  /** 把 "2026-11-23 14:50" / "11-23 14:50" 解析成 Date；解析不了返回 null。 */
  function parseSessionTime(value, now) {
    const m = String(value || "").match(/(?:(\d{4})[-/])?(\d{1,2})[-/](\d{1,2})[ T]+(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return new Date(m[1] ? Number(m[1]) : now.getFullYear(), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  }

  /** 会话分组：进行中置顶，其余按自然日分为 今天 / 昨天 / 近 7 天 / 更早；组内保持传入顺序，空组不返回。 */
  function groupSessions(sessions, now = new Date()) {
    const startOfDay = date => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const today = startOfDay(now);
    const buckets = { running: [], today: [], yesterday: [], week: [], older: [] };
    for (const session of sessions) {
      if (session.status === "进行中") { buckets.running.push(session); continue; }
      const date = parseSessionTime(session.time, now);
      const days = date ? Math.round((today - startOfDay(date)) / 86400000) : Infinity;
      buckets[days <= 0 ? "today" : days === 1 ? "yesterday" : days <= 7 ? "week" : "older"].push(session);
    }
    return Object.keys(buckets).filter(key => buckets[key].length).map(key => ({ key, label: LABELS[key], items: buckets[key] }));
  }

  window.PortalVue.aiChatHelpers = { groupSessions };
})();
