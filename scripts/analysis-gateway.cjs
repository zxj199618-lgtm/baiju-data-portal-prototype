#!/usr/bin/env node
/**
 * 观星台分析网关
 *
 * 接口：
 *  GET  /v1/models                 — 可用模型列表（内置中转站 + 自配供应商，仅纳入可调用协议）
 *  GET  /v1/providers              — 自配供应商列表（API Key 只回显掩码，永不返回明文）
 *  POST /v1/providers              — 新增供应商；PUT / DELETE /v1/providers/:id 修改与删除
 *  POST /v1/providers/test         — 连通性测试 + 按协议拉取模型列表（支持未保存的表单配置）
 *  POST /v1/providers/:id/refresh  — 用已保存配置重新拉取并写入模型列表
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
const { execFile, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const RELAY_BASE_URL = process.env.RELAY_BASE_URL || "https://simindapi.modelgs.com";
const RELAY_API_KEYS = (process.env.RELAY_API_KEY || "").split(",").map(key => key.trim()).filter(Boolean);
const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(__dirname, "..");
const PERMISSIONS_FILE = path.join(DATA_DIR, "user-permissions.json");
const MODEL_CONFIG_FILE = path.join(DATA_DIR, "model-config.json");
const SHARES_FILE = path.join(DATA_DIR, "report-shares.json");
const HISTORY_FILE = path.join(DATA_DIR, "workbench-history.json");
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

function persistSampleRows(cnName, rows) {
  sampleData.tables[cnName] = rows;
  const tmp = `${SAMPLE_DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(sampleData));
  fs.renameSync(tmp, SAMPLE_DATA_FILE);
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

function buildEvidence(cnNames, portalContext = []) {
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
    /* 门户配置（表管理/字典/标签/维表）由前端自动随请求传入，优先级高于网关内置注释 */
    const portal = portalContext.find(item => item.cnName === table.cnName);
    if (portal) {
      if (portal.desc) evidence.说明 = portal.desc;
      if (portal.externalName) evidence.对外表名 = portal.externalName;
      if (portal.bizLine) evidence.业务线 = portal.bizLine;
      if (Array.isArray(portal.fields) && portal.fields.length) {
        evidence.字段 = portal.fields.map(field => {
          let text = `${field.name} — ${field.comment || ""}`;
          if (field.remark) text += `；备注：${field.remark}`;
          if (field.dict) text += `；枚举字典：${field.dict}`;
          return text;
        });
      }
      if (portal.dictEnums?.length) evidence.枚举值 = portal.dictEnums.map(dict => `${dict.name}: ${dict.items.join("、")}`);
      if (portal.tagConfig) evidence.标签配置 = portal.tagConfig;
      if (Array.isArray(portal.dimensionRows) && portal.dimensionRows.length) evidence.维表数据样例 = portal.dimensionRows;
    }
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

/* ================= Skill 包运行时（SKILL.md + 工具脚本 + 注册表） ================= */

const SKILLS_DIR = path.join(DATA_DIR, "skills");
const REGISTRY_FILE = path.join(DATA_DIR, "skill-registry.json");

/* 共享证据工具：stdin 收 {tables}，读 fields.json + sample-data.json，stdout 出 {evidence} */
const WAREHOUSE_EVIDENCE_TOOL = `const fs = require("fs");
const path = require("path");
let input = "";
process.stdin.on("data", d => input += d);
process.stdin.on("end", () => {
  const args = input.trim() ? JSON.parse(input) : {};
  const dataDir = process.env.GATEWAY_DATA_DIR || ".";
  const data = JSON.parse(fs.readFileSync(path.join(dataDir, "sample-data.json"), "utf8"));
  const defs = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fields.json"), "utf8"));
  const NUM = /DECIMAL|BIGINT|INT|DOUBLE|FLOAT/i;
  const round = (v, d = 2) => Number(Number(v).toFixed(d));
  const sum = (list, key) => list.reduce((s, r) => s + (Number(r[key]) || 0), 0);
  const wanted = (args.tables || []).filter(n => data.tables[n]);
  const tables = wanted.length ? wanted : Object.keys(data.tables);
  /* 与 WorkBuddy explain-table-context 对齐的字段结构 */
  const result = { schema_version: 1, query: { tables }, status: "ok", producers: [], contexts: [] };
  tables.forEach(name => {
    const def = defs.find(t => t.cnName === name) || { fields: [], lineage: { upstream: [], downstream: [] } };
    const rows = data.tables[name] || [];
    const ctx = {
      table: name,
      physical: (def.database || "") + "." + (def.table || ""),
      desc: def.desc || "",
      owner: def.owner || "",
      fields: (def.fields || []).map(f => ({ name: f.name, type: f.type || "", comment: f.comment || "" })),
      upstream_tables: (def.lineage && def.lineage.upstream || []).map(u => ({ table: u.table, role: u.role, join: u.join || "" })),
      downstream_tables: (def.lineage && def.lineage.downstream || []).map(d => ({ table: d.table, role: d.role }))
    };
    if (rows.length) {
      const dateKey = (def.agg && def.agg.dateKey) || "";
      const numeric = (def.fields || []).filter(f => NUM.test(f.type || "")).map(f => f.name);
      ctx.row_count = rows.length;
      if (dateKey) { const ds = rows.map(r => String(r[dateKey]).slice(0, 10)).sort(); ctx.date_range = [ds[0], ds[ds.length - 1]]; }
      const sums = {};
      numeric.slice(0, 8).forEach(k => sums[k] = round(sum(rows, k)));
      if (sums.cost && sums.activate_cnt) sums.cpa = round(sums.cost / sums.activate_cnt);
      if (Object.keys(sums).length) ctx.aggregates = sums;
      const groupKey = (def.agg && def.agg.groupBy && def.agg.groupBy[0]) || "";
      const metric = (def.agg && def.agg.metric) || "";
      if (groupKey) {
        const groups = {};
        rows.forEach(r => { const k = String(r[groupKey]); (groups[k] = groups[k] || []).push(r); });
        let stats = Object.entries(groups).map(([k, g]) => ({ group: k, rows: g.length, sums: Object.fromEntries(numeric.slice(0, 6).map(k2 => [k2, round(sum(g, k2))])) }));
        if (metric) stats.sort((a, b) => (b.sums[metric] || 0) - (a.sums[metric] || 0));
        ctx.groups = stats.slice(0, 8);
      }
      ctx.recent_rows = rows.slice(-5);
    } else {
      ctx.row_count = 0;
    }
    result.contexts.push(ctx);
  });
  process.stdout.write(JSON.stringify({ evidence: result.contexts, schema_version: result.schema_version }));
});`;

const EVIDENCE_TOOL_SOURCE = `const fs = require("fs");
const path = require("path");
let input = "";
process.stdin.on("data", d => input += d);
process.stdin.on("end", () => {
  const args = input.trim() ? JSON.parse(input) : {};
  const dataDir = process.env.GATEWAY_DATA_DIR || path.resolve(__dirname, "..", "..", "..");
  const data = JSON.parse(fs.readFileSync(path.join(dataDir, "sample-data.json"), "utf8"));
  const defs = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fields.json"), "utf8"));
  const NUM = /DECIMAL|BIGINT|INT|DOUBLE|FLOAT/i;
  const round = (v, d = 2) => Number(Number(v).toFixed(d));
  const sum = (list, key) => list.reduce((s, r) => s + (Number(r[key]) || 0), 0);
  const wanted = (args.tables || []).filter(n => data.tables[n]);
  const list = wanted.length ? wanted : Object.keys(data.tables);
  const evidence = list.map(name => {
    const def = defs.find(t => t.cnName === name) || { fields: [] };
    const rows = data.tables[name] || [];
    const out = { 表名: name, 物理表: (def.database || "") + "." + (def.table || ""), 说明: def.desc || "", 负责人: def.owner || "", 字段: (def.fields || []).map(f => (f.name + " " + (f.type || "") + " — " + (f.comment || "")).trim()) };
    if (!rows.length) { out.行数 = 0; return out; }
    const dateKey = (def.agg && def.agg.dateKey) || "";
    const numeric = (def.fields || []).filter(f => NUM.test(f.type || "")).map(f => f.name);
    out.行数 = rows.length;
    if (dateKey) { const ds = rows.map(r => String(r[dateKey]).slice(0, 10)).sort(); out.时间范围 = [ds[0], ds[ds.length - 1]]; }
    const sums = {};
    numeric.slice(0, 8).forEach(k => sums[k] = round(sum(rows, k)));
    if (sums.cost && sums.activate_cnt) sums.cpa = round(sums.cost / sums.activate_cnt);
    if (Object.keys(sums).length) out.整体合计 = sums;
    const groupKey = (def.agg && def.agg.groupBy && def.agg.groupBy[0]) || "";
    const metric = (def.agg && def.agg.metric) || "";
    if (groupKey) {
      const groups = {};
      rows.forEach(r => { const k = String(r[groupKey]); (groups[k] = groups[k] || []).push(r); });
      let stats = Object.entries(groups).map(([k, g]) => ({ 组: k, 行数: g.length, 合计: Object.fromEntries(numeric.slice(0, 6).map(k2 => [k2, round(sum(g, k2))])) }));
      if (metric) stats.sort((a, b) => (b.合计[metric] || 0) - (a.合计[metric] || 0));
      stats = stats.slice(0, 8);
      if (dateKey && metric) {
        const mk = back => { const d = new Date(Date.UTC(2026, 7, 31)); d.setUTCDate(d.getUTCDate() - back); return d.toISOString().slice(0, 10); };
        const s7 = mk(7), s14 = mk(14);
        stats.forEach(st => {
          const g = groups[st.组];
          const recent = g.filter(r => String(r[dateKey]) >= s7);
          const prior = g.filter(r => String(r[dateKey]) >= s14 && String(r[dateKey]) < s7);
          const rs = round(sum(recent, metric)), ps = round(sum(prior, metric));
          st.近7天 = rs; st.前7天 = ps;
          st.环比 = ps ? round((rs - ps) / ps * 100, 1) + "%" : "—";
          if (rs && ps && metric === "cost" && numeric.includes("activate_cnt")) {
            const rc = sum(recent, "cost") / Math.max(1, sum(recent, "activate_cnt"));
            const pc = sum(prior, "cost") / Math.max(1, sum(prior, "activate_cnt"));
            st.近7天CPA = round(rc); st.CPA环比 = round((rc - pc) / pc * 100, 1) + "%";
          }
        });
      }
      out[groupKey + "分组"] = stats;
    }
    out.最近明细样例 = rows.slice(-8);
    return out;
  });
  process.stdout.write(JSON.stringify({ evidence }));
});`;

