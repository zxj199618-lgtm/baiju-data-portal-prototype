#!/usr/bin/env node
/**
 * 观星台分析网关
 *
 * 接口：
 *  GET  /v1/models                 — 中转站可用模型列表
 *  GET  /v1/catalog                — 数据表目录（表名/说明/行数/时间范围）
 *  GET  /v1/permissions            — 全部用户的有效表权限
 *  PUT  /v1/permissions/:user      — 保存单个用户的表权限覆盖
 *  POST /v1/analyze                — 分析：权限校验 → 聚合证据 → 调模型生成报告
 *
 * 数据：首次启动生成 14 张表的模拟数据（约 5000+ 行，含趋势故事线），
 *       持久化到 DATA_DIR/sample-data.json（Docker 卷），之后每次启动直接加载。
 *
 * 环境变量：RELAY_BASE_URL / RELAY_API_KEY / PORT / DATA_DIR
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const RELAY_BASE_URL = process.env.RELAY_BASE_URL || "https://simindapi.modelgs.com";
const RELAY_API_KEYS = (process.env.RELAY_API_KEY || "").split(",").map(key => key.trim()).filter(Boolean);
const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const PERMISSIONS_FILE = path.join(DATA_DIR, "user-permissions.json");
const MODEL_CONFIG_FILE = path.join(DATA_DIR, "model-config.json");
const SHARES_FILE = path.join(DATA_DIR, "report-shares.json");
const SAMPLE_DATA_FILE = path.join(DATA_DIR, "sample-data.json");
const DEFAULT_MODEL = "gpt-5.4-mini";
const TODAY = "2026-08-31";

/* ================= 模拟数据生成（确定性随机，可复现） ================= */

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260831);
const rand = (min, max) => min + rng() * (max - min);
const pick = list => list[Math.floor(rng() * list.length)];
const round = (value, digits = 2) => Number(value.toFixed(digits));
const dateBack = days => { const d = new Date(Date.UTC(2026, 7, 31)); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10); };
const DAYS = 90;

const planDefs = [
  { media: "巨量", plan: "小说推文-01", product: "网赚-01", baseCost: 52000, baseCpa: 52, cpaTrend: 0 },
  { media: "巨量", plan: "小说推文-02", product: "网赚-02", baseCost: 38000, baseCpa: 56, cpaTrend: 0.0038 },
  { media: "巨量", plan: "权益拉新-01", product: "权益", baseCost: 26000, baseCpa: 46, cpaTrend: 0 },
  { media: "广点通", plan: "号卡推广-A", product: "号卡", baseCost: 30000, baseCpa: 50, cpaTrend: 0 },
  { media: "广点通", plan: "权益拉新-02", product: "权益", baseCost: 18000, baseCpa: 48, cpaTrend: 0 },
  { media: "快手", plan: "存量唤醒-B", product: "存量", baseCost: 16000, baseCpa: 60, cpaTrend: 0 },
  { media: "快手", plan: "小说推文-03", product: "网赚-01", baseCost: 14000, baseCpa: 63, cpaTrend: 0.0012 },
  { media: "OPPO", plan: "商店推广-C", product: "号卡", baseCost: 12000, baseCpa: 44, cpaTrend: 0 },
  { media: "VIVO", plan: "商店推广-D", product: "权益", baseCost: 9000, baseCpa: 47, cpaTrend: 0 }
];
const mediaTotalCost = {};
planDefs.forEach(def => { mediaTotalCost[def.media] = (mediaTotalCost[def.media] || 0) + def.baseCost; });
const medias = Object.keys(mediaTotalCost);
const revenuePerActivate = 68;

function genAdPlanDaily() {
  const rows = [];
  planDefs.forEach((def, pi) => {
    for (let i = 0; i < DAYS; i++) {
      const statDate = dateBack(DAYS - 1 - i);
      const weekly = 1 + 0.12 * Math.sin((i % 7) / 7 * Math.PI * 2);
      const cost = def.baseCost * (1 + (def.cpaTrend ? def.cpaTrend * i * 0.9 : 0)) * weekly * rand(0.85, 1.15);
      const cpa = def.baseCpa * (1 + (def.cpaTrend || 0) * i) * rand(0.92, 1.08);
      const activateCnt = Math.round(cost / cpa);
      const clickCnt = Math.round(activateCnt * rand(10, 20));
      const showCnt = Math.round(clickCnt * rand(25, 35));
      const registerCnt = Math.round(activateCnt * rand(0.25, 0.4));
      const orderCnt = Math.round(registerCnt * rand(0.2, 0.35));
      rows.push({
        stat_date: statDate,
        media_source: def.media,
        plan_id: `PL${String(pi + 1).padStart(3, "0")}`,
        plan_name: def.plan,
        account_id: `ACC${String(pi + 1).padStart(4, "0")}`,
        account_name: `${def.media}-${def.plan}户`,
        product_name: def.product,
        campaign_id: `CMP${String(pi + 1).padStart(3, "0")}`,
        cost: round(cost),
        click_cnt: clickCnt,
        show_cnt: showCnt,
        activate_cnt: activateCnt,
        register_cnt: registerCnt,
        order_cnt: orderCnt,
        cpa: round(cost / activateCnt),
        roi: round(activateCnt * revenuePerActivate / cost),
        update_time: `${statDate} 02:30:00`
      });
    }
  });
  return rows;
}

const accountDefs = [
  ...[1, 2, 3, 4].map(n => ({ id: `ACCA00${n}`, name: `巨量-直客${n}部`, media: "巨量", biz: "网赚" })),
  ...[1, 2, 3].map(n => ({ id: `ACCG00${n}`, name: `广点通-号卡${n}组`, media: "广点通", biz: "号卡" })),
  ...[1, 2, 3].map(n => ({ id: `ACCK00${n}`, name: `快手-分销${n}组`, media: "快手", biz: "存量" })),
  ...[1, 2, 3].map(n => ({ id: `ACCO00${n}`, name: `OPPO-商店${n}组`, media: "OPPO", biz: "号卡" })),
  ...[1, 2].map(n => ({ id: `ACCV00${n}`, name: `VIVO-商店${n}组`, media: "VIVO", biz: "权益" }))
];

function genAccountDaily() {
  const rows = [];
  for (let i = 0; i < DAYS; i++) {
    const statDate = dateBack(DAYS - 1 - i);
    accountDefs.forEach(acc => {
      const base = mediaTotalCost[acc.media] / accountDefs.filter(a => a.media === acc.media).length;
      const cost = base * rand(0.7, 1.3);
      const activateCnt = Math.round(cost / rand(42, 66));
      rows.push({
        stat_date: statDate, account_id: acc.id, account_name: acc.name,
        media_source: acc.media, biz_line: acc.biz,
        cost: round(cost), activate_cnt: activateCnt,
        consume_rank: Math.round(rand(1, 15)),
        balance: round(rand(5000, 90000))
      });
    });
  }
  return rows;
}

