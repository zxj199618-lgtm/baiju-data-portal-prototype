/**
 * 规划层：决定一次提问用哪个业务技能、输出什么形式（简短回答 / 报告）。
 *
 * 顺序是「便宜的先来」：用户手动选择 > 关键词与上一轮沿用 > 只有这两种都没把握（落到兜底）时，
 * 才用一次很便宜的模型调用做判断。每次决定都带上来源和理由，界面上看得见，也可以改。
 * 这里只放可测试的纯逻辑：什么时候需要模型判断、提示词怎么写、回复怎么解析、怎么汇总成 plan。
 */

const MIN_CONFIDENCE = 0.6;

/** 只有「没有命中任何关键词、落到兜底」并且有两个以上业务技能可选时，才值得再花一次模型调用 */
function needsModelPlanning(routed, domainSkills) {
  if (!routed) return false;
  const fellBack = /^未命中关键词/.test(String(routed.reason || ""));
  return fellBack && Array.isArray(domainSkills) && domainSkills.length >= 2;
}

/** 候选技能的简介：id、名称、适用 / 不适用（规范包写在 spec 里，其余用说明） */
function describeSkills(skills) {
  return skills.map(skill => ({
    id: skill.id,
    title: skill.title || skill.name,
    desc: skill.desc || skill.displayDesc || "",
    useWhen: Array.isArray(skill.useWhen) ? skill.useWhen : [],
    notFor: Array.isArray(skill.notFor) ? skill.notFor : []
  }));
}

function buildPlannerPrompt({ question, skills, conversation = [] }) {
  const lines = [
    "你是观星台数据平台的规划助手，只做一件事：判断用户这句话应该用哪个业务技能，以及输出形式。",
    "## 可选技能",
    ...skills.map(skill => [
      `- ${skill.id}：${skill.title}${skill.desc ? `；${skill.desc}` : ""}`,
      skill.useWhen.length ? `  适用：${skill.useWhen.join("；")}` : "",
      skill.notFor.length ? `  不适用：${skill.notFor.join("；")}` : ""
    ].filter(Boolean).join("\n")),
    "## 输出形式",
    "- answer：默认，简短回答。",
    "- report：只有用户明确要一份报告 / 周报 / 复盘 / 文档时才选。",
    conversation.length ? `## 对话上下文\n${conversation.map((turn, index) => `第 ${index + 1} 轮：${turn.question}`).join("\n")}` : "",
    `## 用户这句话\n${String(question).slice(0, 400)}`,
    "只输出一行 JSON，不要任何解释：",
    '{"skill":"技能 id","output":"answer 或 report","confidence":0 到 1 的小数,"reason":"理由，不超过 20 字"}',
    "拿不准就把 confidence 写低；没有任何技能合适时 skill 写 none。"
  ];
  return lines.filter(Boolean).join("\n");
}

/** 从模型回复里取出 JSON（容忍代码块与前后文字）；技能 id 必须在候选里，否则视为无效 */
function parsePlannerReply(text, validSkillIds) {
  const match = String(text || "").match(/\{[\s\S]*?\}/);
  if (!match) return null;
  let data;
  try { data = JSON.parse(match[0]); } catch { return null; }
  const skillId = String(data.skill || "").trim();
  const confidence = Number(data.confidence);
  return {
    skillId: validSkillIds.includes(skillId) ? skillId : "",
    output: data.output === "report" ? "report" : "answer",
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    reason: String(data.reason || "").slice(0, 80)
  };
}

/** 模型判断是否足够可信：技能有效且置信度达到阈值才采用，否则保留关键词 / 兜底的结果 */
function acceptPlan(plan) {
  return Boolean(plan && plan.skillId && plan.confidence >= MIN_CONFIDENCE);
}

/** 便宜的判断用小模型：先用环境变量指定的，其次在已启用的模型里找名字带 flash / mini / lite / turbo 的，最后用请求本身的模型 */
function pickPlannerModel({ requested, preferred = "", callable = [] }) {
  if (preferred && callable.includes(preferred)) return preferred;
  const cheap = callable.find(id => /(flash|mini|lite|turbo)/i.test(id));
  return cheap || requested;
}

/**
 * 汇总成 plan：给界面和审计看的「本次怎么做的」。
 * source：manual（用户选的）/ keyword（命中关键词）/ sticky（沿用上一轮）/ model（模型判断）/ fallback（兜底）
 */
function buildPlan({ skill, source, reason, confidence = null, output, template = "", alternatives = [] }) {
  return {
    skillId: skill?.id || "",
    skillName: skill?.title || skill?.name || "",
    source, reason: String(reason || ""),
    ...(confidence === null ? {} : { confidence }),
    output: output === "report" ? "report" : "answer",
    template,
    alternatives: alternatives.filter(item => item.id !== skill?.id).slice(0, 6).map(item => ({ id: item.id, name: item.title || item.name }))
  };
}

/** 路由给出的理由文字 → 来源分类 */
function sourceOfReason(reason, manual) {
  if (manual) return "manual";
  if (/^命中关键词/.test(reason)) return "keyword";
  if (/^沿用上一轮/.test(reason)) return "sticky";
  if (/^智能判断/.test(reason)) return "model";
  return "fallback";
}

module.exports = { MIN_CONFIDENCE, needsModelPlanning, describeSkills, buildPlannerPrompt, parsePlannerReply, acceptPlan, pickPlannerModel, buildPlan, sourceOfReason };