function loadSkillRegistry() {
  try { return JSON.parse(fs.readFileSync(REGISTRY_FILE, "utf8")); } catch { return []; }
}

function saveSkillRegistry(registry) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${REGISTRY_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(registry, null, 2));
  fs.renameSync(tmp, REGISTRY_FILE);
}

function skillDir(id) { return path.join(SKILLS_DIR, id); }

function skillManifest(id) {
  try { return JSON.parse(fs.readFileSync(path.join(skillDir(id), "skill.json"), "utf8")); } catch { return null; }
}

function skillInstructions(id) {
  try { return fs.readFileSync(path.join(skillDir(id), "SKILL.md"), "utf8"); } catch { return ""; }
}

/* 内置包定义：SKILL.md + 工具 + 字段元数据，首次启动落盘安装 */
function installBuiltinPackages() {
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
  const defs = [
    { id: "warehouse-analyst", name: "数据查询与指标解答 Skill", source: "maxcompute-warehouse-analyst", version: "v1.4-portal", scenarioKey: "data-query", icon: "📊", title: "数据查询与指标解答", displayDesc: "先确认业务线等条件，再检索表与字段", sort: 10,
      clarification: {
        enabled: true,
        questions: [
          { key: "businessLine", label: "业务线", question: "你问的是哪个业务线？", hint: "确定业务线后，会在你有权限的对应表和字段中检索。", options: ["存量", "权益", "保险", "短剧", "其他"] },
          { key: "timeRange", label: "时间范围", question: "需要看哪个时间范围的数据？", hint: "影响数据范围以及同比 / 环比口径。", options: ["近 7 天", "近 30 天", "近 90 天", "本月", "今年至今"] },
          { key: "granularity", label: "汇总粒度", question: "结果按什么粒度汇总？", hint: "决定输出结果的分组维度。", options: ["按天", "按周", "按渠道", "按计划", "不汇总"] }
        ]
      }, assetScope: "按业务线检索已授权的表与字段", responseContract: ["引用表和字段", "指标口径与时间范围", "证据限制"],
      instructions: "你是观星台数据平台的数据查询与指标解答助手。未指定数据表时，先依据业务线范围检索用户有权限的表和字段。\n规则：\n1. 只基于提供的聚合统计、明细样例和字段注释分析，所有数字必须来自证据，不编造。\n2. 引用字段时用反引号；结论必须说明引用表、指标口径与时间范围。\n3. 样本明细有限时，基于聚合统计下结论，并标注「基于聚合口径」。\n4. 报告使用 Markdown，包含：一句话回答、引用数据资产、关键数据、口径说明、证据限制。" },
    { id: "lineage-analyst", name: "数据血缘与变更影响 Skill", source: "maxcompute-warehouse-analyst", version: "v1.3-portal", scenarioKey: "lineage", icon: "🔗", title: "数据血缘与变更影响", displayDesc: "上下游依赖与影响面", sort: 20,
      clarification: { enabled: false, question: "", options: [] }, assetScope: "引用表、字段与下游依赖", responseContract: ["直接影响", "间接影响", "待核对项"],
      instructions: "你是观星台数据平台的血缘分析助手。\n基于提供的表上下游血缘证据，输出 Markdown 报告：一、上游表清单；二、本表在数仓链路中的位置；三、下游影响面；四、变更风险与注意事项。\n只把明确给出的血缘写成确定关系；证据不足时标注「待核对，非确定引用」。" },
    { id: "asset-qa", name: "数据资产问答 Skill", source: "asset-qa", version: "v1.0-portal", scenarioKey: "asset", icon: "📚", title: "数据资产问答", displayDesc: "有哪些表、口径、负责人", sort: 30,
      clarification: { enabled: false, question: "", options: [] }, assetScope: "全部已授权数据资产", responseContract: ["推荐表", "关键字段", "负责人"],
      instructions: "你是观星台数据平台的资产问答助手。\n基于提供的表资产清单回答用户问题，输出：相关表清单、各表口径说明、负责人、推荐用法。\n只推荐清单内的表；清单外的可能性标注「权限外，未纳入」。" },
    { id: "attribution-analyst", name: "指标异动诊断 Skill", source: "attribution-analyst", version: "v0.6-portal", scenarioKey: "attribution", icon: "🎯", title: "指标异动诊断", displayDesc: "指标异动拆解与定位", sort: 40,
      clarification: { enabled: false, question: "", options: [] }, assetScope: "引用指标表与可拆解维度", responseContract: ["异动幅度", "维度贡献", "证据限制"],
      instructions: "你是观星台数据平台的归因分析助手。\n基于聚合统计中的「近7天 / 前7天 / 环比 / CPA环比」数据对指标异动做维度拆解：1. 先给出整体结论；2. 逐维度列出对比表（Markdown 表格）；3. 定位到具体的组并给出原因判断；4. 给出建议。\n所有数字必须来自证据，不编造。" }
  ];
  /* 数仓模型分析（服务化）：原 maxcompute-warehouse-analyst 提炼，输出对齐 WorkBuddy 八段式 */
  const warehouseDef = {
    id: "numa-warehouse", name: "数仓模型分析（服务化）", source: "maxcompute-warehouse-analyst", version: "v1.2-service", scenarioKey: "warehouse",
    icon: "🏭", title: "数仓模型分析", displayDesc: "口径、血缘与设计解读（WorkBuddy 同款）", sort: 25,
    instructions: [
      "你是 MaxCompute 数仓模型分析师，将门户表证据组织成可复核的 Markdown 口径文档。脚本提供事实，Skill 负责编排和表达。",
      "## 安全与证据边界",
      "1. 只基于证据字段中的聚合统计、字段注释、血缘关系作答，不编造数字与关系。",
      "2. 文本命中只是候选，只有 evidence 明确给出的血缘可表述为确定关系。",
      "3. 证据不足时标注「待业务确认」，不猜测业务定义。",
      "## 证据标签",
      "- SQL/DDL 明确证据：fields 注释、aggregates、upstream/downstream；",
      "- 结构解释：根据明确字段与聚合做出的技术解释；",
      "- 待业务确认：desc 缺失、口径无法从证据证明时使用。",
      "## 报告模板（直接输出八段，不输出计划与工具名）",
      "一、一句话说明；二、数据概览（行数、时间范围、整体合计）；三、为什么这样设计；四、输出粒度与重要口径；五、重点字段（公式与聚合）；六、上下游血缘（用 mermaid flowchart 绘制）；七、风险与建议；八、证据限制（列明待业务确认项）。"
    ].join("\n")
  };

  const registry = loadSkillRegistry();
  defs.forEach(def => {
    const dir = skillDir(def.id);
    const manifest = {
      id: def.id, name: def.name, source: def.source, version: def.version,
      scenarioKey: def.scenarioKey, icon: def.icon, title: def.title,
      displayDesc: def.displayDesc, sort: def.sort, clarification: def.clarification, assetScope: def.assetScope, responseContract: def.responseContract, enabled: true, grayUsers: [],
      tools: [{ name: "evidence", cmd: "node tools/evidence.cjs", description: "采集表证据与聚合统计（含环比）" }]
    };
    const existing = registry.find(item => item.id === def.id);
    const needsBuiltinUpgrade = existing?.builtin && existing.version !== def.version;
    if (!fs.existsSync(path.join(dir, "skill.json")) || needsBuiltinUpgrade) {
      fs.mkdirSync(path.join(dir, "tools"), { recursive: true });
      fs.writeFileSync(path.join(dir, "skill.json"), JSON.stringify(manifest, null, 2));
      fs.writeFileSync(path.join(dir, "SKILL.md"), def.instructions);
      fs.writeFileSync(path.join(dir, "tools", "evidence.cjs"), EVIDENCE_TOOL_SOURCE);
      fs.writeFileSync(path.join(dir, "fields.json"), JSON.stringify(tables.map(({ generator, ...rest }) => rest)));
    }
    if (existing?.builtin) {
      /* registry 的字段会在接口层覆盖 manifest，因此内置包升级时必须让代码定义覆盖旧值，否则改 clarification 不生效 */
      Object.assign(existing, { name: def.name, source: def.source, version: def.version, scenarioKey: def.scenarioKey, icon: def.icon, title: def.title, displayDesc: def.displayDesc, sort: def.sort, clarification: needsBuiltinUpgrade || !existing.clarification ? def.clarification : existing.clarification, assetScope: needsBuiltinUpgrade || !existing.assetScope ? def.assetScope : existing.assetScope, responseContract: needsBuiltinUpgrade || !existing.responseContract ? def.responseContract : existing.responseContract });
    } else if (!existing) {
      registry.push({ id: def.id, name: def.name, source: def.source, version: def.version, dir: path.join(SKILLS_DIR, def.id), enabled: true, grayUsers: [], installedAt: new Date().toISOString(), builtin: true });
    }
  });
  /* 服务化数仓包：tools/warehouse-evidence.cjs */
  (() => {
    const dir = skillDir(warehouseDef.id);
    const manifest = {
      id: warehouseDef.id, name: warehouseDef.name, source: warehouseDef.source, version: warehouseDef.version,
      scenarioKey: warehouseDef.scenarioKey, icon: warehouseDef.icon, title: warehouseDef.title,
      displayDesc: warehouseDef.displayDesc, sort: warehouseDef.sort, enabled: true, grayUsers: [],
      desc: "将门户表证据组织成可复核的 Markdown 口径文档：字段、血缘、聚合、字典；报告结构对齐 WorkBuddy 数仓分析。",
      tools: [{ name: "lineage", cmd: "node tools/warehouse-evidence.cjs", description: "服务化数仓证据（表上下文 + 字段血缘 + 聚合）" }]
    };
    if (!fs.existsSync(path.join(dir, "skill.json"))) {
      fs.mkdirSync(path.join(dir, "tools"), { recursive: true });
      fs.writeFileSync(path.join(dir, "skill.json"), JSON.stringify(manifest, null, 2));
      fs.writeFileSync(path.join(dir, "SKILL.md"), warehouseDef.instructions);
      fs.writeFileSync(path.join(dir, "tools", "warehouse-evidence.cjs"), WAREHOUSE_EVIDENCE_TOOL);
      fs.writeFileSync(path.join(dir, "fields.json"), JSON.stringify(tables.map(({ generator, ...rest }) => rest)));
    }
    if (!registry.some(item => item.id === warehouseDef.id)) {
      registry.push({ id: warehouseDef.id, name: warehouseDef.name, source: warehouseDef.source, version: warehouseDef.version, dir, enabled: true, grayUsers: [], installedAt: new Date().toISOString(), builtin: true });
    }
  })();
  saveSkillRegistry(registry);
}