function genMediaSummary() {
  const rows = [];
  for (let i = 0; i < DAYS; i++) {
    const statDate = dateBack(DAYS - 1 - i);
    medias.forEach(media => {
      const dayPlans = planDefs.filter(def => def.media === media);
      const cost = dayPlans.reduce((sum, def) => sum + def.baseCost * rand(0.85, 1.15), 0);
      const activateCnt = Math.round(cost / rand(45, 62));
      const clickCnt = Math.round(activateCnt * rand(11, 19));
      rows.push({
        stat_date: statDate, media_source: media,
        cost: round(cost), click_cnt: clickCnt, show_cnt: Math.round(clickCnt * rand(25, 35)),
        activate_cnt: activateCnt, cpa: round(cost / activateCnt),
        roi: round(activateCnt * revenuePerActivate / cost)
      });
    });
  }
  return rows;
}

const productDefs = ["网赚-01", "网赚-02", "号卡", "权益", "存量", "保险", "视频会员", "电竞流量包"];

function genProductRoiDaily() {
  const rows = [];
  for (let i = 0; i < DAYS; i++) {
    const statDate = dateBack(DAYS - 1 - i);
    productDefs.forEach(product => {
      const cost = rand(8000, 60000);
      const activateCnt = Math.round(cost / rand(40, 70));
      const revenue = activateCnt * revenuePerActivate * rand(0.8, 1.3);
      rows.push({
        stat_date: statDate, product_name: product,
        cost: round(cost), activate_cnt: activateCnt, revenue: round(revenue),
        order_cnt: Math.round(activateCnt * rand(0.05, 0.12)),
        roi: round(revenue / cost)
      });
    });
  }
  return rows;
}

function genUserOrderDetail() {
  const rows = [];
  for (let i = 0; i < 620; i++) {
    const day = Math.floor(rand(0, DAYS));
    const created = `${dateBack(day)} ${String(Math.floor(rand(0, 24))).padStart(2, "0")}:${String(Math.floor(rand(0, 60))).padStart(2, "0")}:00`;
    const statusRoll = rng();
    rows.push({
      order_id: `SO2026${String(100000 + i)}`,
      user_id: `U${String(Math.floor(rand(10000, 99999)))}`,
      product_name: pick(productDefs),
      order_amount: round(pick([39, 59, 68, 99, 129, 199, 299]) * rand(0.9, 1.1)),
      status: statusRoll < 0.82 ? "已完成" : statusRoll < 0.92 ? "待支付" : "已退款",
      pay_channel: pick(["微信支付", "支付宝", "苹果内购"]),
      created_at: created
    });
  }
  return rows.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
}

function genUserDeviceRelation() {
  const rows = [];
  for (let i = 0; i < 320; i++) {
    rows.push({
      user_id: `U${String(Math.floor(rand(10000, 99999)))}`,
      device_id: `DEV${String(Math.floor(rand(100000, 999999)))}`,
      device_type: pick(["手机", "手机", "手机", "平板"]),
      os: pick(["iOS", "Android", "Android", "Android"]),
      brand: pick(["iPhone", "HUAWEI", "XIAOMI", "OPPO", "vivo", "HONOR"]),
      bind_time: `${dateBack(Math.floor(rand(0, DAYS)))} 12:00:00`
    });
  }
  return rows;
}

const lifecycleStages = ["新增", "激活", "活跃", "流失预警"];

function genLifecycleDaily() {
  const rows = [];
  for (let i = 0; i < DAYS; i++) {
    const statDate = dateBack(DAYS - 1 - i);
    lifecycleStages.forEach((stage, si) => {
      const base = [3200, 5800, 26000, 1900][si];
      rows.push({
        stage_date: statDate, lifecycle_stage: stage,
        user_cnt: Math.round(base * rand(0.9, 1.1)),
        active_cnt: Math.round(base * rand(0.55, 0.8)),
        next_day_retention: round(rand(28, 52), 1)
      });
    });
  }
  return rows;
}

const channelDefs = [
  { code: "CH001", name: "信息流-巨量" },
  { code: "CH002", name: "应用商店-OPPO" },
  { code: "CH003", name: "线下门店-华南" },
  { code: "CH004", name: "代理-保险专项" },
  { code: "CH005", name: "搜索-百度" }
];

function genChannelAttribution() {
  const rows = [];
  for (let i = 0; i < DAYS; i++) {
    const statDate = dateBack(DAYS - 1 - i);
    channelDefs.forEach(channel => {
      rows.push({
        biz_date: statDate, channel_code: channel.code, channel_name: channel.name,
        attribution_cnt: Math.round(rand(120, 900)),
        cost: round(rand(6000, 45000)),
        dup_rate: round(rand(2, 9), 1)
      });
    });
  }
  return rows;
}

function genAccountHealth() {
  const rows = [];
  for (let w = 0; w < 12; w++) {
    const weekEnd = dateBack(DAYS - 1 - w * 7);
    accountDefs.forEach(acc => {
      rows.push({
        week_end: weekEnd, account_id: acc.id, account_name: acc.name,
        health_score: Math.round(rand(58, 98)),
        alert_cnt: Math.round(rand(0, 4)),
        top_alert: pick(["消耗突增", "CPA 超标", "余额不足", "素材衰退", "无"])
      });
    });
  }
  return rows.sort((a, b) => (a.week_end < b.week_end ? -1 : 1));
}

function genRtaHourly() {
  const rows = [];
  for (let i = 0; i < 14 * 24; i++) {
    const day = dateBack(13 - Math.floor(i / 24));
    const hour = i % 24;
    const requests = Math.round(rand(20000, 90000) * (hour > 8 && hour < 24 ? 1 : 0.4));
    rows.push({
      stat_hour: `${day} ${String(hour).padStart(2, "0")}:00`,
      request_cnt: requests,
      hit_cnt: Math.round(requests * rand(0.3, 0.7)),
      avg_cost_ms: round(rand(18, 95), 1),
      error_rate: round(rand(0, 1.6), 2)
    });
  }
  return rows;
}

const tagDefs = [
  ["age_stage", "年龄段", "人口属性", ["18-24", "25-30", "31-40", "40+"]],
  ["vip_level", "会员等级", "价值", ["V1", "V2", "V3", "V4"]],
  ["interest_game", "游戏兴趣", "兴趣", ["高", "中", "低"]],
  ["city_tier", "城市等级", "人口属性", ["一线", "新一线", "二线", "三线及以下"]],
  ["pay_sensitivity", "价格敏感", "价值", ["高", "中", "低"]]
];

function genProfileTag() {
  const rows = [];
  for (let i = 0; i < 260; i++) {
    const [code, name, category, values] = pick(tagDefs);
    rows.push({
      user_id: `U${String(Math.floor(rand(10000, 99999)))}`,
      tag_code: code, tag_name: name, tag_value: pick(values), tag_category: category,
      score: round(rand(0.35, 0.99), 4),
      effective_date: dateBack(Math.floor(rand(0, 60)))
    });
  }
  return rows;
}

