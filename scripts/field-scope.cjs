'use strict';
// 字段权限：按“隐藏字段”裁剪表定义与数据行（纯函数，不改入参）。

function hiddenSet(hidden, table) {
  const v = hidden && hidden[table];
  if (!v) return null;
  const s = v instanceof Set ? v : new Set(v);
  return s.size ? s : null;
}

function isHidden(hidden, table, field) {
  const s = hiddenSet(hidden, table);
  return !!s && s.has(field);
}

function scopeTables(tables, hidden) {
  return (tables || []).map((t) => {
    const s = hiddenSet(hidden, t.cnName);
    const copy = JSON.parse(JSON.stringify(t));
    if (!s) return copy;
    if (Array.isArray(copy.fields)) copy.fields = copy.fields.filter((f) => !s.has(f.name));
    if (copy.agg) {
      if (Array.isArray(copy.agg.groupBy)) copy.agg.groupBy = copy.agg.groupBy.filter((g) => !s.has(g));
      if (s.has(copy.agg.metric)) copy.agg.metric = '';
      if (s.has(copy.agg.dateKey)) copy.agg.dateKey = '';
    }
    return copy;
  });
}

function scopeRowsOf(rowsOf, hidden) {
  const any = hidden && Object.keys(hidden).some((k) => hiddenSet(hidden, k));
  if (!any) return rowsOf;
  return (cnName) => {
    const rows = rowsOf(cnName);
    const s = hiddenSet(hidden, cnName);
    if (!s) return rows;
    return rows.map((r) => {
      const o = {};
      for (const k of Object.keys(r)) if (!s.has(k)) o[k] = r[k];
      return o;
    });
  };
}

module.exports = { scopeTables, scopeRowsOf, isHidden };
