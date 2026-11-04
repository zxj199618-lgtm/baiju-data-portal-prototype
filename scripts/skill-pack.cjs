/**
 * Skill 规范包：把「业务知识」从一段提示词变成平台能执行、能测试的东西。
 *
 * 一个规范包是 skill-packs/<id>/ 目录（随代码发布）：
 *   skill.json       清单 + spec（术语表 glossary、拦截规则 guards、默认值 defaults）
 *   SKILL.md         每次都进入模型上下文的核心规则（要短）
 *   references/*.md  长资料，模型需要时再用 read_reference 读（不占每次的上下文）
 *
 * 这里负责三件「不该交给模型自觉」的事：
 *   1. 术语解析：任哥 → department IN (...)，存量 / 子墨 → account_id = '白驹存量'；有歧义的词（白驹）明确标出来
 *   2. 拦截：本表做不到的需求（按商户拆分、小时级转化率…）直接给出明确答复与替代方案，不调用模型
 *   3. 回答协议：答案优先、篇幅跟着问题走，并按使用者角色（优化师 / 运营 / 数分）调整关注点
 */

const fs = require("fs");
const path = require("path");
const { redactLines, redactLiterals, mentionsHidden } = require("./field-scope.cjs");

const MAX_REFERENCE_CHARS = 24000;

function readText(file) {
  try { return fs.readFileSync(file, "utf8"); } catch { return ""; }
}

/** 读取 skill-packs 下的全部规范包；目录或文件缺失时静默跳过 */
function loadPacks(rootDir) {
  const packs = new Map();
  let ids = [];
  try { ids = fs.readdirSync(rootDir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name); } catch { return packs; }
  for (const id of ids) {
    const dir = path.join(rootDir, id);
    let manifest;
    try { manifest = JSON.parse(readText(path.join(dir, "skill.json"))); } catch { continue; }
    if (!manifest || manifest.id !== id) continue;
    const spec = manifest.spec && typeof manifest.spec === "object" ? manifest.spec : {};
    const declared = Array.isArray(spec.references) ? spec.references : [];
    const references = declared.map(item => ({
      name: String(item.name || ""),
      title: String(item.title || item.name || ""),
      when: String(item.when || ""),
      content: readText(path.join(dir, "references", `${item.name}.md`)).slice(0, MAX_REFERENCE_CHARS)
    })).filter(item => item.name && item.content);
    packs.set(id, { id, dir, manifest, spec, instructions: readText(path.join(dir, "SKILL.md")), references });
  }
  return packs;
}

/* ================= 1. 术语解析 ================= */

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 在问题里找术语表里的词。长词优先并「遮住」已命中的片段，
 * 所以「白驹存量」命中存量口径，不会再被当成有歧义的「白驹」。
 * @returns {{ resolved: object[], ambiguous: object[] }}
 */
function resolveTerms(spec, question, carried = []) {
  const glossary = Array.isArray(spec?.glossary) ? spec.glossary : [];
  let text = String(question || "");
  const candidates = [];
  glossary.forEach(entry => (entry.terms || []).forEach(term => candidates.push({ term, entry })));
  candidates.sort((a, b) => b.term.length - a.term.length);
  const hit = new Map();
  for (const { term, entry } of candidates) {
    if (!term || !text.includes(term)) continue;
    text = text.replace(new RegExp(escapeRegExp(term), "g"), "\u0000".repeat(term.length));
    if (!hit.has(entry)) hit.set(entry, term);
  }
  // 上一轮用过、这一轮没再提的口径沿用（「那昨天呢」「拆到账号」不能丢掉「任哥」）。
  // 只接受术语表里存在的词，过滤条件始终来自规范包，不信任客户端传来的内容
  const carriedEntries = [];
  if (!hit.size) {
    for (const term of Array.isArray(carried) ? carried.slice(0, 6) : []) {
      const entry = glossary.find(item => !item.ambiguous && (item.terms || []).includes(String(term)));
      if (entry && !carriedEntries.some(item => item.entry === entry)) carriedEntries.push({ entry, term: String(term) });
    }
  }
  const resolved = [], ambiguous = [];
  for (const [entry, term] of hit) {
    if (entry.ambiguous) ambiguous.push({ term, ask: entry.ask || "", options: entry.options || [], handling: entry.handling || "" });
    else resolved.push({ term, kind: entry.kind || "", means: entry.means || "", filter: entry.filter || null, carried: false });
  }
  carriedEntries.forEach(({ entry, term }) => resolved.push({ term, kind: entry.kind || "", means: entry.means || "", filter: entry.filter || null, carried: true }));
  return { resolved, ambiguous };
}

