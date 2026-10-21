/**
 * 指标异动的确定性归因计算：代码算出维度贡献，模型只负责解释。
 *
 * 窗口：以数据中最新日期为锚点，「近 N 天」= 锚点往前 N 天（含锚点），「前 N 天」= 再往前 N 天。
 *
 * 加法指标（如消耗）：每个维度的分组变化之和严格等于总变化，贡献 = 分组变化 / 总变化。
 * 比率指标（CPA = 消耗 / 激活）：CPA = Σ(消耗_g / A)，其中 A 为总激活，只对有激活的分组求和；
 *   每组的变化拆成两部分：
 *   - 结构效应（mix）：激活占比变化 × 上期该组 CPA；
 *   - 效率效应（rate）：本期激活占比 × 该组 CPA 变化；
 *   另有「无激活花费」残差（没有激活的分组花掉的钱，计入 CPA 分子）。
 *   三者相加严格等于 CPA 的变化（每个维度都会校验一次）。
 */

const DAY_MS = 86400000;
const TOP_N = 8;

const num = value => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const dayOf = value => String(value ?? "").slice(0, 10);
const toMs = day => Date.parse(`${day}T00:00:00Z`);
const toDay = ms => new Date(ms).toISOString().slice(0, 10);
const round = (value, digits = 2) => (value === null || value === undefined || !Number.isFinite(value)) ? null : Number(value.toFixed(digits));

function windowsFor(anchor, days) {
  const end = toMs(anchor);
  return {
    current: { start: toDay(end - (days - 1) * DAY_MS), end: anchor },
    baseline: { start: toDay(end - (2 * days - 1) * DAY_MS), end: toDay(end - days * DAY_MS) }
  };
}

const inWindow = (row, dateKey, window) => {
  const day = dayOf(row[dateKey]);
  return day >= window.start && day <= window.end;
};

const sumOf = (rows, key) => rows.reduce((total, row) => total + num(row[key]), 0);

function summarize(current, baseline) {
  const delta = current - baseline;
  return {
    current: round(current),
    baseline: round(baseline),
    delta: round(delta),
    pct: baseline ? round((delta / baseline) * 100, 1) : null
  };
}

/** 按维度分组汇总两个窗口的指标，返回 Map<分组名, {cur, base}> */
function groupTotals(currentRows, baselineRows, metric, dimension) {
  const groups = new Map();
  const add = (rows, side) => rows.forEach(row => {
    const key = String(row[dimension] ?? "—");
    const entry = groups.get(key) || { cur: 0, base: 0 };
    entry[side] += num(row[metric]);
    groups.set(key, entry);
  });
  add(currentRows, "cur");
  add(baselineRows, "base");
  return groups;
}

/** 只保留影响最大的 TOP_N 项，其余合并为「其他」，保证合计仍然精确 */
function topDrivers(items, sortKey, sumKeys, keep = TOP_N) {
  const sorted = [...items].sort((a, b) => Math.abs(b[sortKey]) - Math.abs(a[sortKey]));
  if (sorted.length <= keep) return sorted;
  const rest = sorted.slice(keep);
  const other = { group: `其他（${rest.length} 项）` };
  sumKeys.forEach(key => {
    other[key] = round(rest.reduce((total, item) => total + (item[key] ?? 0), 0), 4);
  });
  return [...sorted.slice(0, keep), other];
}

function additiveAttribution(currentRows, baselineRows, metric, dimensions) {
  const total = sumOf(currentRows, metric) - sumOf(baselineRows, metric);
  return dimensions.map(dimension => {
    const groups = groupTotals(currentRows, baselineRows, metric, dimension);
    const items = [...groups.entries()].map(([group, value]) => {
      const delta = value.cur - value.base;
      return {
        group,
        current: round(value.cur),
        baseline: round(value.base),
        delta: round(delta),
        pct: value.base ? round((delta / value.base) * 100, 1) : null,
        shareOfChange: Math.abs(total) > 1e-9 ? round(delta / total, 4) : null
      };
    });
    const drivers = topDrivers(items, "delta", ["current", "baseline", "delta", "shareOfChange"]);
    const reconciled = Math.abs(items.reduce((sum, item) => sum + item.delta, 0) - total) < 0.05;
    return { dimension, drivers, reconciled };
  });
}

