#!/usr/bin/env node
/**
 * 观星台分析网关
 *
 * 身份：除 POST /v1/auth/login 与 GET /v1/shares/:id 外，所有 /v1/ 接口需要 Authorization: Bearer <令牌>；
 *       管理类接口（供应商 / 模型配置 / 表数据 / 权限 / Skill 上传与配置）需要「门户管理员」角色。
 *
 * 接口：
 *  POST /v1/auth/login             — 账号密码登录，返回令牌（12 小时有效）；GET /v1/auth/me 查看当前身份
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
const { createAuth } = require("./gateway-auth.cjs");
const { checkNumericGrounding } = require("./numeric-check.cjs");
const { computeAttribution, parseWindowDays } = require("./attribution-calc.cjs");
const { createAnalysisToolkit } = require("./analysis-tools.cjs");
const { createUsageTracker } = require("./usage-quota.cjs");
const { createSemanticLayer } = require("./semantic-layer.cjs");
const { createFeedbackStore, RATINGS } = require("./feedback-store.cjs");
const { createOrgStore } = require("./org-store.cjs");
const { createAccountStore } = require("./account-store.cjs");
const equitySample = require("./equity-sample.cjs");
const skillPack = require("./skill-pack.cjs");
const reportSkill = require("./report-skill.cjs");
const planner = require("./planner.cjs");
const followups = require("./followups.cjs");
const { lightweightThinking } = require("./thinking-control.cjs");
const { createEvidenceLedger } = require("./evidence-ledger.cjs");

const RELAY_BASE_URL = process.env.RELAY_BASE_URL || "https://simindapi.modelgs.com";
const RELAY_API_KEYS = (process.env.RELAY_API_KEY || "").split(",").map(key => key.trim()).filter(Boolean);
const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(__dirname, "..");
const PERMISSIONS_FILE = path.join(DATA_DIR, "user-permissions.json");
const MODEL_CONFIG_FILE = path.join(DATA_DIR, "model-config.json");
const SHARES_FILE = path.join(DATA_DIR, "report-shares.json");
const HISTORY_FILE = path.join(DATA_DIR, "workbench-history.json");
const LEGACY_HISTORY_FILE = path.join(DATA_DIR, "workbench-history.legacy.json");
const SAMPLE_DATA_FILE = path.join(DATA_DIR, "sample-data.json");
/* 默认模型：管理员在界面设置的优先（model-config.json 的 defaultModel），其次环境变量 DEFAULT_MODEL，最后内置值；
   设置的模型不可用（被停用或供应商没有它）时自动退回到清单里的第一个可用模型 */
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "gpt-5.4-mini";
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
  },
  {
    cnName: equitySample.TABLE_NAME, table: "ads_equity_union_order_account_cost_stat_mv", database: "prod_equity", source: "StarRocks",
    desc: "权益投放账号维度消耗统计（异步物化视图）：同一份订单明细按订单首单日与消耗日两条时间轴分别聚合后合并，含消耗、漏斗、自营收入与三方佣金。当前为示例数据，结构与生产一致。", owner: "待确认（示例数据）",
    generator: () => equitySample.generate(TODAY),
    fields: equitySample.FIELDS,
    agg: { dateKey: "head_data_date", groupBy: ["department", "account_id"], metric: "cash_cost" },
    lineage: {
      upstream: [
        { table: "dws_equity_com_order_profit_detail_mv", role: "权益订单利润明细（订单侧）", join: "LEFT JOIN" },
        { table: "dim_equity_com_pay_channel_merchant_ratio_monthly", role: "月度支付渠道商户分成比例", join: "LEFT JOIN · 年月+渠道+商户" }
      ],
      downstream: []
    }
  }
];

const allTableNames = tables.map(table => table.cnName);

/* ================= 样本数据加载/生成（持久化到数据卷） ================= */

let sampleData = null;

function loadSampleData() {
  try {
    sampleData = JSON.parse(fs.readFileSync(SAMPLE_DATA_FILE, "utf8"));
    console.log(`已加载模拟数据（生成于 ${sampleData.generatedAt}）`);
    // 之后新增的表：旧的数据卷里没有它的数据，补生成并保存（已有的表不动）
    const missing = tables.filter(table => !sampleData.tables[table.cnName]);
    if (missing.length) {
      missing.forEach(table => { sampleData.tables[table.cnName] = table.generator(); console.log(`补充生成 ${table.cnName}: ${sampleData.tables[table.cnName].length} 行`); });
      const tmp = `${SAMPLE_DATA_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(sampleData));
      fs.renameSync(tmp, SAMPLE_DATA_FILE);
    }
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

/* 语义层：指标口径定义在 semantic/metrics.json（开发时在仓库根目录，镜像里与网关同级），启动时对照表结构校验 */
const SEMANTIC_FILE = process.env.SEMANTIC_FILE
  || [path.join(__dirname, "semantic", "metrics.json"), path.join(__dirname, "..", "semantic", "metrics.json")].find(file => fs.existsSync(file))
  || "";
let semanticCatalog = { tables: {}, metrics: [] };
try { if (SEMANTIC_FILE) semanticCatalog = JSON.parse(fs.readFileSync(SEMANTIC_FILE, "utf8")); } catch (error) { console.warn("[semantic] 指标定义读取失败：", error.message); }
const semanticLayer = createSemanticLayer({ catalog: semanticCatalog, tables, rowsOf });
semanticLayer.warnings.forEach(message => console.warn(`[semantic] ${message}`));

const ATTRIBUTION_SKILL_ID = "attribution-analyst";

/* 工具调用式取数：模型按需调用 search_tables 等工具，平台逐次做权限校验；步数与次数有上限 */
const TOOL_MAX_STEPS = 4;
const TOOL_MAX_CALLS = 8;
const AUDIT_FILE = path.join(DATA_DIR, "analysis-audit.jsonl");

/* 演示登录模式（PORTAL_DEMO_LOGIN_PASSWORD）：账号共用一个公开密码，所以
   - 不做「连续输错锁定」（否则任何人都能用脚本把演示账号反复锁死）；
   - 历史与用量按「账号~访客」分开记（访客 id 由浏览器随机生成并随请求头 X-Visitor-Id 发送），访客之间互不可见、各自计数；
   - 全站每日 token 总量兜底（默认 2000 万，可用 PORTAL_GLOBAL_DAILY_TOKEN_LIMIT 调整），避免公开账号被刷出高额费用。 */
// 空字符串（compose 的 ${VAR:-} 会传空值）按未设置处理；想明确不限制请设为 0
if (process.env.PORTAL_DEMO_LOGIN_PASSWORD && !process.env.PORTAL_GLOBAL_DAILY_TOKEN_LIMIT) process.env.PORTAL_GLOBAL_DAILY_TOKEN_LIMIT = "20000000";
const usageTracker = createUsageTracker({ dataDir: DATA_DIR });
const feedbackStore = createFeedbackStore({ dataDir: DATA_DIR });
const tokensOf = usage => Number(usage?.total_tokens) || ((Number(usage?.prompt_tokens) || 0) + (Number(usage?.completion_tokens) || 0));

/** 一次分析结束：累计 token 用量，并写一条审计（谁、问了什么、用了什么、花了多少、结果如何） */
function finishAnalysis({ user, scope = user, requestId, question, model, skillName, scenarioLabel, toolMode, toolCalls, tablesUsed, usage, extraTokens = 0, latencyMs, numericCheck, status, error = "", extra = {} }) {
  const tokens = tokensOf(usage) + extraTokens;
  usageTracker.recordTokens(scope, tokens);
  appendAuditEntry({
    type: "analysis", user, scope: scope !== user ? scope : undefined, requestId, status, error: error ? String(error).slice(0, 200) : undefined,
    question: String(question).slice(0, 300), model, skill: skillName, scenario: scenarioLabel,
    toolMode, toolCallCount: toolCalls.length, tablesUsed, tokens, latencyMs, ...extra,
    ungroundedNumbers: numericCheck ? numericCheck.ungrounded.length : null
  });
  return tokens;
}

function readAuditEntries() {
  try {
    return fs.readFileSync(AUDIT_FILE, "utf8").split("\n").filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

/** 只读审计日志的末尾（默认最近 4MB），日志变大后查询也不会变慢；返回按时间倒序的记录 */
function readAuditTail(maxBytes = 4 * 1024 * 1024) {
  let fd;
  try {
    fd = fs.openSync(AUDIT_FILE, "r");
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - maxBytes);
    const buffer = Buffer.alloc(size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    const lines = buffer.toString("utf8").split("\n");
    if (start > 0) lines.shift(); // 第一行可能被截断
    return lines.filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean).reverse();
  } catch { return []; } finally { if (fd !== undefined) fs.closeSync(fd); }
}

const AUDIT_MAX_BYTES = Number(process.env.AUDIT_MAX_BYTES) || 8 * 1024 * 1024;
const AUDIT_KEEP_ARCHIVES = 5;

/** 审计日志超过上限就换新文件，旧的按时间命名留档（只留最近几份），避免单个文件无限增长 */
function rotateAuditIfNeeded() {
  let size = 0;
  try { size = fs.statSync(AUDIT_FILE).size; } catch { return; }
  if (size < AUDIT_MAX_BYTES) return;
  const archive = AUDIT_FILE.replace(/\.jsonl$/, `.${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
  fs.renameSync(AUDIT_FILE, archive);
  const prefix = path.basename(AUDIT_FILE, ".jsonl") + ".";
  const archives = fs.readdirSync(DATA_DIR).filter(name => name.startsWith(prefix) && name.endsWith(".jsonl")).sort();
  archives.slice(0, Math.max(0, archives.length - AUDIT_KEEP_ARCHIVES)).forEach(name => { try { fs.unlinkSync(path.join(DATA_DIR, name)); } catch { /* 删除失败下次再试 */ } });
}

function appendAuditEntry(entry) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    rotateAuditIfNeeded();
    fs.appendFileSync(AUDIT_FILE, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
  } catch (error) {
    console.warn("[audit] 写入失败：", error.message);
  }
}

/** 只有 OpenAI 兼容协议的供应商会把 tools 原样转发；Anthropic 翻译层目前不支持，走原有证据方式 */
function providerSupportsTools(modelId) {
  const route = routeForModel(modelId);
  return Boolean(route) && !isAnthropicProtocol(route.provider.protocol);
}

async function runAnalysisToolLoop({ model, question, hints, toolkit, onToolEvent = () => {}, systemExtra = "", contextBlock = "", defaultTables = [], maxSteps = TOOL_MAX_STEPS, maxCalls = TOOL_MAX_CALLS, lightThinking = {}, lightFromStep = 1 }) {
  const messages = [
    { role: "system", content: `你是观星台数据分析助手。需要数据时调用工具：先用 search_tables 找表，用 get_schema 看口径。问业务指标（消耗、CPA、点击率、ROI 等）时优先用 list_metrics 与 query_metric，口径由平台统一定义；只有表里没有定义口径的数值字段才用 run_metric。问「为什么涨 / 跌 / 变了」时，先用 query_metric 确认总体变化，再用 attribute_change 定位原因（结构效应、效率效应与各组贡献由平台算好，直接解释）；问上下游、变更影响时用 get_lineage。问题里只要涉及具体数值（多少、是多少、几个、多高、怎么样、对比），必须先调用工具取数再回答，不能只凭口径说明或记忆作答；同一句话里既问数值又问概念（例如「一共多少、是去重的吗」），也要先取数，再顺带解释概念。只引用工具返回的数字；工具返回错误时如实说明，不要猜测。数据足够后停止调用工具。问题缺少关键信息（口径、时间范围、业务线、拆解维度）且无法从数据推断时，调用 ask_user 提问，不要猜测。${systemExtra ? `\n\n${systemExtra}` : ""}` },
    { role: "user", content: `${contextBlock ? `${contextBlock}\n\n` : ""}## 用户问题\n${question}\n## 提示\n${hints.length ? `用户指定的数据表：${hints.join("、")}` : defaultTables.length ? `本 Skill 默认使用的数据表：${defaultTables.join("、")}，无需再搜索，直接用 list_metrics / query_metric 取数。` : "用户未指定数据表，请先搜索候选表。"}` }
  ];
  const evidence = [];
  let calls = 0, steps = 0, tokens = 0;
  while (steps < maxSteps) {
    steps += 1;
    let result = await relayChat(model, { messages, tools: toolkit.schemas, tool_choice: "auto", ...(steps >= lightFromStep ? lightThinking : {}) });
    // 上游不认识「关闭思考」的参数：去掉重试一次，之后的步骤也不再带
    if (!result.ok && steps >= lightFromStep && Object.keys(lightThinking).length) { tokens += tokensOf(result.data?.usage); lightThinking = {}; result = await relayChat(model, { messages, tools: toolkit.schemas, tool_choice: "auto" }); }
    tokens += tokensOf(result.data?.usage);
    if (!result.ok) return { used: false, reason: `工具调用不可用（${result.status}）`, tokens };
    const message = result.data?.choices?.[0]?.message;
    const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
    if (!toolCalls.length) break;
    messages.push({ role: "assistant", content: message.content || "", tool_calls: toolCalls });
    for (const call of toolCalls) {
      const name = call.function?.name || "";
      if (calls >= maxCalls) {
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: false, error: "工具调用次数已达上限" }) });
        continue;
      }
      calls += 1;
      const outcome = toolkit.execute(name, call.function?.arguments || "");
      evidence.push({ 工具: name, 参数: call.function?.arguments || "", 结果: outcome.ok ? outcome.data : { 错误: outcome.error } });
      let table = "";
      try { table = String(JSON.parse(call.function?.arguments || "{}").table || ""); } catch { /* 参数非法时不显示表名 */ }
      onToolEvent({ name, table, ok: outcome.ok, error: outcome.ok ? "" : outcome.error });
      // 模型选择向用户提问：本轮分析到此暂停，由调用方把问题卡片交给界面（不再调用最终回答）
      if (name === "ask_user" && outcome.ok) return { used: true, ask: outcome.data.payload, evidence, calls, steps, tokens, reason: "" };
      messages.push({ role: "tool", tool_call_id: call.id, content: outcome.content });
    }
  }
  return { used: evidence.length > 0, evidence, calls, steps, tokens, reason: evidence.length ? "" : "模型未调用工具" };
}