/* ================= 2. 拦截规则 ================= */

/** 返回命中的规则：mode=block 直接答复（不调模型），mode=warn 只作为提示交给模型 */
function matchGuards(spec, question) {
  const text = String(question || "");
  return (Array.isArray(spec?.guards) ? spec.guards : []).filter(guard =>
    (guard.patterns || []).some(pattern => { try { return new RegExp(pattern).test(text); } catch { return false; } })
  ).map(guard => ({ id: guard.id, mode: guard.mode === "block" ? "block" : "warn", message: guard.message || "", answer: guard.answer || guard.message || "", suggest: Array.isArray(guard.suggest) ? guard.suggest.slice(0, 3) : [] }));
}

/** 给模型的上下文：已解析的口径、需要处理的歧义、提示类规则 */
function buildSpecContext({ resolution, guards = [], spec }) {
  const lines = [];
  if (resolution?.resolved?.length) {
    lines.push("## 口径解析（平台已按业务规范解析，直接采用，并在回答里一句话写明）");
    resolution.resolved.forEach(item => {
      const filter = item.filter ? `${item.filter.field} IN (${(item.filter.values || []).map(value => `'${value}'`).join(", ")})` : "";
      lines.push(`- 「${item.term}」${item.carried ? "（沿用上文）" : ""}→ ${item.kind}：${item.means}${filter ? `；查询时用筛选 ${filter}` : ""}`);
    });
  }
  if (resolution?.ambiguous?.length) {
    lines.push("## 口径歧义（不要自行选一个）");
    resolution.ambiguous.forEach(item => {
      lines.push(`- 「${item.term}」有多种含义：${(item.options || []).map(option => option.label).join(" / ")}。${item.handling}`);
    });
  }
  const warnings = guards.filter(guard => guard.mode === "warn");
  if (warnings.length) {
    lines.push("## 需要注意");
    warnings.forEach(guard => lines.push(`- ${guard.message}`));
  }
  if (spec?.defaults) {
    lines.push("## 缺省值（问题没说明时直接采用，并在回答里声明假设，不要为此追问）");
    Object.entries(spec.defaults).forEach(([key, value]) => lines.push(`- ${key}：${value}`));
  }
  return lines.join("\n");
}

/* ================= 3. 回答协议（按角色） ================= */

const ROLE_BY_GROUP = [
  { match: /优化师|投放/, role: "optimizer" },
  { match: /运营/, role: "ops" },
  { match: /分析|数据|数分/, role: "analyst" }
];

function roleForGroup(group) {
  const found = ROLE_BY_GROUP.find(item => item.match.test(String(group || "")));
  return found ? found.role : "general";
}

const ROLE_STYLE = {
  optimizer: "使用者是投放优化师 / 投放组长，关心「现在该调什么」。结论之后给 1 到 3 条可以马上执行的动作（哪个账号 / 套餐 / 日期，加量、控量还是继续观察），并指出样本量太小、不宜操作的情况。少讲公式，不展开口径推导。",
  ops: "使用者是运营，关心趋势、结构和变化。用业务语言说「变好 / 变差、占比多少、环比多少」，专业术语第一次出现时用半句话解释；重点给出哪部分变化最大，不堆指标。",
  analyst: "使用者是数据分析师，关心口径是否严谨。需要时给出指标的分子分母、时间轴和可加性，指出口径风险；用户要取数方法时给出可直接运行的 SQL，并注明「SQL 仅供参考，未在平台执行」。",
  general: "使用者的角色未知：先给结论和关键数字，术语保持通俗，口径风险用一句话说明。"
};

/** 回答协议：不是写报告，是回答问题。篇幅跟着问题走 */
function buildAnswerProtocol(role) {
  return [
    "## 回答协议",
    "1. 答案优先：第一句话直接回答问题，带上核心数字。不要铺垫，不要复述问题。",
    "2. 篇幅跟着问题走：问一个数就答一两句；对比、排名才用表格；问「为什么」才分「发现 → 可能原因 → 建议」。没被问到的不展开。一般回答控制在 300 字加一张表以内；不要用「#」标题分章节，不要写成报告 —— 用户明确要报告时平台会另外生成。",
    "3. 口径用一行带过：「口径：时间 · 范围 · 套餐 · 数据截止」。用了缺省值或做了假设，必须在这一行写明。",
    "4. 数字只来自工具结果或证据；没有数据支撑的原因只能写成「待验证的假设」，不下因果结论。",
    "5. 做不到就直说缺什么、换什么表或方法可以做到，不用估算值填空。",
    "6. 追问沿用上文已确定的时间、范围和筛选，除非用户明确改了。",
    "7. 结尾不要写「还可以继续看…」之类的下一步建议：界面会自动给出推荐问题。",
    `## 使用者角色\n${ROLE_STYLE[role] || ROLE_STYLE.general}`
  ].join("\n");
}

