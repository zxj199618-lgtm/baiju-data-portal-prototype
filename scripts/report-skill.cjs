/**
 * 报告生成（按需调用的输出 Skill）。
 *
 * 默认的对话回答是简短、答案优先的；只有用户明确要报告（「出个周报」「整理成文档」「复盘一下」），
 * 或点了回答下方的「整理成报告」，才走这里：基于对话里已经取到并核实的事实（证据账本）按模板写报告，
 * 不重新取数。这里只放可测试的纯逻辑：意图识别、模板选择、提示词拼装。
 */

/** 要报告的说法：动词 + 报告类名词，或「整理成 / 写成 / 汇总成 …」。单独出现「报告」二字（如「报告里的数字」）不算 */
const REPORT_NOUN = "(?:报告|周报|日报|月报|复盘|文档|总结)";
const INTENT_PATTERNS = [
  new RegExp(`(?:出|生成|写|整理|做|给我|帮我|输出|产出|来)[^，。！？\\n]{0,8}${REPORT_NOUN}`),
  /(?:整理成|写成|汇总成|总结成|归纳成)(?!表|图|列表|清单|一张)/,
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
    ...template.sections.map((section, index) => `${index + 1}. ${section.title}：${section.guide}`)
  ].join("\n");
}

/** 把已取得的事实（来自证据账本或本次取数）整理成给模型的事实段：每次取数一块，带问题、口径词和结果 */
function buildFactsSection(entries) {
  if (!entries?.length) return "";
  return [
    "## 已核实的取数事实（报告里的数字只能来自这里）",
    ...entries.map((entry, index) => [
      `### 第 ${index + 1} 次取数：${entry.question}`,
      entry.resolvedTerms?.length ? `口径词：${entry.resolvedTerms.map(item => `${item.term}（${item.means}）`).join("；")}` : "",
      entry.answer ? `当时的回答摘要：${entry.answer}` : "",
      `事实：${JSON.stringify(entry.evidence)}`
    ].filter(Boolean).join("\n"))
  ].join("\n\n");
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

module.exports = { detectReportIntent, wantsReuse, pickTemplate, buildTemplateSection, buildFactsSection, buildReportSystem };