function genChannelDim() {
  const extra = [
    ["CH006", "搜索-360", "online", "stock"], ["CH007", "信息流-广点通", "online", "haoka"],
    ["CH008", "应用商店-vivo", "online", "equity"], ["CH009", "线下门店-华东", "offline", "stock"],
    ["CH010", "代理-网赚专项", "agent", "game"]
  ];
  return [
    ...channelDefs.map((channel, index) => ({
      channel_id: channel.code, channel_name: channel.name,
      channel_type: index === 2 || index === 3 ? "offline" : "online",
      biz_line: ["equity", "haoka", "stock", "insure", "game"][index], owner_name: pick(["黄佩贤", "李雨航", "谭嘉颖", "林金维"]),
      row_status: "1"
    })),
    ...extra.map(([id, name, type, biz]) => ({ channel_id: id, channel_name: name, channel_type: type, biz_line: biz, owner_name: pick(["黄佩贤", "李雨航", "谭嘉颖"]), row_status: "1" }))
  ];
}

function genProductDim() {
  return [
    ["P001", "权益会员包", "equity"], ["P002", "电竞流量包", "haoka"], ["P003", "存量通话包", "stock"],
    ["P004", "号卡月租包", "haoka"], ["P005", "网赚-01", "game"], ["P006", "网赚-02", "game"],
    ["P007", "保险体验包", "insure"], ["P008", "视频会员包", "stock"]
  ].map(([id, name, biz], index) => ({ product_id: id, product_name: name, biz_line: biz, unit_price: [99, 69, 39, 59, 199, 199, 49, 29][index], row_status: index === 6 ? "0" : "1" }));
}

/* ================= 表目录（结构与生成器绑定） ================= */

