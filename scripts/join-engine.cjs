/**
 * 关联引擎：按业务线里登记的表关联，把多张表拼起来汇总。
 *
 * 约定（全部在这里强制）：
 * - 只用登记过的关联；任一端的表或字段不在（已按字段权限裁剪的）tables 里，整条关联丢弃；
 * - 每个指标表独立汇总：先应用自身窗口与筛选，再沿「对一」路径把分组 / 筛选字段查到行上，按分组值汇总；
 *   多个指标表的结果按分组值拼接（缺的一侧补 0），不会因为 一对多 关联被互相放大；
 * - 路径上任何一段从指标表方向看是「对多」，就拒绝并点名关联与指标，不返回数字；
 * - 比率先分别汇总再相除（总分子 / 总分母），除数为 0 时为 null；
 * - 不限制表数与跳数，限制按资源：访问的行数、耗时、返回的组数。
 */

const NUMERIC = /DECIMAL|BIGINT|INT|DOUBLE|FLOAT/i;
const AGGS = new Set(["sum", "count"]);
const TYPES = new Set(["1:1", "1:N", "N:1"]);
const DEFAULT_LIMITS = { maxRows: 200000, maxMs: 3000, maxGroups: 20 };
const UNMATCHED_LABEL = "（未关联）";
const EMPTY_LABEL = "（空）";
const UNMATCHED = Symbol("unmatched");
const EMPTY = Symbol("empty");

const round = (value, digits = 2) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : null);
const dayOf = value => String(value ?? "").slice(0, 10);
const num = value => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
const isBlank = value => value === null || value === undefined || value === "";
const describeRelation = relation => `${relation.left.table}.${relation.left.field} ${relation.type} ${relation.right.table}.${relation.right.field}`;
const byId = (a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);

class LimitError extends Error {}

/** 只保留两端表、字段都在裁剪后 tables 里的关联；其余整条丢弃并给出原因 */
function usableRelations(relations, tables) {
  const fieldsOf = new Map((tables || []).map(table => [table.cnName, new Set((table.fields || []).map(field => field.name))]));
  const usable = [];
  const dropped = [];
  for (const relation of relations || []) {
    const id = String(relation?.id ?? "");
    if (!relation?.left?.table || !relation?.right?.table || !TYPES.has(relation.type)) {
      dropped.push({ id, reason: "关联格式不正确" });
      continue;
    }
    let reason = "";
    for (const side of [relation.left, relation.right]) {
      if (!fieldsOf.has(side.table)) { reason = `表「${side.table}」不可用（不存在或无权限）`; break; }
      if (!fieldsOf.get(side.table).has(side.field)) { reason = `字段 ${side.table}.${side.field} 不可用（不存在或无权限）`; break; }
    }
    if (reason) dropped.push({ id, reason });
    else usable.push(relation);
  }
  return { usable, dropped };
}

/** 无向图：每条边记录从 from 走到 to 时，对 from 的一行是「对一」还是「对多」；邻接按关联 id 排序保证确定 */
function buildGraph(relations) {
  const graph = new Map();
  const add = (from, edge) => { if (!graph.has(from)) graph.set(from, []); graph.get(from).push(edge); };
  for (const relation of [...relations].sort(byId)) {
    if (relation.left.table === relation.right.table) continue;
    add(relation.left.table, { relation, from: relation.left.table, fromField: relation.left.field, to: relation.right.table, toField: relation.right.field, toOne: relation.type !== "1:N" });
    add(relation.right.table, { relation, from: relation.right.table, fromField: relation.right.field, to: relation.left.table, toField: relation.left.field, toOne: relation.type !== "N:1" });
  }
  return graph;
}