/* 执行 skill 工具：stdin 传参，stdout 出 JSON */
function runSkillTool(registryEntry, toolName, args) {
  return new Promise(resolve => {
    const manifest = skillManifest(registryEntry.id);
    const tool = (manifest?.tools || []).find(item => item.name === toolName) || (manifest?.tools || [])[0];
    if (!tool || !tool.cmd) return resolve({ ok: false, error: "该 Skill 未声明可用工具" });
    const parts = tool.cmd.split(" ");
    const timeoutMs = Number(tool.timeoutMs || 20000);
    let stdout = "", stderr = "";
    const child = spawn(parts[0], parts.slice(1), {
      cwd: registryEntry.dir,
      env: { ...process.env, GATEWAY_DATA_DIR: DATA_DIR },
      stdio: ["pipe", "pipe", "pipe"]
    });
    const timer = setTimeout(() => { child.kill("SIGKILL"); }, timeoutMs);
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", error => { clearTimeout(timer); resolve({ ok: false, error: `工具启动失败：${error.message}` }); });
    child.on("close", code => {
      clearTimeout(timer);
      if (code !== 0) return resolve({ ok: false, error: `工具退出（码 ${code}）：${String(stderr).slice(0, 150) || "无错误输出"}` });
      try { resolve({ ok: true, result: JSON.parse(stdout) }); }
      catch { resolve({ ok: false, error: "工具输出不是合法 JSON" }); }
    });
    try { child.stdin.end(JSON.stringify(args || {})); } catch { /* 工具可能不读 stdin */ }
  });
}

/* ================= 模型上下文规格（公开规格，约值） ================= */

const MODEL_CONTEXT_RULES = [
  { match: /^gpt-5/, limit: 400000 },
  { match: /^gpt-4/, limit: 128000 },
  { match: /^deepseek/, limit: 128000 },
  { match: /^glm/, limit: 128000 },
  { match: /^kimi/, limit: 256000 }
];

function contextLimitFor(modelId) {
  const rule = MODEL_CONTEXT_RULES.find(rule => rule.match.test(modelId));
  return rule ? rule.limit : 1000000;
}

/* ================= 模型能力：上下文上限 + 思考深度档位 =================
 * 「能选什么」由模型配置页按模型声明（覆盖值存在 model-config.json 的 models 里，
 * 和 disabled 一样属于「按模型」的配置，不挂在供应商记录上）；没声明的按模型名推断。
 * 灵犀智析输入框只渲染当前模型支持的档位，不支持的模型干脆不显示这一项。 */

const REASONING_LEVELS = ["low", "medium", "high"];
const REASONING_LABELS = { low: "快速", medium: "标准", high: "深度" };
const MODEL_REASONING_RULES = [
  { match: /^(gpt-5|o[134])/i, levels: ["low", "medium", "high"], default: "high" },
  { match: /^deepseek-(r1|reasoner)/i, levels: ["low", "medium", "high"], default: "high" },
  { match: /^(glm-4\.[56]|kimi-k2|qwen3-max)/i, levels: ["low", "medium", "high"], default: "medium" }
];

function reasoningCapabilityFor(modelId) {
  const rule = MODEL_REASONING_RULES.find(item => item.match.test(String(modelId || "")));
  return rule ? { levels: [...rule.levels], default: rule.default } : { levels: [], default: "" };
}

/** 归一化：只认 low/medium/high，默认档必须落在已选档位里；非法值回退到推断值 */
function normalizeReasoning(input, fallback) {
  if (!input || typeof input !== "object") return fallback;
  if (!Array.isArray(input.levels)) return fallback;
  const levels = REASONING_LEVELS.filter(level => input.levels.includes(level));
  const preferred = levels.includes(input.default) ? input.default : "";
  return { levels, default: preferred || levels[levels.length - 1] || "" };
}

function normalizeContextLimit(value, fallback) {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit < 1024) return fallback;
  return Math.min(Math.floor(limit), 2000000);
}

/** 单个模型的有效能力：模型配置页的覆盖 > 按模型名推断。overrides 传进来避免逐行读盘 */
function modelCapabilityFor(modelId, overrides) {
  const source = overrides && typeof overrides === "object" ? overrides : (loadModelConfig().models || {});
  const override = source[modelId] && typeof source[modelId] === "object" ? source[modelId] : {};
  return {
    id: modelId,
    contextLimit: normalizeContextLimit(override.contextLimit, contextLimitFor(modelId)),
    reasoning: normalizeReasoning(override.reasoning, reasoningCapabilityFor(modelId)),
    configured: override.contextLimit !== undefined || override.reasoning !== undefined
  };
}

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

/* ================= 模型供应商（模型配置 → 供应商配置） =================
 * 设计参考 CC Switch / DeepSeek Harness 的 provider 配置：
 *   - 所有模型来源统一是「供应商」：内置中转站首次启动按环境变量 RELAY_BASE_URL / RELAY_API_KEY
 *     迁移成一条普通供应商记录（prov-relay），之后与自配供应商共用同一套表单、接口与路由，不再有特例通道；
 *   - 一个供应商可配多个 API Key（每行一个），按「上次成功的 Key」优先重试，保留中转站原有的多 Key 轮换；
 *   - API Key 只写不读：写盘 chmod 600，接口只回显掩码，任何日志/响应都不带明文；
 *   - 「模型」是能力载体，挂在模型条目上而不是供应商上；
 *   - 只有 OpenAI 兼容类协议参与分析调用路由：openai-compatible / ark / custom / azure-openai；
 *     anthropic、anthropic-compatible、gemini 允许登记与连通性测试，但模型不进入工作台可调用列表
 *     （避免把「协议没适配」误当成「模型坏了」）。
 * 同名模型由多个供应商声明时按供应商列表顺序取第一个（内置中转站排在最前）。
 */
const PROVIDERS_FILE = path.join(DATA_DIR, "providers.json");
const RELAY_PROVIDER_ID = "prov-relay";
/** 单个供应商最多保存多少个模型：中转站上游有 200+ 个模型，上限不能卡在 200，否则会静默丢模型 */
const MAX_PROVIDER_MODELS = 1000;
const PROVIDER_PROTOCOLS = {
  "openai-compatible": { label: "OpenAI 兼容", callable: true },
  "ark": { label: "火山方舟 ARK", callable: true },
  "custom": { label: "自定义兼容端点", callable: true },
  "azure-openai": { label: "Azure OpenAI", callable: true },
  "anthropic": { label: "Anthropic 原生", callable: false },
  "anthropic-compatible": { label: "Anthropic 兼容中转", callable: false },
  "gemini": { label: "Google Gemini", callable: false }
};
const PROVIDER_AUTH_TYPES = ["bearer", "x-api-key", "x-goog-api-key", "api-key-header", "query", "custom-header"];
const DEFAULT_AUTH_KEY_NAME = { "x-api-key": "x-api-key", "x-goog-api-key": "x-goog-api-key", "api-key-header": "api-key", query: "key", "custom-header": "X-Api-Key" };

/** 记住每个模型上次成功的 Key：多 Key 供应商重试时优先用它 */
const modelKeyCache = new Map();

function loadProviderState() {
  try {
    const data = JSON.parse(fs.readFileSync(PROVIDERS_FILE, "utf8"));
    return { providers: Array.isArray(data.providers) ? data.providers : [], relayMigrated: data.relayMigrated === true };
  } catch { return { providers: [], relayMigrated: false }; }
}

function saveProviderState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${PROVIDERS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ providers: state.providers || [], relayMigrated: state.relayMigrated === true }, null, 2), { mode: 0o600 });
  try { fs.chmodSync(tmp, 0o600); } catch { /* 文件系统不支持时忽略 */ }
  fs.renameSync(tmp, PROVIDERS_FILE);
}

function loadProviders() { return loadProviderState().providers; }

/** 任何一次增删改都视为「已迁移」，避免删掉内置中转站后重启又被自动建回来 */
function saveProviders(providers) { saveProviderState({ providers, relayMigrated: true }); }

/** 掩码只用于「已配置」的视觉提示，绝不回传明文 */
function maskSecret(value) {
  const secret = String(value || "").trim();
  if (!secret) return "";
  if (secret.length <= 8) return "••••••";
  return `${secret.slice(0, 3)}••••${secret.slice(-4)}`;
}

/** 上游（中转站/供应商）会返回图像、语音、蒸馏等不该出现在分析工作台的模型：
 *  只在「自动拉取」的路径统一过滤，用户手填的模型 ID 不受影响。 */
const UNUSABLE_MODEL_RE = /image|audio|realtime|vision|-distill-|codex-auto|embedding|seedance|seedream|wan2|hitem3d|hyper3d|tts|asr|ocr|rerank|moderation/;
function filterUsableModels(models) {
  return (Array.isArray(models) ? models : []).filter(id => !UNUSABLE_MODEL_RE.test(String(id))).slice(0, MAX_PROVIDER_MODELS);
}