const tables = [
  {
    cnName: "广告计划日报表", table: "dm_ad_plan_daily_media_account_product_performance_detail", database: "prod_callup", source: "StarRocks",
    desc: "广告计划日粒度消耗、转化和成本数据，用于对外提供投放日报。", owner: "黄佩贤",
    generator: genAdPlanDaily,
    fields: [
      { name: "stat_date", type: "DATE", comment: "统计日期" },
      { name: "media_source", type: "VARCHAR", comment: "媒体来源（巨量、广点通、快手、OPPO、VIVO）" },
      { name: "plan_id", type: "VARCHAR", comment: "计划 ID" },
      { name: "plan_name", type: "VARCHAR", comment: "计划名称" },
      { name: "account_id", type: "VARCHAR", comment: "账户 ID" },
      { name: "account_name", type: "VARCHAR", comment: "账户名称" },
      { name: "product_name", type: "VARCHAR", comment: "产品名称" },
      { name: "campaign_id", type: "VARCHAR", comment: "广告组 ID" },
      { name: "cost", type: "DECIMAL(18,2)", comment: "消耗金额（元）" },
      { name: "click_cnt", type: "BIGINT", comment: "点击数" },
      { name: "show_cnt", type: "BIGINT", comment: "曝光数" },
      { name: "activate_cnt", type: "BIGINT", comment: "激活数（按归因口径统计）" },
      { name: "register_cnt", type: "BIGINT", comment: "注册数" },
      { name: "order_cnt", type: "BIGINT", comment: "订单数" },
      { name: "cpa", type: "DECIMAL(18,4)", comment: "转化成本 = cost / activate_cnt" },
      { name: "roi", type: "DECIMAL(18,4)", comment: "ROI = 收入 / 消耗" },
      { name: "update_time", type: "DATETIME", comment: "数据更新时间" }
    ],
    agg: { dateKey: "stat_date", groupBy: ["media_source", "plan_name"], metric: "cost" },
    lineage: {
      upstream: [
        { table: "dwd_ad_account_daily", role: "广告账户日报（账户粒度消耗事实）", join: "INNER JOIN · 账户+日" },
        { table: "dwd_campaign_conversion_daily", role: "广告组转化日报（激活/注册归因明细）", join: "LEFT JOIN · 计划+日" },
        { table: "dim_media_source", role: "媒体来源维表", join: "LEFT JOIN · media_source" }
      ],
      downstream: [
        { table: "ads_media_cost_summary", role: "媒体消耗汇总（ADS 分析层）" },
        { table: "ads_product_roi_daily", role: "产品 ROI 日报" }
      ]
    }
  },
  {
    cnName: "用户画像标签明细表", table: "dwd_user_profile_tag", database: "prod_cloud", source: "StarRocks",
    desc: "用户画像标签明细表，用于用户细查和外部系统标签查询。", owner: "李雨航",
    generator: genProfileTag,
    fields: [
      { name: "user_id", type: "VARCHAR", comment: "用户 ID" },
      { name: "tag_code", type: "VARCHAR", comment: "标签编码" },
      { name: "tag_name", type: "VARCHAR", comment: "标签名称" },
      { name: "tag_value", type: "VARCHAR", comment: "标签值" },
      { name: "tag_category", type: "VARCHAR", comment: "标签分类" },
      { name: "score", type: "DECIMAL(10,4)", comment: "标签置信分值" },
      { name: "effective_date", type: "DATE", comment: "生效日期" }
    ],
    agg: { dateKey: "", groupBy: ["tag_name", "tag_value"], metric: "" },
    lineage: {
      upstream: [{ table: "dwd_user_device_relation", role: "用户设备关系明细", join: "LEFT JOIN · user_id" }],
      downstream: [{ table: "dm_user_lifecycle_daily", role: "用户生命周期日报" }]
    }
  },
  {
    cnName: "渠道归因明细", table: "dwd_channel_attribution_detail", database: "prod_cloud", source: "StarRocks",
    desc: "渠道归因明细，用于渠道效果分析。", owner: "李雨航",
    generator: genChannelAttribution,
    fields: [
      { name: "biz_date", type: "DATE", comment: "业务日期" },
      { name: "channel_code", type: "VARCHAR", comment: "渠道编码" },
      { name: "channel_name", type: "VARCHAR", comment: "渠道名称" },
      { name: "attribution_cnt", type: "BIGINT", comment: "归因转化数" },
      { name: "cost", type: "DECIMAL(18,2)", comment: "渠道消耗" },
      { name: "dup_rate", type: "DECIMAL(5,2)", comment: "重复归因率（%）" }
    ],
    agg: { dateKey: "biz_date", groupBy: ["channel_name"], metric: "cost" },
    lineage: { upstream: [], downstream: [] }
  },
  {
    cnName: "广告账户日报", table: "dwd_ad_account_daily", database: "prod_callup", source: "StarRocks",
    desc: "广告账户日粒度消耗与转化数据，账户维度的投放日报。", owner: "黄佩贤",
    generator: genAccountDaily,
    fields: [
      { name: "stat_date", type: "DATE", comment: "统计日期" },
      { name: "account_id", type: "VARCHAR", comment: "账户 ID" },
      { name: "account_name", type: "VARCHAR", comment: "账户名称" },
      { name: "media_source", type: "VARCHAR", comment: "媒体来源" },
      { name: "biz_line", type: "VARCHAR", comment: "业务线" },
      { name: "cost", type: "DECIMAL(18,2)", comment: "消耗金额" },
      { name: "activate_cnt", type: "BIGINT", comment: "激活数" },
      { name: "consume_rank", type: "BIGINT", comment: "消耗排名" },
      { name: "balance", type: "DECIMAL(18,2)", comment: "账户余额" }
    ],
    agg: { dateKey: "stat_date", groupBy: ["media_source", "account_name"], metric: "cost" },
    lineage: { upstream: [], downstream: [{ table: "dm_ad_plan_daily_media_account_product_performance_detail", role: "广告计划日报表", join: "账户+日" }] }
  },
  {
    cnName: "广告组转化日报", table: "dwd_campaign_conversion_daily", database: "prod_callup", source: "StarRocks",
    desc: "广告组（campaign）日粒度转化归因明细。", owner: "黄佩贤",
    generator: genAccountDaily,
    fields: [
      { name: "stat_date", type: "DATE", comment: "统计日期" },
      { name: "account_id", type: "VARCHAR", comment: "账户 ID" },
      { name: "account_name", type: "VARCHAR", comment: "账户名称" },
      { name: "media_source", type: "VARCHAR", comment: "媒体来源" },
      { name: "biz_line", type: "VARCHAR", comment: "业务线" },
      { name: "cost", type: "DECIMAL(18,2)", comment: "消耗金额" },
      { name: "activate_cnt", type: "BIGINT", comment: "激活数" },
      { name: "consume_rank", type: "BIGINT", comment: "排名" },
      { name: "balance", type: "DECIMAL(18,2)", comment: "余额" }
    ],
    agg: { dateKey: "stat_date", groupBy: ["media_source"], metric: "cost" },
    lineage: { upstream: [], downstream: [{ table: "dm_ad_plan_daily_media_account_product_performance_detail", role: "广告计划日报表" }] }
  },
  {
    cnName: "媒体消耗汇总", table: "ads_media_cost_summary", database: "prod_callup", source: "StarRocks",
    desc: "媒体粒度日消耗汇总（ADS 分析层），供大盘看板使用。", owner: "黄佩贤",
    generator: genMediaSummary,
    fields: [
      { name: "stat_date", type: "DATE", comment: "统计日期" },
      { name: "media_source", type: "VARCHAR", comment: "媒体来源" },
      { name: "cost", type: "DECIMAL(18,2)", comment: "消耗金额" },
      { name: "click_cnt", type: "BIGINT", comment: "点击数" },
      { name: "show_cnt", type: "BIGINT", comment: "曝光数" },
      { name: "activate_cnt", type: "BIGINT", comment: "激活数" },
      { name: "cpa", type: "DECIMAL(18,4)", comment: "转化成本" },
      { name: "roi", type: "DECIMAL(18,4)", comment: "ROI" }
    ],
    agg: { dateKey: "stat_date", groupBy: ["media_source"], metric: "cost" },
    lineage: { upstream: [{ table: "dm_ad_plan_daily_media_account_product_performance_detail", role: "广告计划日报表" }], downstream: [] }
  },
  {
    cnName: "用户设备关系明细", table: "dwd_user_device_relation", database: "prod_cloud", source: "StarRocks",
    desc: "用户与设备的绑定关系明细，用于设备维度分析。", owner: "李雨航",
    generator: genUserDeviceRelation,
    fields: [
      { name: "user_id", type: "VARCHAR", comment: "用户 ID" },
      { name: "device_id", type: "VARCHAR", comment: "设备 ID" },
      { name: "device_type", type: "VARCHAR", comment: "设备类型" },
      { name: "os", type: "VARCHAR", comment: "操作系统" },
      { name: "brand", type: "VARCHAR", comment: "品牌" },
      { name: "bind_time", type: "DATETIME", comment: "绑定时间" }
    ],
    agg: { dateKey: "", groupBy: ["device_type", "brand", "os"], metric: "" },
    lineage: { upstream: [], downstream: [{ table: "dwd_user_profile_tag", role: "用户画像标签明细表" }] }
  },
  {
    cnName: "用户订单明细", table: "dwd_user_order_detail", database: "prod_cloud", source: "StarRocks",
    desc: "用户订单明细，含订单金额、状态与支付渠道。", owner: "李雨航",
    generator: genUserOrderDetail,
    fields: [
      { name: "order_id", type: "VARCHAR", comment: "订单 ID" },
      { name: "user_id", type: "VARCHAR", comment: "用户 ID" },
      { name: "product_name", type: "VARCHAR", comment: "产品名称" },
      { name: "order_amount", type: "DECIMAL(18,2)", comment: "订单金额" },
      { name: "status", type: "VARCHAR", comment: "订单状态（已完成/待支付/已退款）" },
      { name: "pay_channel", type: "VARCHAR", comment: "支付渠道" },
      { name: "created_at", type: "DATETIME", comment: "下单时间" }
    ],
    agg: { dateKey: "created_at", groupBy: ["product_name", "status", "pay_channel"], metric: "order_amount" },
    lineage: { upstream: [], downstream: [] }
  },
  {
    cnName: "用户生命周期日报", table: "dm_user_lifecycle_daily", database: "prod_cloud", source: "StarRocks",
    desc: "用户生命周期各阶段日粒度规模与留存。", owner: "李雨航",
    generator: genLifecycleDaily,
    fields: [
      { name: "stage_date", type: "DATE", comment: "统计日期" },
      { name: "lifecycle_stage", type: "VARCHAR", comment: "生命周期阶段（新增/激活/活跃/流失预警）" },
      { name: "user_cnt", type: "BIGINT", comment: "用户数" },
      { name: "active_cnt", type: "BIGINT", comment: "活跃用户数" },
      { name: "next_day_retention", type: "DECIMAL(5,2)", comment: "次日留存率（%）" }
    ],
    agg: { dateKey: "stage_date", groupBy: ["lifecycle_stage"], metric: "user_cnt" },
    lineage: { upstream: [{ table: "dwd_user_profile_tag", role: "用户画像标签明细表" }], downstream: [] }
  },
  {
    cnName: "产品 ROI 日报", table: "ads_product_roi_daily", database: "prod_callup", source: "StarRocks",
    desc: "产品粒度日 ROI 分析（ADS 层）。", owner: "黄佩贤",
    generator: genProductRoiDaily,
    fields: [
      { name: "stat_date", type: "DATE", comment: "统计日期" },
      { name: "product_name", type: "VARCHAR", comment: "产品名称" },
      { name: "cost", type: "DECIMAL(18,2)", comment: "消耗" },
      { name: "activate_cnt", type: "BIGINT", comment: "激活数" },
      { name: "revenue", type: "DECIMAL(18,2)", comment: "收入" },
      { name: "order_cnt", type: "BIGINT", comment: "订单数" },
      { name: "roi", type: "DECIMAL(18,4)", comment: "ROI = revenue / cost" }
    ],
    agg: { dateKey: "stat_date", groupBy: ["product_name"], metric: "cost" },
    lineage: { upstream: [{ table: "dm_ad_plan_daily_media_account_product_performance_detail", role: "广告计划日报表" }], downstream: [] }
  },
  {
    cnName: "媒体账户健康度", table: "dm_media_account_health", database: "prod_callup", source: "StarRocks",
    desc: "媒体账户周粒度健康度评分与告警。", owner: "黄佩贤",
    generator: genAccountHealth,
    fields: [
      { name: "week_end", type: "DATE", comment: "周截止日期" },
      { name: "account_id", type: "VARCHAR", comment: "账户 ID" },
      { name: "account_name", type: "VARCHAR", comment: "账户名称" },
      { name: "health_score", type: "BIGINT", comment: "健康分（0-100）" },
      { name: "alert_cnt", type: "BIGINT", comment: "告警数" },
      { name: "top_alert", type: "VARCHAR", comment: "主要告警" }
    ],
    agg: { dateKey: "week_end", groupBy: ["top_alert"], metric: "health_score" },
    lineage: { upstream: [], downstream: [] }
  },
  {
    cnName: "RTA 请求小时监控表", table: "ads_rta_request_hour", database: "prod_callup", source: "StarRocks",
    desc: "RTA 小时级请求、命中、耗时监控表。", owner: "谭嘉颖",
    generator: genRtaHourly,
    fields: [
      { name: "stat_hour", type: "VARCHAR", comment: "统计小时" },
      { name: "request_cnt", type: "BIGINT", comment: "请求数" },
      { name: "hit_cnt", type: "BIGINT", comment: "命中数" },
      { name: "avg_cost_ms", type: "DECIMAL(10,1)", comment: "平均耗时（ms）" },
      { name: "error_rate", type: "DECIMAL(5,2)", comment: "错误率（%）" }
    ],
    agg: { dateKey: "stat_hour", groupBy: [], metric: "request_cnt" },
    lineage: { upstream: [], downstream: [] }
  },
  {
    cnName: "渠道维表", table: "dim_channel", database: "portal_dim", source: "门户维护",
    desc: "业务渠道主数据，支持在线增删改查，渠道类型引用共用字典。", owner: "谭嘉颖",
    generator: genChannelDim,
    fields: [
      { name: "channel_id", type: "VARCHAR", comment: "渠道 ID（主键）" },
      { name: "channel_name", type: "VARCHAR", comment: "渠道名称" },
      { name: "channel_type", type: "VARCHAR", comment: "渠道类型（线上/线下/代理）" },
      { name: "biz_line", type: "VARCHAR", comment: "业务线" },
      { name: "owner_name", type: "VARCHAR", comment: "负责人" },
      { name: "row_status", type: "VARCHAR", comment: "状态（1 启用 / 0 停用）" }
    ],
    agg: { dateKey: "", groupBy: ["channel_type", "biz_line"], metric: "" },
    lineage: { upstream: [], downstream: [] }
  },
  {
    cnName: "产品维表", table: "dim_product", database: "portal_dim", source: "门户维护",
    desc: "可投放产品清单，由运营在门户维护。", owner: "李雨航",
    generator: genProductDim,
    fields: [
      { name: "product_id", type: "VARCHAR", comment: "产品 ID" },
      { name: "product_name", type: "VARCHAR", comment: "产品名称" },
      { name: "biz_line", type: "VARCHAR", comment: "业务线" },
      { name: "unit_price", type: "DECIMAL(10,2)", comment: "标准单价" },
      { name: "row_status", type: "VARCHAR", comment: "状态（1 启用 / 0 停用）" }
    ],
    agg: { dateKey: "", groupBy: ["biz_line"], metric: "" },
    lineage: { upstream: [], downstream: [] }
  }
];