/* ================= 4. 参考资料工具 ================= */

/** read_reference 工具：模型需要长资料（指标口径、分析手册、SQL 模板…）时再读，不占每次的上下文 */
function createReferenceTool(pack) {
  if (!pack || !pack.references.length) return null;
  const names = pack.references.map(item => item.name);
  return {
    schema: {
      type: "function",
      function: {
        name: "read_reference",
        description: `读取当前 Skill 的参考资料。可读：${pack.references.map(item => `${item.name}（${item.title}${item.when ? `；${item.when}` : ""}）`).join("；")}`,
        parameters: { type: "object", properties: { name: { type: "string", enum: names, description: "资料名" } }, required: ["name"] }
      }
    },
    execute(rawArgs) {
      let args = {};
      try { args = typeof rawArgs === "string" ? JSON.parse(rawArgs || "{}") : (rawArgs || {}); } catch { return { ok: false, error: "参数不是合法 JSON" }; }
      const found = pack.references.find(item => item.name === args.name);
      if (!found) return { ok: false, error: `没有这份资料：${args.name || "（未指定）"}，可读：${names.join("、")}` };
      return { ok: true, data: { 资料: found.title, 内容: found.content } };
    }
  };
}

/** 资料索引（放进 SKILL.md 之后的上下文里，让模型知道有什么、什么时候读） */
function referenceIndex(pack) {
  if (!pack?.references?.length) return "";
  return ["## 可按需读取的参考资料（用 read_reference 工具）", ...pack.references.map(item => `- ${item.name}：${item.title}${item.when ? `（${item.when}）` : ""}`)].join("\n");
}

/* ================= 字段权限：规范包脱敏 ================= */

/**
 * 当前用户在规范包的表上有被隐藏的字段时，返回脱敏后的规范包副本（不改原对象）：
 * - SKILL.md、参考资料、资料标题、拦截规则的答复 / 提示 / 建议、缺省值：提到隐藏字段的整行替换为「（已隐藏）」；
 * - 术语表：filter.field 被隐藏的口径整条去掉（不再给出筛选和枚举值）；有歧义的词去掉这类选项，不足两个选项时整条去掉；其余文字同样逐行脱敏；
 * - 被去掉的口径的取值与口径词（如「任哥」「投放一部-权益一组」）：上述所有文本里含有它们的行也整行替换（字面子串，宁多勿漏）。
 * hiddenNames 为空时原样返回。
 */
function scopePack(pack, hiddenNames) {
  const names = [...(hiddenNames || [])].map(name => String(name ?? "").trim()).filter(Boolean);
  if (!pack || !names.length) return pack;
  const hiddenFilter = filter => Boolean(filter && names.map(name => name.toLowerCase()).includes(String(filter.field ?? "").trim().toLowerCase()));
  const spec = pack.spec || {};
  /* 先从将被去掉的口径里收集它们的取值与口径词（含去掉连字符的写法），文本里提到的整行同样脱敏，避免取值经静态资料泄露 */
  const literals = new Set();
  const addValues = filter => (filter.values || []).forEach(value => { const text = String(value ?? "").trim(); if (text) { literals.add(text); literals.add(text.replace(/[-－—_\s]/g, "")); } });
  (Array.isArray(spec.glossary) ? spec.glossary : []).forEach(entry => {
    if (hiddenFilter(entry.filter)) { addValues(entry.filter); (entry.terms || []).forEach(term => literals.add(String(term ?? "").trim())); }
    (entry.options || []).forEach(option => { if (hiddenFilter(option.filter)) addValues(option.filter); });
  });
  const literalList = [...literals].filter(text => text.length >= 2);
  const red = text => (typeof text === "string" ? redactLiterals(redactLines(text, names), literalList) : text);
  const glossary = (Array.isArray(spec.glossary) ? spec.glossary : []).flatMap(entry => {
    if (hiddenFilter(entry.filter)) return [];
    if (entry.ambiguous) {
      const options = (entry.options || []).filter(option => !hiddenFilter(option.filter)).map(option => ({ ...option, label: red(option.label), desc: red(option.desc) }));
      if (options.length < 2) return [];
      return [{ ...entry, options, ask: red(entry.ask), handling: red(entry.handling) }];
    }
    return [{ ...entry, means: red(entry.means) }];
  });
  const guards = (Array.isArray(spec.guards) ? spec.guards : []).map(guard => ({
    ...guard, message: red(guard.message), answer: red(guard.answer),
    suggest: Array.isArray(guard.suggest) ? guard.suggest.filter(item => !mentionsHidden(String(item), names)) : guard.suggest
  }));
  const defaults = spec.defaults && typeof spec.defaults === "object" ? Object.fromEntries(Object.entries(spec.defaults).map(([key, value]) => [key, red(String(value))])) : spec.defaults;
  return {
    ...pack,
    instructions: red(pack.instructions || ""),
    references: (pack.references || []).map(item => ({ ...item, title: red(item.title), when: red(item.when), content: red(item.content) })),
    spec: { ...spec, glossary, guards, defaults }
  };
}

