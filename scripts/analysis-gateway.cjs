#!/usr/bin/env node
/**
 * 观星台分析网关（本地演示版）
 *
 * 职责：
 *  1. GET  /v1/models   — 从中转站拉取可用模型列表
 *  2. POST /v1/analyze  — 分析入口：表权限校验 → 组装证据上下文 → 调中转站模型生成分析报告
 *
 * 数据权限与表元数据来自原型同一份数据源（portal-bridge.js 的 dataAssets / permissionGroups），
 * 这里内嵌快照以保持零依赖，可在任何机器直接 `node analysis-gateway.cjs` 运行。
 *
 * 环境变量：
 *  RELAY_BASE_URL  模型中转站地址（默认 https://simindapi.modelgs.com）
 *  RELAY_API_KEY   中转站 API Key
 *  PORT            监听端口（默认 8787）
 */

const http = require("http");
const crypto = require("crypto");

const RELAY_BASE_URL = process.env.RELAY_BASE_URL || "https://simindapi.modelgs.com";
const RELAY_API_KEY = process.env.RELAY_API_KEY || "";
const PORT = Number(process.env.PORT || 8787);
const DEFAULT_MODEL = "gpt-5.4-mini";

/* ---------------- 数据快照（与原型一致） ---------------- */

const tables = [
  {
    cnName: "广告计划日报表",
    table: "dm_ad_plan_daily_media_account_product_performance_detail",
    database: "prod_callup",
    source: "StarRocks",
    desc: "广告计划日粒度消耗、转化和成本数据，用于对外提供投放日报。",
    owner: "黄佩贤",
    fields: [
      { name: "stat_date", type: "DATE", comment: "统计日期" },
      { name: "media_source", type: "VARCHAR", comment: "媒体来源（枚举：巨量、广点通、快手、OPPO、VIVO）" },
      { name: "plan_id", type: "VARCHAR", comment: "计划 ID" },
      { name: "plan_name", type: "VARCHAR", comment: "计划名称" },
      { name: "account_id", type: "VARCHAR", comment: "账户 ID" },
      { name: "account_name", type: "VARCHAR", comment: "账户名称" },
      { name: "product_name", type: "VARCHAR", comment: "产品名称" },
      { name: "cost", type: "DECIMAL(18,2)", comment: "消耗金额（元）" },
      { name: "click_cnt", type: "BIGINT", comment: "点击数" },
      { name: "show_cnt", type: "BIGINT", comment: "曝光数" },
      { name: "activate_cnt", type: "BIGINT", comment: "激活数（按归因口径统计）" },
      { name: "register_cnt", type: "BIGINT", comment: "注册数（按归因口径统计）" },
      { name: "order_cnt", type: "BIGINT", comment: "订单数" },
      { name: "cpa", type: "DECIMAL(18,4)", comment: "转化成本 = cost / activate_cnt" },
      { name: "roi", type: "DECIMAL(18,4)", comment: "ROI = 收入 / 消耗" }
    ],
    sample: [
      { stat_date: "2026-08-30", media_source: "巨量", plan_name: "小说推文-01", product_name: "网赚-01", cost: "186420.55", click_cnt: "32110", show_cnt: "982200", activate_cnt: "3120", cpa: "59.75", roi: "1.21" },
      { stat_date: "2026-08-30", media_source: "巨量", plan_name: "小说推文-02", product_name: "网赚-02", cost: "132890.00", click_cnt: "25400", show_cnt: "771000", activate_cnt: "1780", cpa: "74.66", roi: "0.94" },
      { stat_date: "2026-08-30", media_source: "广点通", plan_name: "号卡推广-A", product_name: "号卡", cost: "88120.30", click_cnt: "15200", show_cnt: "512000", activate_cnt: "1610", cpa: "54.73", roi: "1.35" },
      { stat_date: "2026-08-29", media_source: "巨量", plan_name: "小说推文-01", product_name: "网赚-01", cost: "161200.00", click_cnt: "30100", show_cnt: "905000", activate_cnt: "2950", cpa: "54.64", roi: "1.18" },
      { stat_date: "2026-08-29", media_source: "快手", plan_name: "存量唤醒-B", product_name: "存量", cost: "45600.00", click_cnt: "8100", show_cnt: "260000", activate_cnt: "690", cpa: "66.09", roi: "1.02" }
    ],
    lineage: {
      upstream: [
        { table: "dwd_ad_account_daily", role: "广告账户日报（账户粒度消耗事实）", join: "INNER JOIN · 账户+日" },
        { table: "dwd_campaign_conversion_daily", role: "广告组转化日报（激活/注册归因明细）", join: "LEFT JOIN · 计划+日" },
        { table: "dim_media_source", role: "媒体来源维表（媒体编码 → 中文名）", join: "LEFT JOIN · media_source" }
      ],
      downstream: [
        { table: "ads_media_cost_summary", role: "媒体消耗汇总（ADS 分析层）" },
        { table: "ads_product_roi_daily", role: "产品 ROI 日报" }
      ]
    }
  },
  {
    cnName: "用户画像标签明细表",
    table: "dwd_user_profile_tag",
    database: "prod_cloud",
    source: "StarRocks",
    desc: "用户画像标签明细表，用于用户细查和外部系统标签查询。",
    owner: "李雨航",
    fields: [
      { name: "user_id", type: "VARCHAR", comment: "用户 ID" },
      { name: "tag_code", type: "VARCHAR", comment: "标签编码" },
      { name: "tag_value", type: "VARCHAR", comment: "标签值" },
      { name: "tag_name", type: "VARCHAR", comment: "标签名称" },
      { name: "tag_category", type: "VARCHAR", comment: "标签分类" },
      { name: "score", type: "DECIMAL(10,4)", comment: "标签分值" }
    ],
    sample: [],
    lineage: {
      upstream: [{ table: "dwd_user_device_relation", role: "用户设备关系明细", join: "LEFT JOIN · user_id" }],
      downstream: [{ table: "dm_user_lifecycle_daily", role: "用户生命周期日报" }]
    }
  },
  {
    cnName: "渠道归因明细",
    table: "dwd_channel_attribution_detail",
    database: "prod_cloud",
    source: "StarRocks",
    desc: "渠道归因明细，用于渠道效果分析。",
    owner: "李雨航",
    fields: [
      { name: "biz_date", type: "DATE", comment: "业务日期" },
      { name: "channel_code", type: "VARCHAR", comment: "渠道编码" },
      { name: "metric_value", type: "DECIMAL(18,4)", comment: "指标值" }
    ],
    sample: [],
    lineage: { upstream: [], downstream: [] }
  }
];