/** 按分组计算 CPA 的结构 / 效率 / 无激活花费 三部分 */
function ratioAttribution(currentRows, baselineRows, costKey, actKey, dimensions) {
  const side = rows => ({ cost: sumOf(rows, costKey), act: sumOf(rows, actKey) });
  const C = { cur: side(currentRows), base: side(baselineRows) };
  const cpa = s => (s.act > 0 ? s.cost / s.act : null);
  const cpaCur = cpa(C.cur), cpaBase = cpa(C.base);
  const totalDelta = cpaCur !== null && cpaBase !== null ? cpaCur - cpaBase : null;

  return dimensions.map(dimension => {
    const groups = new Map();
    const collect = (rows, which) => rows.forEach(row => {
      const key = String(row[dimension] ?? "—");
      const entry = groups.get(key) || { cur: { cost: 0, act: 0 }, base: { cost: 0, act: 0 } };
      entry[which].cost += num(row[costKey]);
      entry[which].act += num(row[actKey]);
      groups.set(key, entry);
    });
    collect(currentRows, "cur");
    collect(baselineRows, "base");

    // 只有有激活的分组进入结构 / 效率拆解；无激活分组的花费进入残差
    const zeroActResidual = win => {
      const A = C[win].act;
      if (!A) return 0;
      let zeroCost = 0;
      groups.forEach(entry => { if (entry[win].act === 0) zeroCost += entry[win].cost; });
      return zeroCost / A;
    };
    const residualDelta = zeroActResidual("cur") - zeroActResidual("base");

    const items = [...groups.entries()].map(([group, entry]) => {
      const Ac = C.cur.act, Ab = C.base.act;
      const sc = Ac && entry.cur.act ? entry.cur.act / Ac : 0;
      const sb = Ab && entry.base.act ? entry.base.act / Ab : 0;
      const cb = entry.base.act ? entry.base.cost / entry.base.act : 0;
      const tCur = entry.cur.act && Ac ? entry.cur.cost / Ac : 0;
      const tBase = entry.base.act && Ab ? entry.base.cost / Ab : 0;
      const total = tCur - tBase;
      const mix = (sc - sb) * cb;
      const rate = total - mix;
      return { group, mix, rate, total };
    });

    const mixTotal = items.reduce((sum, item) => sum + item.mix, 0);
    const rateTotal = items.reduce((sum, item) => sum + item.rate, 0);
    const reconciled = totalDelta === null || Math.abs(mixTotal + rateTotal + residualDelta - totalDelta) < 1e-6;
    const drivers = topDrivers(items.map(item => ({
      group: item.group,
      mix: round(item.mix, 4),
      rate: round(item.rate, 4),
      total: round(item.total, 4),
      shareOfChange: totalDelta && Math.abs(totalDelta) > 1e-9 ? round(item.total / totalDelta, 4) : null
    })), "total", ["mix", "rate", "total", "shareOfChange"]);
    return {
      dimension,
      mixEffect: round(mixTotal, 4),
      rateEffect: round(rateTotal, 4),
      uninvestedCostEffect: round(residualDelta, 4),
      drivers,
      reconciled
    };
  });
}

/**
 * @param {Array<object>} rows 表数据行
 * @param {{dateKey: string, metric: string, dimensions?: string[], activateKey?: string, days?: number, anchor?: string}} options
 * @returns {object} 归因结果；数据不足时 available = false 并给出原因
 */
function computeAttribution(rows, options) {
  const { dateKey, metric, dimensions = [], activateKey = "", days = 7 } = options;
  if (!dateKey || !metric) return { available: false, reason: "该表缺少日期或指标定义，无法归因" };
  if (!rows.length) return { available: false, reason: "该表没有数据" };
  const anchor = options.anchor || rows.map(row => dayOf(row[dateKey])).sort().at(-1);
  const windows = windowsFor(anchor, days);
  const currentRows = rows.filter(row => inWindow(row, dateKey, windows.current));
  const baselineRows = rows.filter(row => inWindow(row, dateKey, windows.baseline));
  if (!currentRows.length || !baselineRows.length) {
    return { available: false, reason: `近 ${days} 天或前 ${days} 天没有数据，无法归因`, windows };
  }

  const result = {
    available: true,
    anchor,
    windows,
    metric,
    total: summarize(sumOf(currentRows, metric), sumOf(baselineRows, metric)),
    dimensions: additiveAttribution(currentRows, baselineRows, metric, dimensions)
  };

  const hasActivation = activateKey && rows.some(row => num(row[activateKey]) > 0);
  // CPA 只在两个窗口都有激活时才有定义；否则不给出 CPA 拆解，避免把 0 当成 CPA
  const actCur = sumOf(currentRows, activateKey), actBase = sumOf(baselineRows, activateKey);
  if (metric === "cost" && hasActivation && actCur > 0 && actBase > 0) {
    const cpaCur = sumOf(currentRows, metric) / actCur;
    const cpaBase = sumOf(baselineRows, metric) / actBase;
    result.ratio = {
      metric: "CPA",
      formula: `${metric} / ${activateKey}`,
      total: summarize(cpaCur, cpaBase),
      dimensions: ratioAttribution(currentRows, baselineRows, metric, activateKey, dimensions)
    };
  }
  return result;
}

module.exports = { computeAttribution, windowsFor };
