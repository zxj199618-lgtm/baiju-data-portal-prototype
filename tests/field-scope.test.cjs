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