/** 本地/内网地址通常不校验 Key（Ollama、vLLM、内网网关） */
function isLocalBaseUrl(url) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|[\w.-]+\.local)([:/]|$)/i.test(String(url || "").trim());
}

function providerKeys(provider) {
  const keys = Array.isArray(provider?.apiKeys) ? provider.apiKeys.filter(Boolean) : [];
  return keys.length ? keys : [""];
}

function publicProvider(provider) {
  const { apiKeys, ...rest } = provider;
  const keys = providerKeys(provider).filter(Boolean);
  return {
    ...rest,
    hasKey: keys.length > 0,
    keyCount: keys.length,
    keyMasked: keys.length ? maskSecret(keys[0]) : "",
    keyMasks: keys.map(maskSecret),
    protocolLabel: PROVIDER_PROTOCOLS[provider.protocol]?.label || provider.protocol,
    callable: Boolean(PROVIDER_PROTOCOLS[provider.protocol]?.callable),
    builtin: isBuiltinProvider(provider)
  };
}

function normalizeProvider(input, base = {}) {
  const protocol = PROVIDER_PROTOCOLS[input.protocol] ? input.protocol : (base.protocol || "openai-compatible");
  const authType = PROVIDER_AUTH_TYPES.includes(input.authType) ? input.authType : (base.authType || "bearer");
  const pick = (key, fallback = "") => (input[key] === undefined ? (base[key] ?? fallback) : input[key]);
  const record = {
    id: base.id,
    name: String(pick("name")).trim(),
    protocol,
    baseUrl: String(pick("baseUrl")).trim().replace(/\/+$/, ""),
    authType,
    authKeyName: String(input.authKeyName ?? base.authKeyName ?? DEFAULT_AUTH_KEY_NAME[authType] ?? "").trim(),
    apiVersion: String(pick("apiVersion")).trim(),
    defaultModel: String(pick("defaultModel")).trim(),
    note: String(pick("note")).trim(),
    enabled: input.enabled === undefined ? base.enabled !== false : input.enabled !== false,
    models: (Array.isArray(input.models) ? input.models : base.models || []).map(id => String(id).trim()).filter(Boolean).slice(0, MAX_PROVIDER_MODELS),
    extraHeaders: (Array.isArray(input.extraHeaders) ? input.extraHeaders : base.extraHeaders || [])
      .map(item => ({ name: String(item?.name || "").trim(), value: String(item?.value ?? "") }))
      .filter(item => item.name).slice(0, 20),
    createdAt: base.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  // apiKeys：数组或换行/逗号分隔字符串都接受；apiKey 单值等价；都不传表示「不修改」；clearKeys: true 显式清空
  let keys;
  if (input.clearKeys === true) keys = [];
  else if (Array.isArray(input.apiKeys)) keys = input.apiKeys;
  else if (typeof input.apiKeys === "string" && input.apiKeys.trim()) keys = input.apiKeys.split(/[\n,;]/);
  else if (typeof input.apiKey === "string" && input.apiKey.trim()) keys = [input.apiKey];
  else keys = Array.isArray(base.apiKeys) ? base.apiKeys : [];
  record.apiKeys = [...new Set(keys.map(sanitizeApiKey).filter(Boolean))].slice(0, 10);
  return record;
}

/** 用户常把整段 `Bearer sk-xxx` 或带引号的值粘进来：只做最小清洗，其余原样保存（不猜测、不截断） */
function sanitizeApiKey(raw) {
  let value = String(raw ?? "").trim();
  // 引号与 `Bearer ` 前缀可能嵌套（如 "\"Bearer sk-xxx\""），来回剥两轮即可
  for (let round = 0; round < 2; round += 1) {
    value = value.replace(/^bearer\s+/i, "").trim();
    if (value.length > 1 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) value = value.slice(1, -1).trim();
  }
  return value;
}

function providerHeaders(provider, key = "") {
  const headers = { "Content-Type": "application/json" };
  const authType = provider.authType || "bearer";
  const name = String(provider.authKeyName || "").trim() || DEFAULT_AUTH_KEY_NAME[authType] || "";
  if (authType === "bearer") headers.Authorization = `Bearer ${key}`;
  else if (authType !== "query") headers[name || "X-Api-Key"] = key;
  if (/^anthropic/.test(provider.protocol || "") && !headers["anthropic-version"]) headers["anthropic-version"] = provider.anthropicVersion || "2023-06-01";
  (Array.isArray(provider.extraHeaders) ? provider.extraHeaders : []).forEach(item => {
    const headerName = String(item?.name || "").trim();
    if (headerName) headers[headerName] = String(item?.value ?? "");
  });
  return headers;
}

function withAuthQuery(target, provider, key = "") {
  if ((provider.authType || "") !== "query") return target;
  try {
    const url = new URL(target);
    const paramName = String(provider.authKeyName || "").trim() || "key";
    if (key) url.searchParams.set(paramName, key);
    return url.toString();
  } catch { return target; }
}

function joinBase(baseUrl, suffix) {
  return `${String(baseUrl || "").trim().replace(/\/+$/, "")}${suffix}`;
}

function providerChatTarget(provider, model, key = "") {
  const endpoint = provider.protocol === "azure-openai"
    ? `${joinBase(provider.baseUrl, "")}/openai/deployments/${encodeURIComponent(model)}/chat/completions?api-version=${encodeURIComponent(provider.apiVersion || "2024-10-21")}`
    : joinBase(provider.baseUrl, "/chat/completions");
  return { key, url: withAuthQuery(endpoint, provider, key), headers: providerHeaders(provider, key) };
}

function providerModelsUrl(provider, key = "") {
  const base = String(provider.baseUrl || "").trim().replace(/\/+$/, "");
  if (provider.protocol === "gemini") return withAuthQuery(joinBase(base.replace(/\/v1beta$/, ""), "/v1beta/models"), provider, key);
  if (provider.protocol === "anthropic") return withAuthQuery(joinBase(base.replace(/\/v1$/, ""), "/v1/models?limit=1000"), provider, key);
  return withAuthQuery(joinBase(base, "/models"), provider, key);
}

/** 模型 → 供应商调用目标（一个 Key 一个目标，按上次成功的 Key 优先）；未命中返回 null */
function routeForModel(modelId) {
  const provider = loadProviders().find(item =>
    item.enabled !== false
    && PROVIDER_PROTOCOLS[item.protocol]?.callable
    && Array.isArray(item.models)
    && item.models.includes(modelId)
  );
  if (!provider) return null;
  const keys = providerKeys(provider);
  const ordered = [...keys].sort((a, b) => (modelKeyCache.get(modelId) === b ? -1 : modelKeyCache.get(modelId) === a ? 1 : 0));
  return {
    provider,
    providerId: provider.id,
    providerName: provider.name,
    targets: ordered.map(key => ({ ...providerChatTarget(provider, modelId, key), label: `provider:${provider.id}` }))
  };
}

/** 语义化连通性结果：鉴权失败 / 端点无此能力 / 限流 / 网络 分开报，不把错误都写成「没有模型」 */
function providerProbeMessage(status, models) {
  if (status === 401 || status === 403) return "鉴权失败（401/403）：API Key 无效，或该 Key 没有读取模型列表的权限";
  if (status === 404 || status === 405) return "该端点不提供模型列表接口（404/405）：请在「模型」里手动填写模型 ID";
  if (status === 429) return "上游限流（429）：若是额度用尽请检查供应商账户余额";
  if (status >= 500) return `上游异常（${status}）：稍后重试或检查 Base URL 是否指向正确网关`;
  if (!models.length) return "连接成功，但模型列表为空：可能是该端点不返回模型，请手动填写";
  return `连接成功，返回 ${models.length} 个模型`;
}

/** 单个 Key 的模型列表探测（拆分 Key 时按 Key 各探一次） */
async function probeProviderKey(provider, key) {
  const target = providerModelsUrl(provider, key);
  const started = Date.now();
  try {
    const response = await fetch(target, { headers: providerHeaders(provider, key) });
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
    const source = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];
    const models = [...new Set(source.map(item => String(item?.id || item?.name || "").trim()).filter(Boolean))];
    return { ok: response.ok, status: response.status, models, count: models.length, latencyMs: Date.now() - started, message: providerProbeMessage(response.status, models), endpoint: target };
  } catch (error) {
    return { ok: false, status: 0, models: [], count: 0, latencyMs: Date.now() - started, message: `网络不可达：${error.message}`, endpoint: target };
  }
}

/** 拉取供应商模型列表（只读探测，不改配置）：多 Key 时逐个探测并合并结果 */
async function probeProvider(provider) {
  const keys = providerKeys(provider).slice(0, 3);
  const merged = new Set();
  let okAny = false, lastFail = null, endpoint = "";
  for (const key of keys) {
    const result = await probeProviderKey(provider, key);
    endpoint = endpoint || result.endpoint;
    if (result.ok) { okAny = true; result.models.forEach(id => merged.add(id)); } else lastFail = result;
  }
  const models = [...merged];
  if (okAny) {
    return { ok: true, status: 200, models, count: models.length, keyCount: keys.length, message: providerProbeMessage(200, models), endpoint };
  }
  return { ...(lastFail || { ok: false, status: 0, message: "没有可用的 API Key" }), models: [], count: 0, keyCount: keys.length, endpoint };
}

/** 是否由环境变量迁移来的内置中转站（历史记录只有 id，新记录带 builtin 标记） */
function isBuiltinProvider(provider) { return provider?.builtin === true || provider?.id === RELAY_PROVIDER_ID; }

/** 通过供应商调用 chat/completions（OpenAI 兼容路径） */
async function providerChat(target, model, payload) {
  try {
    const response = await fetch(target.url, { method: "POST", headers: target.headers, body: JSON.stringify({ model, ...payload }) });
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 400) }; }
    return { ok: response.ok, status: response.status, data, keyUsed: target.label };
  } catch (error) {
    return { ok: false, status: 502, data: { error: String(error) } };
  }
}