const permissionGroups = [
  { name: "门户管理员", tables: ["全部数据表"] },
  { name: "投放组长", tables: ["广告计划日报表", "广告账户日报", "广告组转化日报", "媒体消耗汇总", "产品 ROI 日报"] },
  { name: "优化师", tables: ["广告计划日报表", "广告账户日报"] },
  { name: "数据分析师", tables: ["广告计划日报表", "用户画像标签明细表", "用户订单明细", "用户生命周期日报", "渠道归因明细"] },
  { name: "只读访客", tables: [] }
];

const users = [
  { name: "曾祥竞", group: "门户管理员" },
  { name: "黄佩贤", group: "投放组长" },
  { name: "李雨航", group: "数据分析师" },
  { name: "谭嘉颖", group: "优化师" }
];

/* ---------------- Skill 注册表（对应观星台 Skill 配置） ---------------- */

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
          "1. 只基于提供的表结构、字段注释、样本数据和血缘证据分析，不编造数据。",
          "2. 引用字段时用反引号；结论必须能追溯到给定证据。",
          "3. 证据不足时明确标注「待业务确认」，不得猜测业务定义。",
          "4. 报告使用 Markdown，包含：一句话结论、数据概览、关键发现（含数字）、风险与建议、证据限制。",
          "5. 若用户引用了数据表，只分析引用的表。"
        ].join("\n")
      },
      lineage: {
        label: "数据血缘分析",
        system: [
          "你是观星台数据平台的血缘分析助手。",
          "基于提供的表上下游血缘证据，输出 Markdown 报告：",
          "一、上游表清单（表名、角色、关联方式）；二、本表在数仓链路中的位置；三、下游影响面；四、变更风险与注意事项。",
          "只把明确给出的血缘写成确定关系；证据不足时标注「待核对，非确定引用」。关联方式（JOIN 类型）只在证据中给出时才可陈述。"
        ].join("\n")
      },
      asset: {
        label: "数据资产问答",
        system: [
          "你是观星台数据平台的资产问答助手。",
          "基于提供的表资产清单（名称、说明、负责人、字段）回答用户问题，输出：相关表清单、各表口径说明、负责人、推荐用法。",
          "只推荐清单内的表；清单外的可能性标注「权限外，未纳入」。"
        ].join("\n")
      },
      attribution: {
        label: "归因分析",
        system: [
          "你是观星台数据平台的归因分析助手。",
          "基于提供的样本数据和字段口径（如 cpa = cost / activate_cnt），对指标异动做维度拆解：按媒体、产品、计划逐层定位贡献度，输出：结论、拆解过程（含数字）、原因判断、建议。",
          "没有样本数据时说明无法量化，给出需要的分析口径。"
        ].join("\n")
      }
    }
  }
};

