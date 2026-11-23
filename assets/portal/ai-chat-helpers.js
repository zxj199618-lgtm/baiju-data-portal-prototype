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

  /**
   * 一条助手消息上方的 Trace 行（参考 shadcn Trace）：思考过程 → 使用的技能 → 查了哪些表 → 口径理解 → 运行详情。
   * 每行 { key, icon, title, desc, status, tables? }，status 为 "running" / "error" / ""；
   * 没有任何过程信息的旧消息（历史会话、飞书来源）返回空数组；生成中只返回思考行。
   * metaItems 是把元信息行拆成条目的函数（由组件传入）。
   */
  function buildTraceRows(msg, metaItems) {
    const rows = [];
    const live = !!(msg.streaming && !msg.html);
    if (msg.reasoning) {
      rows.push({ key: "reasoning", icon: "spark", title: live ? "正在思考…" : "思考过程", desc: live ? "" : `${msg.reasoning.length} 字`, status: live ? "running" : "" });
    }
    if (msg.streaming) return rows;
    const plan = msg.plan && msg.plan.source && msg.plan.source !== "manual" ? msg.plan : null;
    if (plan) rows.push({ key: "skill", icon: "layers", title: `已使用「${plan.skillName || "通用分析"}」`, desc: plan.output === "report" ? "报告" : "回答", status: "" });
    const items = msg.meta ? metaItems(msg.meta) : [];
    const tables = (items.find(item => item.k === "引用表") || {}).list || [];
    if (tables.length) rows.push({ key: "sources", icon: "database", title: `查了 ${tables.length} 张表`, desc: "", status: "", tables });
    if (msg.resolved && msg.resolved.length) rows.push({ key: "scope", icon: "book", title: `按你的口径理解了 ${msg.resolved.length} 个词`, desc: "", status: "" });
    if (items.some(item => item.k !== "引用表")) {
      const warn = items.some(item => item.warn);
      const elapsed = (items.find(item => item.k === "耗时") || {}).v || "";
      rows.push({ key: "details", icon: "clock", title: warn ? "运行详情（有提醒）" : "运行详情", desc: elapsed, status: warn ? "error" : "" });
    }
    return rows;
  }

  window.PortalVue.aiChatHelpers = { groupSessions, buildTraceRows };
})();
