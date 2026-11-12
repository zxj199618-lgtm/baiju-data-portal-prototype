/**
 * 业务线上下文包与两个工具：get_table_knowledge、query_join。
 * - resolveLine：把业务线名解析成「该用户可用的表集合」；
 * - buildContextPack：拼成注入模型上下文的 Markdown（知识库正文已按隐藏字段逐行脱敏）；
 * - createKnowledgeTools：返回可直接作为 createAnalysisToolkit 的 extraTools 的两个工具。
 */
const { usableRelations, createJoinEngine } = require("./join-engine.cjs");
const { redactLines } = require("./field-scope.cjs");

const DEFAULT_BUDGET_CHARS = 30000;
const JOIN_MAX_CHARS = 12000;
const NOT_AVAILABLE = "该表不存在或无权访问";
const NO_KNOWLEDGE = "该表还没有知识库";
const OVER_BUDGET = "超出本次字数预算";

function resolveLine(store, lineName, allowedTables) {
  const eff = store.effective();
  const publicName = store.PUBLIC;
  if (lineName === publicName) return { ok: false, status: 400, error: "「公共」不是可选的业务线，请选择具体业务线" };
  const line = eff.businessLines.find(item => item.name === lineName);
  if (!line) return { ok: false, status: 404, error: `业务线不存在：${lineName}` };
  const publicLine = eff.businessLines.find(item => item.name === publicName) || { id: "", name: publicName, order: 0, knowledge: null, relations: [] };
  const allowed = new Set(allowedTables || []);
  const tables = Object.entries(eff.tableLines)
    .filter(([table, owner]) => (owner === lineName || owner === publicName) && allowed.has(table))
    .map(([table]) => table);
  if (!tables.length) return { ok: false, status: 404, error: "业务线下没有可用数据资产，请联系管理员确认权限或业务线配置" };
  return { ok: true, line, publicLine, tables };
}

const clean = (text, names) => redactLines(String(text || ""), names).trim();

function buildContextPack({ line, publicLine, tables, scopedTables, relations, tableKnowledgeFlags = {}, hiddenNames = [] }) {
  const inScope = new Set(tables || []);
  const defs = (scopedTables || []).filter(table => inScope.has(table.cnName));
  const { usable } = usableRelations(relations || [], defs);
  const parts = [`# 业务线：${line.name}`];
  parts.push("## 业务线知识库", clean(line.knowledge?.markdown, hiddenNames) || "（暂无）");
  parts.push("## 公共知识库", clean(publicLine?.knowledge?.markdown, hiddenNames) || "（暂无）");
  parts.push("## 可用表清单（需要某张表的详细口径时，用 get_table_knowledge 读取）");
  parts.push(defs.length
    ? defs.map(table => `- ${table.cnName}：${clean(table.desc, hiddenNames) || "（无说明）"}｜表知识库：${tableKnowledgeFlags[table.cnName] ? "有" : "无"}`).join("\n")
    : "（无）");
  parts.push("## 表关联清单（跨表分析直接用 query_join，关联由平台按登记的关联自动连接，不用自己写）");
  parts.push(usable.length
    ? usable.map(r => `- ${r.left.table}.${r.left.field} ${r.type} ${r.right.table}.${r.right.field}${r.note ? `（${clean(r.note, hiddenNames)}）` : ""}`).join("\n")
    : "（无）");
  return parts.join("\n\n");
}

