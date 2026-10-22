/**
 * 语义层：指标口径即代码。
 *
 * 指标定义放在 semantic/metrics.json（随代码评审与发布），这里负责：
 * 1. 启动时对照真实表结构校验定义（表、日期字段、维度、指标字段是否存在且类型正确），不合格的项被丢弃并给出警告；
 * 2. 按口径确定性地计算指标：求和型直接汇总；比率型「先分别汇总再相除」，不是各行比率的平均；
 * 3. 查询时由调用方传入 allowedTables，只暴露用户有权限的表。
 */

const { additiveAttribution, ratioAttribution } = require("./attribution-calc.cjs");

const NUMERIC = /DECIMAL|BIGINT|INT|DOUBLE|FLOAT/i;
const MAX_GROUPS = 10;

/** 同一字段的多个筛选取交集；交集为空时 values 为空数组（调用方据此报错） */
function mergeFilters(filters) {
  const byField = new Map();
  filters.forEach(({ field, values }) => {
    const list = (values || []).map(String);
    byField.set(field, byField.has(field) ? byField.get(field).filter(value => list.includes(value)) : list);
  });
  return [...byField].map(([field, values]) => ({ field, values }));
}

const num = value => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
const dayOf = value => String(value ?? "").slice(0, 10);
const shiftDay = (day, offset) => new Date(Date.parse(`${day}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);

function createSemanticLayer({ catalog, tables, rowsOf }) {
  const warnings = [];
  const tableByName = new Map(tables.map(table => [table.cnName, table]));
  const fieldOf = (table, name) => (table.fields || []).find(field => field.name === name);

  // 1. 表级配置：日期字段与可用维度
  const tableConfig = new Map();
  Object.entries(catalog.tables || {}).forEach(([name, config]) => {
    const table = tableByName.get(name);
    if (!table) return warnings.push(`语义层：表「${name}」不存在，已忽略`);
    const dateField = fieldOf(table, config.dateField);
    if (!dateField) return warnings.push(`语义层：表「${name}」没有日期字段 ${config.dateField}，已忽略`);
    const dimensions = (config.dimensions || []).filter(dimension => {
      const field = fieldOf(table, dimension);
      const valid = field && !NUMERIC.test(field.type || "");
      if (!valid) warnings.push(`语义层：表「${name}」的维度 ${dimension} 不存在或不是文本字段，已忽略`);
      return valid;
    });
    // 固定筛选：该表任何查询都带上（例如只承认「常规套餐」「三方支付套餐」两类），字段必须是该表声明过的维度
    const baseFilters = (config.baseFilters || []).filter(filter => {
      const valid = dimensions.includes(filter.field) && Array.isArray(filter.values) && filter.values.length;
      if (!valid) warnings.push(`语义层：表「${name}」的固定筛选 ${filter.field} 不是已声明的维度或没有取值，已忽略`);
      return valid;
    });
    tableConfig.set(name, { dateField: config.dateField, dimensions, baseFilters });
  });

  // 2. 求和型指标：每张表的指标字段必须存在且为数值
  const metrics = new Map();
  (catalog.metrics || []).filter(metric => metric.type === "sum").forEach(metric => {
    const fields = {};
    Object.entries(metric.fields || {}).forEach(([tableName, fieldName]) => {
      const table = tableByName.get(tableName);
      const field = table && fieldOf(table, fieldName);
      if (!tableConfig.has(tableName)) warnings.push(`语义层：指标 ${metric.id} 引用的表「${tableName}」未配置日期与维度，已忽略`);
      else if (!field || !NUMERIC.test(field.type || "")) warnings.push(`语义层：指标 ${metric.id} 在表「${tableName}」的字段 ${fieldName} 不存在或不是数值，已忽略`);
      else fields[tableName] = fieldName;
    });
    if (Object.keys(fields).length) metrics.set(metric.id, { ...metric, fields });
    else warnings.push(`语义层：指标 ${metric.id} 没有任何可用的表，已忽略`);
  });

  // 3. 比率型指标：分子分母都要存在，可用表取两者的交集
  (catalog.metrics || []).filter(metric => metric.type === "ratio").forEach(metric => {
    const numerator = metrics.get(metric.numerator), denominator = metrics.get(metric.denominator);
    if (!numerator || !denominator) return warnings.push(`语义层：比率指标 ${metric.id} 的分子或分母不存在，已忽略`);
    const shared = Object.keys(numerator.fields).filter(name => denominator.fields[name]);
    if (!shared.length) return warnings.push(`语义层：比率指标 ${metric.id} 的分子分母没有共同的表，已忽略`);
    metrics.set(metric.id, { ...metric, shared });
  });

  const findMetric = key => {
    const needle = String(key || "").trim().toLowerCase();
    if (!needle) return null;
    return [...metrics.values()].find(metric => [metric.id, metric.name, ...(metric.aliases || [])].some(label => String(label).toLowerCase() === needle)) || null;
  };

  /** 指标自带的固定筛选：比率指标取自己、分子、分母三者的并集（同一字段取交集） */
  function metricBaseFilters(metric) {
    const own = metric.baseFilters || [];
    if (metric.type !== "ratio") return own;
    return mergeFilters([...own, ...metricBaseFilters(metrics.get(metric.numerator)), ...metricBaseFilters(metrics.get(metric.denominator))]);
  }

  const tablesOf = metric => (metric.type === "ratio" ? metric.shared : Object.keys(metric.fields));

  /** 某张表上指标的数值：求和型汇总字段；比率型 = 分子和 ÷ 分母和 × scale（分母为 0 返回 null） */
  function valueOn(metric, tableName, rows) {
    if (metric.type === "sum") return rows.reduce((total, row) => total + num(row[metric.fields[tableName]]), 0);
    const top = valueOn(metrics.get(metric.numerator), tableName, rows);
    const bottom = valueOn(metrics.get(metric.denominator), tableName, rows);
    return bottom > 0 ? (top / bottom) * (metric.scale || 1) : null;
  }

  const precision = metric => (metric.type === "ratio" && !metric.unit ? 4 : 2);
  const round = (value, digits) => (value === null || value === undefined || !Number.isFinite(value) ? null : Number(value.toFixed(digits)));

  /** 列出用户有权限的指标：只显示至少有一张有权限表的指标，且只列出有权限的表 */
  function listMetrics(allowedTables, keyword = "") {
    const allowed = new Set(allowedTables);
    const needle = String(keyword || "").trim().toLowerCase();
    return [...metrics.values()]
      .map(metric => ({ metric, usable: tablesOf(metric).filter(name => allowed.has(name)) }))
      .filter(({ metric, usable }) => usable.length && (!needle || [metric.id, metric.name, metric.description, ...(metric.aliases || [])].join(" ").toLowerCase().includes(needle)))
      .map(({ metric, usable }) => ({
        指标: metric.id,
        名称: metric.name,
        别名: metric.aliases || [],
        单位: metric.unit || "",
        口径: metric.description,
        口径状态: metric.reviewed ? "已确认" : "草稿（待数据团队确认）",
        可用表: usable.map(name => ({ 表名: name, 可用分组: tableConfig.get(name).dimensions }))
      }));
  }

  /** 查询与归因共用的准备步骤：解析指标 / 表 / 筛选（含固定筛选）、取窗口内的行。出错返回 { error }，没有数据返回 { empty } */
  function prepare({ metric: metricKey, table: requestedTable, group, days, filters, allowedTables }) {
    const metric = findMetric(metricKey);
    if (!metric) return { error: `未找到指标：${metricKey || "（未指定）"}，请先用 list_metrics 查看可用指标` };
    const allowed = new Set(allowedTables);
    const candidates = tablesOf(metric).filter(name => allowed.has(name));
    if (!candidates.length) return { error: `没有可用的数据表支持指标「${metric.name}」（或无权访问）` };
    let tableName = String(requestedTable || "");
    if (!tableName) {
      if (candidates.length > 1) return { error: `指标「${metric.name}」在多张表中可用，请指定 table：${candidates.join("、")}` };
      tableName = candidates[0];
    }
    if (!candidates.includes(tableName)) return { error: `数据表不存在、无权访问或不支持该指标：${tableName}` };

    const config = tableConfig.get(tableName);
    if (group && !config.dimensions.includes(group)) return { error: `该表不支持按 ${group} 分组，可用分组：${config.dimensions.join("、") || "无"}` };
    // 筛选：只允许该表声明过的文本维度，按「字段 = 任一取值」过滤；多个筛选之间是「且」
    const activeFilters = [];
    for (const filter of Array.isArray(filters) ? filters : []) {
      const field = String(filter?.field || "");
      const values = (Array.isArray(filter?.values) ? filter.values : [filter?.values]).map(value => String(value ?? "").trim()).filter(Boolean);
      if (!config.dimensions.includes(field)) return { error: `该表不支持按 ${field || "（空）"} 筛选，可用维度：${config.dimensions.join("、") || "无"}` };
      if (!values.length || values.length > 20) return { error: `筛选 ${field} 需要 1 到 20 个取值` };
      activeFilters.push({ field, values });
    }
    // 固定筛选（表级 + 指标级）与用户筛选合并；冲突（取交集为空）时说明该指标的适用范围，而不是返回空数据
    const fixedFilters = mergeFilters([...config.baseFilters, ...metricBaseFilters(metric)]);
    const effectiveFilters = mergeFilters([...fixedFilters, ...activeFilters]);
    const emptied = effectiveFilters.find(filter => !filter.values.length);
    if (emptied) {
      const fixed = fixedFilters.find(filter => filter.field === emptied.field);
      return { error: `指标「${metric.name}」只适用于 ${emptied.field} = ${(fixed?.values || []).join("、")}，你指定的筛选与它冲突` };
    }
    const windowDays = Math.min(90, Math.max(1, Math.floor(num(days)) || 7));
    const rows = rowsOf(tableName).filter(row => effectiveFilters.every(({ field, values }) => values.includes(String(row[field] ?? ""))));
    const anchor = rows.map(row => dayOf(row[config.dateField])).sort().at(-1);
    if (!anchor) return { empty: { 表名: tableName, 指标: metric.id, ...(activeFilters.length ? { 筛选: activeFilters.map(({ field, values }) => ({ 字段: field, 取值: values })) } : {}), 说明: activeFilters.length ? "筛选后没有数据：请检查取值是否写对（取值需与数据里的写法完全一致）" : "该表没有数据" } };
    const windows = {
      current: { start: shiftDay(anchor, -(windowDays - 1)), end: anchor },
      prior: { start: shiftDay(anchor, -(2 * windowDays - 1)), end: shiftDay(anchor, -windowDays) }
    };
    const inWindow = (row, window) => dayOf(row[config.dateField]) >= window.start && dayOf(row[config.dateField]) <= window.end;
    const currentRows = rows.filter(row => inWindow(row, windows.current));
    const priorRows = rows.filter(row => inWindow(row, windows.prior));
    return { metric, tableName, config, activeFilters, fixedFilters, windowDays, anchor, windows, currentRows, priorRows };
  }

  /** 查询指标：最近 N 天 vs 前 N 天，可按一个维度拆分。table 缺省时仅在唯一可选表时自动选择 */
  function query({ metric: metricKey, table: requestedTable, group, days, filters, daily, allowedTables }) {
    const prepared = prepare({ metric: metricKey, table: requestedTable, group, days, filters, allowedTables });
    if (prepared.error) return { ok: false, error: prepared.error };
    if (prepared.empty) return { ok: true, data: prepared.empty };
    const { metric, tableName, config, activeFilters, fixedFilters, windowDays, anchor, windows, currentRows, priorRows } = prepared;
    const digits = precision(metric);
    const change = (current, prior) => ({
      变化量: current !== null && prior !== null ? round(current - prior, digits) : null,
      环比百分比: current !== null && prior ? round(((current - prior) / prior) * 100, 2) : null
    });

    const currentTotal = valueOn(metric, tableName, currentRows);
    const priorTotal = valueOn(metric, tableName, priorRows);
    const data = {
      表名: tableName,
      指标: metric.id,
      名称: metric.name,
      单位: metric.unit || "",
      口径: { 说明: metric.description, 状态: metric.reviewed ? "已确认" : "草稿（待数据团队确认）", 负责人: metric.owner || "" },
      窗口: { N: windowDays, 近N天: [windows.current.start, windows.current.end], 前N天: [windows.prior.start, windows.prior.end] },
      近N天: round(currentTotal, digits),
      前N天: round(priorTotal, digits),
      ...change(currentTotal, priorTotal)
    };
    if (activeFilters.length) data.筛选 = activeFilters.map(({ field, values }) => ({ 字段: field, 取值: values }));
    if (fixedFilters.length) data.口径.固定筛选 = fixedFilters.map(({ field, values }) => ({ 字段: field, 取值: values }));
    if (metric.caveat) data.提示 = metric.caveat;
    data.数据截止日期 = anchor;

    if (daily) {
      // 按日趋势：窗口内每天的值（比率按「当天先汇总再相除」）；订单与消耗不同轴，比率类的日级值会抖动
      const series = [];
      for (let offset = windowDays - 1; offset >= 0; offset -= 1) {
        const day = shiftDay(anchor, -offset);
        const dayRows = currentRows.filter(row => dayOf(row[config.dateField]) === day);
        series.push({ 日期: day, 值: dayRows.length ? round(valueOn(metric, tableName, dayRows), digits) : null });
      }
      const present = series.filter(item => item.值 !== null);
      const stats = {};
      if (present.length) {
        const sorted = [...present].sort((a, b) => a.值 - b.值);
        stats.最高日 = sorted.at(-1);
        stats.最低日 = sorted[0];
        if (metric.type === "sum") {
          const mean = present.reduce((total, item) => total + item.值, 0) / present.length;
          const sd = Math.sqrt(present.reduce((total, item) => total + (item.值 - mean) ** 2, 0) / present.length);
          stats.日均 = round(mean, digits);
          if (sd > 0) stats.异常日 = present.filter(item => Math.abs(item.值 - mean) > 2 * sd).map(item => item.日期);
        }
      }
      data.按日 = { 明细: series, ...stats };
      if (metric.type === "ratio") data.按日.说明 = "比率类指标的日级值受订单与消耗不同时间轴影响，会明显抖动，趋势判断请以整个窗口为准。";
    }
    if (group) {
      const keys = new Set([...currentRows, ...priorRows].map(row => String(row[group] ?? "—")));
      const items = [...keys].map(key => {
        const pick = list => list.filter(row => String(row[group] ?? "—") === key);
        const current = valueOn(metric, tableName, pick(currentRows));
        const prior = valueOn(metric, tableName, pick(priorRows));
        return { 组: key, 近N天: round(current, digits), 前N天: round(prior, digits), ...change(current, prior) };
      }).sort((a, b) => Math.abs(b.变化量 ?? 0) - Math.abs(a.变化量 ?? 0));
      data.分组 = { 字段: group, 明细: items.slice(0, MAX_GROUPS), 其余组数: Math.max(0, items.length - MAX_GROUPS) };
    }
    return { ok: true, data };
  }

  const MAX_ATTRIBUTION_DIMENSIONS = 5;
  const SHOWN_DRIVERS = 5;

  /**
   * 指标异动归因：把「近 N 天 vs 前 N 天」的变化拆到各个维度上，所有数字由代码确定性计算，模型只负责解释。
   * - 加法指标（消耗、用户数…）：每个维度下各组的变化之和严格等于总变化，给出各组占总变化的比例；
   * - 比率指标（CPA、ROI、签约率…）：拆成「结构效应」（该组分母占比变化）与「效率效应」（该组自身比率变化），
   *   再加上「分母为零的分组的影响」，三者之和严格等于比率的总变化（每个维度都核对一次）。
   * 维度按「前几名能解释多少变化」从高到低排序，最值得先看的排在最前面。
   */
  function attribute({ metric: metricKey, table: requestedTable, dimensions, days, filters, allowedTables }) {
    const prepared = prepare({ metric: metricKey, table: requestedTable, days, filters, allowedTables });
    if (prepared.error) return { ok: false, error: prepared.error };
    if (prepared.empty) return { ok: true, data: prepared.empty };
    const { metric, tableName, config, activeFilters, fixedFilters, windowDays, anchor, windows, currentRows, priorRows } = prepared;
    if (!currentRows.length || !priorRows.length) return { ok: true, data: { 表名: tableName, 指标: metric.id, 窗口: { N: windowDays, 近N天: [windows.current.start, windows.current.end], 前N天: [windows.prior.start, windows.prior.end] }, 说明: "近 N 天或前 N 天没有数据，无法归因；可以缩短窗口再试" } };

    // 要拆的维度：默认用该表的全部可用维度；被筛选成单一取值的维度没有信息量，去掉
    const requested = (Array.isArray(dimensions) ? dimensions : []).map(String);
    const unknown = requested.find(name => !config.dimensions.includes(name));
    if (unknown) return { ok: false, error: `该表不支持按 ${unknown} 拆解，可用维度：${config.dimensions.join("、") || "无"}` };
    const pool = requested.length ? requested : config.dimensions;
    const informative = pool.filter(name => new Set([...currentRows, ...priorRows].map(row => String(row[name] ?? "—"))).size > 1);
    const dims = informative.slice(0, MAX_ATTRIBUTION_DIMENSIONS);
    if (!dims.length) return { ok: true, data: { 表名: tableName, 指标: metric.id, 说明: "所选范围内没有可以拆解的维度（各维度都只有一个取值）" } };

    // 把行映射成归因计算要的形状：维度取值 + 数值（比率按「分子 / 分母」，百分比类指标把分子乘以 scale）
    let toRow;
    let valueKey, numeratorKey, denominatorKey;
    if (metric.type === "sum") {
      valueKey = "__v";
      toRow = row => ({ ...Object.fromEntries(dims.map(name => [name, row[name]])), __v: num(row[metric.fields[tableName]]) });
    } else {
      const numerator = metrics.get(metric.numerator), denominator = metrics.get(metric.denominator);
      if (numerator.type !== "sum" || denominator.type !== "sum") return { ok: false, error: `指标「${metric.name}」由比率再组合而成，暂不支持归因` };
      numeratorKey = "__n"; denominatorKey = "__d";
      const scale = metric.scale || 1;
      toRow = row => ({ ...Object.fromEntries(dims.map(name => [name, row[name]])), __n: num(row[numerator.fields[tableName]]) * scale, __d: num(row[denominator.fields[tableName]]) });
    }
    const current = currentRows.map(toRow), prior = priorRows.map(toRow);
    const digits = precision(metric);
    const currentTotal = valueOn(metric, tableName, currentRows), priorTotal = valueOn(metric, tableName, priorRows);
    const delta = currentTotal !== null && priorTotal !== null ? currentTotal - priorTotal : null;
    const data = {
      表名: tableName, 指标: metric.id, 名称: metric.name, 单位: metric.unit || "",
      口径: { 说明: metric.description, 状态: metric.reviewed ? "已确认" : "草稿（待数据团队确认）" },
      窗口: { N: windowDays, 近N天: [windows.current.start, windows.current.end], 前N天: [windows.prior.start, windows.prior.end] },
      总体: { 近N天: round(currentTotal, digits), 前N天: round(priorTotal, digits), 变化量: round(delta, digits), 环比百分比: priorTotal ? round((delta / priorTotal) * 100, 2) : null },
      数据截止日期: anchor
    };
    if (activeFilters.length) data.筛选 = activeFilters.map(({ field, values }) => ({ 字段: field, 取值: values }));
    if (fixedFilters.length) data.口径.固定筛选 = fixedFilters.map(({ field, values }) => ({ 字段: field, 取值: values }));
    if (metric.caveat) data.提示 = metric.caveat;
    if (delta === null || Math.abs(delta) < 1e-9) data.说明 = "总变化接近 0，各组占比没有意义；下面只列各组自身的变化";

    const share = value => (delta && Math.abs(delta) > 1e-9 ? round(value / delta, 4) : null);
    let result;
    if (metric.type === "sum") {
      result = additiveAttribution(current, prior, valueKey, dims).map(item => {
        const real = item.drivers.filter(driver => !String(driver.group).startsWith("其他"));
        const shown = real.slice(0, SHOWN_DRIVERS);
        const shownDelta = shown.reduce((total, driver) => total + driver.delta, 0);
        const total = item.drivers.reduce((sum, driver) => sum + driver.delta, 0);
        return {
          字段: item.dimension,
          主要贡献: shown.map(driver => ({ 组: driver.group, 近N天: round(driver.current, digits), 前N天: round(driver.baseline, digits), 变化量: round(driver.delta, digits), 环比百分比: driver.pct, 占总变化比例: driver.shareOfChange })),
          其余合计: { 变化量: round(total - shownDelta, digits), 占总变化比例: share(total - shownDelta) },
          各组变化之和等于总变化: item.reconciled,
          _top: shown.length ? Math.abs(shown[0].shareOfChange ?? 0) : 0
        };
      });
    } else {
      result = ratioAttribution(current, prior, numeratorKey, denominatorKey, dims).map(item => {
        const real = item.drivers.filter(driver => !String(driver.group).startsWith("其他"));
        const shown = real.slice(0, SHOWN_DRIVERS);
        const shownTotal = shown.reduce((sum, driver) => sum + driver.total, 0);
        const shownMix = shown.reduce((sum, driver) => sum + driver.mix, 0);
        const shownRate = shown.reduce((sum, driver) => sum + driver.rate, 0);
        return {
          字段: item.dimension,
          结构效应合计: round(item.mixEffect, 4), 效率效应合计: round(item.rateEffect, 4), 分母为零的分组的影响: round(item.uninvestedCostEffect, 4),
          主要贡献: shown.map(driver => ({ 组: driver.group, 结构效应: round(driver.mix, 4), 效率效应: round(driver.rate, 4), 合计变化: round(driver.total, 4), 占总变化比例: driver.shareOfChange })),
          其余合计: { 结构效应: round(item.mixEffect - shownMix, 4), 效率效应: round(item.rateEffect - shownRate, 4), 合计变化: round(item.mixEffect + item.rateEffect - shownTotal, 4) },
          三部分之和等于总变化: item.reconciled,
          _top: shown.length ? Math.abs(shown[0].shareOfChange ?? 0) : 0
        };
      });
    }
    result.sort((a, b) => b._top - a._top);
    data.维度 = result.map(({ _top, ...rest }) => rest);
    data.读法 = metric.type === "sum"
      ? "占总变化比例 = 该组变化 ÷ 总变化；同一维度下各组加其余合计等于 100%。维度已按「前几名能解释多少变化」从高到低排序，优先看排在前面的。"
      : "结构效应 = 该组分母占比变化带来的影响（投放结构变了）；效率效应 = 该组自身比率变化带来的影响；加上「分母为零的分组的影响」等于比率的总变化。维度已按前几名的解释力排序，优先看排在前面的。";
    return { ok: true, data };
  }

  return { warnings, listMetrics, query, attribute, metricCount: metrics.size };
}

module.exports = { createSemanticLayer };