/** 首次启动把环境变量里的中转站迁移成普通供应商记录：一个 Key 一条
 *  公司中转站的多个 Key 往往对应不同厂商（如 deepseek / gpt / 阿里百炼），
 *  合成一条会把不同厂商的模型混在一起、也没法分别命名与停用，所以按 Key 拆成多行。 */
async function ensureRelayProvider() {
  const state = loadProviderState();
  if (state.relayMigrated || state.providers.some(item => isBuiltinProvider(item))) return;
  if (!RELAY_API_KEYS.length) {
    saveProviderState({ providers: state.providers, relayMigrated: true });
    console.log("[providers] 未配置 RELAY_API_KEY，跳过内置中转站迁移");
    return;
  }
  const multiple = RELAY_API_KEYS.length > 1;
  const created = RELAY_API_KEYS.slice(0, 10).map((key, index) => Object.assign(normalizeProvider({
    name: multiple ? `内置中转站 · ${index + 1}` : "内置中转站",
    protocol: "openai-compatible",
    baseUrl: RELAY_BASE_URL,
    authType: "bearer",
    apiKeys: [key],
    models: [],
    note: multiple ? "由环境变量 RELAY_API_KEY 第 " + (index + 1) + " 个 Key 迁移，建议改成对应厂商名" : "由环境变量 RELAY_BASE_URL / RELAY_API_KEY 自动迁移，之后可直接在这里改"
  }, { id: index === 0 ? RELAY_PROVIDER_ID : `prov-${crypto.randomBytes(4).toString("hex")}` }), { builtin: true }));
  saveProviderState({ providers: [...created, ...state.providers], relayMigrated: true });
  let total = 0;
  for (const provider of created) {
    const result = await probeProviderKey(provider, provider.apiKeys[0]).catch(() => null);
    if (!result?.ok) continue;
    const list = loadProviders();
    const target = list.find(item => item.id === provider.id);
    if (!target) continue;
    target.models = filterUsableModels(result.models);
    target.health = { ok: true, status: 200, message: result.message, at: new Date().toISOString(), latencyMs: result.latencyMs };
    total += target.models.length;
    saveProviders(list);
  }
  console.log(`[providers] 已把环境变量中的中转站迁移为 ${created.length} 条供应商记录（共 ${total} 个模型）`);
}

/** 模型清单为空的自配供应商做一次限频的后台补拉，避免首次配置后要手动点「拉取模型」 */
let providerAutoRefreshAt = 0;
function scheduleProviderAutoRefresh() {
  const now = Date.now();
  if (now - providerAutoRefreshAt < 60000) return;
  providerAutoRefreshAt = now;
  const stale = loadProviders().filter(item => item.enabled !== false && !(item.models || []).length);
  if (!stale.length) return;
  Promise.allSettled(stale.slice(0, 3).map(async provider => {
    const result = await probeProvider(provider);
    if (!result.ok || !result.models.length) return;
    const list = loadProviders();
    const target = list.find(item => item.id === provider.id);
    if (!target) return;
    target.models = filterUsableModels(result.models);
    target.health = { ok: true, status: 200, message: result.message, at: new Date().toISOString(), latencyMs: result.latencyMs };
    saveProviders(list);
  })).catch(() => { /* 后台补拉失败不影响主流程 */ });
}

/** 启动时把内置中转站的模型清单同步一次：上游增删模型、或历史版本截断过清单，都能自愈 */
async function syncBuiltinRelayModels() {
  const builtins = loadProviders().filter(item => isBuiltinProvider(item) && item.enabled !== false);
  for (const provider of builtins) {
    // 还没拆分的记录可能有多个 Key（同一中转站的多个账号/厂商），必须合并探测，
    // 否则同步一次就把其它 Key 的模型冲掉（线上实测：265 → 9）。
    const result = await probeProvider(provider).catch(() => null);
    if (!result?.ok) continue;
    const models = filterUsableModels(result.models);
    const list = loadProviders();
    const target = list.find(item => item.id === provider.id);
    if (!target) continue;
    const changed = models.length !== (target.models || []).length;
    target.models = models;
    target.health = { ok: true, status: 200, message: result.message, at: new Date().toISOString(), latencyMs: result.latencyMs };
    target.updatedAt = new Date().toISOString();
    saveProviders(list);
    console.log(`[providers] ${target.name} 模型清单已同步：${models.length} 个${changed ? "（数量有变化）" : ""}`);
  }
}

/** 汇总所有供应商的模型清单（含来源、可调用性与启停状态）
 *  停用（enabled === false）的供应商不进入清单：它下面的模型一个都不该出现在「全部可用模型」里，
 *  否则页面会一边显示「供应商已停用」一边把模型算进可用数，用户看到的就是「停用了列表却没关」。
 *  被藏起来的供应商单独回给前端（hiddenProviders），用来渲染空态与提示。 */