/* 指标异动归因：维度贡献由代码确定性计算（attribution-calc.cjs），写入每张表的证据「归因计算」，模型只负责解释 */
function attachAttribution(evidence, tableNames, question = "") {
  const days = parseWindowDays(question);
  const targets = tableNames.map(name => tables.find(table => table.cnName === name)).filter(Boolean).slice(0, 3);
  if (!targets.length) {
    evidence.push({ 归因计算: { available: false, reason: "所选数据表不在门户表目录中，无法归因" } });
    return;
  }
  targets.forEach(table => {
    const agg = table.agg || {};
    const result = computeAttribution(rowsOf(table.cnName), {
      dateKey: agg.dateKey || "",
      metric: agg.metric || "",
      dimensions: (agg.groupBy || []).filter(Boolean),
      activateKey: "activate_cnt",
      days
    });
    let item = evidence.find(entry => entry.表名 === table.cnName);
    if (!item) {
      item = { 表名: table.cnName };
      evidence.push(item);
    }
    item.归因计算 = result;
  });
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
  { name: "投放组长", tables: ["广告计划日报表", "广告账户日报", "广告组转化日报", "媒体消耗汇总", "产品 ROI 日报", equitySample.TABLE_NAME] },
  { name: "优化师", tables: ["广告计划日报表", "广告账户日报", equitySample.TABLE_NAME] },
  { name: "数据分析师", tables: ["广告计划日报表", "用户画像标签明细表", "用户订单明细", "用户生命周期日报", "渠道归因明细", equitySample.TABLE_NAME] },
  { name: "只读访客", tables: [] }
];

const users = [
  { name: "曾祥竞", group: "门户管理员" },
  { name: "黄佩贤", group: "门户管理员" },
  { name: "林金维", group: "投放组长" },
  { name: "谭嘉颖", group: "优化师" },
  { name: "李雨航", group: "数据分析师" }
];

/* 身份：账号密码登录，令牌由服务端签发；角色由权限组决定（门户管理员 = 管理员），不信任请求体里的任何用户名 */
/* 组与账号分组：管理员在界面保存后以 org.json 为准，之前使用上面的默认值 */
/* 账号列表：可新增 / 停用，保存在 accounts.json；上面的 users 只是首次启动时的默认账号 */
const accountStore = createAccountStore({ dataDir: DATA_DIR, defaults: users.map(item => item.name) });
const generatePassword = () => crypto.randomBytes(9).toString("base64url");
const orgStore = createOrgStore({
  dataDir: DATA_DIR,
  defaultGroups: permissionGroups,
  defaultUserGroups: Object.fromEntries(users.map(item => [item.name, item.group])),
  accounts: () => accountStore.names(),
  isActive: name => accountStore.isActive(name),
  tableNames: allTableNames
});
const auth = createAuth(DATA_DIR);
const DEMO_LOGIN_PASSWORD = String(process.env.PORTAL_DEMO_LOGIN_PASSWORD || "");
function roleOf(name) {
  return accountStore.isActive(name) && orgStore.isAdmin(name) ? "admin" : "user";
}

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
        const anchorDay = rows.map(r => String(r[dateKey]).slice(0, 10)).sort().pop();
        const mk = back => { const d = new Date(anchorDay + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - back); return d.toISOString().slice(0, 10); };
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

/* Skill 规范包（随代码发布的业务知识：核心规则 + 术语表 + 拦截规则 + 参考资料），开发时在仓库根目录，镜像里与网关同级 */
const SKILL_PACKS_DIR = [path.join(__dirname, "skill-packs"), path.join(__dirname, "..", "skill-packs")].find(dir => fs.existsSync(dir)) || path.join(__dirname, "skill-packs");
const skillPacks = skillPack.loadPacks(SKILL_PACKS_DIR);
/* 证据账本：每次分析取到的事实，报告 Skill 按需使用（只有产生它的账号能读） */
const evidenceLedger = createEvidenceLedger({ dir: path.join(DATA_DIR, "evidence") });

/** 规范包落盘并登记到注册表：展示信息以代码为准，启停与灰度名单保留后台配置；并把路由关键词补进「通用分析」 */
function installSkillPacks(registry) {
  const writeIfChanged = (file, content) => {
    try {
      if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === content) return;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    } catch (error) { console.warn(`[skills] 写入失败 ${file}：${error.message}`); }
  };
  for (const pack of skillPacks.values()) {
    const { spec, router, ...manifest } = pack.manifest;
    const dir = skillDir(pack.id);
    writeIfChanged(path.join(dir, "skill.json"), JSON.stringify(manifest, null, 2));
    writeIfChanged(path.join(dir, "SKILL.md"), pack.instructions);
    const display = {
      name: manifest.name, source: manifest.source, version: manifest.version, scenarioKey: manifest.scenarioKey, icon: manifest.icon, title: manifest.title,
      displayDesc: manifest.displayDesc, desc: manifest.desc, sort: manifest.sort, clarification: manifest.clarification, assetScope: manifest.assetScope,
      responseContract: manifest.responseContract, pack: true, builtin: true, dir, kind: manifest.kind
    };
    const existing = registry.find(item => item.id === pack.id);
    if (existing) Object.assign(existing, display);
    else registry.push({ id: pack.id, ...display, enabled: true, grayUsers: [], installedAt: new Date().toISOString() });
  }
}

function ensurePackRoutes(registry) {
  const routerEntry = registry.find(item => item.id === ROUTER_SKILL_ID);
  if (!routerEntry) return;
  routerEntry.routes = Array.isArray(routerEntry.routes) ? routerEntry.routes : [];
  for (const pack of skillPacks.values()) {
    const keywords = pack.manifest.router?.keywords;
    if (!Array.isArray(keywords) || !keywords.length) continue;
    const existingRoute = routerEntry.routes.find(route => route.skillId === pack.id);
    if (!existingRoute) routerEntry.routes.unshift({ skillId: pack.id, keywords, priority: 10 });
    else if (existingRoute.priority === undefined) existingRoute.priority = 10;
  }
}

/* 通用分析（路由型）：自身不执行工具，按问题关键词在「用户可用」的技能中自动转交；路由规则与兜底技能在「Skill 配置」里维护 */
const ROUTER_SKILL_ID = "general-analyst";
const ROUTER_SKILL_DEFAULTS = {
  id: ROUTER_SKILL_ID, name: "通用分析 Skill", source: "router", version: "v1.0-portal", kind: "router", scenarioKey: "general", icon: "✦",
  title: "通用分析", displayDesc: "自动选择最合适的分析技能", desc: "根据问题内容与你可用的分析技能，自动转交给最合适的一个；未命中关键词时使用兜底技能。",
  sort: 5, enabled: true, grayUsers: [], builtin: true, fallbackSkillId: "warehouse-analyst",
  routes: [
    { skillId: "lineage-analyst", keywords: ["血缘", "上游", "下游", "依赖", "影响面", "变更影响"] },
    { skillId: "attribution-analyst", keywords: ["异动", "归因", "环比", "波动", "为什么", "诊断", "下降", "上涨"] },
    { skillId: "asset-qa", keywords: ["有哪些表", "哪张表", "负责人", "资产", "口径是什么", "字段含义"] },
    { skillId: "warehouse-analyst", keywords: ["多少", "汇总", "趋势", "明细", "消耗", "CPA", "ROI", "查询"] }
  ]
};
function ensureRouterSkill(registry) {
  const existing = registry.find(item => item.id === ROUTER_SKILL_ID);
  if (!existing) {
    registry.push({ ...ROUTER_SKILL_DEFAULTS, dir: skillDir(ROUTER_SKILL_ID), installedAt: new Date().toISOString() });
    return;
  }
  /* 展示信息由代码定义覆盖；开关、路由规则与兜底技能保留后台配置 */
  Object.assign(existing, {
    name: ROUTER_SKILL_DEFAULTS.name, kind: "router", scenarioKey: ROUTER_SKILL_DEFAULTS.scenarioKey, icon: ROUTER_SKILL_DEFAULTS.icon,
    title: ROUTER_SKILL_DEFAULTS.title, displayDesc: ROUTER_SKILL_DEFAULTS.displayDesc, desc: ROUTER_SKILL_DEFAULTS.desc, sort: ROUTER_SKILL_DEFAULTS.sort, builtin: true,
    fallbackSkillId: existing.fallbackSkillId || ROUTER_SKILL_DEFAULTS.fallbackSkillId,
    routes: Array.isArray(existing.routes) && existing.routes.length ? existing.routes : ROUTER_SKILL_DEFAULTS.routes
  });
}
/* 规范化后台提交的路由规则 */
function sanitizeRoutes(list) {
  return list.slice(0, 20).map(route => ({
    skillId: String(route?.skillId || "").slice(0, 60),
    keywords: (Array.isArray(route?.keywords) ? route.keywords : []).map(item => String(item).trim()).filter(Boolean).slice(0, 30),
    ...(Number.isFinite(Number(route?.priority)) && Number(route.priority) > 0 ? { priority: Math.min(10, Math.floor(Number(route.priority))) } : {})
  })).filter(route => route.skillId);
}
/* 自动选择：只在该用户可用的技能（已上线 + 灰度名单）中挑选；命中关键词最多者胜出，未命中用兜底 */
function pickAutoSkill(router, user, question, stickySkillId = "") {
  const registry = loadSkillRegistry();
  const usable = id => registry.find(item => item.id === id && item.kind !== "router" && item.enabled !== false && (!item.grayUsers?.length || item.grayUsers.includes(user))) || null;
  const text = String(question || "").toLowerCase();
  let best = null;
  for (const route of router.routes || []) {
    const entry = usable(route.skillId);
    if (!entry) continue;
    const hits = (route.keywords || []).filter(keyword => keyword && text.includes(String(keyword).toLowerCase()));
    // 业务专属技能（priority 更高）的关键词命中优先于通用技能的多个命中；同优先级再比命中数
    const priority = Number(route.priority) || 0;
    if (hits.length && (!best || priority > best.priority || (priority === best.priority && hits.length > best.hits.length))) best = { entry, hits, priority };
  }
  if (best) return { skill: best.entry, reason: `命中关键词「${best.hits.join("、")}」` };
  // 追问（「那昨天呢」）里通常没有关键词：沿用上一轮的技能，而不是掉回兜底
  const sticky = stickySkillId ? usable(stickySkillId) : null;
  if (sticky) return { skill: sticky, reason: "沿用上一轮的技能" };
  const fallback = usable(router.fallbackSkillId) || (router.routes || []).map(route => usable(route.skillId)).find(Boolean) || null;
  return { skill: fallback, reason: "未命中关键词，使用兜底技能" };
}

