/**
 * 分析工具箱：模型按需调用这些工具取数，权限与输出上限都由平台控制。
 *
 * 安全边界（全部在这里强制，不信任模型给出的任何表名）：
 * - 只能访问 allowedTables（即当前登录用户的数据表权限）；无权或不存在的表返回同一条提示；
 * - 工具只读，只做聚合或返回少量样例行；单次返回字符数有上限；
 * - 每次调用写一条审计记录（谁、调了什么、参数、结果概况）。
 */

const NUMERIC = /DECIMAL|BIGINT|INT|DOUBLE|FLOAT/i;
const MAX_OUTPUT_CHARS = 6000;
const MAX_GROUPS = 10;
const MAX_SAMPLE_ROWS = 5;

/** 语义层工具：只有传入 semantic 时才提供 */
const SEMANTIC_TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "list_metrics",
      description: "列出平台定义好的业务指标（如消耗、CPA、点击率、ROI）：名称、口径、单位、可用的表与分组维度。问业务指标时优先用它们，口径由平台统一定义。",
      parameters: { type: "object", properties: { keyword: { type: "string", description: "指标名、别名或口径关键词，可为空" } } }
    }
  },
  {
    type: "function",
    function: {
      name: "query_metric",
      description: "按平台口径计算一个业务指标：最近 N 天与前 N 天对比（含变化量与环比），可按一个维度拆分。比率类指标（CPA、点击率、ROI）由平台先汇总再相除，请直接引用结果，不要自己重算。",
      parameters: {
        type: "object",
        properties: {
          metric: { type: "string", description: "指标 id、名称或别名，来自 list_metrics" },
          table: { type: "string", description: "数据表；指标只在一张有权限的表中可用时可省略" },
          group: { type: "string", description: "分组维度，须在 list_metrics 给出的可用分组内" },
          filters: {
            type: "array",
            description: "筛选条件（且）：例如只看某个媒体。字段须在 list_metrics 给出的可用分组内，取值需与数据里的写法一致",
            items: { type: "object", properties: { field: { type: "string" }, values: { type: "array", items: { type: "string" } } }, required: ["field", "values"] }
          },
          days: { type: "integer", minimum: 1, maximum: 90, description: "窗口天数，默认 7" },
          daily: { type: "boolean", description: "为 true 时额外返回窗口内逐日的值（含最高 / 最低日、日均、异常日），用于趋势与找异常日" }
        },
        required: ["metric"]
      }
    }
  }
];
/** 归因工具：问「为什么涨 / 跌 / 变了」时用；只有传入 semantic 时才提供 */
const ATTRIBUTION_TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "attribute_change",
    description: "解释一个指标为什么变了：把「近 N 天 vs 前 N 天」的变化确定性地拆到各个维度（部门、账号、媒体、套餐等），指出哪些组贡献最大。加法指标给出各组占总变化的比例；比率指标（CPA、ROI、签约率…）拆成结构效应（分母占比变了）与效率效应（自身比率变了）。所有数字由平台计算，请直接引用并解释，不要重算。先用 query_metric 确认总体变化，再用它定位原因。",
    parameters: {
      type: "object",
      properties: {
        metric: { type: "string", description: "指标 id、名称或别名，来自 list_metrics" },
        table: { type: "string", description: "数据表；指标只在一张有权限的表中可用时可省略" },
        filters: {
          type: "array", description: "先把范围限定在某个部门 / 账号 / 套餐等，再拆解（且）",
          items: { type: "object", properties: { field: { type: "string" }, values: { type: "array", items: { type: "string" } } }, required: ["field", "values"] }
        },
        dimensions: { type: "array", items: { type: "string" }, description: "只拆这几个维度；留空则拆该表全部可用维度（结果已按解释力排序）" },
        days: { type: "integer", minimum: 1, maximum: 90, description: "窗口天数，默认 7" }
      },
      required: ["metric"]
    }
  }
};

/** 血缘工具：问上下游、变更影响时用 */
const LINEAGE_TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "get_lineage",
    description: "查看一张有权限数据表的上下游血缘：它依赖哪些上游表（角色、关联方式），又被哪些下游表使用。只把明确给出的血缘当作确定关系。",
    parameters: { type: "object", properties: { table: { type: "string", description: "数据表中文名" } }, required: ["table"] }
  }
};

const MAX_SEARCH_RESULTS = 20;

const round = (value, digits = 2) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : null);
const dayOf = value => String(value ?? "").slice(0, 10);
const num = value => { const n = Number(value); return Number.isFinite(n) ? n : 0; };

