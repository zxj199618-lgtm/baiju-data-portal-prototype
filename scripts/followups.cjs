/**
 * 回答后的推荐问题：让用户一键继续问，也把追问留在平台真正能回答的范围里。
 *
 * 为什么不让模型自由发挥：模型容易推荐平台做不到的问题（没有的指标、做不到的拆分）。
 * 这里根据「这一轮实际用到的工具和结果」确定性地生成，并用语义层校验：
 * 只推荐存在的指标、该表确实有的拆分维度、平台支持的动作（拆解、趋势、为什么变了、相关指标、整理成报告）。
 * 不额外调用模型：没有延迟、没有 token，也能完整测试。
 */

const MAX_SUGGESTIONS = 3;

const DIMENSION_LABELS = {
  department: "部门", account_id: "账号", optimize_user_name: "优化师", platform_name: "渠道", medium: "媒体", commodity_classify: "套餐类型",
  commodity_name: "套餐", is_renew: "是否续费", pay_category: "支付方式", media_source: "媒体", plan_name: "计划", account_name: "账户",
  product_name: "产品", biz_line: "业务线", channel_name: "渠道", status: "订单状态", lifecycle_stage: "生命周期阶段"
};
const DEFAULT_DIMENSION_ORDER = ["department", "account_id", "media_source", "account_name", "product_name", "channel_name", "biz_line"];

/** 不同角色先看到什么：优化师先看「为什么 / 往下拆」，运营先看趋势与结构，数分先看口径 */
const KIND_RANK = {
  optimizer: ["drill", "why", "group", "related", "trend", "definition", "report", "generic"],
  ops: ["trend", "group", "why", "related", "drill", "report", "definition", "generic"],
  analyst: ["definition", "group", "why", "drill", "related", "trend", "report", "generic"],
  general: ["why", "drill", "group", "trend", "related", "report", "definition", "generic"]
};

function parseArgs(raw) {
  try { return typeof raw === "string" ? JSON.parse(raw || "{}") : (raw || {}); } catch { return {}; }
}

/** 从证据里整理出这一轮做了什么：成功的取数 / 归因 / 读资料 / 血缘 */
function collect(evidence) {
  const entries = (Array.isArray(evidence) ? evidence : []).filter(item => item && item.工具 && item.结果 && !item.结果.错误);
  const queries = entries.filter(item => item.工具 === "query_metric" && item.结果.指标).map(item => ({ args: parseArgs(item.参数), data: item.结果 }));
  const attributions = entries.filter(item => item.工具 === "attribute_change" && item.结果.指标 && item.结果.维度).map(item => ({ args: parseArgs(item.参数), data: item.结果 }));
  return {
    queries, attributions,
    usedReference: entries.some(item => item.工具 === "read_reference"),
    usedLineage: entries.some(item => item.工具 === "get_lineage"),
    hasFacts: queries.length > 0 || attributions.length > 0
  };
}