async function collectModels() {
  const modelConfig = loadModelConfig();
  const disabled = modelConfig.disabled || {};
  const capabilityOverrides = modelConfig.models || {};
  const providers = loadProviders();
  const rows = [];
  const hiddenProviders = [];
  providers.forEach(provider => {
    const protocolCallable = Boolean(PROVIDER_PROTOCOLS[provider.protocol]?.callable);
    const providerOn = provider.enabled !== false;
    if (!providerOn) {
      const count = (provider.models || []).length;
      if (count) hiddenProviders.push({ id: provider.id, name: provider.name, count });
      return;
    }
    (provider.models || []).forEach(id => {
      const capability = modelCapabilityFor(id, capabilityOverrides);
      rows.push({
        id, source: provider.name, sourceType: "provider", providerId: provider.id,
        builtin: isBuiltinProvider(provider),
        protocol: provider.protocol, protocolLabel: PROVIDER_PROTOCOLS[provider.protocol]?.label || provider.protocol,
        callable: protocolCallable, adaptable: protocolCallable,
        contextLimit: capability.contextLimit, reasoning: capability.reasoning, capabilityConfigured: capability.configured,
        enabled: !disabled[id], reason: disabled[id]?.reason || "", disabledAt: disabled[id]?.disabledAt || ""
      });
    });
  });
  // 稳定排序：同 id 保持供应商列表顺序（第一个就是路由实际命中的那家）
  rows.sort((a, b) => a.id.localeCompare(b.id));
  const notices = [];
  const hiddenNames = hiddenProviders.map(item => item.name).join("、");
  const hiddenCount = hiddenProviders.reduce((sum, item) => sum + item.count, 0);
  if (!providers.length) notices.push("还没有配置供应商：点右上角「供应商配置」接入（内置中转站会按环境变量自动迁移）");
  else if (!rows.length && hiddenProviders.length) notices.push(`${hiddenNames}已停用，其 ${hiddenCount} 个模型已从清单隐藏：到「供应商配置」重新启用即恢复`);
  else if (!rows.length) notices.push("供应商已接入但模型清单为空：在「供应商配置」里点「拉取模型」同步");
  else if (hiddenProviders.length) notices.push(`${hiddenNames}已停用，其 ${hiddenCount} 个模型不在上方清单里`);
  const stale = providers.filter(item => item.enabled !== false && !(item.models || []).length);
  if (rows.length && stale.length) notices.push(`${stale.map(item => item.name).join("、")} 的模型清单为空，正在自动同步`);
  if (stale.length) scheduleProviderAutoRefresh();
  return {
    rows,
    notice: notices.join("；"),
    hiddenProviders,
    providers: providers.map(publicProvider),
    protocols: Object.entries(PROVIDER_PROTOCOLS).map(([id, meta]) => ({ id, ...meta }))
  };
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

// 工作台会话/分析资产历史（无登录、共享一份：所有人看到同样的记录，刷新可恢复）
function loadHistory() {
  try {
    const data = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
    return { sessions: Array.isArray(data.sessions) ? data.sessions.slice(0, 80) : [], reports: Array.isArray(data.reports) ? data.reports.slice(0, 120) : [] };
  } catch { return { sessions: [], reports: [] }; }
}

function sanitizeHistoryMessage(msg) {
  return {
    role: ["user", "assistant"].includes(msg?.role) ? msg.role : "assistant",
    lines: Array.isArray(msg?.lines) ? msg.lines.slice(0, 80).map(line => String(line).slice(0, 8000)) : [],
    refs: Array.isArray(msg?.refs) ? msg.refs.slice(0, 8).map(ref => String(ref).slice(0, 80)) : undefined,
    html: String(msg?.html || "").slice(0, 120000),
    meta: String(msg?.meta || "").slice(0, 400),
    model: String(msg?.model || "").slice(0, 80),
    reportId: String(msg?.reportId || "").slice(0, 80),
    leadMsg: String(msg?.leadMsg || "").slice(0, 300),
    trailMsg: String(msg?.trailMsg || "").slice(0, 300),
    streaming: false
  };
}

// 工作台历史：无登录、共享一份。多标签页并发时按 id 合并（旧标签页的旧状态不会覆盖新记录）
function mergeHistory(incoming, existing) {
  const sessions = new Map((existing.sessions || []).map(s => [s.id, s]));
  for (const s of incoming.sessions || []) if (s.id) sessions.set(s.id, s);
  const reports = new Map((existing.reports || []).map(r => [r.id, r]));
  for (const r of incoming.reports || []) if (r.id) reports.set(r.id, r);
  return {
    sessions: [...sessions.values()].slice(0, 80),
    reports: [...reports.values()].slice(0, 120)
  };
}

function saveHistory(box) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const sessions = (Array.isArray(box.sessions) ? box.sessions.slice(0, 80) : []).map(s => ({
    id: String(s?.id || "").slice(0, 80),
    title: String(s?.title || "新的分析").slice(0, 120),
    channel: String(s?.channel || "工作台对话").slice(0, 40),
    scenario: String(s?.scenario || "").slice(0, 40),
    status: String(s?.status || "已完成").slice(0, 20),
    time: String(s?.time || "").slice(0, 40),
    suggested: !!s?.suggested,
    messages: (Array.isArray(s?.messages) ? s.messages.slice(-60) : []).map(sanitizeHistoryMessage)
  })).filter(s => s.id);
  const reports = (Array.isArray(box.reports) ? box.reports.slice(0, 120) : []).map(r => ({
    id: String(r?.id || "").slice(0, 80),
    title: String(r?.title || "分析报告").slice(0, 120),
    scenario: String(r?.scenario || "").slice(0, 40),
    channel: String(r?.channel || "工作台对话").slice(0, 40),
    time: String(r?.time || "").slice(0, 40),
    tables: Array.isArray(r?.tables) ? r.tables.slice(0, 8).map(t => String(t).slice(0, 60)) : [],
    summary: String(r?.summary || "").slice(0, 500),
    model: String(r?.model || "").slice(0, 80),
    markdown: String(r?.markdown || "").slice(0, 120000),
    starred: !!r?.starred,
    sourceId: String(r?.sourceId || "").slice(0, 80)
  })).filter(r => r.id);
  const tmp = `${HISTORY_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ sessions, reports, updatedAt: new Date().toISOString() }, null, 2));
  fs.renameSync(tmp, HISTORY_FILE);
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
      "data-query": {
        label: "数据查询与指标解答",
        system: [
          "你是观星台数据平台的数据查询与指标解答助手。",
          "只基于提供的业务线范围、表字段和聚合统计回答；先说明引用表、字段、指标口径与时间范围。",
          "没有证据时明确标注证据限制，不能推测原因或数值。"
        ].join("\n")
      },
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
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
  });
  res.end(JSON.stringify(data));
}

function readBody(req, maxSize = 2e6) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => { raw += chunk; if (raw.length > maxSize) req.destroy(); });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (error) { reject(error); } });
  });
}

/**
 * 按模型调用 chat/completions：模型归属哪个供应商就走哪个供应商，多 Key 时按「上次成功的 Key」
 * 优先重试（401/403/404/模型不存在视为该 Key 不可用，换下一个）。
 * 返回 { ok, status, data, keyUsed }。
 */
async function relayChat(model, payload) {
  const route = routeForModel(model);
  if (!route) return { ok: false, status: 404, data: { error: `模型「${model}」没有对应的供应商：请到「模型配置 → 供应商配置」接入并勾选该模型` } };
  let lastResult = null;
  for (const target of route.targets) {
    const result = await providerChat(target, model, payload);
    lastResult = result;
    if (result.ok) {
      modelKeyCache.set(model, target.key);
      return result;
    }
    const failed = result.status === 401 || result.status === 403 || result.status === 404
      || (typeof result.data?.error?.message === "string" && /model names|does not exist|not found|invalid.*model/i.test(result.data.error.message));
    if (!failed) return result;
  }
  return lastResult;
}

/** 流式调用：成功时通过 onEvent({delta}) 逐段回调，返回 {ok, content, usage} 或 {ok:false, lastResult} */
async function relayChatStream(model, payload, onEvent) {
  // 模型归属哪个供应商就走哪个供应商；多 Key 时一个 Key 一个目标依次重试
  const route = routeForModel(model);
  const targets = route ? route.targets : [];
  let lastResult = route ? null : { status: 404, data: { error: `模型「${model}」没有对应的供应商：请到「模型配置 → 供应商配置」接入并勾选该模型` } };
  for (const target of targets) {
    let response;
    try {
      response = await fetch(target.url, {
        method: "POST",
        headers: target.headers,
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
    let lastTextAt = Date.now(), stalled = "";
    while (true) {
      // 看门狗：上游静默超时（20s 无任何数据）即中断，不无限等待拖死整个请求
      const readTicket = Promise.race([
        reader.read(),
        new Promise(resolve => setTimeout(() => resolve({ _timeout: true }), 20000))
      ]);
      const { done, value, _timeout } = await readTicket;
      if (_timeout) {
        stalled = "中转站静默超时（20s 无数据）";
        try { await reader.cancel(); } catch (cancelError) { /* 忽略 */ }
        break;
      }
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
          if (delta) { content += delta; lastTextAt = Date.now(); onEvent({ delta }); }
          const reasoning = obj.choices?.[0]?.delta?.reasoning_content || "";
          if (reasoning) { lastTextAt = Date.now(); onEvent({ reasoning }); }
        } catch { /* 忽略心跳等非 JSON 行 */ }
      }
      if (stalled) break;
      if (content && Date.now() - lastTextAt > 90000) {
        stalled = "中转站输出停滞（90s 无新内容）";
        try { await reader.cancel(); } catch (cancelError) { /* 忽略 */ }
        break;
      }
    }
    modelKeyCache.set(model, target.key);
    if (stalled) {
      // 已有部分内容：把已生成部分交还前端（中断信息随 meta 返回）；无内容则尝试下一个目标
      if (content) return { ok: true, content, usage, keyUsed: target.label, stalled };
      return { ok: false, lastResult: { status: 504, data: { error: stalled } }, stalled };
    }
    return { ok: true, content, usage, keyUsed: target.label, provider: route.providerName, providerId: route.providerId };
  }
  return { ok: false, lastResult };
}

/* ================= 路由 ================= */

async function handleRequest(req, res) {
  if (req.method === "OPTIONS") return sendJson(res, 204, {});
  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && url.pathname === "/v1/models") {
    // 所有模型都来自供应商记录（内置中转站也是其中一条）；某个供应商挂了不影响其他供应商的模型
    const { rows, notice } = await collectModels();
    const callable = rows.filter(row => row.callable);
    const usable = [...new Set(callable.map(row => row.id))];
    const modelConfig = loadModelConfig();
    const disabled = modelConfig.disabled || {};
    const capabilityOverrides = modelConfig.models || {};
    const enabledModels = usable.filter(id => !disabled[id]).sort();
    const defaultModel = enabledModels.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : enabledModels[0] || DEFAULT_MODEL;
    return sendJson(res, 200, {
      models: enabledModels,
      allModels: usable.sort().map(id => ({ id, enabled: !disabled[id], reason: disabled[id]?.reason || "", source: callable.find(row => row.id === id)?.source || "" })),
      // details 带上下文上限与思考档位：灵犀智析输入框按它渲染「深度」chip（不支持的模型不给选）
      details: enabledModels.map(id => {
        const capability = modelCapabilityFor(id, capabilityOverrides);
        return { id, contextLimit: capability.contextLimit, reasoning: capability.reasoning, capabilityConfigured: capability.configured };
      }),
      default: defaultModel,
      notice
    });
  }

  if (req.method === "GET" && url.pathname === "/v1/model-config") {
    const { rows, notice, providers, protocols, hiddenProviders } = await collectModels();
    return sendJson(res, 200, { models: rows, providers, protocols, hiddenProviders, notice });
  }

  /* ---------- 自配供应商：列表 / 新增 / 修改 / 删除 / 连通性测试 / 拉取模型 ---------- */

  if (req.method === "GET" && url.pathname === "/v1/providers") {
    return sendJson(res, 200, {
      providers: loadProviders().map(publicProvider),
      protocols: Object.entries(PROVIDER_PROTOCOLS).map(([id, meta]) => ({ id, ...meta })),
      authTypes: PROVIDER_AUTH_TYPES,
      authKeyDefaults: DEFAULT_AUTH_KEY_NAME
    });
  }

  if (req.method === "POST" && url.pathname === "/v1/providers") {
    const body = await readBody(req);
    const name = String(body.name || "").trim();
    const baseUrl = String(body.baseUrl || "").trim();
    if (!name) return sendJson(res, 400, { error: "供应商名称不能为空" });
    if (!baseUrl) return sendJson(res, 400, { error: "Base URL 不能为空" });
    if (!PROVIDER_PROTOCOLS[body.protocol]) return sendJson(res, 400, { error: "协议类型不支持" });
    const providers = loadProviders();
    if (providers.some(item => item.name === name)) return sendJson(res, 409, { error: `供应商「${name}」已存在` });
    const provider = normalizeProvider(body, { id: `prov-${crypto.randomBytes(4).toString("hex")}` });
    if (!provider.models.length) return sendJson(res, 400, { error: "至少填写一个模型 ID（可先用「拉取模型」获取）" });
    if (!provider.apiKeys.length && !isLocalBaseUrl(provider.baseUrl)) return sendJson(res, 400, { error: "请填写 API Key（本地地址可不填）" });
    providers.push(provider);
    saveProviders(providers);
    return sendJson(res, 200, { provider: publicProvider(provider) });
  }

  const providerMatch = url.pathname.match(/^\/v1\/providers\/([^/]+)$/);
  if (req.method === "PUT" && providerMatch) {
    const providerId = decodeURIComponent(providerMatch[1]);
    const providers = loadProviders();
    const index = providers.findIndex(item => item.id === providerId);
    if (index < 0) return sendJson(res, 404, { error: "供应商不存在" });
    const body = await readBody(req);
    const name = String(body.name ?? providers[index].name).trim();
    const baseUrl = String(body.baseUrl ?? providers[index].baseUrl).trim();
    if (!name) return sendJson(res, 400, { error: "供应商名称不能为空" });
    if (!baseUrl) return sendJson(res, 400, { error: "Base URL 不能为空" });
    if (providers.some(item => item.id !== providerId && item.name === name)) return sendJson(res, 409, { error: `供应商「${name}」已存在` });
    const updated = normalizeProvider(body, providers[index]);
    // 只有「保存供应商表单」这条路径必须带模型 ID；行内启停（PUT { enabled }）不该被模型清单为空卡住，
    // 否则迁移/拉取失败导致 models 为空的供应商连停用都点不动。
    if (!updated.models.length && body.models !== undefined) return sendJson(res, 400, { error: "至少填写一个模型 ID（可先用「拉取模型」获取）" });
    // API Key 同样是必填（本地地址除外）：只在「保存供应商表单」这条路径校验，行内启停不受影响
    if (!updated.apiKeys.length && !isLocalBaseUrl(updated.baseUrl)) return sendJson(res, 400, { error: "请填写 API Key（本地地址可不填）" });
    providers[index] = updated;
    saveProviders(providers);
    return sendJson(res, 200, { provider: publicProvider(updated) });
  }

  if (req.method === "DELETE" && providerMatch) {
    const providerId = decodeURIComponent(providerMatch[1]);
    const providers = loadProviders();
    const next = providers.filter(item => item.id !== providerId);
    if (next.length === providers.length) return sendJson(res, 404, { error: "供应商不存在" });
    saveProviders(next);
    return sendJson(res, 200, { removed: providerId, remaining: next.length });
  }

  if (req.method === "POST" && url.pathname === "/v1/providers/test") {
    const body = await readBody(req);
    const stored = body.id ? loadProviders().find(item => item.id === body.id) : null;
    const baseUrl = String(body.baseUrl ?? stored?.baseUrl ?? "").trim();
    if (!baseUrl) return sendJson(res, 400, { error: "缺少 Base URL" });
    // 未保存的表单直接测：Key 留空时沿用已保存的 Key（只写不读，前端也拿不到明文）
    const provider = normalizeProvider({ ...body, baseUrl }, stored || {});
    const result = await probeProvider(provider);
    // 已保存的供应商：把这次探测结果记为连通性健康状态，列表里直接能看到「正常 / 异常」
    if (stored) {
      const providers = loadProviders();
      const target = providers.find(item => item.id === stored.id);
      if (target) {
        target.health = { ok: result.ok, status: result.status, message: result.message, at: new Date().toISOString(), latencyMs: result.latencyMs };
        saveProviders(providers);
      }
    }
    return sendJson(res, 200, { ...result, providerId: stored?.id || "", protocolLabel: PROVIDER_PROTOCOLS[provider.protocol]?.label || provider.protocol });
  }

  const providerSplitMatch = url.pathname.match(/^\/v1\/providers\/([^/]+)\/split$/);
  if (req.method === "POST" && providerSplitMatch) {
    // 把一个多 Key 的供应商按 Key 拆成多条：每个 Key 拉自己的模型清单、有自己的名称与连通性
    const providerId = decodeURIComponent(providerSplitMatch[1]);
    const providers = loadProviders();
    const index = providers.findIndex(item => item.id === providerId);
    if (index < 0) return sendJson(res, 404, { error: "供应商不存在" });
    const provider = providers[index];
    const keys = providerKeys(provider).filter(Boolean);
    if (keys.length < 2) return sendJson(res, 400, { error: "该供应商只有 1 个 API Key，无需拆分" });
    const body = await readBody(req);
    const names = Array.isArray(body.names) ? body.names : [];
    const created = [];
    for (let i = 0; i < keys.length; i += 1) {
      const single = Object.assign({}, provider, {
        id: `prov-${crypto.randomBytes(4).toString("hex")}`,
        name: String(names[i] || "").trim() || `${provider.name} · ${i + 1}`,
        apiKeys: [keys[i]],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      const result = await probeProviderKey(single, keys[i]).catch(() => null);
      if (result?.ok) {
        single.models = filterUsableModels(result.models);
        single.health = { ok: true, status: 200, message: result.message, at: new Date().toISOString(), latencyMs: result.latencyMs };
      } else if (result) {
        single.models = [];
        single.health = { ok: false, status: result.status, message: result.message, at: new Date().toISOString(), latencyMs: result.latencyMs };
      } else {
        single.models = [];
      }
      created.push(single);
    }
    const taken = new Set(providers.filter(item => item.id !== providerId).map(item => item.name));
    created.forEach(item => {
      let name = item.name, n = 2;
      while (taken.has(name)) { name = `${item.name} (${n})`; n += 1; }
      taken.add(name);
      item.name = name;
    });
    providers.splice(index, 1, ...created);
    saveProviders(providers);
    return sendJson(res, 200, { split: created.length, removed: providerId, providers: created.map(publicProvider) });
  }

  const providerRefreshMatch = url.pathname.match(/^\/v1\/providers\/([^/]+)\/refresh$/);
  if (req.method === "POST" && providerRefreshMatch) {
    const providerId = decodeURIComponent(providerRefreshMatch[1]);
    const providers = loadProviders();
    const provider = providers.find(item => item.id === providerId);
    if (!provider) return sendJson(res, 404, { error: "供应商不存在" });
    const result = await probeProvider(provider);
    provider.health = { ok: result.ok, status: result.status, message: result.message, at: new Date().toISOString(), latencyMs: result.latencyMs };
    if (result.ok && result.models.length) {
      provider.models = filterUsableModels(result.models);
      provider.updatedAt = new Date().toISOString();
    }
    saveProviders(providers);
    return sendJson(res, 200, { ...result, provider: publicProvider(provider) });
  }

  if (req.method === "GET" && url.pathname === "/v1/skills") {
    return sendJson(res, 200, loadSkillRegistry().map(entry => {
      const manifest = skillManifest(entry.id) || {};
      return { ...manifest, ...entry, dir: undefined, tools: (manifest.tools || []).map(tool => tool.name) };
    }));
  }

  if (req.method === "POST" && url.pathname === "/v1/skills/upload") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const zipBuffer = Buffer.concat(chunks);
    if (!zipBuffer.length) return sendJson(res, 400, { error: "未收到文件内容" });
    const id = "skill-" + crypto.randomBytes(4).toString("hex");
    const zipPath = path.join(DATA_DIR, `upload-${id}.zip`);
    const dir = skillDir(id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(zipPath, zipBuffer);
    try {
      await new Promise((resolve, reject) => execFile("unzip", ["-o", zipPath, "-d", dir], { timeout: 20000 }, (error, stdout, stderr) => error ? reject(new Error(stderr || error.message)) : resolve()));
      /* 兼容 zip 带一层目录的情况：找到 skill.json 所在层级并上提 */
      let manifestPath = path.join(dir, "skill.json");
      if (!fs.existsSync(manifestPath)) {
        const found = (function walk(base) {
          for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
            const full = path.join(base, entry.name);
            if (entry.isDirectory()) {
              const candidate = path.join(full, "skill.json");
              if (fs.existsSync(candidate)) return full;
              const nested = walk(full);
              if (nested) return nested;
            }
          }
          return null;
        })(dir);
        if (!found) throw new Error("包内未找到 skill.json（需要 SKILL.md + skill.json 清单）");
        for (const entry of fs.readdirSync(found, { withFileTypes: true })) {
          fs.renameSync(path.join(found, entry.name), path.join(dir, entry.name));
        }
      }
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (!manifest.name) throw new Error("skill.json 缺少 name 字段");
      const registry = loadSkillRegistry();
      const entry = {
        id, name: String(manifest.name).slice(0, 60),
        source: String(manifest.source || id).slice(0, 80),
        version: String(manifest.version || "v1.0").slice(0, 20),
        scenarioKey: String(manifest.scenarioKey || "single").slice(0, 20),
        icon: String(manifest.icon || "✦").slice(0, 8),
        title: String(manifest.title || manifest.name).slice(0, 30),
        displayDesc: String(manifest.displayDesc || "").slice(0, 60),
        sort: Number(manifest.sort) || 50,
        enabled: manifest.enabled !== false,
        grayUsers: Array.isArray(manifest.grayUsers) ? manifest.grayUsers.slice(0, 50) : [],
        desc: String(manifest.desc || "").slice(0, 200),
        dir, installedAt: new Date().toISOString(), builtin: false
      };
      registry.push(entry);
      saveSkillRegistry(registry);
      fs.unlinkSync(zipPath);
      return sendJson(res, 200, { id, name: entry.name, tools: (manifest.tools || []).map(tool => tool.name || tool) });
    } catch (error) {
      fs.rmSync(dir, { recursive: true, force: true });
      try { fs.unlinkSync(zipPath); } catch {}
      return sendJson(res, 400, { error: `Skill 包无效：${error.message}` });
    }
  }

  const skillConfigMatch = url.pathname.match(/^\/v1\/skills\/([a-zA-Z0-9_-]+)\/config$/);
  if (req.method === "PUT" && skillConfigMatch) {
    const id = skillConfigMatch[1];
    const registry = loadSkillRegistry();
    const entry = registry.find(item => item.id === id);
    if (!entry) return sendJson(res, 404, { error: `Skill 不存在：${id}` });
    const body = await readBody(req);
    ["icon", "title", "desc", "displayDesc", "sort", "enabled", "prompt", "scenarioKey", "clarification", "assetScope", "responseContract"].forEach(key => {
      if (body[key] !== undefined) entry[key] = body[key];
    });
    if (Array.isArray(body.grayUsers)) entry.grayUsers = body.grayUsers.slice(0, 50);
    saveSkillRegistry(registry);
    return sendJson(res, 200, { id, saved: true });
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

  // 工作台历史：无登录共享一份，页面刷新后恢复（会话、消息、分析资产）
  if (req.method === "GET" && url.pathname === "/v1/history") {
    return sendJson(res, 200, loadHistory());
  }
  if (req.method === "PUT" && url.pathname === "/v1/history") {
    const body = await readBody(req, 30e6);
    if (!Array.isArray(body.sessions) || !Array.isArray(body.reports)) {
      return sendJson(res, 400, { error: "历史数据格式不正确" });
    }
    const existing = loadHistory();
    // 合并而非替换：多标签页各自保存时以 id 互不覆盖（旧标签页的旧状态不会清掉新标签页的记录）
    saveHistory(mergeHistory({ sessions: body.sessions, reports: body.reports }, existing));
    return sendJson(res, 200, { saved: true });
  }
  const historyReportMatch = url.pathname.match(/^\/v1\/history\/report\/(.+)$/);
  if (req.method === "DELETE" && historyReportMatch) {
    const reportId = decodeURIComponent(historyReportMatch[1]);
    const existing = loadHistory();
    const reports = existing.reports.filter(r => r.id !== reportId);
    saveHistory({ sessions: existing.sessions, reports });
    return sendJson(res, 200, { removed: reports.length !== existing.reports.length });
  }

  const modelConfigMatch = url.pathname.match(/^\/v1\/model-config\/(.+)$/);
  if (req.method === "PUT" && modelConfigMatch) {
    const modelId = decodeURIComponent(modelConfigMatch[1]);
    const config = loadModelConfig();
    config.disabled = config.disabled || {};
    config.models = config.models || {};
    const body = await readBody(req);
    // enabled 只在显式传入时改启停：能力覆盖（上下文 / 思考档位）也走这个接口，
    // 不能因为请求里没有 enabled 就把模型顺手停掉
    if (body.enabled !== undefined) {
      if (body.enabled) delete config.disabled[modelId];
      else config.disabled[modelId] = { reason: String(body.reason || "").slice(0, 200), disabledAt: new Date().toISOString() };
    }
    if (body.contextLimit !== undefined || body.reasoning !== undefined) {
      const current = config.models[modelId] && typeof config.models[modelId] === "object" ? config.models[modelId] : {};
      const next = { ...current };
      if (body.contextLimit !== undefined) next.contextLimit = normalizeContextLimit(body.contextLimit, contextLimitFor(modelId));
      if (body.reasoning !== undefined) next.reasoning = normalizeReasoning(body.reasoning, reasoningCapabilityFor(modelId));
      config.models[modelId] = next;
    }
    saveModelConfig(config);
    const capability = modelCapabilityFor(modelId, config.models);
    return sendJson(res, 200, {
      model: modelId,
      enabled: !config.disabled[modelId],
      contextLimit: capability.contextLimit,
      reasoning: capability.reasoning,
      capabilityConfigured: capability.configured
    });
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

  if (req.method === "GET" && url.pathname === "/v1/table-rows") {
    const name = url.searchParams.get("name") || "";
    const limit = Number(url.searchParams.get("limit") || 0);
    const table = tables.find(item => item.cnName === name);
    if (!table) return sendJson(res, 404, { error: `表不存在：${name}` });
    const rows = rowsOf(name);
    return sendJson(res, 200, {
      name, total: rows.length,
      fields: table.fields,
      rows: limit > 0 ? rows.slice(0, limit) : rows
    });
  }

  const tableRowsMatch = url.pathname.match(/^\/v1\/table-rows\/(.+)$/);
  if (req.method === "PUT" && tableRowsMatch) {
    const name = decodeURIComponent(tableRowsMatch[1]);
    if (!tables.some(item => item.cnName === name)) return sendJson(res, 404, { error: `表不存在：${name}` });
    const body = await readBody(req);
    if (!Array.isArray(body.rows)) return sendJson(res, 400, { error: "rows 必须是数组" });
    persistSampleRows(name, body.rows);
    return sendJson(res, 200, { name, total: body.rows.length, updatedAt: new Date().toISOString() });
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
    const { user = "曾祥竞", question = "", scenario = "data-query", tables: requestedTables = [], assetCandidates = [], businessLine = "", model = DEFAULT_MODEL, reasoningEffort = "", maxTokens = null, portalContext = [] } = body;
    if (!question.trim()) return sendJson(res, 400, { error: "问题不能为空" });

    const modelConfig = loadModelConfig();
    if (modelConfig.disabled?.[model]) {
      return sendJson(res, 403, { error: `模型「${model}」已被管理员禁用${modelConfig.disabled[model].reason ? `：${modelConfig.disabled[model].reason}` : ""}，请在右下角切换其他模型` });
    }

    const allowed = userTables(user);
    const wanted = requestedTables.length ? requestedTables.slice(0, 3) : [];
    const referenced = wanted.filter(name => allowed.includes(name));
    const denied = wanted.filter(name => !allowed.includes(name));
    const scopedCandidates = Array.isArray(assetCandidates) ? assetCandidates.slice(0, 12).filter(name => allowed.includes(name)) : [];
    if (wanted.length && !referenced.length) {
      return sendJson(res, 403, { error: `引用的数据表均未授权给当前用户（${user}），请检查「权限组 → 数据表权限」` });
    }
    if (businessLine && !referenced.length && !scopedCandidates.length) {
      return sendJson(res, 404, { error: `「${businessLine}」业务线下没有可用数据资产，请先在表管理中配置业务线或确认权限` });
    }

    /* Skill 运行时：优先按 skillId 执行注册表里的包（工具出证据 + SKILL.md 出编排），失败回退内置 */
    let buildEvidenceOverride = null;
    const registrySkill = body.skillId
      ? loadSkillRegistry().find(item => item.id === body.skillId && item.enabled !== false && (!item.grayUsers?.length || item.grayUsers.includes(user)))
      : null;
    let skill = null, scene = null, runtimeError = "";
    if (registrySkill) {
      const toolRun = await runSkillTool(registrySkill, "evidence", { tables: referenced.length ? referenced : scopedCandidates, question, businessLine });
      if (toolRun.ok && Array.isArray(toolRun.result.evidence)) {
        const instructions = skillInstructions(registrySkill.id);
        skill = { name: registrySkill.name, version: registrySkill.version };
        scene = { label: registrySkill.title || registrySkill.name, system: instructions || "你是观星台数据平台的数据分析助手，只基于证据回答，不编造数字。" };
        buildEvidenceOverride = toolRun.result.evidence;
      } else {
        runtimeError = toolRun.error || "工具执行失败";
      }
    }
    if (!skill) {
      const builtin = skills["warehouse-analyst"];
      skill = builtin;
      scene = builtin.scenarios[scenario] || builtin.scenarios.single;
    }
    const evidenceTables = referenced.length ? referenced : scopedCandidates;
    const evidence = buildEvidenceOverride || buildEvidence(evidenceTables, portalContext);
    const prompt = [
      `## 用户问题\n${question}`,
      `## 分析场景\n${scene.label}`,
      referenced.length ? `## 引用数据表\n${referenced.join("、")}` : scopedCandidates.length ? `## 业务线范围\n${businessLine || "已选择业务线"}；候选数据表：${scopedCandidates.join("、")}` : "## 引用数据表\n（未指定，以下为当前用户权限内全部表的概览，深度分析请引用具体表）",
      "## 门户配置说明\n表证据中的「枚举值」「字段备注」「标签配置」「维表数据样例」来自门户的表管理、字典管理、标签管理与维表管理配置，分析时优先据此解释编码取值与口径；与网关注释冲突时以门户配置为准。",
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
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      });
      const send = obj => res.write(`data: ${JSON.stringify(obj)}\n\n`);
      const heartbeat = setInterval(() => res.write(": hb\n\n"), 5000);
      send({ started: true, scenario: scene.label, model });
      const reasoningOptions = {};
      // 只在该模型声明支持的档位里透传 reasoning_effort：不支持的模型直接不带这个参数
      const modelReasoning = modelCapabilityFor(model).reasoning;
      if (REASONING_LEVELS.includes(reasoningEffort) && modelReasoning.levels.includes(reasoningEffort)) reasoningOptions.reasoning_effort = reasoningEffort;
      if (Number.isFinite(maxTokens) && maxTokens >= 256) reasoningOptions.max_completion_tokens = Math.floor(maxTokens);
      let result = await relayChatStream(model, { messages, ...reasoningOptions }, evt => {
        if (evt.delta) send({ delta: evt.delta });
        if (evt.reasoning) send({ reasoning: evt.reasoning });
      });
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
          usage: result.usage || null, requestId: crypto.randomUUID(),
          warning: result.stalled ? "上游中断，以上为已生成内容" : ""
        }
      });
      return res.end();
    }

    const reasoningOptions = {};
    const modelReasoning = modelCapabilityFor(model).reasoning;
    if (REASONING_LEVELS.includes(reasoningEffort) && modelReasoning.levels.includes(reasoningEffort)) reasoningOptions.reasoning_effort = reasoningEffort;
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
          model, skillRuntime: registrySkill ? ("package:" + registrySkill.id) : "builtin", skillFallback: runtimeError || "",
          reasoningEffort: hasReasoningOptions ? (reasoningOptions.reasoning_effort || "default") : "default",
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

  // 静态页面托管（与 API 同源）：入口与报告分享页由网关直接提供，
  // 并注入 PORTAL_GATEWAY_BASE="" 让前端用相对路径访问同一网关，域名部署时分享链接可直接打开。
  if (req.method === "GET" && !url.pathname.startsWith("/v1/")) {
    const pathname = "/" + decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const fileName = pathname === "/" ? "/index.html" : pathname;
    const filePath = path.resolve(PUBLIC_DIR, "." + fileName);
    const publicRoot = path.resolve(PUBLIC_DIR);
    if (filePath === publicRoot || filePath.startsWith(publicRoot + path.sep)) {
      let content = null;
      try { content = fs.readFileSync(filePath); } catch (error) { /* 不存在则走下方 404 */ }
      if (content) {
        if (filePath.endsWith("index.html") || filePath.endsWith("share.html")) {
          content = Buffer.from(content.toString("utf8").replace(/<\/head>/i, '<script>window.PORTAL_GATEWAY_BASE="";</script></head>'));
        }
        const ext = path.extname(filePath).toLowerCase();
        const types = {
          ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
          ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ico": "image/x-icon",
          ".json": "application/json; charset=utf-8", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2"
        };
        res.writeHead(200, {
          "Content-Type": types[ext] || "application/octet-stream",
          "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600"
        });
        return res.end(content);
      }
    }
  }

  sendJson(res, 404, { error: "not found" });
}

// 全局兜底：任何 handler 异常（如非法 JSON 请求体）只返回 400，不拖垮服务进程
const server = http.createServer((req, res) => {
  handleRequest(req, res).catch(error => {
    try {
      sendJson(res, 400, { error: `请求处理失败：${error && error.message ? error.message : "未知错误"}` });
    } catch (sendError) { /* 响应可能已发出，忽略 */ }
    if (error && error.message) console.error("网关请求处理异常：", error.message);
  });
});

loadSampleData();
installBuiltinPackages();
server.listen(PORT, () => console.log(`观星台分析网关已启动: http://localhost:${PORT}（数据目录 ${DATA_DIR}，skill 运行时已就绪）`));
// 首次启动把环境变量里的中转站迁移成普通供应商记录；之后一切都走「供应商配置」
ensureRelayProvider()
  .then(() => syncBuiltinRelayModels())
  .catch(error => console.warn("[providers] 内置中转站初始化失败：", error && error.message ? error.message : error));
