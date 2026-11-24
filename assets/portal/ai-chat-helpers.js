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
   * metaItems 是把元信息行拆成条目的函数（由组件传入）；liveDesc 是生成中思考行右边的预计时长文案。
   */
  function buildTraceRows(msg, metaItems, liveDesc) {
    const rows = [];
    const live = !!(msg.streaming && !msg.html);
    if (msg.reasoning) {
      rows.push({ key: "reasoning", icon: "spark", title: live ? "正在思考…" : "思考过程", desc: live ? (liveDesc || "") : `${msg.reasoning.length} 字`, status: live ? "running" : "" });
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


  /* ---------- 预计回答时长 ---------- */
  /** 最近 10 次耗时（秒）的中位数，限制在 3–300 秒；没有有效记录返回 null。 */
  function estimateSeconds(history) {
    const list = (Array.isArray(history) ? history : []).filter(value => typeof value === "number" && Number.isFinite(value) && value > 0).slice(-10).sort((a, b) => a - b);
    if (!list.length) return null;
    const mid = list.length >> 1;
    const median = list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
    return Math.min(300, Math.max(3, Math.round(median)));
  }

  /** 记下一次耗时（保留 1 位小数），只留最近 10 次；非法值不写入。 */
  function pushDuration(history, seconds, max = 10) {
    const list = Array.isArray(history) ? history.slice() : [];
    if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) list.push(Math.round(seconds * 10) / 10);
    return list.slice(-max);
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Math.round(seconds));
    if (total < 60) return `${total} 秒`;
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return rest ? `${minutes} 分 ${rest} 秒` : `${minutes} 分钟`;
  }

  /** 生成中显示的文案：已用多久 + 预计多久；没有历史时给个范围；明显超过预计时提示「比平常久一点」。 */
  function formatEta(elapsedSeconds, estimate) {
    const elapsed = Math.max(0, Math.round(elapsedSeconds));
    const slow = estimate ? elapsed > estimate * 1.5 + 3 : elapsed > 40;
    if (slow) return `已用 ${formatDuration(elapsed)} · 比平常久一点，还在处理`;
    return `已用 ${formatDuration(elapsed)} · ${estimate ? `预计约 ${formatDuration(estimate)}` : "预计 10–30 秒"}`;
  }

  /* ---------- 回答末尾的「引用了哪些 skill」 ---------- */
  /** 一条助手回答用到的 skill：来自 plan 和 skillId，按 id 去重；生成中、旧消息、用户消息返回空数组。 */
  function skillsUsed(msg) {
    if (!msg || msg.role !== "assistant" || msg.streaming) return [];
    const found = [];
    const add = (id, name) => { if (id && !found.some(item => item.id === id)) found.push({ id, name: name || "" }); };
    if (msg.plan) add(msg.plan.skillId, msg.plan.skillName);
    add(msg.skillId, "");
    return found;
  }

  /**
   * 下拉按钮的宽度（px）：按文字估算——中文 13px、其他 7.5px，加上前面的图标、后面的箭头和内边距共 72px；
   * 最小 96，最大 240（再长的文字由省略号处理）。Element Plus 的 select 自己撑不开，所以由页面传宽度。
   */
  function chipWidth(text) {
    const width = [...String(text || "")].reduce((sum, char) => sum + (/[\u2e80-\u9fff\uff00-\uffef]/.test(char) ? 13 : 7.5), 0);
    return Math.min(240, Math.max(96, Math.round(72 + width)));
  }

  window.PortalVue.aiChatHelpers = { chipWidth, groupSessions, buildTraceRows, estimateSeconds, pushDuration, formatDuration, formatEta, skillsUsed };
})();
