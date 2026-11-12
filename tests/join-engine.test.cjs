/**
 * 关联引擎测试（单元，内存夹具，期望值手算）。
 * 运行：node --test tests/join-engine.test.cjs
 */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { usableRelations, createJoinEngine } = require("../scripts/join-engine.cjs");

const f = (name, type = "VARCHAR") => ({ name, type });
const TABLES = [
  { cnName: "订单", fields: [f("dt", "DATE"), f("order_id"), f("user_id"), f("product_id"), f("cost", "DECIMAL(18,2)")], agg: { dateKey: "dt" } },
  { cnName: "用户", fields: [f("user_id"), f("channel"), f("cost", "DECIMAL(18,2)")], agg: {} },
  { cnName: "产品", fields: [f("product_id"), f("line_name"), f("brand_id")], agg: {} },
  { cnName: "品牌", fields: [f("brand_id"), f("brand_name")], agg: {} },
  { cnName: "退款", fields: [f("dt", "DATE"), f("user_id"), f("refund", "DECIMAL(18,2)")], agg: { dateKey: "dt" } },
  { cnName: "活动", fields: [f("act_id"), f("name")], agg: {} }
];
const ROWS = {
  订单: [
    { dt: "2026-11-01", order_id: "o1", user_id: "u1", product_id: "p1", cost: 100 },
    { dt: "2026-11-02", order_id: "o2", user_id: "u2", product_id: "p1", cost: 50 },
    { dt: "2026-11-03", order_id: "o3", user_id: "u3", product_id: "p2", cost: 30 },
    { dt: "2026-11-03", order_id: "o4", user_id: "u1", product_id: "p2", cost: 20 },
    { dt: "2026-11-03", order_id: "o5", user_id: "u9", product_id: "p1", cost: 7 },
    { dt: "2026-11-02", order_id: "o6", user_id: null, product_id: "p2", cost: 3 }
  ],
  用户: [
    { user_id: "u1", channel: "抖音", cost: 1 },
    { user_id: "u2", channel: "快手", cost: 2 },
    { user_id: "u3", channel: "抖音", cost: 3 }
  ],
  产品: [
    { product_id: "p1", line_name: "线A", brand_id: "b1" },
    { product_id: "p2", line_name: "线B", brand_id: "b2" }
  ],
  品牌: [
    { brand_id: "b1", brand_name: "品牌甲" },
    { brand_id: "b2", brand_name: "品牌乙" }
  ],
  退款: [
    { dt: "2026-11-01", user_id: "u1", refund: 10 },
    { dt: "2026-11-02", user_id: "u2", refund: 5 },
    { dt: "2026-11-03", user_id: "u1", refund: 5 }
  ],
  活动: [{ act_id: "a1", name: "双十一" }]
};
const rel = (id, lt, lf, type, rt, rf) => ({ id, left: { table: lt, field: lf }, right: { table: rt, field: rf }, type, note: "" });
const BASE_RELATIONS = [
  rel("r1", "订单", "user_id", "N:1", "用户", "user_id"),
  rel("r2", "订单", "product_id", "N:1", "产品", "product_id"),
  rel("r3", "产品", "brand_id", "N:1", "品牌", "brand_id"),
  rel("r4", "退款", "user_id", "N:1", "用户", "user_id")
];
const make = ({ tables = TABLES, rows = ROWS, relations = BASE_RELATIONS, limits } = {}) =>
  createJoinEngine({ tables, rowsOf: name => rows[name] || [], relations, limits });
const byGroup = (data, key) => Object.fromEntries(data.明细.map(item => [item.分组[key], item.值]));
const hasBadNumber = value => {
  if (typeof value === "number") return !Number.isFinite(value);
  if (value && typeof value === "object") return Object.values(value).some(hasBadNumber);
  return false;
};