/** BFS 最短路径（同长按关联 id 先到先得）；onlyToOne 时只走「对一」边 */
function shortestPath(graph, start, target, onlyToOne) {
  if (start === target) return [];
  const parent = new Map([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const table = queue.shift();
    for (const edge of graph.get(table) || []) {
      if (onlyToOne && !edge.toOne) continue;
      if (parent.has(edge.to)) continue;
      parent.set(edge.to, edge);
      if (edge.to === target) {
        const path = [];
        for (let step = edge; step; step = parent.get(step.from)) path.unshift(step);
        return path;
      }
      queue.push(edge.to);
    }
  }
  return null;
}

function shiftDay(day, delta) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function createJoinEngine({ tables, rowsOf, relations, limits } = {}) {
  const limit = { ...DEFAULT_LIMITS, ...(limits || {}) };
  const tableMap = new Map((tables || []).map(table => [table.cnName, table]));
  const graph = buildGraph(usableRelations(relations, tables).usable);

  const fieldOf = (table, field) => (tableMap.get(table)?.fields || []).find(item => item.name === field);
  const checkRef = (ref, label) => {
    if (!ref || typeof ref.table !== "string" || typeof ref.field !== "string") return `${label}格式不正确，应为 { table, field }`;
    if (!tableMap.has(ref.table)) return `数据表「${ref.table}」不存在或无权限`;
    if (!fieldOf(ref.table, ref.field)) return `字段 ${ref.table}.${ref.field} 不存在或无权限`;
    return "";
  };

  function validate(request) {
    if (!request || !Array.isArray(request.metrics) || !request.metrics.length) return "至少需要一个指标";
    const names = new Set();
    for (const metric of request.metrics) {
      const error = checkRef(metric, "指标");
      if (error) return error;
      if (!AGGS.has(metric.agg)) return `指标 ${metric.table}.${metric.field} 的汇总方式只能是 sum 或 count`;
      if (metric.agg === "sum" && !NUMERIC.test(fieldOf(metric.table, metric.field).type || "")) return `字段 ${metric.table}.${metric.field} 不是数值字段，不能求和`;
      const name = metric.name || `${metric.table}.${metric.field}`;
      if (names.has(name)) return `指标名「${name}」重复`;
      names.add(name);
    }
    for (const ref of request.groupBy || []) { const error = checkRef(ref, "分组"); if (error) return error; }
    for (const filter of request.filters || []) {
      const error = checkRef(filter, "筛选");
      if (error) return error;
      if (!Array.isArray(filter.values) || !filter.values.length) return `筛选 ${filter.table}.${filter.field} 至少需要一个取值`;
    }
    for (const ratio of request.ratios || []) {
      if (!ratio?.name || names.has(ratio.name)) return `比率名「${ratio?.name ?? ""}」为空或与其他指标重名`;
      for (const ref of [ratio.numerator, ratio.denominator]) if (!names.has(ref)) return `比率「${ratio.name}」引用的指标「${ref}」不存在`;
      names.add(ratio.name);
    }
    if (request.days !== undefined && request.days !== null) {
      if (!Number.isInteger(request.days) || request.days <= 0) return "days 必须是正整数";
      const dateTable = request.dateTable || request.metrics[0].table;
      const dateKey = tableMap.get(dateTable)?.agg?.dateKey;
      if (!tableMap.has(dateTable)) return `数据表「${dateTable}」不存在或无权限`;
      if (!dateKey || !fieldOf(dateTable, dateKey)) return `数据表「${dateTable}」没有可用的日期字段，不能按天数取窗口`;
    }
    return "";
  }

  /** 每个指标表到每张分组 / 筛选表的路径：优先只走「对一」边的最短路径；不存在时用任意最短路径说明原因 */
  function planPaths(metricTables, targets, metricsByTable) {
    const paths = new Map();
    for (const from of metricTables) {
      const own = new Map();
      for (const to of targets) {
        if (own.has(to)) continue;
        const path = shortestPath(graph, from, to, true);
        if (path) { own.set(to, path); continue; }
        const any = shortestPath(graph, from, to, false);
        if (!any) return { error: `${from} 与 ${to} 在关联清单里没有登记，无法关联` };
        const edge = any.find(step => !step.toOne);
        const names = metricsByTable.get(from).map(metric => metric.name).join("、");
        return { error: `指标 ${names} 来自一对多关系的『1』侧（关联 ${describeRelation(edge.relation)}，${edge.from} 一行对应 ${edge.to} 多行），按『N』侧 ${to} 分组 / 筛选会重复计数，不返回数字` };
      }
      paths.set(from, own);
    }
    return { paths };
  }

  function query(request) {
    const invalid = validate(request);
    if (invalid) return { ok: false, error: invalid };
    const metrics = request.metrics.map(metric => ({ ...metric, name: metric.name || `${metric.table}.${metric.field}` }));
    const groupBy = request.groupBy || [];
    const filters = request.filters || [];
    const ratios = request.ratios || [];
    const metricTables = [...new Set(metrics.map(metric => metric.table))];
    const metricsByTable = new Map(metricTables.map(table => [table, metrics.filter(metric => metric.table === table)]));
    const targets = [...new Set([...groupBy, ...filters].map(ref => ref.table))];

    const plan = planPaths(metricTables, targets, metricsByTable);
    if (plan.error) return { ok: false, error: plan.error };

    const startedAt = Date.now();
    let visited = 0;
    const tick = count => {
      visited += count;
      if (visited > limit.maxRows) throw new LimitError(`超出资源上限：中间结果超过 ${limit.maxRows} 行，请缩短时间窗口、增加筛选或减少关联的表`);
      if (Date.now() - startedAt > limit.maxMs) throw new LimitError(`超出资源上限：计算超过 ${limit.maxMs} 毫秒，请缩短时间窗口、增加筛选或减少关联的表`);
    };

    try {
      // 窗口：只对 dateTable 按其日期字段过滤，以该表最大日期为锚
      let window;
      const dateTable = request.days ? (request.dateTable || metrics[0].table) : null;
      const rowCache = new Map();
      const loadRows = name => {
        if (rowCache.has(name)) return rowCache.get(name);
        let rows = rowsOf(name) || [];
        tick(rows.length);
        if (name === dateTable) {
          const dateKey = tableMap.get(name).agg.dateKey;
          const anchor = rows.reduce((max, row) => { const day = dayOf(row[dateKey]); return day && day > max ? day : max; }, "");
          if (anchor) {
            const start = shiftDay(anchor, -(request.days - 1));
            window = { 起: start, 止: anchor, N: request.days };
            rows = rows.filter(row => { const day = dayOf(row[dateKey]); return day >= start && day <= anchor; });
          } else rows = [];
        }
        rowCache.set(name, rows);
        return rows;
      };
      if (dateTable) loadRows(dateTable);

      const indexCache = new Map();
      const indexOf = (table, field) => {
        const key = `${table}\u0000${field}`;
        if (!indexCache.has(key)) {
          const index = new Map();
          for (const row of loadRows(table)) {
            const value = row[field];
            if (!isBlank(value) && !index.has(String(value))) index.set(String(value), row);
          }
          indexCache.set(key, index);
        }
        return indexCache.get(key);
      };
      const resolve = (row, path, field) => {
        let current = row;
        for (const edge of path) {
          const key = current[edge.fromField];
          if (isBlank(key)) return UNMATCHED;
          current = indexOf(edge.to, edge.toField).get(String(key));
          if (!current) return UNMATCHED;
        }
        const value = current[field];
        return isBlank(value) ? EMPTY : String(value);
      };

      const merged = new Map();
      let contributed = false;
      for (const table of metricTables) {
        const own = plan.paths.get(table);
        const tableMetrics = metricsByTable.get(table);
        const filterSets = filters.map(filter => new Set(filter.values.map(String)));
        let checked = 0;
        for (const row of loadRows(table)) {
          if (++checked % 1000 === 0) tick(0);
          let keep = true;
          for (let i = 0; i < filters.length && keep; i += 1) {
            const value = resolve(row, own.get(filters[i].table), filters[i].field);
            keep = typeof value === "string" && filterSets[i].has(value);
          }
          if (!keep) continue;
          const groupValues = groupBy.map(ref => {
            const value = resolve(row, own.get(ref.table), ref.field);
            return value === UNMATCHED ? UNMATCHED_LABEL : value === EMPTY ? EMPTY_LABEL : value;
          });
          const key = JSON.stringify(groupValues);
          if (!merged.has(key)) merged.set(key, { groupValues, sums: Object.fromEntries(metrics.map(metric => [metric.name, 0])) });
          const entry = merged.get(key);
          for (const metric of tableMetrics) {
            entry.sums[metric.name] += metric.agg === "sum" ? num(row[metric.field]) : isBlank(row[metric.field]) ? 0 : 1;
          }
          contributed = true;
        }
      }

      const valuesOf = sums => {
        const values = {};
        for (const metric of metrics) values[metric.name] = round(sums[metric.name]);
        for (const ratio of ratios) {
          const denominator = sums[ratio.denominator];
          values[ratio.name] = denominator ? round(sums[ratio.numerator] / denominator, 4) : null;
        }
        return values;
      };
      const groupFields = groupBy.map(ref => `${ref.table}.${ref.field}`);
      const first = metrics[0].name;
      const entries = [...merged.entries()].sort(([keyA, a], [keyB, b]) =>
        b.sums[first] - a.sums[first] || (keyA < keyB ? -1 : keyA > keyB ? 1 : 0));
      const totals = Object.fromEntries(metrics.map(metric => [metric.name, 0]));
      for (const [, entry] of entries) for (const metric of metrics) totals[metric.name] += entry.sums[metric.name];

      const pathNames = [];
      for (const table of metricTables) {
        for (const to of targets) for (const edge of plan.paths.get(table).get(to)) {
          const name = describeRelation(edge.relation);
          if (!pathNames.includes(name)) pathNames.push(name);
        }
      }

      const data = {
        指标: [...metrics.map(metric => metric.name), ...ratios.map(ratio => ratio.name)],
        分组字段: groupFields,
        明细: entries.slice(0, limit.maxGroups).map(([, entry]) => ({
          分组: Object.fromEntries(groupFields.map((field, i) => [field, entry.groupValues[i]])),
          值: valuesOf(entry.sums)
        })),
        合计: contributed ? valuesOf(totals) : null,
        关联路径: pathNames,
        其余组数: Math.max(0, entries.length - limit.maxGroups)
      };
      if (window) data.窗口 = window;
      return { ok: true, data };
    } catch (error) {
      if (error instanceof LimitError) return { ok: false, error: error.message };
      throw error;
    }
  }

  return { query };
}

module.exports = { usableRelations, createJoinEngine, DEFAULT_LIMITS };
