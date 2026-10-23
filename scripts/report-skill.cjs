/**
 * 报告生成（按需调用的输出 Skill）。
 *
 * 默认的对话回答是简短、答案优先的；只有用户明确要报告（「出个周报」「整理成文档」「复盘一下」），
 * 或点了回答下方的「整理成报告」，才走这里：基于对话里已经取到并核实的事实（证据账本）按模板写报告，
 * 不重新取数。这里只放可测试的纯逻辑：意图识别、模板选择、提示词拼装。
 */

/** 要报告的说法。只在明确要「一份报告 / 周报 / 复盘 / 文档」时才算：
 *  - 强名词（报告、周报、日报、月报、复盘）：动词 + 名词即可（「出个周报」「帮我写份复盘」）；
 *  - 弱名词（总结、文档）太常见（「帮我总结一下消耗」只是要个简短结论）：必须带「一份 / 份 / 篇」或「整理成 / 写成」才算；
 *  - 单独出现「报告」二字（如「报告里的数字」）不算。 */
const STRONG_NOUN = "(?:报告|周报|日报|月报|复盘)";
const WEAK_NOUN = "(?:总结|文档)";
const VERBS = "(?:出|生成|写|整理|做|给我|帮我|输出|产出|来)";
const INTENT_PATTERNS = [
  new RegExp(`${VERBS}[^，。！？\\n]{0,8}${STRONG_NOUN}`),
  new RegExp(`${VERBS}[^，。！？\\n]{0,4}(?:一份|份|一篇|篇)[^，。！？\\n]{0,8}${WEAK_NOUN}`),
  /(?:整理成|写成|汇总成|总结成|归纳成)(?!表|图|列表|清单|一张|要点|几点|一句|简短)/,
  /^(?:复盘|周报|月报|日报)(?:一下|吧)?[。！？!?]*$/,
  /(?:口径说明|口径文档|指标说明文档)/
];

function detectReportIntent(question) {
  const text = String(question || "");
  return INTENT_PATTERNS.some(pattern => pattern.test(text));
}

/** 用户说的是「基于上面的内容」（沿用对话里已有的事实，不重新取数） */
const REUSE_PATTERN = /(上面|刚才|以上|这些|这个分析|前面|之前|刚刚|上述)/;
const wantsReuse = question => REUSE_PATTERN.test(String(question || ""));

/** 选模板：明确指定的优先，其次按问题关键词，最后用通用模板 */
function pickTemplate(templates, requestedId, question) {
  const list = Array.isArray(templates) ? templates : [];
  const byId = id => list.find(item => item.id === id);
  if (requestedId && byId(requestedId)) return byId(requestedId);
  const text = String(question || "");
  if (/周报|本周|上周|每周/.test(text) && byId("weekly")) return byId("weekly");
  if (/复盘|异动|为什么.{0,8}(涨|跌|降|升|掉|变)/.test(text) && byId("review")) return byId("review");
  if (/口径(说明|文档)|指标说明|怎么算/.test(text) && byId("definition")) return byId("definition");
  return byId("general") || list[0] || null;
}

function buildTemplateSection(template) {
  if (!template) return "";
  return [
    `## 报告模板：${template.name}`,
    "按下面的章节组织（没有内容的章节直接省略，不要写「暂无」）：",
    ...template.sections.map((section, index) => `${index + 1}. ${section.title}：${section.guide}`),
    template.maxChars ? `篇幅：全文不超过 ${template.maxChars} 字，表格最多 ${template.maxTables || 2} 个，每个章节只写最重要的 2 到 3 点。` : ""
  ].filter(Boolean).join("\n");
}

/**
 * 给模型看的事实要精简：去掉每次取数都重复的长说明（口径说明、负责人、读法）、空值，
 * 把重复的口径状态和提示合并成一段放在最后。数字原样保留（账本里存的原件不变，数字回查仍用原件）。
 */
function compactEvidence(evidence) {
  const caveats = new Set();
  const draftMetrics = new Set();
  const clean = value => {
    if (Array.isArray(value)) return value.map(clean).filter(item => item !== undefined);
    if (value && typeof value === "object") {
      const out = {};
      for (const [key, inner] of Object.entries(value)) {
        const cleaned = clean(inner);
        if (cleaned === undefined || cleaned === null || cleaned === "" || (Array.isArray(cleaned) && !cleaned.length) || (typeof cleaned === "object" && !Array.isArray(cleaned) && !Object.keys(cleaned).length)) continue;
        out[key] = cleaned;
      }
      return out;
    }
    return value;
  };
  const items = (Array.isArray(evidence) ? evidence : []).map(item => {
    const result = item && item.结果 && typeof item.结果 === "object" && !Array.isArray(item.结果) ? { ...item.结果 } : item?.结果;
    if (result && typeof result === "object" && !Array.isArray(result)) {
      if (typeof result.提示 === "string") { caveats.add(result.提示); delete result.提示; }
      delete result.读法;
      if (result.口径 && typeof result.口径 === "object") {
        const scope = { ...result.口径 };
        if (/草稿/.test(String(scope.状态 || ""))) draftMetrics.add(result.名称 || result.指标 || "");
        delete scope.说明; delete scope.负责人; delete scope.状态;
        result.口径 = scope;
      }
    }
    return clean({ ...item, 结果: result });
  });
  return { items, caveats: [...caveats], draftMetrics: [...draftMetrics].filter(Boolean) };
}

/** 把已取得的事实（来自证据账本或本次取数）整理成给模型的事实段：每次取数一块，带问题、口径词和精简后的结果，最后合并口径提示 */
function buildFactsSection(entries) {
  if (!entries?.length) return "";
  const caveats = new Set();
  const drafts = new Set();
  const blocks = entries.map((entry, index) => {
    const compact = compactEvidence(entry.evidence);
    compact.caveats.forEach(item => caveats.add(item));
    compact.draftMetrics.forEach(item => drafts.add(item));
    return [
      `### 第 ${index + 1} 次取数：${entry.question}`,
      entry.resolvedTerms?.length ? `口径词：${entry.resolvedTerms.map(item => `${item.term}（${item.means}）`).join("；")}` : "",
      `事实：${JSON.stringify(compact.items)}`
    ].filter(Boolean).join("\n");
  });
  const notes = [
    ...[...caveats].map(item => `- ${item}`),
    drafts.size ? `- 草稿口径（待数据团队确认）：${[...drafts].join("、")}` : ""
  ].filter(Boolean);
  return ["## 已核实的取数事实（报告里的数字只能来自这里）", ...blocks, notes.length ? `### 口径提示（对所有事实适用）\n${notes.join("\n")}` : ""].filter(Boolean).join("\n\n");
}

/** 报告的写作要求（替代对话用的回答协议）；rules 是 report-writer 的 SKILL.md */
function buildReportSystem(rules, template) {
  return [
    "你是观星台数据平台的报告撰写助手。",
    String(rules || "").trim(),
    buildTemplateSection(template),
    "输出 Markdown：用 # 写标题，## 写章节；数字原样引用事实，不要心算新数字。"
  ].filter(Boolean).join("\n\n");
}

module.exports = { detectReportIntent, wantsReuse, pickTemplate, buildTemplateSection, buildFactsSection, buildReportSystem, compactEvidence };
