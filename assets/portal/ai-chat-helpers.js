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

  /** @ 引用下拉里右侧的表介绍：缺哪项给空，不抛错；字段只列前 6 个，优先用中文说明。asset 可能是 undefined（只在网关里存在的表）。 */
  function tableIntro(asset, fallbackName) {
    const table = asset || {};
    const fields = (Array.isArray(table.fields) ? table.fields : []).filter(Boolean);
    const text = value => (typeof value === "string" ? value.trim() : "");
    return {
      title: text(table.cnName) || String(fallbackName || ""),
      tableName: text(table.table) ? [text(table.database), text(table.table)].filter(Boolean).join(".") : "",
      bizLine: text(table.bizLine), desc: text(table.desc), owner: text(table.owner), update: text(table.nextSync),
      fieldCount: fields.length,
      fields: fields.slice(0, 6).map(field => text(field.comment) || text(field.name)).filter(Boolean)
    };
  }

  /** 列表里上下移动一格，到头循环；空列表或下标越界回到 0。 */
  function moveIndex(index, delta, length) {
    if (!length) return 0;
    if (!Number.isInteger(index) || index < 0 || index >= length) return 0;
    return (index + delta + length) % length;
  }

  /** 会话筛选：按关键词（标题/业务线/消息摘要）和渠道过滤。 */
  function filterSessions(sessions, { keyword = "", channel = "all" } = {}) {
    const kw = String(keyword || "").trim().toLowerCase();
    return (Array.isArray(sessions) ? sessions : []).filter(session => {
      if (channel === "feishu" && session.channel !== "飞书机器人") return false;
      if (channel === "web" && session.channel === "飞书机器人") return false;
      if (!kw) return true;
      const hay = [session.title, session.scenario, ...(session.messages || []).slice(0, 2).flatMap(m => m.lines || [])].join(" ").toLowerCase();
      return hay.includes(kw);
    });
  }

  /** 带置顶的会话分组：置顶会话单独置顶，其余复用 groupSessions。 */
  function groupSessionsWithPin(sessions, now = new Date()) {
    const list = Array.isArray(sessions) ? sessions : [];
    const pinned = list.filter(s => s.pinned && s.status !== "进行中");
    const rest = list.filter(s => !(s.pinned && s.status !== "进行中"));
    const groups = groupSessions(rest, now);
    if (!pinned.length) return groups;
    const runningIdx = groups.findIndex(g => g.key === "running");
    const pinGroup = { key: "pinned", label: "已置顶", items: pinned };
    if (runningIdx >= 0) { groups.splice(runningIdx + 1, 0, pinGroup); return groups; }
    return [pinGroup, ...groups];
  }

  /** 从输入框文本中提取所有已引用的合法表名（去重，保持出现顺序）。 */
  function extractMentionedTables(text, myTables) {
    const raw = String(text || "");
    return [...new Set((Array.isArray(myTables) ? myTables : []).filter(table => raw.includes(`@${table}`)))];
  }

  /** 数字核验徽章文案：checked > 0 时返回状态、标题与未命中列表。 */
  function formatVerification(numericCheck) {
    if (!numericCheck || typeof numericCheck.checked !== "number" || numericCheck.checked <= 0) return null;
    const ungrounded = Array.isArray(numericCheck.ungrounded) ? numericCheck.ungrounded : [];
    if (!ungrounded.length) {
      return { status: "ok", label: `${numericCheck.checked} 项数据已核验`, ungrounded: [] };
    }
    return { status: "warn", label: `${ungrounded.length} 项派生数字建议复核`, ungrounded };
  }

  /** 输入框 `/` 快捷分析指令。 */
  const SLASH_COMMANDS = [
    { key: "trend", cmd: "/趋势", title: "趋势分析", desc: "按日/周查看核心指标趋势与波动", template: "帮我分析近 7 天核心指标的变化趋势：" },
    { key: "attribution", cmd: "/归因", title: "异动归因", desc: "拆解指标涨跌的渠道、产品或计划贡献", template: "帮我归因分析一下为什么出现波动：" },
    { key: "caliber", cmd: "/口径", title: "指标与表口径", desc: "查询字段定义、计算口径与负责人", template: "帮我查一下相关表和指标口径：" },
    { key: "lineage", cmd: "/血缘", title: "上下游影响", desc: "排查改表/改字段对下游任务和看板的影响", template: "帮我查一下变更的上下游血缘影响：" },
    { key: "report", cmd: "/报告", title: "生成正式分析报告", desc: "将结论沉淀为可分享的结构化报告", template: "请基于以上分析生成一份结构化分析报告" }
  ];

  window.PortalVue.aiChatHelpers = {
    tableIntro, moveIndex, chipWidth, groupSessions, buildTraceRows, estimateSeconds, pushDuration, formatDuration, formatEta, skillsUsed,
    filterSessions, groupSessionsWithPin, extractMentionedTables, formatVerification, SLASH_COMMANDS
  };
})();