function suggestFollowUps({ evidence, question = "", resolvedTerms = [], output = "answer", templates = [], currentTemplate = "", role = "general", guards = [], spec = {}, semantic = null }) {
  const config = spec.followUps || {};
  const candidates = [];
  // 中英文 / 数字之间补空格，和界面里其他中文文案的写法一致（「自营 ROI 对比」而不是「自营 ROI对比」）
  const spaced = text => String(text).replace(/([A-Za-z])([\u4e00-\u9fa5])/g, "$1 $2").replace(/([\u4e00-\u9fa5])([A-Za-z])/g, "$1 $2");
  const add = (kind, raw) => { const text = spaced(raw || ""); if (text && !candidates.some(item => item.text === text)) candidates.push({ kind, text }); };

  // 被拦截的需求：给出同一诉求下平台能做的替代问法
  const blocked = guards.find(guard => guard.mode === "block");
  if (blocked) return (blocked.suggest || []).slice(0, MAX_SUGGESTIONS).map(text => ({ kind: "generic", text }));

  const context = collect(evidence);

  // 报告：推荐换模板重新整理（沿用对话里已有的事实）
  if (output === "report") {
    templates.filter(template => template.id !== currentTemplate).slice(0, 2).forEach(template => add("report", `把上面的分析换成${template.name}重新整理`));
    return candidates.slice(0, MAX_SUGGESTIONS);
  }

  const scope = (resolvedTerms || []).map(item => item.term).filter(Boolean).join("、");
  const latest = context.attributions.at(-1) || context.queries.at(-1) || null;
  if (latest) {
    const data = latest.data;
    const info = semantic?.metricInfo?.(data.指标) || { id: data.指标, name: data.名称 || data.指标 };
    const name = info.name;
    const days = data.窗口?.N || latest.args.days || 7;
    const windowText = `近 ${days} 天`;
    const prefix = `${scope}${windowText}`;
    const table = data.表名;
    const dimensionsAvailable = semantic?.dimensionsOf?.(info.id, table) || null;
    const usedGroup = latest.args.group || data.分组?.字段 || "";
    const usedFilterFields = new Set((latest.args.filters || []).map(item => item.field));
    const label = field => DIMENSION_LABELS[field] || field;
    const mentionedInQuestion = text => question.includes(text);

    // 往下一层拆（归因之后先看贡献最大的那一组内部）
    if (context.attributions.length) {
      const attribution = context.attributions.at(-1).data;
      const top = attribution.维度?.[0];
      const topGroup = top?.主要贡献?.[0]?.组;
      if (top && topGroup && !String(topGroup).startsWith("其他")) {
        add("drill", `${topGroup}的${name}变化，继续往下拆是什么原因？`);
        add("trend", `${topGroup}${windowText}每天的${name}趋势`);
      }
      add("report", "把上面的分析整理成异动复盘");
    } else {
      // 变化明显：问为什么
      const pct = Number(data.环比百分比);
      if (Number.isFinite(pct) && Math.abs(pct) >= 3 && !mentionedInQuestion("为什么")) add("why", `${prefix}${name}为什么${pct > 0 ? "涨" : "跌"}了？`);
      // 按维度拆开看：选该表确实有、本轮还没用过的维度
      if (dimensionsAvailable) {
        const order = [...(config.dimensionOrder || []), ...DEFAULT_DIMENSION_ORDER];
        const dimension = order.find(field => dimensionsAvailable.includes(field) && field !== usedGroup && !usedFilterFields.has(field));
        if (dimension && !mentionedInQuestion(`各${label(dimension)}`)) add("group", `${prefix}各${label(dimension)}的${name}对比`);
      }
      // 趋势
      if (!data.按日 && !mentionedInQuestion("趋势")) add("trend", `${prefix}每天的${name}趋势`);
      // 相关指标（规范包里配的；必须是存在、且在这张表上可用的指标）
      for (const relatedKey of (config.relatedMetrics?.[info.id] || [])) {
        const related = semantic?.metricInfo?.(relatedKey);
        if (!related || !semantic.dimensionsOf(related.id, table)) continue;
        add("related", `${prefix}${related.name}怎么样？`);
      }
      add("report", /周|week/i.test(question) ? "把上面的分析整理成周报" : "把上面的分析整理成报告");
    }
  }

  // 问口径：数分常要取数方法
  if (context.usedReference) {
    if (config.sql) add("definition", "这个指标怎么取数？给我一段取数 SQL");
    add("definition", "还有哪些指标可以看？");
  }
  if (context.usedLineage) add("generic", "这张表有哪些指标可以看？");
  if (!candidates.length) {
    (config.starters || ["有哪些指标可以看？"]).slice(0, MAX_SUGGESTIONS).forEach(text => add("generic", text));
  }

  // 去掉和刚才的问题几乎一样的；按角色排序；报告类最多 1 个；取前 3 个
  const rank = KIND_RANK[role] || KIND_RANK.general;
  const fresh = candidates.filter(item => item.text !== question.trim());
  fresh.sort((a, b) => rank.indexOf(a.kind) - rank.indexOf(b.kind));
  const picked = [];
  for (const item of fresh) {
    if (item.kind === "report" && picked.some(other => other.kind === "report")) continue;
    picked.push(item);
    if (picked.length >= MAX_SUGGESTIONS) break;
  }
  return picked;
}

module.exports = { suggestFollowUps, collect, DIMENSION_LABELS, MAX_SUGGESTIONS };