/** 工具的 OpenAI function-calling 定义 */
const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "search_tables",
      description: "在当前用户有权限的数据表中按关键词查找候选表（匹配表名、说明、负责人、字段名与字段注释）。关键词留空则列出全部。",
      parameters: { type: "object", properties: { keyword: { type: "string", description: "关键词，可为空" } } }
    }
  },
  {
    type: "function",
    function: {
      name: "get_schema",
      description: "查看一张有权限数据表的字段、类型、注释与口径定义（可用指标、分组维度、日期字段）。",
      parameters: { type: "object", properties: { table: { type: "string", description: "数据表中文名，须来自 search_tables 的结果" } }, required: ["table"] }
    }
  },
  {
    type: "function",
    function: {
      name: "run_metric",
      description: "对一张有权限的表做确定性聚合：按最近 N 天与前 N 天比较指标，并可按一个分组字段拆解。所有数字由平台计算，请直接引用。",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string" },
          metric: { type: "string", description: "数值字段名，留空则使用表的默认指标" },
          group: { type: "string", description: "分组字段名，可选" },
          days: { type: "integer", minimum: 1, maximum: 90, description: "窗口天数，默认 7" }
        },
        required: ["table"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ask_user",
      description: "当问题缺少关键信息（指标口径、时间范围、业务线、拆解维度等）且无法从数据中推断时，向用户提问，而不是猜测。调用后本轮分析暂停，等用户回答。最多 3 个问题，每题 2-6 个选项；界面会自动提供「自定义输入」，不要自己加「其他」。",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          intro: { type: "string", description: "一句话说明为什么要问" },
          questions: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: {
              type: "object",
              properties: {
                key: { type: "string" },
                question: { type: "string" },
                hint: { type: "string" },
                multiple: { type: "boolean" },
                options: { type: "array", minItems: 2, maxItems: 6, items: { type: "object", properties: { label: { type: "string" }, desc: { type: "string" } }, required: ["label"] } }
              },
              required: ["question", "options"]
            }
          }
        },
        required: ["questions"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_sample_rows",
      description: "取一张有权限的表的少量样例行（最多 5 行），用于核对字段取值形式。",
      parameters: { type: "object", properties: { table: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: MAX_SAMPLE_ROWS } }, required: ["table"] }
    }
  }
];

/**
 * @param {{ userName: string, allowedTables: string[], tables: Array<object>, rowsOf: (name: string) => Array<object>, audit?: (entry: object) => void }} context
 */