/* ---------------- 工具函数 ---------------- */

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => { raw += chunk; if (raw.length > 1e6) req.destroy(); });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (error) { reject(error); } });
  });
}

function userTables(userName) {
  const user = users.find(item => item.name === userName);
  const group = permissionGroups.find(item => item.name === user?.group);
  if (!group) return [];
  if (group.tables.includes("全部数据表")) return tables.map(table => table.cnName);
  return tables.filter(table => group.tables.includes(table.cnName)).map(table => table.cnName);
}

function buildEvidence(cnNames) {
  const list = cnNames.length ? tables.filter(table => cnNames.includes(table.cnName)) : tables;
  return list.map(table => ({
    表名: table.cnName,
    物理表: `${table.database}.${table.table}`,
    说明: table.desc,
    负责人: table.owner,
    字段: table.fields.map(field => `${field.name} ${field.type} — ${field.comment}`),
    样本数据: table.sample.length ? table.sample : "（无样本数据，无法做量化分析）",
    血缘: table.lineage.upstream.length || table.lineage.downstream.length ? table.lineage : "（无语料证据）"
  }));
}

async function relay(path, options = {}) {
  const response = await fetch(`${RELAY_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${RELAY_API_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: response.status, data };
}

/* ---------------- 路由 ---------------- */

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return sendJson(res, 204, {});
  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && url.pathname === "/v1/models") {
    try {
      const result = await relay("/v1/models");
      const ids = (result.data?.data || []).map(item => item.id).filter(id => !/image|audio|realtime/.test(id));
      return sendJson(res, result.status, { models: ids, default: DEFAULT_MODEL });
    } catch (error) {
      return sendJson(res, 502, { error: `中转站不可达：${error.message}` });
    }
  }

  if (req.method === "POST" && url.pathname === "/v1/analyze") {
    const body = await readBody(req);
    const { user = "曾祥竞", question = "", scenario = "single", tables: requestedTables = [], model = DEFAULT_MODEL } = body;
    if (!question.trim()) return sendJson(res, 400, { error: "问题不能为空" });

    const allowed = userTables(user);
    const referenced = requestedTables.filter(name => allowed.includes(name));
    const denied = requestedTables.filter(name => !allowed.includes(name));
    if (requestedTables.length && !referenced.length) {
      return sendJson(res, 403, { error: `引用的数据表均未授权给当前用户（${user}），请检查「权限组 → 数据表权限」` });
    }

    const skill = skills["warehouse-analyst"];
    const scene = skill.scenarios[scenario] || skill.scenarios.single;
    const evidence = buildEvidence(referenced);
    const prompt = [
      `## 用户问题\n${question}`,
      `## 分析场景\n${scene.label}`,
      referenced.length ? `## 引用数据表\n${referenced.join("、")}` : "## 引用数据表\n（未指定，使用当前用户权限内相关表）",
      denied.length ? `## 权限提示\n以下表未授权，未纳入分析：${denied.join("、")}` : "",
      `## 表证据（唯一事实来源）\n${JSON.stringify(evidence, null, 2)}`
    ].filter(Boolean).join("\n\n");

    const started = Date.now();
    try {
      const result = await relay("/v1/chat/completions", {
        method: "POST",
        body: JSON.stringify({ model, messages: [{ role: "system", content: scene.system }, { role: "user", content: prompt }] })
      });
      if (result.status !== 200) {
        return sendJson(res, 502, { error: `模型调用失败（${result.status}）：${JSON.stringify(result.data).slice(0, 300)}` });
      }
      const content = result.data?.choices?.[0]?.message?.content || "";
      return sendJson(res, 200, {
        report: content,
        meta: {
          skill: skill.name, skillVersion: skill.version, scenario: scene.label,
          model, tablesUsed: referenced.length ? referenced : evidence.map(item => item.表名),
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

server.listen(PORT, () => console.log(`观星台分析网关已启动: http://localhost:${PORT}`));