/** 该用户可用的业务技能（排除「通用分析」路由和输出类技能），带上规范包里写的适用 / 不适用，供规划与界面「换一个」使用 */
function usableDomainSkills(user) {
  return loadSkillRegistry()
    .filter(item => item.kind !== "router" && item.kind !== "output" && item.id !== "numa-warehouse" && item.enabled !== false && (!item.grayUsers?.length || item.grayUsers.includes(user)))
    .map(item => ({ ...item, useWhen: skillPacks.get(item.id)?.spec.useWhen, notFor: skillPacks.get(item.id)?.spec.notFor }));
}

const PLANNER_TIMEOUT_MS = 20000;
/* 报告是把已有事实排版成文，不需要深度推理（推理 token 常占一半以上耗时）：默认压低 / 关闭模型思考；PORTAL_REPORT_THINKING=on 可恢复默认 */
const REPORT_LIGHT_THINKING = process.env.PORTAL_REPORT_THINKING !== "on";
/* 取数循环（选工具、取数）的后续步骤不需要深度推理：每一步都思考会让一次提问多花几十秒。
   PORTAL_LOOP_THINKING：after-first（默认：第一步保留思考、决定怎么查之后的步骤关闭）/ on（每一步都保留思考，即原来的行为）/ off（每一步都关闭，
   线上评测里会让「该不该先取数、两种口径都查」这类指令遵循略有下降，不建议）。请求里可用 loopThinking 覆盖，评测用 */
const LOOP_THINKING_MODES = ["on", "after-first", "off"];
const LOOP_THINKING_DEFAULT = LOOP_THINKING_MODES.includes(process.env.PORTAL_LOOP_THINKING) ? process.env.PORTAL_LOOP_THINKING : "after-first";
const PLANNER_MODEL = process.env.PORTAL_PLANNER_MODEL || "";

/** 关键词拿不准（落到兜底）时，用一次便宜的模型调用判断技能与输出形式；失败、超时或不够确定都返回 null，调用方保留原来的结果 */
async function planWithModel({ question, domainSkills, conversationTurns, requestedModel }) {
  const { rows } = await collectModels();
  const callable = rows.filter(row => row.callable && row.enabled).map(row => row.id);
  const first = planner.pickPlannerModel({ requested: requestedModel, preferred: PLANNER_MODEL, callable });
  const candidates = [...new Set([first, requestedModel])];
  const described = planner.describeSkills(domainSkills);
  const prompt = planner.buildPlannerPrompt({ question, skills: described, conversation: conversationTurns.slice(-2) });
  let tokens = 0;
  const attempts = []; // 每次尝试的模型、耗时与结果，写进 plan.diagnostics，方便运维看判断为什么没被采用
  for (const model of candidates) {
    const startedAt = Date.now();
    let result;
    try {
      result = await Promise.race([
        relayChat(model, { messages: [{ role: "user", content: prompt }] }),
        new Promise(resolve => setTimeout(() => resolve({ ok: false, status: 0, timeout: true }), PLANNER_TIMEOUT_MS))
      ]);
    } catch (error) { attempts.push({ model, ms: Date.now() - startedAt, outcome: `异常：${error.message}`.slice(0, 80) }); continue; }
    tokens += tokensOf(result.data?.usage);
    if (!result.ok) { attempts.push({ model, ms: Date.now() - startedAt, outcome: result.timeout ? "超时" : `调用失败（${result.status}）` }); continue; }
    const reply = result.data?.choices?.[0]?.message?.content || "";
    const plan = planner.parsePlannerReply(reply, described.map(item => item.id));
    if (planner.acceptPlan(plan)) return { ...plan, model, tokens, attempts: [...attempts, { model, ms: Date.now() - startedAt, outcome: "采用" }] };
    attempts.push({ model, ms: Date.now() - startedAt, outcome: plan ? `未采用（${plan.skillId || "无技能"}，置信度 ${plan.confidence}）` : `回复无法解析：${String(reply).slice(0, 40)}` });
    return { rejected: true, tokens, attempts };
  }
  return { rejected: true, tokens, attempts };
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
          { key: "granularity", label: "汇总粒度", question: "结果按什么粒度汇总？", hint: "决定输出结果的分组维度，可同时选多个。", multiple: true, options: ["按天", "按周", "按渠道", "按计划", "不汇总"] }
        ]
      }, assetScope: "按业务线检索已授权的表与字段", responseContract: ["引用表和字段", "指标口径与时间范围", "证据限制"],
      instructions: "你是观星台数据平台的数据查询与指标解答助手。未指定数据表时，先依据业务线范围检索用户有权限的表和字段。\n规则：\n1. 只基于提供的聚合统计、明细样例和字段注释分析，所有数字必须来自证据，不编造。\n2. 引用字段时用反引号；结论必须说明引用表、指标口径与时间范围。\n3. 样本明细有限时，基于聚合统计下结论，并标注「基于聚合口径」。\n4. 先用一两句话直接回答，再用必要的表格给出关键数据；引用表、指标口径、时间范围用一行说明，证据不足的地方说明限制。不要写成报告，也不要用「#」标题分章节。" },
    { id: "lineage-analyst", name: "数据血缘与变更影响 Skill", source: "maxcompute-warehouse-analyst", version: "v1.3-portal", scenarioKey: "lineage", icon: "🔗", title: "数据血缘与变更影响", displayDesc: "上下游依赖与影响面", sort: 20,
      clarification: { enabled: false, question: "", options: [] }, assetScope: "引用表、字段与下游依赖", responseContract: ["直接影响", "间接影响", "待核对项"],
      instructions: "你是观星台数据平台的血缘分析助手。\n基于提供的表上下游血缘证据回答：先一句话说明上下游关系和最大的影响面，再按需用短列表列出上游表、下游影响面和变更风险；不要写成报告。\n只把明确给出的血缘写成确定关系；证据不足时标注「待核对，非确定引用」。" },
    { id: "asset-qa", name: "数据资产问答 Skill", source: "asset-qa", version: "v1.0-portal", scenarioKey: "asset", icon: "📚", title: "数据资产问答", displayDesc: "有哪些表、口径、负责人", sort: 30,
      clarification: { enabled: false, question: "", options: [] }, assetScope: "全部已授权数据资产", responseContract: ["推荐表", "关键字段", "负责人"],
      instructions: "你是观星台数据平台的资产问答助手。\n基于提供的表资产清单回答用户问题，输出：相关表清单、各表口径说明、负责人、推荐用法。\n只推荐清单内的表；清单外的可能性标注「权限外，未纳入」。" },
    { id: "attribution-analyst", name: "指标异动诊断 Skill", source: "attribution-analyst", version: "v0.7-portal", scenarioKey: "attribution", icon: "🎯", title: "指标异动诊断", displayDesc: "指标异动拆解与定位", sort: 40,
      clarification: { enabled: false, question: "", options: [] }, assetScope: "引用指标表与可拆解维度", responseContract: ["异动幅度", "维度贡献", "证据限制"],
      instructions: "你是观星台数据平台的归因分析助手。\n证据中的「归因计算」由代码按确定性公式算出：加法指标（如消耗）按维度给出分组贡献；CPA 拆成结构效应、效率效应与无激活花费三部分，三者之和等于总变化。你的任务是解释这些结果，不是重新计算。\n1. 先给出整体结论（总变化与幅度）；2. 按「归因计算」里的维度列出贡献最大的组（Markdown 表格，数字原样引用，不得重算或改写）；3. 解释原因：结构效应表示激活占比（投放结构）的变化，效率效应表示单个分组 CPA 的变化；区分有证据支撑的结论与需要业务确认的假设；4. 给出建议。\n所有数字必须来自证据，不编造。「归因计算」中 reconciled 为 false 的维度不要使用。" }
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
  /* 工具脚本是代码、不是配置：每次启动都以代码里的版本为准（内容不同才重写）。
     不依赖版本号变化，这样更新脚本不会重置管理员在界面里改过的 Skill 配置（升级内置包时会覆盖追问等配置）。 */
  const writeToolIfChanged = (file, source) => {
    try {
      if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === source) return;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, source);
    } catch (error) { console.warn(`[skills] 工具脚本更新失败 ${file}：${error.message}`); }
  };
  defs.forEach(def => writeToolIfChanged(path.join(skillDir(def.id), "tools", "evidence.cjs"), EVIDENCE_TOOL_SOURCE));
  // 各技能的 SKILL.md（提示词）同样以代码为准、每次启动对齐；只改文件，不动后台里配置过的追问 / 启停 / 灰度
  defs.forEach(def => writeToolIfChanged(path.join(skillDir(def.id), "SKILL.md"), def.instructions));
  writeToolIfChanged(path.join(skillDir(warehouseDef.id), "SKILL.md"), warehouseDef.instructions);
  writeToolIfChanged(path.join(skillDir(warehouseDef.id), "tools", "warehouse-evidence.cjs"), WAREHOUSE_EVIDENCE_TOOL);
  installSkillPacks(registry);
  ensureRouterSkill(registry);
  ensurePackRoutes(registry);
  saveSkillRegistry(registry);
}