const allTableNames = tables.map(table => table.cnName);

/* ================= 样本数据加载/生成（持久化到数据卷） ================= */

let sampleData = null;

function loadSampleData() {
  try {
    sampleData = JSON.parse(fs.readFileSync(SAMPLE_DATA_FILE, "utf8"));
    console.log(`已加载模拟数据（生成于 ${sampleData.generatedAt}）`);
    return;
  } catch { /* 首次启动或文件缺失时生成 */ }
  const dataset = { generatedAt: new Date().toISOString(), anchorDate: TODAY, tables: {} };
  tables.forEach(table => {
    const rows = table.generator();
    dataset.tables[table.cnName] = rows;
    console.log(`生成 ${table.cnName}: ${rows.length} 行`);
  });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${SAMPLE_DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(dataset));
  fs.renameSync(tmp, SAMPLE_DATA_FILE);
  sampleData = dataset;
  console.log(`模拟数据已持久化到 ${SAMPLE_DATA_FILE}`);
}

function rowsOf(cnName) {
  return sampleData?.tables?.[cnName] || [];
}

/* ================= 聚合证据（喂给模型的事实层） ================= */

const NUMERIC = /DECIMAL|BIGINT|INT/;

function aggregateEvidence(table) {
  const rows = rowsOf(table.cnName);
  const { dateKey = "", groupBy = [], metric = "" } = table.agg || {};
  const result = { 行数: rows.length };
  if (!rows.length) return result;

  const numericKeys = table.fields.filter(field => NUMERIC.test(field.type) && field.name !== metric?.match(/^$/)).map(field => field.name).filter(key => key !== "consume_rank" && key !== "unit_price");
  const sumOf = (list, key) => list.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);

  if (dateKey) {
    const dates = rows.map(row => String(row[dateKey]).slice(0, 10)).sort();
    result.时间范围 = [dates[0], dates[dates.length - 1]];
  }

  const sums = {};
  numericKeys.forEach(key => { sums[key] = round(sumOf(rows, key)); });
  if (sums.cost && sums.activate_cnt) sums.cpa = round(sums.cost / sums.activate_cnt);
  if (Object.keys(sums).length) result.整体合计 = sums;

  const groupKey = Array.isArray(groupBy) ? groupBy[0] : groupBy;
  if (groupKey && groupKey !== "--") {
    const groups = {};
    rows.forEach(row => {
      const key = String(row[groupKey]);
      (groups[key] = groups[key] || []).push(row);
    });
    let groupStats = Object.entries(groups).map(([key, list]) => ({
      组: key, 行数: list.length,
      指标合计: Object.fromEntries(numericKeys.slice(0, 6).map(key2 => [key2, round(sumOf(list, key2))]))
    }));
    if (metric) groupStats.sort((a, b) => (b.指标合计[metric] || 0) - (a.指标合计[metric] || 0));
    groupStats = groupStats.slice(0, 8);

    if (dateKey && metric) {
      const sevenAgo = dateBack(7);
      const fourteenAgo = dateBack(14);
      groupStats.forEach(stat => {
        const list = groups[stat.组];
        const recent = list.filter(row => String(row[dateKey]) >= sevenAgo);
        const prior = list.filter(row => String(row[dateKey]) >= fourteenAgo && String(row[dateKey]) < sevenAgo);
        const recentSum = round(sumOf(recent, metric));
        const priorSum = round(sumOf(prior, metric));
        stat.近7天 = recentSum;
        stat.前7天 = priorSum;
        stat.环比 = priorSum ? `${round(((recentSum - priorSum) / priorSum) * 100, 1)}%` : "—";
        if (recentSum && priorSum) {
          if (metric === "cost" && numericKeys.includes("activate_cnt")) {
            const recentCpa = sumOf(recent, "cost") / Math.max(1, sumOf(recent, "activate_cnt"));
            const priorCpa = sumOf(prior, "cost") / Math.max(1, sumOf(prior, "activate_cnt"));
            stat.近7天CPA = round(recentCpa);
            stat.CPA环比 = round(((recentCpa - priorCpa) / priorCpa) * 100, 1) + "%";
          }
          if (metric === "cost" && numericKeys.includes("revenue")) {
            const recentRoi = sumOf(recent, "revenue") / Math.max(1, recentSum);
            const priorRoi = sumOf(prior, "revenue") / Math.max(1, priorSum);
            stat.近7天ROI = round(recentRoi);
          }
        }
        delete stat.指标合计;
      });
    }
    result[`${groupKey}分组`] = groupStats;
  }

  return result;
}

