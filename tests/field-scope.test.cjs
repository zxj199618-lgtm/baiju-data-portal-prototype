'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { scopeTables, scopeRowsOf, isHidden } = require('../scripts/field-scope.cjs');

const mkTables = () => [
  {
    cnName: '订单表', desc: 'd', owner: 'o',
    fields: [
      { name: 'dt', type: 'date', comment: '日期' },
      { name: 'channel', type: 'string', comment: '渠道', enum: ['a', 'b'] },
      { name: 'cost', type: 'number', comment: '成本' },
    ],
    agg: { dateKey: 'dt', groupBy: ['channel', 'cost'], metric: 'cost' },
    lineage: { upstream: [], downstream: [] },
  },
  { cnName: '其他表', fields: [{ name: 'x', type: 'string', comment: '' }], agg: { dateKey: 'x', groupBy: ['x'], metric: 'x' }, lineage: {} },
];

test('scopeTables 不改原对象，去掉隐藏字段与 groupBy 项，metric 置空', () => {
  const tables = mkTables();
  const snap = JSON.stringify(tables);
  const out = scopeTables(tables, { 订单表: ['cost'] });
  assert.equal(JSON.stringify(tables), snap);
  assert.deepEqual(out[0].fields.map((f) => f.name), ['dt', 'channel']);
  assert.deepEqual(out[0].agg.groupBy, ['channel']);
  assert.equal(out[0].agg.metric, '');
  assert.equal(out[0].agg.dateKey, 'dt');
  assert.deepEqual(out[1], tables[1]);
  out[0].fields[0].comment = 'changed';
  out[0].fields[1].enum.push('c');
  assert.equal(JSON.stringify(tables), snap);
});

test('scopeTables dateKey 被隐藏置空，支持 Set', () => {
  const out = scopeTables(mkTables(), { 订单表: new Set(['dt']) });
  assert.equal(out[0].agg.dateKey, '');
  assert.equal(out[0].fields.length, 2);
});

test('scopeRowsOf 去掉隐藏列，未隐藏的表原样', () => {
  const data = { 订单表: [{ dt: '1', cost: 5, channel: 'a' }], 其他表: [{ x: 1 }] };
  const rowsOf = (n) => data[n] || [];
  const s = scopeRowsOf(rowsOf, { 订单表: new Set(['cost']) });
  assert.deepEqual(s('订单表'), [{ dt: '1', channel: 'a' }]);
  assert.deepEqual(data['订单表'][0], { dt: '1', cost: 5, channel: 'a' });
  assert.equal(s('其他表'), data['其他表']);
});

test('hidden 为空时 scopeRowsOf 返回原 rowsOf', () => {
  const rowsOf = () => [];
  assert.equal(scopeRowsOf(rowsOf, {}), rowsOf);
  assert.equal(scopeRowsOf(rowsOf, undefined), rowsOf);
  assert.equal(scopeRowsOf(rowsOf, { a: [] }), rowsOf);
});

test('isHidden', () => {
  assert.equal(isHidden({ t: ['a'] }, 't', 'a'), true);
  assert.equal(isHidden({ t: new Set(['a']) }, 't', 'a'), true);
  assert.equal(isHidden({ t: ['a'] }, 't', 'b'), false);
  assert.equal(isHidden({}, 't', 'a'), false);
  assert.equal(isHidden(undefined, 't', 'a'), false);
});

test('scopeTables 血缘 join / role 提到隐藏字段时整段替换为「（已隐藏）」，其余不动', () => {
  const tables = [{
    cnName: '计划表', fields: [{ name: 'media_source', type: 'VARCHAR' }, { name: 'cost', type: 'DECIMAL' }],
    agg: { dateKey: '', groupBy: ['media_source'], metric: 'cost' },
    lineage: {
      upstream: [
        { table: 'dim_media_source', role: '媒体来源维表', join: 'LEFT JOIN · media_source' },
        { table: 'dwd_a', role: '按 media_source 关联的账户表', join: 'INNER JOIN · 账户+日' },
        { table: 'dwd_b', role: '成本明细（cost_detail 不是 cost 本身？）', join: 'LEFT JOIN · media_source_v2' }
      ],
      downstream: [{ table: 'ads_x', role: '汇总 media_source' }]
    }
  }];
  const out = scopeTables(tables, { 计划表: [' media_source '] });
  const up = out[0].lineage.upstream;
  assert.equal(up[0].join, '（已隐藏）');
  assert.equal(up[0].role, '媒体来源维表');
  assert.equal(up[0].table, 'dim_media_source', '表名不是字段名，不替换');
  assert.equal(up[1].role, '（已隐藏）');
  assert.equal(up[1].join, 'INNER JOIN · 账户+日');
  assert.equal(up[2].join, 'LEFT JOIN · media_source_v2', '只按完整标识符匹配');
  assert.equal(out[0].lineage.downstream[0].role, '（已隐藏）');
  assert.equal(JSON.stringify(out).includes('· media_source"'), false);
  assert.equal(tables[0].lineage.upstream[0].join, 'LEFT JOIN · media_source', '不改入参');
  assert.deepEqual(out[0].fields.map((f) => f.name), ['cost'], '存储时去掉首尾空格，比较一致');
});

test('hidden 的表名查找只看自有属性（原型链上的键不算）', () => {
  const tables = [{ cnName: 'constructor', fields: [{ name: 'a' }, { name: 'length' }], agg: {}, lineage: {} },
    { cnName: 'toString', fields: [{ name: 'a' }], agg: {}, lineage: {} }];
  const out = scopeTables(tables, {});
  assert.equal(out[0].fields.length, 2);
  assert.equal(out[1].fields.length, 1);
  assert.equal(isHidden({}, 'constructor', 'length'), false);
  assert.equal(isHidden({}, '__proto__', 'a'), false);
  const rowsOf = () => [{ a: 1, length: 2 }];
  assert.equal(scopeRowsOf(rowsOf, {}), rowsOf);
  assert.deepEqual(scopeRowsOf(rowsOf, { other: ['a'] })('constructor'), [{ a: 1, length: 2 }]);
});

test('isHidden 两侧都去掉首尾空格比较', () => {
  assert.equal(isHidden({ t: [' a '] }, 't', 'a'), true);
  assert.equal(isHidden({ t: ['a'] }, 't', ' a'), true);
});
