'use strict';
// 字段权限：按“隐藏字段”裁剪表定义与数据行（纯函数，不改入参）。
// 字段名一律去掉首尾空格后比较（存储时也是去掉空格后的值）；表名只认 hidden 的自有属性。

const REDACTED = '（已隐藏）';
const norm = (value) => String(value ?? '').trim();

function hiddenSet(hidden, table) {
  if (!hidden || typeof hidden !== 'object' || !Object.prototype.hasOwnProperty.call(hidden, table)) return null;
  const v = hidden[table];
  if (!v) return null;
  const list = v instanceof Set ? [...v] : Array.isArray(v) ? v : [];
  const s = new Set(list.map(norm).filter(Boolean));
  return s.size ? s : null;
}

function isHidden(hidden, table, field) {
  const s = hiddenSet(hidden, table);
  return !!s && s.has(norm(field));
}

const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** 文本里是否以完整标识符的形式提到某个隐藏字段（media_source 不匹配 media_source_v2）；names 为数组或 Set */
function mentionsHidden(text, names) {
  if (typeof text !== 'string' || !text || !names) return false;
  for (const raw of names) {
    const name = norm(raw);
    if (name && new RegExp(`(^|[^A-Za-z0-9_])${escapeRe(name)}(?![A-Za-z0-9_])`).test(text)) return true;
  }
  return false;
}
const mentionsAny = mentionsHidden;

/** 逐行脱敏：提到任一隐藏字段的整行替换为「（已隐藏）」，其余行原样 */
function redactLines(text, names) {
  if (typeof text !== 'string' || !text) return text;
  const list = [...(names || [])].map(norm).filter(Boolean);
  if (!list.length) return text;
  return text.split('\n').map((line) => (mentionsHidden(line, list) ? REDACTED : line)).join('\n');
}

/** 某几张表上被隐藏的字段名合集 */
function hiddenNamesOf(hidden, tableNames) {
  const out = new Set();
  for (const t of tableNames || []) { const s = hiddenSet(hidden, t); if (s) s.forEach((n) => out.add(n)); }
  return out;
}

/** 血缘条目的说明文字（join / role）提到隐藏字段时整段替换为「（已隐藏）」；表名不动 */
function scopeLineage(lineage, s) {
  if (!lineage || typeof lineage !== 'object') return;
  for (const key of Object.keys(lineage)) {
    if (!Array.isArray(lineage[key])) continue;
    lineage[key].forEach((item) => {
      if (!item || typeof item !== 'object') return;
      for (const prop of ['join', 'role']) if (mentionsAny(item[prop], s)) item[prop] = REDACTED;
    });
  }
}

function scopeTables(tables, hidden) {
  return (tables || []).map((t) => {
    const s = hiddenSet(hidden, t.cnName);
    const copy = JSON.parse(JSON.stringify(t));
    if (!s) return copy;
    if (Array.isArray(copy.fields)) copy.fields = copy.fields.filter((f) => !s.has(norm(f.name)));
    if (copy.agg) {
      if (Array.isArray(copy.agg.groupBy)) copy.agg.groupBy = copy.agg.groupBy.filter((g) => !s.has(norm(g)));
      if (s.has(norm(copy.agg.metric))) copy.agg.metric = '';
      if (s.has(norm(copy.agg.dateKey))) copy.agg.dateKey = '';
    }
    scopeLineage(copy.lineage, s);
    return copy;
  });
}

function scopeRowsOf(rowsOf, hidden) {
  const any = hidden && typeof hidden === 'object' && Object.keys(hidden).some((k) => hiddenSet(hidden, k));
  if (!any) return rowsOf;
  return (cnName) => {
    const rows = rowsOf(cnName);
    const s = hiddenSet(hidden, cnName);
    if (!s) return rows;
    return rows.map((r) => {
      const o = {};
      for (const k of Object.keys(r)) if (!s.has(norm(k))) o[k] = r[k];
      return o;
    });
  };
}

module.exports = { scopeTables, scopeRowsOf, isHidden, mentionsAny, mentionsHidden, redactLines, hiddenNamesOf, REDACTED };