function recentRows(table, count = 8) {
  return rowsOf(table.cnName).slice(-count);
}

function buildEvidence(cnNames) {
  const selected = cnNames.length ? tables.filter(table => cnNames.includes(table.cnName)) : tables;
  return selected.map(table => {
    const total = rowsOf(table.cnName).length;
    const evidence = {
      表名: table.cnName,
      物理表: `${table.database}.${table.table}`,
      说明: table.desc,
      负责人: table.owner,
      字段: table.fields.map(field => `${field.name} ${field.type} — ${field.comment}`)
    };
    if (cnNames.length) {
      evidence.聚合统计 = aggregateEvidence(table);
      evidence.最近明细样例 = recentRows(table);
    } else {
      evidence.行数 = total;
    }
    if (table.lineage.upstream.length || table.lineage.downstream.length) evidence.血缘 = table.lineage;
    return evidence;
  });
}

/* ================= 权限（组默认 + 用户级覆盖，持久化） ================= */

const permissionGroups = [
  { name: "门户管理员", tables: ["全部数据表"] },
  { name: "投放组长", tables: ["广告计划日报表", "广告账户日报", "广告组转化日报", "媒体消耗汇总", "产品 ROI 日报"] },
  { name: "优化师", tables: ["广告计划日报表", "广告账户日报"] },
  { name: "数据分析师", tables: ["广告计划日报表", "用户画像标签明细表", "用户订单明细", "用户生命周期日报", "渠道归因明细"] },
  { name: "只读访客", tables: [] }
];

const users = [
  { name: "曾祥竞", group: "门户管理员" },
  { name: "黄佩贤", group: "门户管理员" },
  { name: "林金维", group: "投放组长" },
  { name: "谭嘉颖", group: "优化师" },
  { name: "李雨航", group: "数据分析师" }
];

function loadPermissionOverrides() {
  try { return JSON.parse(fs.readFileSync(PERMISSIONS_FILE, "utf8")); } catch { return {}; }
}

function savePermissionOverrides(overrides) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${PERMISSIONS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(overrides, null, 2));
  fs.renameSync(tmp, PERMISSIONS_FILE);
}

function loadModelConfig() {
  try { return JSON.parse(fs.readFileSync(MODEL_CONFIG_FILE, "utf8")); } catch { return { disabled: {} }; }
}

function saveModelConfig(config) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${MODEL_CONFIG_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2));
  fs.renameSync(tmp, MODEL_CONFIG_FILE);
}

function loadShares() {
  try { return JSON.parse(fs.readFileSync(SHARES_FILE, "utf8")); } catch { return {}; }
}

function saveShares(shares) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${SHARES_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(shares, null, 2));
  fs.renameSync(tmp, SHARES_FILE);
}

function userTables(userName) {
  const user = users.find(item => item.name === userName);
  if (!user) return [];
  const override = loadPermissionOverrides()[userName];
  if (override) return override.tables.includes("全部数据表") ? [...allTableNames] : [...override.tables];
  const group = permissionGroups.find(item => item.name === user.group);
  if (!group) return [];
  if (group.tables.includes("全部数据表")) return [...allTableNames];
  return tables.filter(table => group.tables.includes(table.cnName)).map(table => table.cnName);
}

/* ================= Skill 注册表 ================= */

const skills = {
  "warehouse-analyst": {
    name: "数仓分析 Skill（maxcompute-warehouse-analyst 移植版）",
    version: "1.2-portal",
    scenarios: {
      single: {
        label: "单表分析",
        system: [
          "你是观星台数据平台的数仓分析助手，负责基于给定表证据生成分析报告。",
          "规则：",
          "1. 只基于提供的聚合统计、明细样例和字段注释分析，所有数字必须来自证据，不编造。",
          "2. 引用字段时用反引号；结论必须能追溯到证据中的具体数字。",
          "3. 样本明细有限时，基于聚合统计下结论，并标注「基于聚合口径」。",
          "4. 报告使用 Markdown，包含：一句话结论、数据概览、关键发现（含具体数字与对比）、风险与建议、证据限制。"
        ].join("\n")
      },
      lineage: {
        label: "数据血缘分析",
        system: [
          "你是观星台数据平台的血缘分析助手。",
          "基于提供的表上下游血缘证据，输出 Markdown 报告：",
          "一、上游表清单（表名、角色、关联方式）；二、本表在数仓链路中的位置；三、下游影响面；四、变更风险与注意事项。",
          "只把明确给出的血缘写成确定关系；证据不足时标注「待核对，非确定引用」。"
        ].join("\n")
      },
      asset: {
        label: "数据资产问答",
        system: [
          "你是观星台数据平台的资产问答助手。",
          "基于提供的表资产清单（名称、说明、行数、负责人、字段）回答用户问题，输出：相关表清单、各表口径说明、负责人、推荐用法。",
          "只推荐清单内的表；清单外的可能性标注「权限外，未纳入」。"
        ].join("\n")
      },
      attribution: {
        label: "归因分析",
        system: [
          "你是观星台数据平台的归因分析助手。",
          "基于聚合统计中的「近7天 / 前7天 / 环比 / CPA环比」数据对指标异动做维度拆解：",
          "1. 先给出整体结论（哪个维度贡献最大、幅度多少）；2. 逐维度列出对比表（Markdown 表格）；3. 定位到具体的组并给出原因判断；4. 给出建议。",
          "所有数字必须来自证据，不编造；无法归因时说明数据限制。"
        ].join("\n")
      }
    }
  }
};