function createAnalysisToolkit({ userName, allowedTables, tables, rowsOf, audit = () => {}, allowAsk = true, semantic = null, extraTools = [] }) {
  const allowed = new Set(allowedTables);
  const definitionOf = name => (allowed.has(name) ? tables.find(table => table.cnName === name) || null : null);
  const denied = name => ({ ok: false, error: `数据表不存在或无权访问：${name}` });

  function fieldsOf(definition) {
    return (definition.fields || []).map(field => ({ name: field.name, type: field.type || "", comment: field.comment || "", enum: field.enum || undefined }));
  }

  function searchTables(args) {
    const keyword = String(args.keyword || "").trim().toLowerCase();
    const matches = tables
      .filter(table => allowed.has(table.cnName))
      .filter(table => {
        if (!keyword) return true;
        const haystack = [table.cnName, table.desc, table.owner, ...(table.fields || []).map(field => `${field.name} ${field.comment || ""}`)].join(" ").toLowerCase();
        return haystack.includes(keyword);
      })
      .slice(0, MAX_SEARCH_RESULTS)
      .map(table => ({ 表名: table.cnName, 说明: table.desc || "", 负责人: table.owner || "", 字段数: (table.fields || []).length }));
    const data = { 候选表: matches, 总数: matches.length };
    // 没有匹配时直接告诉模型可能原因，避免它换着关键词反复搜索（用户问的表很可能没有权限或不存在）
    if (!matches.length) data.提示 = "没有匹配的有权限数据表。如果用户问的是某张具体的表，很可能是无权限或不存在：请如实告知用户，或用 ask_user 确认，不要换关键词反复搜索。";
    return { ok: true, data };
  }

  function getSchema(args) {
    const definition = definitionOf(String(args.table || ""));
    if (!definition) return denied(args.table);
    return {
      ok: true,
      data: {
        表名: definition.cnName,
        说明: definition.desc || "",
        负责人: definition.owner || "",
        字段: fieldsOf(definition).slice(0, 40),
        口径: { 日期字段: definition.agg?.dateKey || null, 默认指标: definition.agg?.metric || null, 可用分组: definition.agg?.groupBy || [] }
      }
    };
  }

  function runMetric(args) {
    const definition = definitionOf(String(args.table || ""));
    if (!definition) return denied(args.table);
    const rows = rowsOf(definition.cnName);
    const fields = definition.fields || [];
    const agg = definition.agg || {};
    const metric = String(args.metric || agg.metric || "");
    const metricField = fields.find(field => field.name === metric && NUMERIC.test(field.type || ""));
    if (!metricField) return { ok: false, error: `指标字段不存在或不是数值字段：${metric || "（未指定）"}` };
    const group = String(args.group || "");
    if (group && !fields.some(field => field.name === group && !NUMERIC.test(field.type || ""))) {
      return { ok: false, error: `分组字段不存在或不是文本字段：${group}` };
    }
    const days = Math.min(90, Math.max(1, Math.floor(num(args.days) || 7)));
    const dateKey = agg.dateKey || "";
    if (!dateKey) {
      const total = rows.reduce((sum, row) => sum + num(row[metric]), 0);
      return { ok: true, data: { 表名: definition.cnName, 指标: metric, 合计: round(total), 行数: rows.length, 说明: "该表没有日期字段，只返回全表合计" } };
    }
    const anchor = rows.map(row => dayOf(row[dateKey])).sort().at(-1);
    if (!anchor) return { ok: true, data: { 表名: definition.cnName, 指标: metric, 说明: "没有数据" } };
    const shift = (day, offset) => new Date(Date.parse(`${day}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
    const window = { current: { start: shift(anchor, -(days - 1)), end: anchor }, prior: { start: shift(anchor, -(2 * days - 1)), end: shift(anchor, -days) } };
    const inWindow = (row, w) => dayOf(row[dateKey]) >= w.start && dayOf(row[dateKey]) <= w.end;
    const summarize = w => {
      const picked = rows.filter(row => inWindow(row, w));
      const total = picked.reduce((sum, row) => sum + num(row[metric]), 0);
      const groups = new Map();
      if (group) picked.forEach(row => { const key = String(row[group] ?? "—"); groups.set(key, (groups.get(key) || 0) + num(row[metric])); });
      return { total, groups };
    };
    const cur = summarize(window.current), pri = summarize(window.prior);
    const change = pri.total ? round((cur.total - pri.total) / pri.total * 100, 1) : null;
    const result = {
      表名: definition.cnName,
      指标: metric,
      窗口: { 近N天: [window.current.start, window.current.end], 前N天: [window.prior.start, window.prior.end], N: days },
      近N天合计: round(cur.total),
      前N天合计: round(pri.total),
      增减额: round(cur.total - pri.total),
      环比百分比: change,
      行数: rows.filter(row => inWindow(row, window.current)).length
    };
    if (group) {
      const keys = [...new Set([...cur.groups.keys(), ...pri.groups.keys()])];
      // 增减额与环比也由平台算出，模型直接引用，不需要自己做减法
      const items = keys.map(key => {
        const current = cur.groups.get(key) || 0, prior = pri.groups.get(key) || 0;
        return {
          组: key,
          近N天: round(current),
          前N天: round(prior),
          增减额: round(current - prior),
          环比百分比: prior ? round((current - prior) / prior * 100, 2) : null
        };
      }).sort((a, b) => Math.abs(b.增减额) - Math.abs(a.增减额));
      result.分组 = { 字段: group, 明细: items.slice(0, MAX_GROUPS), 其余组数: Math.max(0, items.length - MAX_GROUPS) };
    }
    return { ok: true, data: result };
  }

  function getSampleRows(args) {
    const definition = definitionOf(String(args.table || ""));
    if (!definition) return denied(args.table);
    const limit = Math.min(MAX_SAMPLE_ROWS, Math.max(1, Math.floor(num(args.limit)) || MAX_SAMPLE_ROWS));
    const rows = rowsOf(definition.cnName);
    return { ok: true, data: { 表名: definition.cnName, 总行数: rows.length, 样例: rows.slice(-limit) } };
  }

  /** 校验并规整追问：数量、选项数、字段长度都由平台限定，不合格的返回错误让模型重新提问 */
  function askUser(args) {
    const clip = (value, max) => String(value ?? "").trim().slice(0, max);
    const rawQuestions = Array.isArray(args.questions) ? args.questions : [];
    if (!rawQuestions.length) return { ok: false, error: "至少需要 1 个问题" };
    if (rawQuestions.length > 3) return { ok: false, error: "最多 3 个问题" };
    const questions = [];
    for (const [index, item] of rawQuestions.entries()) {
      const question = clip(item?.question, 120);
      const options = (Array.isArray(item?.options) ? item.options : [])
        .map(option => (typeof option === "string" ? { label: option } : option))
        .map(option => ({ label: clip(option?.label, 40), desc: clip(option?.desc, 80) }))
        .filter(option => option.label)
        .map(option => (option.desc ? option : { label: option.label }));
      if (!question) return { ok: false, error: `第 ${index + 1} 个问题缺少题目` };
      if (options.length < 2 || options.length > 6) return { ok: false, error: `第 ${index + 1} 个问题需要 2-6 个选项（当前 ${options.length} 个）` };
      const entry = { key: clip(item.key, 40) || `q${index + 1}`, question, options };
      if (clip(item.hint, 120)) entry.hint = clip(item.hint, 120);
      if (item.multiple === true) entry.multiple = true;
      questions.push(entry);
    }
    return {
      ok: true,
      data: { ask: true, payload: { title: clip(args.title, 60) || "需要你确认", intro: clip(args.intro, 200), questions } }
    };
  }

  function listMetricsTool(args) {
    return { ok: true, data: { 指标: semantic.listMetrics(allowedTables, args.keyword) } };
  }

  function queryMetricTool(args) {
    return semantic.query({ metric: args.metric, table: args.table, group: args.group, days: args.days, filters: args.filters, daily: args.daily === true, allowedTables });
  }

  function attributeChangeTool(args) {
    return semantic.attribute({ metric: args.metric, table: args.table, dimensions: args.dimensions, days: args.days, filters: args.filters, allowedTables });
  }

  function getLineage(args) {
    const definition = definitionOf(String(args.table || ""));
    if (!definition) return denied(args.table);
    const lineage = definition.lineage || { upstream: [], downstream: [] };
    const data = {
      表名: definition.cnName,
      上游: (lineage.upstream || []).map(item => ({ 表: item.table, 角色: item.role || "", 关联方式: item.join || "" })),
      下游: (lineage.downstream || []).map(item => ({ 表: item.table, 角色: item.role || "" }))
    };
    if (!data.上游.length && !data.下游.length) data.说明 = "平台没有登记这张表的血缘：不能据此判断它没有上下游，请如实告知并建议向表负责人确认";
    return { ok: true, data };
  }

  const handlers = { search_tables: searchTables, get_schema: getSchema, run_metric: runMetric, get_sample_rows: getSampleRows, ask_user: askUser, get_lineage: getLineage };
  if (semantic) Object.assign(handlers, { list_metrics: listMetricsTool, query_metric: queryMetricTool, attribute_change: attributeChangeTool });
  // 额外工具（例如 Skill 的 read_reference）：同样走参数解析、审计与输出上限，上限可单独放宽
  const outputLimits = {};
  extraTools.forEach(tool => { handlers[tool.schema.function.name] = tool.execute; outputLimits[tool.schema.function.name] = tool.maxChars || MAX_OUTPUT_CHARS; });

  /** 执行一次工具调用：参数解析、权限、输出上限与审计都在这里统一处理 */
  function execute(name, rawArguments) {
    const handler = handlers[name];
    let args = {};
    try { args = rawArguments ? JSON.parse(rawArguments) : {}; } catch { args = null; }
    let outcome;
    if (!handler) outcome = { ok: false, error: `未知工具：${name}` };
    else if (args === null) outcome = { ok: false, error: "工具参数不是合法 JSON" };
    else {
      try { outcome = handler(args); } catch (error) { outcome = { ok: false, error: `工具执行失败：${error.message}` }; }
    }
    let text = JSON.stringify(outcome);
    const limit = outputLimits[name] || MAX_OUTPUT_CHARS;
    if (text.length > limit) {
      text = JSON.stringify({ ok: outcome.ok, truncated: true, preview: text.slice(0, limit - 200) });
    }
    audit({
      user: userName,
      tool: name,
      args: String(rawArguments || "").slice(0, 300),
      ok: Boolean(outcome.ok),
      table: args && typeof args.table === "string" ? args.table : undefined,
      error: outcome.error || undefined
    });
    return { ok: Boolean(outcome.ok), content: text, data: outcome.data || null, error: outcome.error || "" };
  }

  // 用户已补充信息时不再提供追问工具：硬性禁止重复追问，而不只靠提示词约束
  const baseSchemas = [...(semantic ? [...TOOL_SCHEMAS, ...SEMANTIC_TOOL_SCHEMAS, ATTRIBUTION_TOOL_SCHEMA] : TOOL_SCHEMAS), LINEAGE_TOOL_SCHEMA, ...extraTools.map(tool => tool.schema)];
  const schemas = allowAsk ? baseSchemas : baseSchemas.filter(tool => tool.function.name !== "ask_user");
  return { schemas, execute: (name, rawArguments) => (name === "ask_user" && !allowAsk ? { ok: false, content: JSON.stringify({ ok: false, error: "用户已补充信息，不能再提问" }), data: null, error: "用户已补充信息，不能再提问" } : execute(name, rawArguments)) };
}

module.exports = { createAnalysisToolkit, TOOL_SCHEMAS };