function createKnowledgeTools({ store, resolved, scopedTables, rowsOf, hiddenNames = [], budgetChars = DEFAULT_BUDGET_CHARS, limits }) {
  const inScope = new Set(resolved.tables);
  const defs = (scopedTables || []).filter(table => inScope.has(table.cnName));
  const budget = Number.isFinite(budgetChars) && budgetChars > 0 ? budgetChars : DEFAULT_BUDGET_CHARS;

  const getTableKnowledge = {
    schema: {
      type: "function",
      function: {
        name: "get_table_knowledge",
        description: "读取当前业务线下若干张表的表知识库（口径、字段含义、注意事项），不限制表数，总字数有预算，超出的表会列在「未提供」里。表之间的关联不用自己写，平台按业务线登记的关联自动连接（直接用 query_join）。",
        parameters: { type: "object", properties: { tables: { type: "array", items: { type: "string" }, description: "表名列表，按重要程度排序" } }, required: ["tables"] }
      }
    },
    maxChars: undefined,
    execute(args) {
      const names = [...new Set((Array.isArray(args?.tables) ? args.tables : []).map(name => String(name ?? "").trim()).filter(Boolean))];
      if (!names.length) return { ok: false, error: "请提供至少一个表名" };
      const knowledge = store.effective().tableKnowledge || {};
      const provided = [];
      const missing = [];
      let used = 0;
      let exhausted = false;
      for (const name of names) {
        if (!inScope.has(name)) { missing.push({ 表名: name, 原因: NOT_AVAILABLE }); continue; }
        const body = knowledge[name]?.markdown;
        if (!body || !String(body).trim()) { missing.push({ 表名: name, 原因: NO_KNOWLEDGE }); continue; }
        const content = redactLines(String(body), hiddenNames);
        if (exhausted || used + content.length > budget) { exhausted = true; missing.push({ 表名: name, 原因: OVER_BUDGET }); continue; }
        used += content.length;
        provided.push({ 表名: name, 内容: content });
      }
      return { ok: true, data: { 知识库: provided, 未提供: missing } };
    }
  };

  const queryJoin = {
    schema: {
      type: "function",
      function: {
        name: "query_join",
        description: "跨表汇总：把多张表按业务线登记的关联拼起来，按分组字段汇总指标。关联不用自己写，平台按业务线登记的关联自动连接；一对多会重复计数的写法会被拒绝。各指标表分别汇总后按分组值拼接；比率为总分子除以总分母。",
        parameters: {
          type: "object",
          properties: {
            metrics: { type: "array", description: "指标列表", items: { type: "object", properties: { table: { type: "string" }, field: { type: "string" }, agg: { type: "string", enum: ["sum", "count"] }, name: { type: "string", description: "指标别名（可选）" } }, required: ["table", "field", "agg"] } },
            groupBy: { type: "array", description: "分组字段（可来自任意已登记关联的表）", items: { type: "object", properties: { table: { type: "string" }, field: { type: "string" } }, required: ["table", "field"] } },
            filters: { type: "array", description: "筛选：字段取值在 values 内", items: { type: "object", properties: { table: { type: "string" }, field: { type: "string" }, values: { type: "array", items: {} } }, required: ["table", "field", "values"] } },
            ratios: { type: "array", description: "比率：引用指标别名，先分别汇总再相除", items: { type: "object", properties: { name: { type: "string" }, numerator: { type: "string" }, denominator: { type: "string" } }, required: ["name", "numerator", "denominator"] } },
            days: { type: "integer", description: "只看最近 N 天（每个指标表都需有日期字段）" },
            dateTable: { type: "string", description: "取日期锚点的指标表（可选）" }
          },
          required: ["metrics"]
        }
      }
    },
    maxChars: JOIN_MAX_CHARS,
    execute(args) {
      const eff = store.effective();
      const lineRelations = [
        ...(eff.businessLines.find(item => item.name === resolved.line.name)?.relations || resolved.line.relations || []),
        ...(eff.businessLines.find(item => item.name === store.PUBLIC)?.relations || resolved.publicLine?.relations || [])
      ];
      const { usable } = usableRelations(lineRelations, defs);
      const engine = createJoinEngine({ tables: defs, rowsOf, relations: usable, ...(limits ? { limits } : {}) });
      return engine.query(args || {});
    }
  };
  getTableKnowledge.maxChars = Math.max(budget + 4000, 16000);

  return [getTableKnowledge, queryJoin];
}

module.exports = { resolveLine, buildContextPack, createKnowledgeTools };
