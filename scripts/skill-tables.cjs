"use strict";

function sanitizeSkillTables(input, knownNames, { max = 100 } = {}) {
  if (!Array.isArray(input)) return { ok: false, error: "tables 必须是数组" };
  const known = new Set(Array.isArray(knownNames) ? knownNames : []);
  const tables = [];
  const seen = new Set();
  const unknown = [];
  for (const item of input) {
    const name = String(item ?? "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    if (!known.has(name)) unknown.push(name);
    else tables.push(name);
  }
  if (unknown.length) {
    return { ok: false, error: `未识别的表：${unknown.join("、")}`, unknown };
  }
  if (tables.length > max) {
    return { ok: false, error: `引用的表不能超过 ${max} 张` };
  }
  return { ok: true, tables };
}

function resolveSkillTables(entry, pack) {
  if (Array.isArray(entry?.tables)) return entry.tables.map(name => String(name));
  const fromPack = pack?.spec?.tables;
  return Array.isArray(fromPack) ? fromPack.map(name => String(name)) : [];
}

module.exports = { sanitizeSkillTables, resolveSkillTables };