/* ================= 5. 会话上下文 ================= */

/** 把客户端传来的最近几轮对话整理成上下文；只保留文本，截断长度，丢掉提问卡片与代码块 */
function sanitizeConversation(input, { maxTurns = 3, maxAnswerChars = 600 } = {}) {
  if (!Array.isArray(input)) return [];
  return input.slice(-maxTurns).map(turn => ({
    question: String(turn?.question || "").slice(0, 400),
    answer: String(turn?.answer || "").replace(/```[\s\S]*?```/g, " ").replace(/\s+/g, " ").trim().slice(0, maxAnswerChars),
    skillId: /^[A-Za-z0-9_-]{1,60}$/.test(String(turn?.skillId || "")) ? String(turn.skillId) : "",
    requestId: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(turn?.requestId || "")) ? String(turn.requestId) : "",
    terms: (Array.isArray(turn?.terms) ? turn.terms : []).slice(0, 6).map(term => String(term).slice(0, 20)),
    tables: (Array.isArray(turn?.tables) ? turn.tables : []).slice(0, 8).map(name => String(name).slice(0, 60))
  })).filter(turn => turn.question);
}

/**
 * 表边界：对话中切换了数据表，切表之前的轮次（问题、回答摘要、沿用的技能与口径词、证据账本）都不再作为上下文，
 * 否则旧表的数字和口径会被当成新表的事实。从最近一轮往前找第一个与本次所选表没有交集的轮次，它和它之前的全部丢弃。
 * 本次没选表、或旧轮次没记录表时无法判断，不当作切表。返回 { turns, reset }，reset 为 { from, to } 或 null。
 */
function applyTableBoundary(turns, currentTables) {
  const current = (Array.isArray(currentTables) ? currentTables : []).filter(Boolean);
  if (!turns?.length || !current.length) return { turns: turns || [], reset: null };
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const used = turns[index].tables || [];
    if (used.length && !used.some(name => current.includes(name))) {
      // 只有「刚刚切」的这一轮才提示；之后在新表上继续追问，旧轮次照样丢弃但不再重复提示
      return { turns: turns.slice(index + 1), reset: index === turns.length - 1 ? { from: used, to: current } : null };
    }
  }
  return { turns, reset: null };
}

function buildConversationContext(turns, { answers = true, reset = null } = {}) {
  const notice = reset
    ? `## 数据表已切换\n用户已切换到「${(reset.to || []).join("、")}」，此前对话针对「${(reset.from || []).join("、")}」，其中的数字、时间、筛选和指标口径不适用于当前这张表；一律重新取数确认，不要引用之前的数字。`
    : "";
  if (!turns?.length) return notice;
  return [notice, "## 对话上下文（用户在追问时，仅在同一张表内沿用这里已确定的时间、范围、筛选和指标；用户明确改变，或数据表不同，就不要沿用）",
    ...turns.map((turn, index) => `第 ${index + 1} 轮 用户：${turn.question}${answers && turn.answer ? `\n第 ${index + 1} 轮 回答摘要：${turn.answer}` : ""}`)].filter(Boolean).join("\n");
}

module.exports = {
  loadPacks, resolveTerms, matchGuards, buildSpecContext, scopePack,
  roleForGroup, buildAnswerProtocol, createReferenceTool, referenceIndex,
  sanitizeConversation, applyTableBoundary, buildConversationContext
};