/* ================= 工具函数 ================= */

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS"
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => { raw += chunk; if (raw.length > 2e6) req.destroy(); });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (error) { reject(error); } });
  });
}

async function relayWithKey(path, key, options = {}) {
  const response = await fetch(`${RELAY_BASE_URL}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: response.status, data };
}

/** 聚合全部 key 的模型列表（去重） */
async function relayAllModels() {
  const results = await Promise.allSettled(RELAY_API_KEYS.map(key => relayWithKey("/v1/models", key)));
  const ids = new Set();
  results.forEach(result => {
    if (result.status === "fulfilled") (result.value.data?.data || []).forEach(item => ids.add(item.id));
  });
  return [...ids];
}

/**
 * 按模型调用 chat/completions：
 * 先用记住的成功 key，失败（401/403/404/模型不存在）时遍历其余 key 重试。
 * 返回 { ok, status, data, keyUsed }。
 */
async function relayChat(model, payload) {
  const order = [...RELAY_API_KEYS].sort((a, b) => (modelKeyCache.get(model) === b ? -1 : modelKeyCache.get(model) === a ? 1 : 0));
  let lastResult = null;
  for (const key of order) {
    const result = await relayWithKey("/v1/chat/completions", key, {
      method: "POST",
      body: JSON.stringify({ model, ...payload })
    });
    lastResult = { ...result, keyUsed: key };
    const failed = result.status === 401 || result.status === 403 || result.status === 404
      || (typeof result.data?.error?.message === "string" && /model names|does not exist|not found|invalid.*model/i.test(result.data.error.message));
    if (!failed) {
      modelKeyCache.set(model, key);
      return lastResult;
    }
  }
  return lastResult;
}
const modelKeyCache = new Map();

/** 流式调用：成功时通过 onEvent({delta}) 逐段回调，返回 {ok, content, usage} 或 {ok:false, lastResult} */
async function relayChatStream(model, payload, onEvent) {
  const order = [...RELAY_API_KEYS].sort((a, b) => (modelKeyCache.get(model) === b ? -1 : modelKeyCache.get(model) === a ? 1 : 0));
  let lastResult = null;
  for (const key of order) {
    let response;
    try {
      response = await fetch(`${RELAY_BASE_URL}/v1/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, stream: true, stream_options: { include_usage: true }, ...payload })
      });
    } catch (error) { lastResult = { status: 502, data: { error: String(error) } }; continue; }
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => "");
      let data; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 200) }; }
      lastResult = { status: response.status, data };
      continue;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", content = "", usage = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n");
      buffer = parts.pop();
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const obj = JSON.parse(data);
          if (obj.usage) usage = obj.usage;
          const delta = obj.choices?.[0]?.delta?.content || "";
          if (delta) { content += delta; onEvent({ delta }); }
        } catch { /* 忽略心跳等非 JSON 行 */ }
      }
    }
    modelKeyCache.set(model, key);
    return { ok: true, content, usage, keyUsed: key };
  }
  return { ok: false, lastResult };
}

