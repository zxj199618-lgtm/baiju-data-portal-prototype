/**
 * 报告数字回查：检查报告正文里的数字是否能在证据（或用户问题）里找到。
 *
 * 只做「找不到」的提示，不改写报告。规则：
 * - 跳过代码块、日期、时间段（近 7 天）、列表序号、「3 个指标」这类个位数计数、表名/ID 中的数字；
 * - 带「%」时同时接受比例形式（证据 0.123 ↔ 报告 12.3%）；带「万 / 亿」时按量级换算；
 * - 容差按报告里写出的小数位取半个最小单位，允许模型做四舍五入；
 * - 模型自己算出的派生数字（如差值、比率）如果证据里没有，会被列为「未在证据中找到」，由人核对。
 */

const MAX_REPORTED = 10;

/** 去掉不需要校验的片段：代码块、日期、时间段、列表序号、字母数字混合的编码 */
function stripUncheckable(report) {
  return String(report)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/(?<![\d.])\d{4}(?:[-/年]\d{1,2}(?:[-/月]\d{1,2}日?)?|\.\d{1,2}\.\d{1,2})(?![\d.])/g, " ")
    // 省略年份的日期：08-25、8/25、8月25日
    .replace(/(?<![\d.\-/])(?:0?[1-9]|1[0-2])[-/](?:0?[1-9]|[12]\d|3[01])(?![\d.\-/])/g, " ")
    .replace(/\d{1,2}月\d{1,2}日?/g, " ")
    .replace(/[近前最过去]\s*\d+\s*(?:天|日|周|个月|月|小时|分钟)/g, " ")
    .replace(/\d+\s*(?:天|日|周|个月|小时|分钟)/g, " ")
    .replace(/^\s*\d+[.、)）]\s/gm, " ")
    // 报告自己的枚举计数（「3 个指标」「第 2 步」）：个位数 + 量词，不是证据里的数据
    .replace(/(?<![\d.])\d\s*(?:个|项|条|张|次|种|类|步|位|家|款|组|份)(?![\d])/g, " ")
    .replace(/第\s*\d+/g, " ")
    .replace(/(?<![A-Za-z_\d.])[A-Za-z_][A-Za-z_\d]*\d[A-Za-z_\d]*/g, " ");
}

/** 从文本中抽出数字：返回 { value, decimals, unit, text } */
function extractNumbers(text) {
  const found = [];
  const pattern = /(?<![\w.])-?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?:\s?(%|％|万|亿))?(?!\w)/g;
  let match;
  while ((match = pattern.exec(text))) {
    const integer = match[1].replace(/,/g, "");
    const decimals = match[2] ? match[2].length : 0;
    const value = Number(`${integer}${match[2] ? `.${match[2]}` : ""}`) * (match[0].startsWith("-") ? -1 : 1);
    found.push({ value, decimals, unit: match[3] === "％" ? "%" : (match[3] || ""), text: match[0] });
  }
  return found;
}

/** 证据里的全部数值（数字本身，或整段都是数字的字符串） */
function collectEvidenceNumbers(evidence, out = []) {
  if (typeof evidence === "number" && Number.isFinite(evidence)) out.push(evidence);
  else if (typeof evidence === "string" && /^-?\d+(?:\.\d+)?$/.test(evidence.trim())) out.push(Number(evidence));
  else if (Array.isArray(evidence)) evidence.forEach(item => collectEvidenceNumbers(item, out));
  else if (evidence && typeof evidence === "object") Object.values(evidence).forEach(item => collectEvidenceNumbers(item, out));
  return out;
}

/** 判断一个报告数字是否能在证据值中找到（含单位换算与容差） */
function isGrounded(number, sources) {
  const halfStep = 0.5 * Math.pow(10, -number.decimals);
  const scale = number.unit === "万" ? 1e4 : number.unit === "亿" ? 1e8 : 1;
  const targets = [];
  if (number.unit === "%") {
    targets.push({ value: number.value / 100, tolerance: halfStep / 100 }, { value: number.value, tolerance: halfStep });
  } else {
    targets.push({ value: number.value * scale, tolerance: halfStep * scale });
    if (scale !== 1) targets.push({ value: number.value, tolerance: halfStep });
  }
  // 报告常把「减少 20,107.77」写成正数，因此比较绝对值
  return sources.some(source => targets.some(target => Math.abs(Math.abs(source) - Math.abs(target.value)) <= target.tolerance + 1e-9));
}

/**
 * @param {string} report 模型生成的报告（Markdown）
 * @param {unknown} evidence 提供给模型的证据（任意 JSON 结构）
 * @param {string} question 用户问题（问题里出现的数字视为有依据）
 * @returns {{ checked: number, grounded: number, ungrounded: string[] }}
 */
function checkNumericGrounding(report, evidence, question = "") {
  const sources = [...collectEvidenceNumbers(evidence), ...extractNumbers(String(question)).map(item => item.value)];
  const numbers = extractNumbers(stripUncheckable(report));
  const ungrounded = [];
  let grounded = 0;
  numbers.forEach(number => {
    if (isGrounded(number, sources)) grounded += 1;
    else if (!ungrounded.includes(number.text)) ungrounded.push(number.text);
  });
  return { checked: numbers.length, grounded, ungrounded: ungrounded.slice(0, MAX_REPORTED) };
}

/** 报告里是否出现了某个数值（考虑「万 / 亿 / %」写法、四舍五入与正负号），评测用 */
function mentionsNumber(report, value) {
  return extractNumbers(stripUncheckable(report)).some(number => isGrounded(number, [value]));
}

module.exports = { checkNumericGrounding, extractNumbers, stripUncheckable, mentionsNumber };