/* 执行 skill 工具：stdin 传参，stdout 出 JSON */
function runSkillTool(registryEntry, toolName, args) {
  return new Promise(resolve => {
    /* 只有随网关代码发布的内置包可以执行工具；上传包不论 skill.json 写什么都不执行（不再允许任意 cmd） */
    if (registryEntry.builtin !== true) return resolve({ ok: false, error: "未经审核的 Skill 不执行工具" });
    const dir = skillDir(registryEntry.id);
    const manifest = skillManifest(registryEntry.id);
    const tool = (manifest?.tools || []).find(item => item.name === toolName) || (manifest?.tools || [])[0];
    if (!tool || !tool.cmd) return resolve({ ok: false, error: "该 Skill 未声明可用工具" });
    /* 命令白名单：只接受 `node tools/<文件>.cjs`，脚本必须在技能目录的 tools 下；不经过 shell */
    const match = String(tool.cmd).match(/^node (tools\/[A-Za-z0-9_.-]+\.cjs)$/);
    const scriptPath = match ? path.join(dir, match[1]) : "";
    if (!match || !scriptPath.startsWith(path.join(dir, "tools") + path.sep)) return resolve({ ok: false, error: "工具命令不在白名单内" });
    const timeoutMs = Math.min(Number(tool.timeoutMs || 20000), 60000);
    let stdout = "", stderr = "";
    const child = spawn(process.execPath, [scriptPath], {
      cwd: dir,
      /* 工具进程不继承网关的密钥环境变量，只带必要变量 */
      env: { PATH: process.env.PATH || "", GATEWAY_DATA_DIR: DATA_DIR },
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
  "anthropic": { label: "Anthropic 原生", callable: true },
  "anthropic-compatible": { label: "Anthropic 兼容中转", callable: true },
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

/** Anthropic 系协议：走 Messages API（/v1/messages），请求/响应都要翻译 */
const ANTHROPIC_PROTOCOLS = new Set(["anthropic", "anthropic-compatible"]);
function isAnthropicProtocol(protocol) { return ANTHROPIC_PROTOCOLS.has(String(protocol || "")); }

function anthropicBaseUrl(baseUrl) {
  return String(baseUrl || "").trim().replace(/\/+$/, "").replace(/\/v1$/, "");
}

function providerChatTarget(provider, model, key = "") {
  if (isAnthropicProtocol(provider.protocol)) {
    return { key, protocol: provider.protocol, url: withAuthQuery(joinBase(anthropicBaseUrl(provider.baseUrl), "/v1/messages"), provider, key), headers: providerHeaders(provider, key) };
  }
  const endpoint = provider.protocol === "azure-openai"
    ? `${joinBase(provider.baseUrl, "")}/openai/deployments/${encodeURIComponent(model)}/chat/completions?api-version=${encodeURIComponent(provider.apiVersion || "2024-10-21")}`
    : joinBase(provider.baseUrl, "/chat/completions");
  return { key, protocol: provider.protocol, url: withAuthQuery(endpoint, provider, key), headers: providerHeaders(provider, key) };
}

/** OpenAI 形状请求体 → Anthropic Messages API 形状：system 要提到顶层，max_tokens 必填 */
function anthropicRequestBody(model, payload = {}) {
  const source = Array.isArray(payload.messages) ? payload.messages : [];
  const systemParts = [];
  const messages = [];
  source.forEach(item => {
    const content = typeof item?.content === "string"
      ? item.content
      : Array.isArray(item?.content) ? item.content.map(part => (typeof part === "string" ? part : part?.text || "")).join("") : "";
    if (!content) return;
    if (item.role === "system" || item.role === "developer") { systemParts.push(content); return; }
    messages.push({ role: item.role === "assistant" ? "assistant" : "user", content });
  });
  const body = {
    model,
    messages: messages.length ? messages : [{ role: "user", content: "（空请求）" }],
    max_tokens: Math.max(256, Math.floor(payload.max_completion_tokens || payload.max_tokens || 4096))
  };
  if (systemParts.length) body.system = systemParts.join("\n\n");
  if (Number.isFinite(payload.temperature)) body.temperature = payload.temperature;
  if (payload.stream) body.stream = true;
  return body;
}

/** Anthropic Messages 响应 → OpenAI 形状：消费方读 choices[0].message.content 与 usage */
function anthropicToOpenAI(data) {
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const text = blocks.filter(block => block?.type === "text").map(block => String(block.text || "")).join("");
  const thinking = blocks.filter(block => block?.type === "thinking").map(block => String(block.thinking || "")).join("");
  const usage = data?.usage
    ? { prompt_tokens: data.usage.input_tokens ?? null, completion_tokens: data.usage.output_tokens ?? null, total_tokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0) }
    : null;
  return {
    ...data,
    choices: [{ index: 0, message: { role: "assistant", content: text, ...(thinking ? { reasoning_content: thinking } : {}) }, finish_reason: data?.stop_reason || "stop" }],
    usage
  };
}

function providerModelsUrl(provider, key = "") {
  const base = String(provider.baseUrl || "").trim().replace(/\/+$/, "");
  if (provider.protocol === "gemini") return withAuthQuery(joinBase(base.replace(/\/v1beta$/, ""), "/v1beta/models"), provider, key);
  if (isAnthropicProtocol(provider.protocol)) return withAuthQuery(joinBase(anthropicBaseUrl(base), "/v1/models?limit=1000"), provider, key);
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
  const anthropic = isAnthropicProtocol(target.protocol);
  const body = anthropic ? anthropicRequestBody(model, payload) : { model, ...payload };
  try {
    const response = await fetch(target.url, { method: "POST", headers: target.headers, body: JSON.stringify(body) });
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 400) }; }
    if (anthropic && response.ok) data = anthropicToOpenAI(data);
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

/* 工作台历史按登录账号隔离：文件结构 { users: { <账号>: { sessions, reports } } }。
   旧版是全站共享的一份（没有账号维度），无法判断归属，首次读取时改名为 .legacy.json 保留，不再对外提供。 */
function readHistoryStore() {
  let data = null;
  try { data = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); } catch { return { users: {} }; }
  if (data && data.users && typeof data.users === "object") return data;
  if (Array.isArray(data?.sessions) || Array.isArray(data?.reports)) {
    try { fs.renameSync(HISTORY_FILE, LEGACY_HISTORY_FILE); } catch { /* 改名失败时下次再尝试 */ }
  }
  return { users: {} };
}

function loadHistory(userName) {
  const box = readHistoryStore().users[userName] || {};
  return { sessions: Array.isArray(box.sessions) ? box.sessions.slice(0, 80) : [], reports: Array.isArray(box.reports) ? box.reports.slice(0, 120) : [] };
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
    requestId: String(msg?.requestId || "").slice(0, 80),
    feedback: RATINGS.includes(msg?.feedback) ? msg.feedback : "",
    leadMsg: String(msg?.leadMsg || "").slice(0, 300),
    suggestions: (Array.isArray(msg?.suggestions) ? msg.suggestions : []).slice(0, 3).map(item => String(item?.text ?? item ?? "").slice(0, 60)).filter(Boolean),
    skillId: /^[A-Za-z0-9_-]{1,60}$/.test(String(msg?.skillId || "")) ? String(msg.skillId) : "",
    terms: (Array.isArray(msg?.terms) ? msg.terms : []).slice(0, 6).map(term => String(term).slice(0, 20)),
    plan: msg?.plan && typeof msg.plan === "object" ? {
      skillId: String(msg.plan.skillId || "").slice(0, 60), skillName: String(msg.plan.skillName || "").slice(0, 40), source: String(msg.plan.source || "").slice(0, 12),
      reason: String(msg.plan.reason || "").slice(0, 100), output: msg.plan.output === "report" ? "report" : "answer", template: String(msg.plan.template || "").slice(0, 20),
      alternatives: (Array.isArray(msg.plan.alternatives) ? msg.plan.alternatives : []).slice(0, 6).map(item => ({ id: String(item?.id || "").slice(0, 60), name: String(item?.name || "").slice(0, 40) }))
    } : undefined,
    resolved: (Array.isArray(msg?.resolved) ? msg.resolved : []).slice(0, 6).map(item => ({ term: String(item?.term || "").slice(0, 20), kind: String(item?.kind || "").slice(0, 20), means: String(item?.means || "").slice(0, 80), carried: item?.carried === true })),
    trailMsg: String(msg?.trailMsg || "").slice(0, 300),
    streaming: false
  };
}

// 工作台历史：每个账号一份。同一账号多标签页并发时按 id 合并（旧标签页的旧状态不会覆盖新记录）
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

function saveHistory(userName, box) {
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
  // 读-改-写在同一个同步段内完成，不会与其他账号的保存交错
  const store = readHistoryStore();
  store.users[userName] = { sessions, reports, updatedAt: new Date().toISOString() };
  const tmp = `${HISTORY_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, HISTORY_FILE);
}

function userTables(userName) {
  if (!accountStore.has(userName)) return [];
  const override = loadPermissionOverrides()[userName];
  if (override) return override.tables.includes("全部数据表") ? [...allTableNames] : [...override.tables];
  return orgStore.tablesOf(userName);
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
          "4. 先给一句话结论，再用必要的表格和 2 到 3 条关键发现（带具体数字与对比）说明；有风险或建议时简短写出，证据不足的地方说明限制。不要写成报告，也不要用「#」标题分章节。"
        ].join("\n")
      },
      lineage: {
        label: "数据血缘分析",
        system: [
          "你是观星台数据平台的血缘分析助手。",
          "基于提供的表上下游血缘证据回答：先一句话说明上下游关系和最大的影响面，再按需用短列表列出上游表、下游影响面和变更风险；不要写成报告。",
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
          "证据中的「归因计算」由代码按确定性公式算出：加法指标（如消耗）按维度给出分组贡献；CPA 拆成结构效应、效率效应与无激活花费三部分，三者之和等于总变化。你的任务是解释这些结果，不是重新计算。",
          "1. 先给出整体结论（总变化与幅度）；2. 按「归因计算」里的维度列出贡献最大的组（Markdown 表格，数字原样引用，不得重算或改写）；3. 解释原因：结构效应表示激活占比（投放结构）的变化，效率效应表示单个分组 CPA 的变化；区分有证据支撑的结论与需要业务确认的假设；4. 给出建议。",
          "所有数字必须来自证据，不编造。「归因计算」中 reconciled 为 false 的维度不要使用。"
        ].join("\n")
      }
    }
  }
};

/* ================= 工具函数 ================= */

/* 跨域：默认只允许同源页面与本机开发页（localhost / 127.0.0.1）；其他来源要写进 PORTAL_ALLOWED_ORIGINS（逗号分隔，
   写 * 表示不限制）。没有 Origin 头的请求（curl、服务端调用）不涉及浏览器跨域，不受影响。 */
const ALLOWED_ORIGINS = String(process.env.PORTAL_ALLOWED_ORIGINS || "").split(",").map(item => item.trim()).filter(Boolean);

/** 返回应写入 Access-Control-Allow-Origin 的值：""（无需 CORS 头）、具体来源，或 null（不允许） */
function resolveCorsOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return "";
  if (ALLOWED_ORIGINS.includes("*")) return "*";
  try {
    const parsed = new URL(origin);
    if (parsed.host === req.headers.host) return origin;
    if (["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) return origin;
  } catch { return null; }
  return ALLOWED_ORIGINS.includes(origin) ? origin : null;
}

function corsHeadersFor(res) {
  const headers = {
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Visitor-Id",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    Vary: "Origin"
  };
  if (res.corsOrigin) headers["Access-Control-Allow-Origin"] = res.corsOrigin;
  return headers;
}

/** 会话 cookie：httpOnly（脚本读不到）、SameSite=Lax；经 HTTPS 访问时加 Secure。maxAge 为 0 表示清除 */
function sessionCookie(req, token, maxAgeSeconds = 12 * 3600) {
  const secure = req.socket?.encrypted || String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
  return `gxt_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`;
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeadersFor(res),
    "X-Content-Type-Options": "nosniff"
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
    const anthropic = isAnthropicProtocol(target.protocol);
    let response;
    try {
      response = await fetch(target.url, {
        method: "POST",
        headers: target.headers,
        body: JSON.stringify(anthropic
          ? anthropicRequestBody(model, { ...payload, stream: true })
          : { model, stream: true, stream_options: { include_usage: true }, ...payload })
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
          if (anthropic) {
            // Anthropic SSE：content_block_delta 带文本 / thinking，message_delta 带用量
            if (obj.type === "content_block_delta") {
              const piece = obj.delta?.text || "";
              if (piece) { content += piece; lastTextAt = Date.now(); onEvent({ delta: piece }); }
              const think = obj.delta?.thinking || "";
              if (think) { lastTextAt = Date.now(); onEvent({ reasoning: think }); }
            } else if (obj.type === "message_start") {
              const input = obj.message?.usage?.input_tokens;
              if (Number.isFinite(input)) usage = { prompt_tokens: input, completion_tokens: null, total_tokens: null };
            } else if (obj.type === "message_delta") {
              const output = obj.usage?.output_tokens;
              if (Number.isFinite(output)) usage = { prompt_tokens: usage?.prompt_tokens ?? null, completion_tokens: output, total_tokens: Number.isFinite(usage?.prompt_tokens) ? usage.prompt_tokens + output : null };
            }
          } else {
            if (obj.usage) usage = obj.usage;
            const delta = obj.choices?.[0]?.delta?.content || "";
            if (delta) { content += delta; lastTextAt = Date.now(); onEvent({ delta }); }
            const reasoning = obj.choices?.[0]?.delta?.reasoning_content || "";
            if (reasoning) { lastTextAt = Date.now(); onEvent({ reasoning }); }
          }
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

/* 公开接口：登录本身，以及同事通过链接打开的分享报告（只读） */
function isPublicApi(method, pathname) {
  return (method === "POST" && pathname === "/v1/auth/login") || (method === "POST" && pathname === "/v1/auth/logout") || (method === "GET" && pathname === "/v1/auth/demo") || (method === "GET" && /^\/v1\/shares\/[a-f0-9]+$/.test(pathname));
}

/* 管理类接口：AI 中心（供应商、模型配置、Skill 管理）、表数据与权限的写操作，以及供应商明细读取 */
function requiresAdmin(method, pathname) {
  if (method === "GET") return pathname === "/v1/providers" || pathname === "/v1/model-config" || pathname === "/v1/usage/all" || pathname === "/v1/feedback" || pathname === "/v1/accounts" || pathname === "/v1/audit";
  return /^\/v1\/(providers|model-config|default-model|table-rows|permissions|quota|org|accounts|skills\/upload)(\/|$)/.test(pathname) || /^\/v1\/skills\/[^/]+\/config$/.test(pathname);
}

async function handleRequest(req, res) {
  const corsOrigin = resolveCorsOrigin(req);
  res.corsOrigin = corsOrigin || "";
  if (corsOrigin === null) return sendJson(res, 403, { error: "该来源不在允许的跨域名单内" });
  if (req.method === "OPTIONS") return sendJson(res, 204, {});
  const url = new URL(req.url, "http://localhost");

  /* 身份闸门：除公开接口外，所有 /v1/ 接口都要求有效令牌；管理类接口再要求管理员角色 */
  if (url.pathname.startsWith("/v1/") && !isPublicApi(req.method, url.pathname)) {
    let username = auth.userFromRequest(req);
    // 没有 Authorization 头时才用 httpOnly cookie（带了无效令牌就是无效，不回退到 cookie）；cookie 会被浏览器自动携带，所以写操作要确认来源（CSRF）
    if (!username && !req.headers.authorization) {
      username = auth.userFromCookie(req);
      if (username && !["GET", "HEAD"].includes(req.method) && req.headers.origin && resolveCorsOrigin(req) !== req.headers.origin) return sendJson(res, 403, { error: "请求来源不被允许" });
    }
    // 账号被停用后，已经签发的令牌下一次请求就失效（不用等令牌过期）
    if (!username || !accountStore.isActive(username)) return sendJson(res, 401, { error: username && accountStore.has(username) ? "账号已停用，请联系管理员" : "请先登录" });
    const role = roleOf(username);
    if (requiresAdmin(req.method, url.pathname) && role !== "admin") return sendJson(res, 403, { error: "该操作需要门户管理员权限" });
    // 演示模式下按「账号~访客」区分同一账号的不同浏览器；非演示模式忽略该请求头
    const visitor = DEMO_LOGIN_PASSWORD && /^[A-Za-z0-9_-]{8,40}$/.test(String(req.headers["x-visitor-id"] || "")) ? String(req.headers["x-visitor-id"]) : "";
    req.session = { name: username, role, scope: visitor ? `${username}~${visitor}` : username };
  }

  /* 本地演示登录：仅当显式设置了 PORTAL_DEMO_LOGIN_PASSWORD 才开启，登录页会据此给出账号快捷按钮并自动填密码。
     它会把这个密码公开给任何访问者，所以默认关闭，只能用于本机；服务器部署不要设置。 */
  if (req.method === "GET" && url.pathname === "/healthz") return sendJson(res, 200, { ok: true, uptimeSeconds: Math.round(process.uptime()) });

  if (req.method === "GET" && url.pathname === "/v1/auth/demo") {
    if (!DEMO_LOGIN_PASSWORD) return sendJson(res, 404, { error: "未开启演示登录" });
    return sendJson(res, 200, { accounts: accountStore.activeNames().map(name => ({ name, role: roleOf(name) })), password: DEMO_LOGIN_PASSWORD });
  }

  if (req.method === "POST" && url.pathname === "/v1/auth/login") {
    const body = await readBody(req, 4096);
    const name = String(body.name || "").trim();
    const password = String(body.password || "");
    // 未知用户与密码错误返回同样的提示，避免枚举账号
    if (!accountStore.has(name)) return sendJson(res, 401, { error: "账号或密码错误" });
    if (!DEMO_LOGIN_PASSWORD && auth.isLocked(name)) return sendJson(res, 429, { error: "失败次数过多，请 15 分钟后再试" });
    if (!auth.checkPassword(name, password)) {
      if (!DEMO_LOGIN_PASSWORD) auth.recordFailure(name);
      return sendJson(res, 401, { error: "账号或密码错误" });
    }
    auth.clearFailures(name);
    // 密码正确但账号已停用：明确告知（此时已证明是账号主人，不算泄露账号是否存在）
    if (!accountStore.isActive(name)) return sendJson(res, 403, { error: "账号已停用，请联系管理员" });
    const token = auth.issueToken(name);
    res.setHeader("Set-Cookie", sessionCookie(req, token));
    return sendJson(res, 200, { token, user: { name, role: roleOf(name), group: orgStore.groupOf(name) } });
  }

  if (req.method === "POST" && url.pathname === "/v1/auth/logout") {
    res.setHeader("Set-Cookie", sessionCookie(req, "", 0));
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/v1/auth/me") {
    return sendJson(res, 200, { name: req.session.name, role: req.session.role, group: orgStore.groupOf(req.session.name), tables: userTables(req.session.name) });
  }

  // 修改自己的密码：需要旧密码；旧密码连续输错同样会被临时锁定
  if (req.method === "POST" && url.pathname === "/v1/auth/password") {
    // 演示登录模式下账号共用一个公开的密码：不允许任何人改掉它，否则登录页自动填的密码就会失效，所有人都登不进去
    if (DEMO_LOGIN_PASSWORD) return sendJson(res, 403, { error: "演示环境的账号共用公开密码，不允许修改密码" });
    const body = await readBody(req, 4096);
    const name = req.session.name;
    const newPassword = String(body.newPassword || "");
    if (auth.isLocked(name)) return sendJson(res, 429, { error: "失败次数过多，请 15 分钟后再试" });
    if (!auth.checkPassword(name, String(body.oldPassword || ""))) {
      auth.recordFailure(name);
      return sendJson(res, 401, { error: "旧密码不正确" });
    }
    if (newPassword.length < 8) return sendJson(res, 400, { error: "新密码至少 8 位" });
    if (newPassword === String(body.oldPassword)) return sendJson(res, 400, { error: "新密码不能与旧密码相同" });
    auth.clearFailures(name);
    auth.setPassword(name, newPassword);
    appendAuditEntry({ type: "password-change", user: name });
    return sendJson(res, 200, { changed: true });
  }

  if (req.method === "GET" && url.pathname === "/v1/models") {
    // 所有模型都来自供应商记录（内置中转站也是其中一条）；某个供应商挂了不影响其他供应商的模型
    const { rows, notice } = await collectModels();
    const callable = rows.filter(row => row.callable);
    const usable = [...new Set(callable.map(row => row.id))];
    const modelConfig = loadModelConfig();
    const disabled = modelConfig.disabled || {};
    const capabilityOverrides = modelConfig.models || {};
    const enabledModels = usable.filter(id => !disabled[id]).sort();
    const configuredDefault = modelConfig.defaultModel || "";
    const defaultModel = [configuredDefault, DEFAULT_MODEL].find(id => id && enabledModels.includes(id)) || enabledModels[0] || DEFAULT_MODEL;
    return sendJson(res, 200, {
      models: enabledModels,
      allModels: usable.sort().map(id => ({ id, enabled: !disabled[id], reason: disabled[id]?.reason || "", source: callable.find(row => row.id === id)?.source || "" })),
      // details 带上下文上限与思考档位：灵犀智析输入框按它渲染「深度」chip（不支持的模型不给选）
      details: enabledModels.map(id => {
        const capability = modelCapabilityFor(id, capabilityOverrides);
        return { id, contextLimit: capability.contextLimit, reasoning: capability.reasoning, capabilityConfigured: capability.configured };
      }),
      default: defaultModel,
      defaultConfigured: configuredDefault,
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

  // 报告模板清单：界面「整理成报告」按钮的下拉菜单用
  if (req.method === "GET" && url.pathname === "/v1/report/templates") {
    const templates = skillPacks.get("report-writer")?.spec.templates || [];
    return sendJson(res, 200, templates.map(({ id, name, when }) => ({ id, name, when })));
  }

  if (req.method === "GET" && url.pathname === "/v1/skills") {
    return sendJson(res, 200, loadSkillRegistry().map(entry => {
      const manifest = skillManifest(entry.id) || {};
      return { ...manifest, ...entry, dir: undefined, tools: (manifest.tools || []).map(tool => tool.name) };
    }));
  }

  if (req.method === "POST" && url.pathname === "/v1/skills/upload") {
    const chunks = [];
    let uploadedBytes = 0;
    for await (const chunk of req) {
      uploadedBytes += chunk.length;
      if (uploadedBytes > 20e6) return sendJson(res, 413, { error: "Skill 包超过 20MB 上限" });
      chunks.push(chunk);
    }
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
      /* 上传包不执行工具：清空 tools 并落盘，运行时也只接受内置包（见 runSkillTool）。
         数据取证沿用网关内置证据通道；需要自定义工具的包须经代码评审后随网关发布。 */
      manifest.tools = [];
      manifest.toolsDisabled = true;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
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
        dir, installedAt: new Date().toISOString(), builtin: false, toolsDisabled: true
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
    ["icon", "title", "desc", "displayDesc", "sort", "enabled", "prompt", "scenarioKey", "clarification", "assetScope", "responseContract", "fallbackSkillId"].forEach(key => {
      if (body[key] !== undefined) entry[key] = body[key];
    });
    if (Array.isArray(body.grayUsers)) entry.grayUsers = body.grayUsers.slice(0, 50);
    if (Array.isArray(body.routes)) entry.routes = sanitizeRoutes(body.routes);
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
      createdBy: req.session.name,
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

  // 回答反馈：只能评价自己的分析（用审计里的 requestId 校验归属）；管理员查看列表与汇总
  if (req.method === "POST" && url.pathname === "/v1/feedback") {
    const body = await readBody(req, 8000);
    const requestId = String(body.requestId || "").slice(0, 80);
    if (!RATINGS.includes(body.rating)) return sendJson(res, 400, { error: "评价只能是 up 或 down" });
    const analysis = readAuditEntries().find(entry => entry.type === "analysis" && entry.requestId === requestId && (entry.scope || entry.user) === req.session.scope);
    if (!analysis) return sendJson(res, 404, { error: "找不到这次分析，或它不属于当前账号" });
    const saved = feedbackStore.set({ requestId, user: req.session.name, rating: body.rating, comment: body.comment, model: analysis.model, skill: analysis.skill, scenario: analysis.scenario, toolMode: analysis.toolMode, question: analysis.question });
    return sendJson(res, 200, { saved: true, rating: saved.rating });
  }
  if (req.method === "GET" && url.pathname === "/v1/feedback") {
    return sendJson(res, 200, { summary: feedbackStore.summary(), items: feedbackStore.list({ rating: url.searchParams.get("rating") || "", limit: url.searchParams.get("limit") || 50 }) });
  }

  // 组织与权限：权限组配置与账号分组。登录后界面读取；管理员在界面修改后保存，服务端据此判断数据表权限与管理员角色
  const orgView = () => {
    const org = orgStore.effective();
    const admin = req.session.role === "admin";
    const own = orgStore.groupOf(req.session.name);
    return {
      role: req.session.role,
      accounts: admin ? accountStore.names() : [req.session.name],
      customized: org.customized,
      // 还没有管理员保存过时不下发组配置，界面继续使用自带的默认配置
      groups: org.customized ? (admin ? org.groups : org.groups.filter(group => group.name === own)) : [],
      userGroups: admin ? org.userGroups : { [req.session.name]: own }
    };
  };
  if (req.method === "GET" && url.pathname === "/v1/org") return sendJson(res, 200, orgView());
  if (req.method === "PUT" && url.pathname === "/v1/org") {
    const body = await readBody(req);
    const outcome = orgStore.save({ groups: body.groups, userGroups: body.userGroups });
    if (!outcome.ok) return sendJson(res, 400, { error: outcome.error });
    appendAuditEntry({ type: "org-change", user: req.session.name, groups: Array.isArray(body.groups) ? body.groups.length : undefined });
    return sendJson(res, 200, orgView());
  }

  // 语义层：当前用户有权限的业务指标与口径（校验警告只给管理员看）
  if (req.method === "GET" && url.pathname === "/v1/metrics") {
    return sendJson(res, 200, {
      metrics: semanticLayer.listMetrics(userTables(req.session.name), url.searchParams.get("keyword") || ""),
      ...(req.session.role === "admin" ? { warnings: semanticLayer.warnings } : {})
    });
  }

  // 按口径直接查询指标（与 query_metric 工具同一套计算与权限）：供评测取「标准答案」，也可给界面或外部调用
  if (req.method === "POST" && url.pathname === "/v1/metrics/query") {
    const body = await readBody(req, 20000);
    const outcome = semanticLayer.query({ metric: body.metric, table: body.table, group: body.group, days: body.days, filters: body.filters, allowedTables: userTables(req.session.name) });
    return sendJson(res, outcome.ok ? 200 : 400, outcome.ok ? outcome.data : { error: outcome.error });
  }

  // 审计日志查询（管理员）：按类型 / 账号 / 状态筛选，最近的在前，默认 50 条、最多 200 条
  if (req.method === "GET" && url.pathname === "/v1/audit") {
    const type = url.searchParams.get("type") || "";
    const user = url.searchParams.get("user") || "";
    const status = url.searchParams.get("status") || "";
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));
    // 工具调用的审计记录没有 type 字段，统一归为 tool-call，才能被筛选与统计
    const typeOf = entry => entry.type || (entry.tool ? "tool-call" : "other");
    const all = readAuditTail().map(entry => ({ ...entry, type: typeOf(entry) })).filter(entry => (!type || entry.type === type) && (!user || entry.user === user) && (!status || entry.status === status));
    const counts = {};
    all.forEach(entry => { counts[entry.type] = (counts[entry.type] || 0) + 1; });
    return sendJson(res, 200, { items: all.slice(0, limit), matched: all.length, counts });
  }

  // 账号管理（管理员）：新增、停用 / 启用、重置密码。停用立即生效（已签发的令牌下一次请求就被拒绝）。
  // 不提供删除：账号名是历史、反馈、审计的归属键，删掉会让这些记录失去主人。
  const accountView = name => ({
    name, status: accountStore.isActive(name) ? "active" : "disabled", group: orgStore.groupOf(name), role: roleOf(name),
    createdAt: accountStore.list().find(account => account.name === name)?.createdAt || null
  });
  if (req.method === "GET" && url.pathname === "/v1/accounts") {
    return sendJson(res, 200, { accounts: accountStore.names().map(accountView), demoMode: Boolean(DEMO_LOGIN_PASSWORD) });
  }
  if (req.method === "POST" && url.pathname === "/v1/accounts") {
    const body = await readBody(req, 4000);
    const created = accountStore.create(body.name);
    if (!created.ok) return sendJson(res, 400, { error: created.error });
    // 演示模式下所有账号共用公开密码，不再单独生成；否则生成随机初始密码，只在这次响应里返回
    const password = DEMO_LOGIN_PASSWORD ? "" : generatePassword();
    auth.setPassword(created.name, DEMO_LOGIN_PASSWORD || password);
    let warning = "";
    if (body.group) {
      const outcome = orgStore.save({ userGroups: { [created.name]: String(body.group) } });
      if (!outcome.ok) warning = `账号已创建，但权限组没有设置成功：${outcome.error}`;
    }
    appendAuditEntry({ type: "account-create", user: req.session.name, account: created.name });
    return sendJson(res, 200, { account: accountView(created.name), password, warning });
  }
  const accountMatch = url.pathname.match(/^\/v1\/accounts\/([^/]+)(\/reset-password)?$/);
  if (accountMatch) {
    const name = decodeURIComponent(accountMatch[1]);
    if (!accountStore.has(name)) return sendJson(res, 404, { error: `账号不存在：${name}` });
    if (req.method === "PATCH" && !accountMatch[2]) {
      const body = await readBody(req, 2000);
      if (!["active", "disabled"].includes(body.status)) return sendJson(res, 400, { error: "状态只能是 active 或 disabled" });
      if (body.status === "disabled") {
        if (name === req.session.name) return sendJson(res, 400, { error: "不能停用自己的账号" });
        const remainingAdmins = accountStore.activeNames().filter(item => item !== name && orgStore.isAdmin(item));
        if (!remainingAdmins.length) return sendJson(res, 400, { error: "至少需要保留一个未停用的门户管理员账号" });
      }
      accountStore.setStatus(name, body.status);
      appendAuditEntry({ type: "account-status", user: req.session.name, account: name, status: body.status });
      return sendJson(res, 200, { account: accountView(name) });
    }
    if (req.method === "POST" && accountMatch[2]) {
      if (DEMO_LOGIN_PASSWORD) return sendJson(res, 403, { error: "演示环境的账号共用公开密码，不允许重置密码" });
      const password = generatePassword();
      auth.setPassword(name, password);
      auth.clearFailures(name);
      appendAuditEntry({ type: "account-reset-password", user: req.session.name, account: name });
      return sendJson(res, 200, { password });
    }
  }

  // 默认模型：管理员指定新会话默认选中的模型（传空字符串清除，退回环境变量 / 内置默认）
  if (req.method === "PUT" && url.pathname === "/v1/default-model") {
    const body = await readBody(req, 4000);
    const model = String(body.model || "").trim();
    const config = loadModelConfig();
    if (model) {
      const { rows } = await collectModels();
      const callable = new Set(rows.filter(row => row.callable).map(row => row.id));
      if (!callable.has(model)) return sendJson(res, 400, { error: `模型「${model}」不在可调用的模型清单里，请先在供应商配置里接入并拉取模型` });
      if (config.disabled?.[model]) return sendJson(res, 400, { error: `模型「${model}」已被停用，不能设为默认` });
      config.defaultModel = model;
    } else {
      delete config.defaultModel;
    }
    saveModelConfig(config);
    appendAuditEntry({ type: "default-model", user: req.session.name, model: model || null });
    return sendJson(res, 200, { defaultConfigured: config.defaultModel || "" });
  }

  // 用量与配额：个人查看自己的今日用量；管理员查看全员并调整限额（0 = 不限）
  if (req.method === "GET" && url.pathname === "/v1/usage") {
    return sendJson(res, 200, { ...usageTracker.usageOf(req.session.scope), limits: usageTracker.limitsFor(req.session.name) });
  }
  if (req.method === "GET" && url.pathname === "/v1/usage/all") {
    return sendJson(res, 200, usageTracker.snapshot(accountStore.names()));
  }
  if (req.method === "PUT" && url.pathname === "/v1/quota") {
    const body = await readBody(req, 20000);
    usageTracker.setLimits(body, accountStore.names());
    return sendJson(res, 200, usageTracker.snapshot(accountStore.names()));
  }

  // 工作台历史：只读写当前登录账号自己的记录，页面刷新后恢复（会话、消息、分析资产）
  if (req.method === "GET" && url.pathname === "/v1/history") {
    return sendJson(res, 200, loadHistory(req.session.scope));
  }
  if (req.method === "PUT" && url.pathname === "/v1/history") {
    const body = await readBody(req, 30e6);
    if (!Array.isArray(body.sessions) || !Array.isArray(body.reports)) {
      return sendJson(res, 400, { error: "历史数据格式不正确" });
    }
    const existing = loadHistory(req.session.scope);
    // 合并而非替换：多标签页各自保存时以 id 互不覆盖（旧标签页的旧状态不会清掉新标签页的记录）
    saveHistory(req.session.scope, mergeHistory({ sessions: body.sessions, reports: body.reports }, existing));
    return sendJson(res, 200, { saved: true });
  }
  const historyReportMatch = url.pathname.match(/^\/v1\/history\/report\/(.+)$/);
  if (req.method === "DELETE" && historyReportMatch) {
    const reportId = decodeURIComponent(historyReportMatch[1]);
    const existing = loadHistory(req.session.scope);
    const reports = existing.reports.filter(r => r.id !== reportId);
    saveHistory(req.session.scope, { sessions: existing.sessions, reports });
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
    const org = orgStore.effective();
    return sendJson(res, 200, {
      groups: org.groups.map(group => ({ name: group.name, tables: group.tables })),
      // 普通用户只能看到自己的有效权限，全员清单仅管理员可见
      users: (req.session.role === "admin" ? accountStore.names() : [req.session.name]).map(name => ({
        name, group: org.userGroups[name],
        groupTables: org.groups.find(item => item.name === org.userGroups[name])?.tables || [],
        override: overrides[name] || null,
        effectiveTables: userTables(name)
      }))
    });
  }

  const permissionMatch = url.pathname.match(/^\/v1\/permissions\/(.+)$/);
  if (req.method === "PUT" && permissionMatch) {
    const userName = decodeURIComponent(permissionMatch[1]);
    if (!accountStore.has(userName)) return sendJson(res, 404, { error: `用户不存在：${userName}` });
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
    // 分析身份只取令牌里的登录用户，请求体里的 user 一律忽略
    const user = req.session.name;
    const scope = req.session.scope;
    const started = Date.now();
    const { question = "", scenario = "data-query", tables: requestedTables = [], assetCandidates = [], businessLine = "", model: requestedModel = "", reasoningEffort = "", maxTokens = null, portalContext = [] } = body;
    if (!question.trim()) return sendJson(res, 400, { error: "问题不能为空" });
    const model = requestedModel || loadModelConfig().defaultModel || DEFAULT_MODEL;

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

    /* 每人每日配额：请求数或 token 用量达到上限时直接拒绝（校验与权限检查之后才计数） */
    const quota = usageTracker.check(scope, user);
    if (!quota.ok) return sendJson(res, 429, { error: quota.error, quota: { usage: quota.usage, limits: quota.limits } });
    usageTracker.recordRequest(scope);
    const requestId = crypto.randomUUID();

    /* Skill 运行时：优先按 skillId 执行注册表里的包（工具出证据 + SKILL.md 出编排），失败回退内置 */
    let buildEvidenceOverride = null;
    /* 通用分析：按问题关键词与用户可用技能自动转交；其余请求按 skillId 直接执行 */
    const routerEntry = loadSkillRegistry().find(item => item.id === ROUTER_SKILL_ID);
    const isRouting = Boolean(routerEntry) && (body.skillId === ROUTER_SKILL_ID || (!body.skillId && scenario === "general"));
    const conversationTurns = skillPack.sanitizeConversation(body.conversation);
    const stickySkillId = [...conversationTurns].reverse().find(turn => turn.skillId)?.skillId || "";
    /* 流式请求尽早打开 SSE：规划、取数阶段界面都能看到进度，而不是长时间没有任何反应 */
    const streaming = body.stream === true;
    let sseSend = null, sseHeartbeat = null;
    const openStream = () => {
      if (!streaming || sseSend) return;
      res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive", ...corsHeadersFor(res) });
      sseSend = obj => res.write(`data: ${JSON.stringify(obj)}\n\n`);
      sseHeartbeat = setInterval(() => res.write(": hb\n\n"), 5000);
      res.on("close", () => clearInterval(sseHeartbeat));
    };
    /* 规划：手动选择 > 关键词 / 沿用上一轮 > 都没把握时用一次便宜的模型判断；每次决定都带来源和理由，界面上看得见也能改 */
    let routed = isRouting ? pickAutoSkill(routerEntry, user, question, stickySkillId) : null;
    let planSource = isRouting ? planner.sourceOfReason(routed.reason, false) : "manual";
    let planConfidence = null, plannedOutput = "", plannerTokens = 0, planAttempts = null;
    const domainSkills = usableDomainSkills(user);
    /* 没命中关键词时，先看有没有哪个规范包的「拦截规则」认得这句话（例如「按商户看收入」）：命中就交给它，让它说明做不到的原因并给出替代问法，不必再花一次模型判断 */
    if (isRouting && /^未命中关键词/.test(routed.reason || "")) {
      for (const entry of domainSkills) {
        const pack = skillPacks.get(entry.id);
        const hit = pack && skillPack.matchGuards(pack.spec, question).find(guard => guard.mode === "block");
        if (hit) { routed = { skill: entry, reason: `命中规范规则「${hit.id}」` }; planSource = "keyword"; break; }
      }
    }
    if (isRouting && body.planner !== false && planner.needsModelPlanning(routed, domainSkills)) {
      openStream();
      if (sseSend) sseSend({ status: "正在判断用什么技能…" });
      try {
        const decided = await planWithModel({ question, domainSkills, conversationTurns, requestedModel: model });
        plannerTokens += decided.tokens || 0;
        planAttempts = decided.attempts || null;
        if (!decided.rejected) {
          routed = { skill: domainSkills.find(item => item.id === decided.skillId), reason: `智能判断：${decided.reason || "按问题内容判断"}` };
          planSource = "model"; planConfidence = decided.confidence;
          // 要不要出报告是更重的决定：模型判断必须很确定（≥0.8）才采用，否则按简短回答
          plannedOutput = decided.output === "report" && decided.confidence >= 0.8 ? "report" : "answer";
        }
      } catch (error) { console.warn("[planner] 判断失败，沿用关键词结果：", error.message); }
    }
    const targetSkillId = isRouting ? (routed.skill?.id || "") : body.skillId;
    const registrySkill = targetSkillId
      ? loadSkillRegistry().find(item => item.id === targetSkillId && item.enabled !== false && (!item.grayUsers?.length || item.grayUsers.includes(user)))
      : null;
    let skill = null, scene = null, runtimeError = "";
    /* 规范包：核心规则直接作为场景提示词，数据通过工具循环取（不再跑证据脚本） */
    const packEntry = registrySkill ? skillPacks.get(registrySkill.id) || null : null;
    if (packEntry) {
      skill = { name: registrySkill.name, version: registrySkill.version };
      scene = { label: registrySkill.title || registrySkill.name, system: packEntry.instructions };
    } else if (registrySkill) {
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
      scene = builtin.scenarios[routed?.skill?.scenarioKey || (isRouting ? "data-query" : scenario)] || builtin.scenarios.single;
    }
    const packTables = packEntry ? (packEntry.spec.tables || []).filter(name => allowed.includes(name)) : [];
    const evidenceTables = referenced.length ? referenced : (packTables.length ? packTables : scopedCandidates);
    /* 回答协议（所有技能）+ 规范包上下文（术语解析、拦截规则）+ 会话上下文 */
    const answerRole = skillPack.roleForGroup(orgStore.groupOf(user));
    const answerProtocol = skillPack.buildAnswerProtocol(answerRole);
    const conversationContext = skillPack.buildConversationContext(conversationTurns);
    let specContext = "", reportSpecContext = "", packGuards = [], packMeta = { role: answerRole };
    if (packEntry) {
      const carried = [...conversationTurns].reverse().find(turn => turn.terms?.length)?.terms || [];
      const resolution = skillPack.resolveTerms(packEntry.spec, question, carried);
      packGuards = skillPack.matchGuards(packEntry.spec, question);
      specContext = skillPack.buildSpecContext({ resolution, guards: packGuards, spec: packEntry.spec });
      // 报告用的精简版：只留口径解析、歧义和提示，不带「缺省值」这类只对取数有用的内容
      reportSpecContext = skillPack.buildSpecContext({ resolution, guards: packGuards, spec: { ...packEntry.spec, defaults: null } });
      packMeta = {
        role: answerRole, pack: packEntry.id,
        resolvedTerms: resolution.resolved.map(({ term, kind, means, carried: isCarried }) => ({ term, kind, means, carried: isCarried })),
        ambiguousTerms: resolution.ambiguous.map(item => item.term),
        guards: packGuards.map(guard => guard.id)
      };
    }
    /* 报告是按需调用的输出 Skill：只有用户明确要报告（或点了「整理成报告」，或规划判断出来）才走；基于对话里已经取到的事实写，不重新取数。output=answer 表示用户明确不要报告 */
    const reportPack = skillPacks.get("report-writer") || null;
    const wantsReport = Boolean(reportPack) && (body.output === "report" || (body.output !== "answer" && (reportSkill.detectReportIntent(question) || plannedOutput === "report")));
    const reportTemplate = wantsReport ? reportSkill.pickTemplate(reportPack.spec.templates, body.template, question) : null;
    const priorLedger = wantsReport ? evidenceLedger.loadMany(conversationTurns.map(turn => turn.requestId).filter(Boolean).slice(-4), scope) : [];
    const reuseOnly = wantsReport && priorLedger.length > 0 && (body.output === "report" || reportSkill.wantsReuse(question));
    if (wantsReport) packMeta = { ...packMeta, output: "report", template: reportTemplate?.id || "", basedOn: priorLedger.map(entry => entry.requestId) };
    /* 本次怎么做的：用了哪个技能、输出什么形式、为什么；界面展示，也可以在界面上改 */
    const plan = planner.buildPlan({
      skill: registrySkill || { id: "", title: scene.label }, source: planSource, reason: isRouting ? routed?.reason : "你选择了该技能", confidence: planConfidence,
      output: wantsReport ? "report" : "answer", template: reportTemplate?.id || "", alternatives: domainSkills
    });
    packMeta = { ...packMeta, plan: planAttempts ? { ...plan, diagnostics: planAttempts } : plan };
    /* 做不到的需求（例如按商户拆分）：直接给出明确答复与替代方案，不调用模型 */
    const blockedBy = packGuards.find(guard => guard.mode === "block");
    if (blockedBy) {
      const blockMeta = {
        skill: skill.name, skillVersion: skill.version, scenario: scene.label, toolMode: `guard:${blockedBy.id}`, toolCalls: [],
        model, tablesUsed: [], deniedTables: denied, latencyMs: Date.now() - started, usage: null, requestId,
        numericCheck: null, totalTokens: plannerTokens, ...packMeta,
        suggestions: followups.suggestFollowUps({ evidence: [], question, guards: packGuards, spec: packEntry?.spec || {}, semantic: semanticLayer })
      };
      finishAnalysis({ user, scope, requestId, question, model, skillName: skill.name, scenarioLabel: scene.label, toolMode: blockMeta.toolMode, toolCalls: [], tablesUsed: [], usage: null, extraTokens: plannerTokens, latencyMs: blockMeta.latencyMs, numericCheck: null, status: "ok" });
      blockMeta.usageToday = { ...usageTracker.usageOf(scope), limits: usageTracker.limitsFor(user) };
      if (streaming) {
        openStream();
        sseSend({ started: true, scenario: scene.label, model, routedSkill: routed?.skill ? { id: routed.skill.id, name: routed.skill.title || routed.skill.name } : null, routeReason: routed?.reason || "", resolved: packMeta.resolvedTerms || [], plan });
        sseSend({ delta: blockedBy.answer });
        sseSend({ done: true, meta: blockMeta });
        clearInterval(sseHeartbeat);
        return res.end();
      }
      return sendJson(res, 200, { report: blockedBy.answer, meta: blockMeta });
    }
    const isAttributionRequest = targetSkillId === ATTRIBUTION_SKILL_ID || scenario === "attribution";
    let evidence = buildEvidenceOverride || buildEvidence(evidenceTables, portalContext);
    if (reuseOnly) evidence = priorLedger.flatMap(entry => entry.evidence);
    const reportAudit = { plan: plan.source, planSkill: plan.skillId, ...(wantsReport ? { output: "report", template: reportTemplate?.id || "", basedOn: priorLedger.length } : {}) };
    /* 回答后的推荐问题：按这一轮实际用到的工具确定性生成，只推平台能回答的（不额外调用模型） */
    const suggestionsFor = () => followups.suggestFollowUps({
      evidence, question, resolvedTerms: packMeta.resolvedTerms || [], output: wantsReport ? "report" : "answer", templates: reportPack?.spec.templates || [],
      currentTemplate: reportTemplate?.id || "", role: answerRole, guards: packGuards, spec: packEntry?.spec || {}, semantic: semanticLayer
    });
    /* 把这次取到的事实存进证据账本，之后「整理成报告」直接用，不用重新取数 */
    const saveLedger = answerText => evidenceLedger.save({
      requestId, scope, user, question, model, skill: skill.name, pack: packEntry?.id || "", resolvedTerms: packMeta.resolvedTerms,
      evidence, answer: answerText, output: wantsReport ? "report" : "answer", template: reportTemplate?.id || ""
    });
    /* 工具取数：模型自己决定查什么，权限在工具里逐次校验；未调用工具或模型不支持时回到原证据方式 */
    let toolMode = "off";
    let toolCalls = [];
    let toolTokens = plannerTokens;
    if (streaming) {
      openStream();
      sseSend({ started: true, scenario: scene.label, model, routedSkill: routed?.skill ? { id: routed.skill.id, name: routed.skill.title || routed.skill.name } : null, routeReason: routed?.reason || "", resolved: packMeta.resolvedTerms || [], plan, ...(wantsReport ? { output: "report", template: reportTemplate?.name || "" } : {}) });
    }
    if (reuseOnly) {
      toolMode = `reuse:${priorLedger.length}`;
      if (sseSend) sseSend({ status: `基于对话里已核实的 ${priorLedger.length} 次取数整理报告…` });
    } else if (body.toolMode !== false && !isAttributionRequest && providerSupportsTools(model)) {
      const referenceTool = packEntry ? skillPack.createReferenceTool(packEntry) : null;
      const toolkit = createAnalysisToolkit({ userName: user, allowedTables: allowed, tables, rowsOf, audit: appendAuditEntry, allowAsk: !question.includes("用户补充信息"), semantic: semanticLayer, extraTools: referenceTool ? [{ ...referenceTool, maxChars: 26000 }] : [] });
      const loopSystemExtra = [
        packEntry?.instructions, packEntry ? skillPack.referenceIndex(packEntry) : "", specContext,
        wantsReport ? `## 本次要生成报告\n先把写「${reportTemplate?.name || "报告"}」需要的事实取全（口径、时间窗、对比期、必要的拆分维度），取完就停止，不要写报告正文。${priorLedger.length ? "对话里已经取过的事实不用重复取。" : ""}` : answerProtocol
      ].filter(Boolean).join("\n\n");
      if (sseSend) sseSend({ status: "正在查询数据…" });
      let loop;
      try {
        loop = await runAnalysisToolLoop({
          model, question, hints: referenced, toolkit, onToolEvent: ev => { if (sseSend) sseSend({ tool: ev }); },
          systemExtra: loopSystemExtra, contextBlock: conversationContext, defaultTables: packTables,
          ...(() => {
            const mode = LOOP_THINKING_MODES.includes(body.loopThinking) ? body.loopThinking : LOOP_THINKING_DEFAULT;
            return mode === "on" ? {} : { lightThinking: lightweightThinking(model, modelCapabilityFor(model).reasoning), lightFromStep: mode === "off" ? 1 : 2 };
          })(),
          ...(packEntry ? { maxSteps: 6, maxCalls: 12 } : {})
        });
      } catch (error) {
        if (sseSend) {
          clearInterval(sseHeartbeat);
          sseSend({ error: `工具取数失败：${error.message}` });
          return res.end();
        }
        throw error;
      }
      toolTokens += loop.tokens || 0;
      if (loop.ask) {
        const askText = `${loop.ask.intro ? loop.ask.intro + "\n\n" : ""}\`\`\`ask\n${JSON.stringify(loop.ask)}\n\`\`\``;
        const askCalls = loop.evidence.map(entry => ({ tool: entry.工具, table: "", ok: !(entry.结果 && entry.结果.错误) }));
        const askMeta = {
          skill: skill.name, skillVersion: skill.version, scenario: scene.label, toolMode: `ask:${loop.calls}`, toolCalls: askCalls,
          model, tablesUsed: referenced, deniedTables: denied, latencyMs: Date.now() - started, usage: null, requestId,
          numericCheck: null, usageToday: null, totalTokens: toolTokens, ...packMeta
        };
        finishAnalysis({ user, scope, requestId, question, model, skillName: skill.name, scenarioLabel: scene.label, toolMode: askMeta.toolMode, toolCalls: askCalls, tablesUsed: referenced, usage: null, extraTokens: toolTokens, latencyMs: askMeta.latencyMs, numericCheck: null, status: "ok" });
        askMeta.usageToday = { ...usageTracker.usageOf(scope), limits: usageTracker.limitsFor(user) };
        if (sseSend) {
          clearInterval(sseHeartbeat);
          sseSend({ delta: askText });
          sseSend({ done: true, meta: askMeta });
          return res.end();
        }
        return sendJson(res, 200, { report: askText, meta: askMeta });
      }
      if (loop.used) {
        evidence = [...priorLedger.flatMap(entry => entry.evidence), ...loop.evidence];
        toolMode = `used:${loop.calls}`;
        // 界面展示用的摘要：调了什么工具、查了哪张表、是否成功（完整结果已进入证据与审计）
        toolCalls = loop.evidence.map(entry => {
          let args = {};
          try { args = JSON.parse(entry.参数 || "{}"); } catch { /* 参数非法时只展示工具名 */ }
          return { tool: entry.工具, table: typeof args.table === "string" ? args.table : "", ok: !(entry.结果 && entry.结果.错误) };
        });
      } else {
        toolMode = `fallback:${loop.reason || "no-tool-call"}`;
      }
    }
    if (isAttributionRequest) attachAttribution(evidence, evidenceTables, question);
    /* 报告的提示词要精简：事实已经在下面，不需要重复前几轮的回答摘要、场景名、数据表说明、门户配置说明和取数用的缺省值 */
    const prompt = [
      wantsReport ? skillPack.buildConversationContext(conversationTurns, { answers: false }) : conversationContext,
      `## 用户问题\n${question}`,
      wantsReport ? reportSpecContext : specContext,
      wantsReport ? "" : `## 分析场景\n${scene.label}`,
      wantsReport ? "" : referenced.length ? `## 引用数据表\n${referenced.join("、")}` : scopedCandidates.length ? `## 业务线范围\n${businessLine || "已选择业务线"}；候选数据表：${scopedCandidates.join("、")}` : "## 引用数据表\n（未指定，以下为当前用户权限内全部表的概览，深度分析请引用具体表）",
      wantsReport ? "" : "## 门户配置说明\n表证据中的「枚举值」「字段备注」「标签配置」「维表数据样例」来自门户的表管理、字典管理、标签管理与维表管理配置，分析时优先据此解释编码取值与口径；与网关注释冲突时以门户配置为准。",
      denied.length ? `## 权限提示\n以下表未授权，未纳入分析：${denied.join("、")}` : "",
      wantsReport && priorLedger.length ? reportSkill.buildFactsSection(priorLedger) : "",
      reuseOnly ? "" : `## 表证据（唯一事实来源，所有数字必须来自这里）\n${JSON.stringify(wantsReport && priorLedger.length ? evidence.filter(item => !priorLedger.some(entry => entry.evidence.includes(item))) : evidence, null, 1)}`
    ].filter(Boolean).join("\n\n");

    const ASK_PROTOCOL = [
      "## 交互式提问协议",
      "当用户问题缺少关键信息（指标口径、时间范围、业务线、拆解维度等），且无法从表证据中合理推断时，不要猜测，也不要输出长报告；改为先提问。",
      "提问方式：输出一两句说明，然后附一个 ```ask 代码块，内容为 JSON：",
      '{"title":"标题","intro":"一句话说明为什么要问","questions":[{"key":"metric","question":"问题","hint":"可选提示","multiple":false,"options":[{"label":"选项","desc":"可选说明"}]}]}',
      "要求：最多 3 个问题，每题 2-6 个选项；multiple 为 true 表示可多选；界面会自动提供「自定义输入」，不需要自己加「其他」选项。",
      "提问块之后不要再输出任何内容。如果用户消息里已经包含「用户补充信息」，或信息已经足够，则直接分析，禁止再次提问。"
    ].join("\n");
    const messages = [{
      role: "system",
      content: wantsReport
        ? `${reportSkill.buildReportSystem(reportPack.instructions, reportTemplate)}${specContext ? "\n\n（用户问题中的口径词已由平台解析，见用户消息里的「口径解析」。）" : ""}`
        : `${scene.system}\n\n（以上场景说明只提供事实边界与专业规则；回答的篇幅与结构以下面的「回答协议」为准。）\n\n${answerProtocol}\n\n${ASK_PROTOCOL}`
    }, { role: "user", content: prompt }];

    /* 流式模式：SSE 逐段转发给前端 */
    if (streaming) {
      // SSE 已在工具阶段之前打开（见上方），这里沿用同一条连接
      const send = sseSend;
      const heartbeat = sseHeartbeat;
      if (send) send({ status: wantsReport ? `正在撰写「${reportTemplate?.name || "报告"}」…` : "正在生成回答…" });
      const reasoningOptions = {};
      // 只在该模型声明支持的档位里透传 reasoning_effort：不支持的模型直接不带这个参数
      const modelReasoning = modelCapabilityFor(model).reasoning;
      if (REASONING_LEVELS.includes(reasoningEffort) && modelReasoning.levels.includes(reasoningEffort)) reasoningOptions.reasoning_effort = reasoningEffort;
      if (Number.isFinite(maxTokens) && maxTokens >= 256) reasoningOptions.max_completion_tokens = Math.floor(maxTokens);
      if (wantsReport && REPORT_LIGHT_THINKING) Object.assign(reasoningOptions, lightweightThinking(model, modelReasoning));
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
        const failure = `模型调用失败（${result.lastResult?.status || 502}）：${JSON.stringify(result.lastResult?.data).slice(0, 300)}`;
        finishAnalysis({ user, scope, requestId, question, model, skillName: skill.name, scenarioLabel: scene.label, toolMode, toolCalls, tablesUsed: referenced, usage: null, extraTokens: toolTokens, latencyMs: Date.now() - started, numericCheck: null, status: "error", error: failure });
        send({ error: failure });
        return res.end();
      }
      clearInterval(heartbeat);
      const streamNumericCheck = checkNumericGrounding(result.content || "", evidence, question);
      finishAnalysis({ user, scope, requestId, question, model, skillName: skill.name, scenarioLabel: scene.label, toolMode, toolCalls, tablesUsed: referenced.length ? referenced : evidence.map(item => item.表名).filter(Boolean), usage: result.usage, extraTokens: toolTokens, latencyMs: Date.now() - started, numericCheck: streamNumericCheck, status: "ok", extra: reportAudit });
      saveLedger(result.content);
      send({
        done: true,
        meta: {
          skill: skill.name, skillVersion: skill.version, scenario: scene.label, toolMode, toolCalls,
          model, reasoningEffort: reasoningOptions.reasoning_effort || (reasoningOptions.enable_thinking === false || reasoningOptions.thinking ? "off" : "default"),
          maxTokens: reasoningOptions.max_completion_tokens || null,
          tablesUsed: referenced.length ? referenced : evidence.map(item => item.表名),
          deniedTables: denied, latencyMs: Date.now() - started,
          usage: result.usage || null, requestId,
          warning: result.stalled ? "上游中断，以上为已生成内容" : "",
          numericCheck: streamNumericCheck, totalTokens: tokensOf(result.usage) + toolTokens,
          usageToday: { ...usageTracker.usageOf(scope), limits: usageTracker.limitsFor(user) }, ...packMeta, suggestions: suggestionsFor()
        }
      });
      return res.end();
    }

    const reasoningOptions = {};
    const modelReasoning = modelCapabilityFor(model).reasoning;
    if (REASONING_LEVELS.includes(reasoningEffort) && modelReasoning.levels.includes(reasoningEffort)) reasoningOptions.reasoning_effort = reasoningEffort;
    if (Number.isFinite(maxTokens) && maxTokens >= 256) reasoningOptions.max_completion_tokens = Math.floor(maxTokens);
    if (wantsReport && REPORT_LIGHT_THINKING) Object.assign(reasoningOptions, lightweightThinking(model, modelReasoning));
    const hasReasoningOptions = Object.keys(reasoningOptions).length > 0;
    try {
      let result = await relayChat(model, { messages, ...reasoningOptions });
      if (result.status !== 200 && hasReasoningOptions && /unsupported|unknown|invalid|not support|unexpected/i.test(JSON.stringify(result.data).slice(0, 500))) {
        result = await relayChat(model, { messages });
      }
      if (result.status !== 200) {
        const failure = `模型调用失败（${result.status}）：${JSON.stringify(result.data).slice(0, 300)}`;
        finishAnalysis({ user, scope, requestId, question, model, skillName: skill.name, scenarioLabel: scene.label, toolMode, toolCalls, tablesUsed: referenced, usage: null, extraTokens: toolTokens, latencyMs: Date.now() - started, numericCheck: null, status: "error", error: failure });
        return sendJson(res, 502, { error: failure });
      }
      const content = result.data?.choices?.[0]?.message?.content || "";
      const plainNumericCheck = checkNumericGrounding(content, evidence, question);
      finishAnalysis({ user, scope, requestId, question, model, skillName: skill.name, scenarioLabel: scene.label, toolMode, toolCalls, tablesUsed: referenced.length ? referenced : evidence.map(item => item.表名).filter(Boolean), usage: result.data.usage, extraTokens: toolTokens, latencyMs: Date.now() - started, numericCheck: plainNumericCheck, status: "ok", extra: reportAudit });
      saveLedger(content);
      return sendJson(res, 200, {
        report: content,
        meta: {
          skill: skill.name, skillVersion: skill.version, scenario: scene.label, toolMode, toolCalls,
          model, skillRuntime: registrySkill ? ("package:" + registrySkill.id) : "builtin", skillFallback: runtimeError || "",
          reasoningEffort: reasoningOptions.reasoning_effort || (reasoningOptions.enable_thinking === false || reasoningOptions.thinking ? "off" : "default"),
          maxTokens: reasoningOptions.max_completion_tokens || null,
          tablesUsed: referenced.length ? referenced : evidence.map(item => item.表名),
          deniedTables: denied, latencyMs: Date.now() - started,
          usage: result.data.usage || null, requestId,
          numericCheck: plainNumericCheck, totalTokens: tokensOf(result.data.usage) + toolTokens,
          usageToday: { ...usageTracker.usageOf(scope), limits: usageTracker.limitsFor(user) }, ...packMeta, suggestions: suggestionsFor()
        }
      });
    } catch (error) {
      finishAnalysis({ user, scope, requestId, question, model, skillName: skill.name, scenarioLabel: scene.label, toolMode, toolCalls, tablesUsed: referenced, usage: null, extraTokens: toolTokens, latencyMs: Date.now() - started, numericCheck: null, status: "error", error: error.message });
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
          "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "same-origin",
          // 不影响现有页面的收紧项：禁用插件对象、限制 base 与表单提交目标、禁止被其他站点嵌入
          "Content-Security-Policy": "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'"
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
    const message = `请求处理失败：${error && error.message ? error.message : "未知错误"}`;
    try {
      if (res.headersSent) {
        // 流式响应已经打开：不能再改状态码，用 error 事件告知前端并结束连接，避免界面一直等待
        res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
        res.end();
      } else {
        sendJson(res, 400, { error: message });
      }
    } catch (sendError) { /* 响应可能已发出，忽略 */ }
    if (error && error.message) console.error("网关请求处理异常：", error.message);
  });
});