/* ================= 路由 ================= */

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return sendJson(res, 204, {});
  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && url.pathname === "/v1/models") {
    try {
      const ids = await relayAllModels();
      const usable = ids.filter(id => !/image|audio|realtime|vision|-distill-|codex-auto/.test(id));
      const disabled = loadModelConfig().disabled || {};
      const enabledModels = usable.filter(id => !disabled[id]).sort();
      const defaultModel = enabledModels.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : enabledModels[0] || DEFAULT_MODEL;
      return sendJson(res, 200, {
        models: enabledModels,
        allModels: usable.sort().map(id => ({ id, enabled: !disabled[id], reason: disabled[id]?.reason || "" })),
        default: defaultModel
      });
    } catch (error) {
      return sendJson(res, 502, { error: `中转站不可达：${error.message}` });
    }
  }

  if (req.method === "GET" && url.pathname === "/v1/model-config") {
    try {
      const ids = await relayAllModels();
      const usable = ids.filter(id => !/image|audio|realtime|vision|-distill-|codex-auto/.test(id));
      const disabled = loadModelConfig().disabled || {};
      return sendJson(res, 200, {
        models: usable.sort().map(id => ({ id, enabled: !disabled[id], reason: disabled[id]?.reason || "", disabledAt: disabled[id]?.disabledAt || "" }))
      });
    } catch (error) {
      return sendJson(res, 502, { error: `中转站不可达：${error.message}` });
    }
  }

  if (req.method === "POST" && url.pathname === "/v1/shares") {
    const body = await readBody(req);
    const id = crypto.randomBytes(6).toString("hex");
    const shares = loadShares();
    shares[id] = {
      title: String(body.title || "分析报告").slice(0, 120),
      scenario: String(body.scenario || "").slice(0, 40),
      model: String(body.model || "").slice(0, 60),
      tablesUsed: Array.isArray(body.tablesUsed) ? body.tablesUsed.slice(0, 8).map(item => String(item).slice(0, 60)) : [],
      report: String(body.report || "").slice(0, 120000),
      question: String(body.question || "").slice(0, 500),
      createdBy: String(body.createdBy || "").slice(0, 40),
      createdAt: new Date().toISOString()
    };
    saveShares(shares);
    return sendJson(res, 200, { id, url: `/share.html?id=${id}` });
  }

  const shareMatch = url.pathname.match(/^\/v1\/shares\/([a-f0-9]+)$/);
  if (req.method === "GET" && shareMatch) {
    const share = loadShares()[shareMatch[1]];
    if (!share) return sendJson(res, 404, { error: "分享链接不存在或已被删除" });
    return sendJson(res, 200, share);
  }

  const modelConfigMatch = url.pathname.match(/^\/v1\/model-config\/(.+)$/);
  if (req.method === "PUT" && modelConfigMatch) {
    const modelId = decodeURIComponent(modelConfigMatch[1]);
    const config = loadModelConfig();
    config.disabled = config.disabled || {};
    const body = await readBody(req);
    if (body.enabled) delete config.disabled[modelId];
    else config.disabled[modelId] = { reason: String(body.reason || "").slice(0, 200), disabledAt: new Date().toISOString() };
    saveModelConfig(config);
    return sendJson(res, 200, { model: modelId, enabled: !config.disabled[modelId] });
  }

  if (req.method === "GET" && url.pathname === "/v1/catalog") {
    return sendJson(res, 200, {
      tables: tables.map(table => {
        const rows = rowsOf(table.cnName);
        const dates = rows.length && table.agg.dateKey ? rows.map(row => String(row[table.agg.dateKey]).slice(0, 10)).sort() : [];
        return { name: table.cnName, physical: `${table.database}.${table.table}`, desc: table.desc, owner: table.owner, rows: rows.length, range: dates.length ? [dates[0], dates[dates.length - 1]] : null };
      })
    });
  }

  if (req.method === "GET" && url.pathname === "/v1/permissions") {
    const overrides = loadPermissionOverrides();
    return sendJson(res, 200, {
      groups: permissionGroups,
      users: users.map(user => ({
        name: user.name, group: user.group,
        groupTables: permissionGroups.find(item => item.name === user.group)?.tables || [],
        override: overrides[user.name] || null,
        effectiveTables: userTables(user.name)
      }))
    });
  }

  const permissionMatch = url.pathname.match(/^\/v1\/permissions\/(.+)$/);
  if (req.method === "PUT" && permissionMatch) {
    const userName = decodeURIComponent(permissionMatch[1]);
    if (!users.some(user => user.name === userName)) return sendJson(res, 404, { error: `用户不存在：${userName}` });
    const body = await readBody(req);
    const tableList = Array.isArray(body.tables) ? body.tables : [];
    const invalid = tableList.filter(name => name !== "全部数据表" && !allTableNames.includes(name));
    if (invalid.length) return sendJson(res, 400, { error: `未知数据表：${invalid.join("、")}` });
    const overrides = loadPermissionOverrides();
    if (!tableList.length) delete overrides[userName];
    else overrides[userName] = { tables: tableList, updatedAt: new Date().toISOString() };
    savePermissionOverrides(overrides);
    return sendJson(res, 200, { user: userName, effectiveTables: userTables(userName) });
  }

  if (req.method === "POST" && url.pathname === "/v1/analyze") {
    const body = await readBody(req);
    const { user = "曾祥竞", question = "", scenario = "single", tables: requestedTables = [], model = DEFAULT_MODEL, reasoningEffort = "", maxTokens = null } = body;
    if (!question.trim()) return sendJson(res, 400, { error: "问题不能为空" });

    const modelConfig = loadModelConfig();
    if (modelConfig.disabled?.[model]) {
      return sendJson(res, 403, { error: `模型「${model}」已被管理员禁用${modelConfig.disabled[model].reason ? `：${modelConfig.disabled[model].reason}` : ""}，请在右下角切换其他模型` });
    }

    const allowed = userTables(user);
    const wanted = requestedTables.length ? requestedTables.slice(0, 3) : [];
    const referenced = wanted.filter(name => allowed.includes(name));
    const denied = wanted.filter(name => !allowed.includes(name));
    if (wanted.length && !referenced.length) {
      return sendJson(res, 403, { error: `引用的数据表均未授权给当前用户（${user}），请检查「权限组 → 数据表权限」` });
    }

    const skill = skills["warehouse-analyst"];
    const scene = skill.scenarios[scenario] || skill.scenarios.single;
    const evidence = buildEvidence(referenced);
    const prompt = [
      `## 用户问题\n${question}`,
      `## 分析场景\n${scene.label}`,
      referenced.length ? `## 引用数据表\n${referenced.join("、")}` : "## 引用数据表\n（未指定，以下为当前用户权限内全部表的概览，深度分析请引用具体表）",
      denied.length ? `## 权限提示\n以下表未授权，未纳入分析：${denied.join("、")}` : "",
      `## 表证据（唯一事实来源，所有数字必须来自这里）\n${JSON.stringify(evidence, null, 1)}`
    ].filter(Boolean).join("\n\n");

    const started = Date.now();
    const messages = [{ role: "system", content: scene.system }, { role: "user", content: prompt }];

    /* 流式模式：SSE 逐段转发给前端 */
    if (body.stream === true) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS"
      });
      const send = obj => res.write(`data: ${JSON.stringify(obj)}\n\n`);
      const heartbeat = setInterval(() => res.write(": hb\n\n"), 5000);
      send({ started: true, scenario: scene.label, model });
      const reasoningOptions = {};
      if (["low", "medium", "high"].includes(reasoningEffort)) reasoningOptions.reasoning_effort = reasoningEffort;
      if (Number.isFinite(maxTokens) && maxTokens >= 256) reasoningOptions.max_completion_tokens = Math.floor(maxTokens);
      let result = await relayChatStream(model, { messages, ...reasoningOptions }, evt => send({ delta: evt.delta }));
      if (!result.ok && Object.keys(reasoningOptions).length) {
        send({ notice: "当前模型不支持推理参数，已自动降级重试" });
        result = await relayChatStream(model, { messages }, evt => send({ delta: evt.delta }));
      }
      if (!result.ok) {
        clearInterval(heartbeat);
        send({ error: `模型调用失败（${result.lastResult?.status || 502}）：${JSON.stringify(result.lastResult?.data).slice(0, 300)}` });
        return res.end();
      }
      clearInterval(heartbeat);
      send({
        done: true,
        meta: {
          skill: skill.name, skillVersion: skill.version, scenario: scene.label,
          model, reasoningEffort: reasoningOptions.reasoning_effort || "default",
          maxTokens: reasoningOptions.max_completion_tokens || null,
          tablesUsed: referenced.length ? referenced : evidence.map(item => item.表名),
          deniedTables: denied, latencyMs: Date.now() - started,
          usage: result.usage || null, requestId: crypto.randomUUID()
        }
      });
      return res.end();
    }

    const reasoningOptions = {};
    if (["low", "medium", "high"].includes(reasoningEffort)) reasoningOptions.reasoning_effort = reasoningEffort;
    if (Number.isFinite(maxTokens) && maxTokens >= 256) reasoningOptions.max_completion_tokens = Math.floor(maxTokens);
    const hasReasoningOptions = Object.keys(reasoningOptions).length > 0;
    try {
      let result = await relayChat(model, { messages, ...reasoningOptions });
      if (result.status !== 200 && hasReasoningOptions && /unsupported|unknown|invalid|not support|unexpected/i.test(JSON.stringify(result.data).slice(0, 500))) {
        result = await relayChat(model, { messages });
      }
      if (result.status !== 200) {
        return sendJson(res, 502, { error: `模型调用失败（${result.status}）：${JSON.stringify(result.data).slice(0, 300)}` });
      }
      const content = result.data?.choices?.[0]?.message?.content || "";
      return sendJson(res, 200, {
        report: content,
        meta: {
          skill: skill.name, skillVersion: skill.version, scenario: scene.label,
          model, reasoningEffort: hasReasoningOptions ? (reasoningOptions.reasoning_effort || "default") : "default",
          maxTokens: reasoningOptions.max_completion_tokens || null,
          tablesUsed: referenced.length ? referenced : evidence.map(item => item.表名),
          deniedTables: denied, latencyMs: Date.now() - started,
          usage: result.data.usage || null, requestId: crypto.randomUUID()
        }
      });
    } catch (error) {
      return sendJson(res, 502, { error: `分析失败：${error.message}` });
    }
  }

  sendJson(res, 404, { error: "not found" });
});

loadSampleData();
server.listen(PORT, () => console.log(`观星台分析网关已启动: http://localhost:${PORT}（数据目录 ${DATA_DIR}）`));