describe("关联引擎（单元）", () => {
  test("单事实表 + 一个维度：按渠道汇总订单金额", () => {
    const result = make().query({
      metrics: [{ table: "订单", field: "cost", agg: "sum" }, { name: "订单数", table: "订单", field: "order_id", agg: "count" }],
      groupBy: [{ table: "用户", field: "channel" }]
    });
    assert.equal(result.ok, true, result.error);
    assert.deepEqual(result.data.指标, ["订单.cost", "订单数"]);
    assert.deepEqual(result.data.分组字段, ["用户.channel"]);
    const groups = byGroup(result.data, "用户.channel");
    assert.deepEqual(groups["抖音"], { "订单.cost": 150, 订单数: 3 });
    assert.deepEqual(groups["快手"], { "订单.cost": 50, 订单数: 1 });
    assert.deepEqual(result.data.合计, { "订单.cost": 210, 订单数: 6 });
    assert.deepEqual(result.data.关联路径, ["订单.user_id N:1 用户.user_id"]);
    assert.equal(result.data.明细[0].分组["用户.channel"], "抖音", "按第一个指标降序");
    assert.equal(result.data.其余组数, 0);
  });

  test("经过未点名的中间表：按 line_name 分组需经 订单→产品", () => {
    const result = make().query({ metrics: [{ table: "订单", field: "cost", agg: "sum" }], groupBy: [{ table: "产品", field: "line_name" }] });
    assert.equal(result.ok, true, result.error);
    const groups = byGroup(result.data, "产品.line_name");
    assert.equal(groups["线A"]["订单.cost"], 157);
    assert.equal(groups["线B"]["订单.cost"], 53);
  });

  test("多跳：订单→产品→品牌，按 品牌.brand_name 分组", () => {
    const result = make().query({ metrics: [{ table: "订单", field: "cost", agg: "sum" }], groupBy: [{ table: "品牌", field: "brand_name" }] });
    assert.equal(result.ok, true, result.error);
    const groups = byGroup(result.data, "品牌.brand_name");
    assert.equal(groups["品牌甲"]["订单.cost"], 157);
    assert.equal(groups["品牌乙"]["订单.cost"], 53);
    assert.deepEqual(result.data.关联路径, ["订单.product_id N:1 产品.product_id", "产品.brand_id N:1 品牌.brand_id"]);
  });

  test("没有登记的关联：返回 error，且点名两张表", () => {
    const result = make().query({ metrics: [{ table: "用户", field: "cost", agg: "sum" }], groupBy: [{ table: "活动", field: "name" }] });
    assert.equal(result.ok, false);
    assert.match(result.error, /用户 与 活动 在关联清单里没有登记/);
  });

  test("一对多重复计数被拒绝", () => {
    const result = make().query({ metrics: [{ table: "用户", field: "cost", agg: "sum" }], groupBy: [{ table: "订单", field: "product_id" }] });
    assert.equal(result.ok, false);
    assert.equal(result.data, undefined);
    assert.match(result.error, /订单\.user_id N:1 用户\.user_id/);
    assert.match(result.error, /用户\.cost/);
    assert.match(result.error, /重复计数/);
  });

  test("一对多重复计数被拒绝：筛选方向同样拦截", () => {
    const result = make().query({ metrics: [{ table: "用户", field: "cost", agg: "sum" }], filters: [{ table: "订单", field: "product_id", values: ["p1"] }] });
    assert.equal(result.ok, false);
    assert.match(result.error, /用户\.cost/);
  });

  test("两个事实表共享维度：订单金额与退款金额按渠道各自汇总再合并", () => {
    const result = make().query({
      metrics: [{ table: "订单", field: "cost", agg: "sum" }, { table: "退款", field: "refund", agg: "sum" }],
      groupBy: [{ table: "用户", field: "channel" }]
    });
    assert.equal(result.ok, true, result.error);
    const groups = byGroup(result.data, "用户.channel");
    assert.deepEqual(groups["抖音"], { "订单.cost": 150, "退款.refund": 15 });
    assert.deepEqual(groups["快手"], { "订单.cost": 50, "退款.refund": 5 });
    assert.deepEqual(groups["（未关联）"], { "订单.cost": 10, "退款.refund": 0 });
    assert.deepEqual(result.data.合计, { "订单.cost": 210, "退款.refund": 20 });
    assert.deepEqual(result.data.关联路径, ["订单.user_id N:1 用户.user_id", "退款.user_id N:1 用户.user_id"]);
  });

  test("比率先汇总再相除", () => {
    const result = make().query({
      metrics: [{ name: "金额", table: "订单", field: "cost", agg: "sum" }, { name: "退款", table: "退款", field: "refund", agg: "sum" }],
      groupBy: [{ table: "用户", field: "channel" }],
      ratios: [{ name: "退款率", numerator: "退款", denominator: "金额" }]
    });
    assert.equal(result.ok, true, result.error);
    assert.deepEqual(result.data.指标, ["金额", "退款", "退款率"]);
    const groups = byGroup(result.data, "用户.channel");
    assert.equal(groups["抖音"].退款率, 0.1);
    assert.equal(groups["（未关联）"].退款率, 0);
    // 合计 20/210，而不是各组比率的均值 (0.1+0.1+0)/3
    assert.equal(result.data.合计.退款率, 0.0952);
    assert.notEqual(result.data.合计.退款率, Number(((0.1 + 0.1 + 0) / 3).toFixed(4)));
  });

  test("比率引用不存在的指标：返回 error", () => {
    const result = make().query({ metrics: [{ table: "订单", field: "cost", agg: "sum" }], ratios: [{ name: "r", numerator: "订单.cost", denominator: "不存在" }] });
    assert.equal(result.ok, false);
    assert.match(result.error, /不存在/);
  });

  test("关联键为空或对端没有匹配：分组显示「（未关联）」；筛选时该行被丢弃", () => {
    const grouped = make().query({ metrics: [{ table: "订单", field: "cost", agg: "sum" }], groupBy: [{ table: "用户", field: "channel" }] });
    assert.equal(byGroup(grouped.data, "用户.channel")["（未关联）"]["订单.cost"], 10);
    const filtered = make().query({
      metrics: [{ table: "订单", field: "cost", agg: "sum" }],
      filters: [{ table: "用户", field: "channel", values: ["抖音", "快手"] }]
    });
    assert.equal(filtered.ok, true, filtered.error);
    assert.deepEqual(filtered.data.明细, [{ 分组: {}, 值: { "订单.cost": 200 } }]);
    assert.deepEqual(filtered.data.合计, { "订单.cost": 200 });
  });

  test("窗口：以 dateTable 最大日期为锚取最近 N 天", () => {
    const result = make().query({ metrics: [{ table: "订单", field: "cost", agg: "sum" }], days: 2 });
    assert.equal(result.ok, true, result.error);
    assert.deepEqual(result.data.窗口, { 起: "2026-11-02", 止: "2026-11-03", N: 2 });
    assert.deepEqual(result.data.合计, { "订单.cost": 110 });
  });

  test("窗口对每个指标表都生效：共用一个锚点与同一段 [起, 止]", () => {
    const rows = {
      ...ROWS,
      订单: [
        { dt: "2026-11-01", order_id: "a", user_id: "u1", product_id: "p1", cost: 100 },
        { dt: "2026-11-10", order_id: "b", user_id: "u1", product_id: "p1", cost: 10 },
        { dt: "2026-11-10", order_id: "c", user_id: "u2", product_id: "p1", cost: "5" }
      ],
      退款: [
        { dt: "2026-01-01", user_id: "u1", refund: 50 },
        { dt: "2026-11-10", user_id: "u1", refund: 1 }
      ]
    };
    const result = make({ rows }).query({
      metrics: [{ name: "金额", table: "订单", field: "cost", agg: "sum" }, { name: "退款", table: "退款", field: "refund", agg: "sum" }],
      ratios: [{ name: "退款率", numerator: "退款", denominator: "金额" }],
      days: 1
    });
    assert.equal(result.ok, true, result.error);
    assert.deepEqual(result.data.窗口, { 起: "2026-11-10", 止: "2026-11-10", N: 1 });
    assert.deepEqual(result.data.合计, { 金额: 15, 退款: 1, 退款率: 0.0667 });
  });

  test("窗口：dateTable 必须是指标所在的表之一", () => {
    const result = make().query({ metrics: [{ table: "订单", field: "cost", agg: "sum" }], days: 1, dateTable: "活动" });
    assert.equal(result.ok, false);
    assert.match(result.error, /dateTable「活动」/);
    const ok = make().query({ metrics: [{ table: "订单", field: "cost", agg: "sum" }, { table: "退款", field: "refund", agg: "sum" }], days: 1, dateTable: "退款" });
    assert.equal(ok.ok, true, ok.error);
    assert.deepEqual(ok.data.窗口, { 起: "2026-11-03", 止: "2026-11-03", N: 1 });
    assert.deepEqual(ok.data.合计, { "订单.cost": 57, "退款.refund": 5 });
  });

  test("窗口：指标表没有日期字段时拒绝并点名该表", () => {
    const result = make().query({ metrics: [{ table: "订单", field: "cost", agg: "sum" }, { table: "用户", field: "cost", agg: "sum" }], days: 7 });
    assert.equal(result.ok, false);
    assert.match(result.error, /用户/);
    assert.match(result.error, /日期字段/);
  });

  test("窗口：锚点日期无效时返回 error 而不是抛异常", () => {
    const rows = { ...ROWS, 订单: [{ dt: "20261101", order_id: "x", user_id: "u1", product_id: "p1", cost: 1 }] };
    const result = make({ rows }).query({ metrics: [{ table: "订单", field: "cost", agg: "sum" }], days: 3 });
    assert.equal(result.ok, false);
    assert.match(result.error, /20261101/);
  });

  test("维度表关联键重复：固定取第一行，并在 提示 里点名", () => {
    const rows = { ...ROWS, 用户: [...ROWS.用户, { user_id: "u1", channel: "微信", cost: 0 }] };
    const first = make({ rows }).query({ metrics: [{ table: "订单", field: "cost", agg: "sum" }], groupBy: [{ table: "用户", field: "channel" }] });
    assert.equal(first.ok, true, first.error);
    assert.equal(byGroup(first.data, "用户.channel")["抖音"]["订单.cost"], 150);
    assert.equal(byGroup(first.data, "用户.channel")["微信"], undefined);
    assert.match(first.data.提示, /用户\.user_id/);
    const clean = make().query({ metrics: [{ table: "订单", field: "cost", agg: "sum" }], groupBy: [{ table: "用户", field: "channel" }] });
    assert.equal(clean.data.提示, undefined);
  });

  test("空表、窗口内没有数据：返回 ok 且 明细 为空数组或 合计 为 null，不出现 NaN", () => {
    const empty = make({ rows: { ...ROWS, 订单: [] } }).query({
      metrics: [{ name: "金额", table: "订单", field: "cost", agg: "sum" }, { name: "单数", table: "订单", field: "order_id", agg: "count" }],
      groupBy: [{ table: "用户", field: "channel" }],
      ratios: [{ name: "客单价", numerator: "金额", denominator: "单数" }],
      days: 7
    });
    assert.equal(empty.ok, true, empty.error);
    assert.deepEqual(empty.data.明细, []);
    assert.equal(empty.data.合计, null);
    assert.equal(hasBadNumber(empty.data), false);

    const noDates = make({ rows: { ...ROWS, 订单: [{ dt: "", order_id: "x", user_id: "u1", product_id: "p1", cost: 1 }] } })
      .query({ metrics: [{ table: "订单", field: "cost", agg: "sum" }], days: 3 });
    assert.equal(noDates.ok, true, noDates.error);
    assert.deepEqual(noDates.data.明细, []);
    assert.equal(noDates.data.合计, null);
  });

  test("除数为 0 的比率为 null", () => {
    const result = make().query({
      metrics: [{ name: "金额", table: "订单", field: "cost", agg: "sum" }, { name: "退款", table: "退款", field: "refund", agg: "sum" }],
      groupBy: [{ table: "用户", field: "channel" }],
      ratios: [{ name: "金额/退款", numerator: "金额", denominator: "退款" }]
    });
    assert.equal(result.ok, true, result.error);
    const groups = byGroup(result.data, "用户.channel");
    assert.equal(groups["（未关联）"]["金额/退款"], null);
    assert.equal(groups["抖音"]["金额/退款"], 10);
    assert.equal(hasBadNumber(result.data), false);
  });

  test("路径确定：存在环或两条平行关联时，两次查询的 关联路径 完全一致，且选最短、同长按关联 id 排序", () => {
    const tables = [
      { cnName: "甲", fields: [f("b_id"), f("c_id"), f("c2_id"), f("v", "INT")], agg: {} },
      { cnName: "乙", fields: [f("id"), f("c_id")], agg: {} },
      { cnName: "丙", fields: [f("id"), f("name")], agg: {} }
    ];
    const rows = { 甲: [{ b_id: "b", c_id: "c1", c2_id: "c2", v: 1 }], 乙: [{ id: "b", c_id: "c2" }], 丙: [{ id: "c1", name: "一" }, { id: "c2", name: "二" }] };
    const relations = [
      rel("r1", "甲", "b_id", "N:1", "乙", "id"),
      rel("r2", "乙", "c_id", "N:1", "丙", "id"),
      rel("rz", "甲", "c_id", "N:1", "丙", "id"),
      rel("ra", "甲", "c2_id", "N:1", "丙", "id")
    ];
    const request = { metrics: [{ table: "甲", field: "v", agg: "sum" }], groupBy: [{ table: "丙", field: "name" }] };
    const first = make({ tables, rows, relations }).query(request);
    const second = make({ tables, rows, relations: [...relations].reverse() }).query(request);
    assert.equal(first.ok, true, first.error);
    assert.deepEqual(first.data.关联路径, ["甲.c2_id N:1 丙.id"]);
    assert.deepEqual(second.data.关联路径, first.data.关联路径);
    assert.deepEqual(second.data.明细, first.data.明细);
    assert.equal(first.data.明细[0].分组["丙.name"], "二");
  });

  test("超出 maxRows 时返回资源上限错误而不是卡住", () => {
    const result = make({ limits: { maxRows: 5 } }).query({ metrics: [{ table: "订单", field: "cost", agg: "sum" }] });
    assert.equal(result.ok, false);
    assert.match(result.error, /资源上限/);
    assert.match(result.error, /5/);
  });

  test("maxGroups：按第一个指标降序截断，余下计入 其余组数", () => {
    const result = make({ limits: { maxGroups: 1 } }).query({ metrics: [{ table: "订单", field: "cost", agg: "sum" }], groupBy: [{ table: "用户", field: "channel" }] });
    assert.equal(result.ok, true, result.error);
    assert.equal(result.data.明细.length, 1);
    assert.equal(result.data.明细[0].分组["用户.channel"], "抖音");
    assert.equal(result.data.其余组数, 2);
    assert.deepEqual(result.data.合计, { "订单.cost": 210 });
  });

  test("引用裁剪后不存在的表或字段：返回 error", () => {
    assert.equal(make().query({ metrics: [{ table: "订单", field: "secret", agg: "sum" }] }).ok, false);
    assert.equal(make().query({ metrics: [{ table: "无权表", field: "cost", agg: "sum" }] }).ok, false);
    assert.equal(make().query({ metrics: [] }).ok, false);
  });

  test("usableRelations：关联一端字段在裁剪后的表里不存在时整条被丢弃，dropped 里有原因", () => {
    const trimmed = TABLES.map(table => (table.cnName === "订单" ? { ...table, fields: table.fields.filter(field => field.name !== "user_id") } : table))
      .filter(table => table.cnName !== "品牌");
    const { usable, dropped } = usableRelations(BASE_RELATIONS, trimmed);
    assert.deepEqual(usable.map(r => r.id), ["r2", "r4"]);
    assert.deepEqual(dropped.map(d => d.id), ["r1", "r3"]);
    assert.match(dropped[0].reason, /订单\.user_id/);
    assert.match(dropped[1].reason, /品牌/);
    // 引擎内部同样只用可用关联：按渠道分组找不到登记的关联
    const result = make({ tables: trimmed }).query({ metrics: [{ table: "订单", field: "cost", agg: "sum" }], groupBy: [{ table: "用户", field: "channel" }] });
    assert.equal(result.ok, false);
    assert.match(result.error, /订单 与 用户 在关联清单里没有登记/);
  });
});