loadSampleData();
installBuiltinPackages();
/* 账号：名单内用户首次启动时创建；密码取 PORTAL_INITIAL_PASSWORD，未设置则随机生成并只打印这一次 */
if (DEMO_LOGIN_PASSWORD) console.warn("[auth] ⚠ 已开启演示登录（PORTAL_DEMO_LOGIN_PASSWORD）：登录页会公开显示账号并自动填入密码，只能用于本机，不要用于服务器。");
const generatedAccounts = auth.bootstrapAccounts(accountStore.names(), process.env.PORTAL_INITIAL_PASSWORD || "");
if (generatedAccounts.length) {
  console.log("[auth] 已为以下账号生成初始密码（只显示这一次，请尽快修改）：");
  generatedAccounts.forEach(item => console.log(`[auth]   ${item.name}：${item.password}`));
}
server.listen(PORT, () => console.log(`观星台分析网关已启动: http://localhost:${PORT}（数据目录 ${DATA_DIR}，skill 运行时已就绪）`));
// 首次启动把环境变量里的中转站迁移成普通供应商记录；之后一切都走「供应商配置」
ensureRelayProvider()
  .then(() => syncBuiltinRelayModels())
  .catch(error => console.warn("[providers] 内置中转站初始化失败：", error && error.message ? error.message : error));
