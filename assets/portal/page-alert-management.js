/**
 * 页面：alert-management
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    confirmAction,
    ep,
    loginUserName,
    mount,
    notify,
    paginate,
    refreshTick,
    state
  } = window.PortalVue;


  /* ===== 数据告警：选监控表 → 配告警规则 → 配告警模版 → 配告警通道 → 设告警方式 ===== */

  /* 度量值（数值型）字段不能作为「重复判定字段」：去重口径必须是用户名、设备、渠道这类维度字段 */
  const MEASURE_SQL_TYPES = ["BIGINT", "INT", "INTEGER", "SMALLINT", "TINYINT", "DECIMAL", "NUMERIC", "DOUBLE", "FLOAT", "REAL", "NUMBER", "MONEY", "BIGDECIMAL"];
  function isMeasureField(field) {
    const type = String(field?.type || "").toUpperCase().split("(")[0].trim();
    return MEASURE_SQL_TYPES.includes(type);
  }

  /* 监控埋点表：告警按事件流计算，字段同时作为规则条件与模版变量来源 */
  const alertMonitorTables = [
    {
      name: "dwd_user_login_log", cn: "用户登录埋点", bizLine: "安全合规",
      desc: "登录事件流，含设备指纹、IP 属地与网络环境判定字段",
      keyField: "user_name", timeField: "event_time",
      fields: [
        { name: "user_name", cn: "用户名", type: "VARCHAR" },
        { name: "event_time", cn: "登陆时间", type: "DATETIME" },
        { name: "user_agent", cn: "UA", type: "VARCHAR" },
        { name: "ip", cn: "IP", type: "VARCHAR" },
        { name: "province", cn: "登陆省份", type: "VARCHAR" },
        { name: "city", cn: "登陆城市", type: "VARCHAR" },
        { name: "device_id", cn: "设备ID", type: "VARCHAR" },
        { name: "is_workday", cn: "是否工作日", type: "BOOLEAN", values: ["是", "否"] },
        { name: "is_office_network", cn: "是否工作环境登陆", type: "BOOLEAN", values: ["是", "否"] },
        { name: "is_new_device", cn: "是否新设备ID", type: "BOOLEAN", values: ["是", "否"] },
        { name: "is_new_ip", cn: "是否新IP地址", type: "BOOLEAN", values: ["是", "否"] },
        { name: "is_wechat_env", cn: "是否微信环境", type: "BOOLEAN", values: ["是", "否"] },
        { name: "is_domestic", cn: "是否国内", type: "BOOLEAN", values: ["是", "否"] },
        { name: "is_login", cn: "是否登陆", type: "BOOLEAN", values: ["是", "否"] },
        { name: "today_device_cnt", cn: "用户今日登陆设备数", type: "BIGINT" }
      ]
    },
    {
      name: "dwd_board_share_log", cn: "看板分享埋点", bizLine: "安全合规",
      desc: "看板/报告分享与访问事件流，用于外发风险告警",
      keyField: "user_name", timeField: "event_time",
      fields: [
        { name: "user_name", cn: "用户名", type: "VARCHAR" },
        { name: "event_time", cn: "事件发生时间", type: "DATETIME" },
        { name: "board_name", cn: "看板名称", type: "VARCHAR" },
        { name: "share_id", cn: "分享ID", type: "VARCHAR" },
        { name: "viewer_name", cn: "访问者", type: "VARCHAR" },
        { name: "is_logged_in", cn: "是否登录", type: "BOOLEAN", values: ["是", "否"] },
        { name: "is_authorized", cn: "是否在权限范围内", type: "BOOLEAN", values: ["是", "否"] },
        { name: "is_public_link", cn: "是否公开链接", type: "BOOLEAN", values: ["是", "否"] },
        { name: "viewer_cnt", cn: "访问人数", type: "BIGINT" },
        { name: "province", cn: "登陆省份", type: "VARCHAR" },
        { name: "city", cn: "登陆城市", type: "VARCHAR" }
      ]
    },
    {
      name: "dwd_data_export_log", cn: "数据导出埋点", bizLine: "安全合规",
      desc: "数据导出/下载事件流，用于导出量与敏感字段告警",
      keyField: "user_name", timeField: "event_time",
      fields: [
        { name: "user_name", cn: "用户名", type: "VARCHAR" },
        { name: "event_time", cn: "事件发生时间", type: "DATETIME" },
        { name: "table_name", cn: "数据表", type: "VARCHAR" },
        { name: "export_format", cn: "导出格式", type: "VARCHAR" },
        { name: "row_count", cn: "导出行数", type: "BIGINT" },
        { name: "has_sensitive_field", cn: "是否含敏感字段", type: "BOOLEAN", values: ["是", "否"] },
        { name: "is_working_hours", cn: "是否工作时间", type: "BOOLEAN", values: ["是", "否"] },
        { name: "province", cn: "登陆省份", type: "VARCHAR" },
        { name: "city", cn: "登陆城市", type: "VARCHAR" }
      ]
    }
  ];

  /* 条件算子：按字段类型收敛可用算子 */
  /* 条件算子按字段类型收敛，取值方式与「人群包」保持一致；
     日期额外保留「时间范围」，用于表达工作时段类告警（人群包的相对/绝对时间覆盖不到）。 */
  const alertTypeOps = {
    "数值": [["gt", "大于"], ["lt", "小于"], ["eq", "等于"], ["gte", "大于等于"], ["lte", "小于等于"], ["between", "区间"], ["notnull", "有值"], ["isnull", "无值"]],
    "文本": [["eq", "等于"], ["ne", "不等于"], ["notnull", "有值"], ["isnull", "无值"]],
    "日期": [["timeBetween", "时间范围"], ["relative", "相对时间"], ["absolute", "绝对时间"], ["notnull", "有值"], ["isnull", "无值"]],
    "布尔": [["true", "是"], ["false", "否"], ["notnull", "有值"], ["isnull", "无值"]]
  };
  const alertNoValueOps = ["notnull", "isnull", "true", "false"];
  /* 「时间范围」按数据记录粒度选择：
     日 = 一天内的时段（HH:mm），周 = 一周内的星期几，月 = 一个月内的日期 */
  const alertTimeGrains = ["日", "周", "月"];
  const alertWeekChoices = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const alertMonthDayChoices = Array.from({ length: 31 }, (item, index) => index + 1 + "号");
  const alertRangeOps = ["between", "timeBetween"];
  const alertMultiValueTypes = ["文本"];

  /* 库内字段类型（VARCHAR/DATETIME/BOOLEAN/...）→ 人群包同款中文类型 */
  function alertFieldType(type) {
    const raw = String(type || "").toUpperCase();
    if (raw.startsWith("BOOL")) return "布尔";
    if (raw.startsWith("DATE") || raw.startsWith("TIME")) return "日期";
    if (["BIGINT", "INT", "INTEGER", "DECIMAL", "DOUBLE", "FLOAT", "NUMBER"].some(item => raw.startsWith(item))) return "数值";
    return "文本";
  }
  function alertOpsOf(type) {
    return (alertTypeOps[type] || alertTypeOps["文本"]).map(([value, label]) => ({ value, label }));
  }
  function alertNewCondition(fields) {
    const field = (fields || [])[0] || { name: "", type: "VARCHAR" };
    const type = alertFieldType(field.type);
    return {
      field: field.name,
      op: (alertTypeOps[type] || alertTypeOps["文本"])[0][0],
      value: alertMultiValueTypes.includes(type) ? [] : "",
      value1: null, value2: null, range: [],
      grain: "日"
    };
  }
  /* 旧数据（历史上用 eq/in/contains/notEmpty/isEmpty 等算子）迁移到新算子模型 */
  function normalizeAlertConditions(conditions, fields) {
    return (conditions || []).map(condition => {
      const field = (fields || []).find(item => item.name === condition.field) || {};
      const type = alertFieldType(field.type);
      const next = {
        field: condition.field, op: condition.op,
        value: condition.value, value1: condition.value1, value2: condition.value2,
        range: Array.isArray(condition.range) ? condition.range : []
      };
      if (condition.op === "notEmpty") next.op = "notnull";
      if (condition.op === "isEmpty") next.op = "isnull";
      if (["in", "contains", "notcontains"].includes(condition.op)) next.op = type === "文本" ? "eq" : "eq";
      if (type === "布尔") {
        if (condition.op === "eq") next.op = String(condition.value) === "是" ? "true" : "false";
        else if (condition.op === "ne") next.op = String(condition.value) === "是" ? "false" : "true";
        next.value = "";
      }
      if (type === "文本" && !Array.isArray(next.value)) {
        next.value = next.value === "" || next.value === undefined || next.value === null ? [] : [String(next.value)];
      }
      if (type === "数值" && !alertNoValueOps.includes(next.op) && !alertRangeOps.includes(next.op)
        && next.value !== "" && next.value !== null && next.value !== undefined && !Number.isNaN(Number(next.value))) {
        next.value = Number(next.value);
      }
      if (condition.op === "between" || condition.op === "timeBetween") {
        next.value1 = condition.value1 ?? condition.value ?? null;
        next.value2 = condition.value2 ?? null;
        next.value = "";
      }
      if (condition.op === "timeBetween") {
        next.grain = alertTimeGrains.includes(condition.grain) ? condition.grain : "日";
        /* 早先周/月粒度用的是日历区间，取值与新下拉选项不同，迁移时清空避免出现无效值 */
        const choices = next.grain === "周" ? alertWeekChoices : next.grain === "月" ? alertMonthDayChoices : null;
        if (choices) {
          if (!choices.includes(next.value1)) next.value1 = null;
          if (!choices.includes(next.value2)) next.value2 = null;
        }
      }
      const allowed = (alertTypeOps[type] || alertTypeOps["文本"]).map(item => item[0]);
      if (!allowed.includes(next.op)) next.op = allowed[0];
      return next;
    });
  }
  const alertCompactOps = {
    gt: ">", lt: "<", eq: "=", gte: "≥", lte: "≤", ne: "≠",
    between: " ", timeBetween: " "
  };

  /* 告警分类：可在「分类管理」中维护（参照人群包需求分类的做法） */
  const alertCategoryDefaults = ["账号安全", "数据外发", "数据质量", "业务波动"];
  const alertBotName = "观星台飞书机器人";
  const alertGroupChoices = ["数据安全告警群", "投放运营群", "数据分析师群", "权益业务群", "高管数据群"];
  const alertTestGroupChoices = ["告警测试群（仅自己）"];
  const alertFreqChoices = ["每小时", "每天", "每周"];
  const alertWeekdayChoices = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const alertTimeChoices = ["00:00", "08:00", "09:00", "10:00", "12:00", "18:00", "20:00"];
  const alertDedupChoices = [
    { value: "interval", label: "时间范围内不重复通知" },
    { value: "once", label: "只通知一次" },
    { value: "always", label: "每次触发都通知" }
  ];
  const alertSampleValues = {
    "用户名": "曾祥竞", "登陆时间": "2026-09-15 10:24:31", "事件发生时间": "2026-09-15 10:24:31",
    "UA": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/128.0.0.0",
    "IP": "113.87.42.18", "登陆省份": "广东省", "登陆城市": "深圳市",
    "设备ID": "DEV-8f3c21a9", "用户今日登陆设备数": "2",
    "看板名称": "权益核心大盘", "分享ID": "9f3c21a9b7e4d201", "访问者": "谭嘉颖", "访问人数": "6",
    "数据表": "dwd_user_order_detail", "导出格式": "xlsx", "导出行数": "128,430"
  };

  /* 新建告警的初始表单：默认落在登录埋点表，实时计算 */
  function createAlertForm() {
    const table = alertMonitorTables[0];
    const dimensionFields = (table.fields || []).filter(field => !isMeasureField(field));
    const defaultKeyField = dimensionFields.find(field => field.name === table.keyField) || dimensionFields[0] || {};
    return {
      name: "", category: alertCategoryDefaults[0], desc: "", owner: loginUserName(), requester: loginUserName(),
      table: table.name, keyField: defaultKeyField.name || "", timeField: table.timeField,
      relation: "AND",
      conditions: [alertNewCondition(table.fields)],
      mode: "realtime",
      schedule: { freq: "每天", weekday: "周一", time: "09:00", minute: 0 },
      dedup: { mode: "interval", intervalMinutes: 10 },
      channel: { groups: [], users: [] },
      testChannel: { groups: [], users: [] },
      template: { style: "card", title: "", lines: [{ label: "用户名", value: "{用户名}" }] }
    };
  }

  /* 条件 → 人类可读规则描述（纯函数，列表页与表单页共用） */
  /* 列表摘要：算子用符号，区间省略「在…之间」，避免长文案占满整列 */
  function alertRuleText(conditions, relation, fields) {
    const labelOf = fieldName => fields.find(field => field.name === fieldName)?.cn || fieldName || "";
    const rows = (conditions || []).filter(condition => condition.field);
    if (!rows.length) return "尚未配置触发条件";
    const joiner = relation === "AND" ? " 且 " : " 或 ";
    const blank = value => value === "" || value === undefined || value === null;
    return rows.map(row => {
      const field = labelOf(row.field);
      if (row.op === "true") return field + "=是";
      if (row.op === "false") return field + "=否";
      if (row.op === "notnull") return field + " 有值";
      if (row.op === "isnull") return field + " 无值";
      if (row.op === "between") return field + " " + (blank(row.value1) ? "?" : row.value1) + "~" + (blank(row.value2) ? "?" : row.value2);
      if (row.op === "timeBetween") return field + " " + (row.value1 || "?") + "~" + (row.value2 || "?");
      if (row.op === "relative") return field + " 最近 " + (blank(row.value1) ? "?" : row.value1) + " 天";
      if (row.op === "absolute") {
        const range = row.range || [];
        return field + " " + (range[0] || "?") + "~" + (range[1] || "?");
      }
      const value = Array.isArray(row.value) ? row.value.join("、") : row.value;
      return field + (alertCompactOps[row.op] || row.op) + (blank(value) ? "?" : value);
    }).join(joiner);
  }

  const alertSeeds = [
    {
      id: "AL20260901001", name: "用户工作时间非公司环境登陆", category: "账号安全",
      desc: "工作日 9:00–19:00 从非公司网络环境登录时实时提醒", owner: "曾祥竞", creator: "曾祥竞", requester: "曾祥竞",
      table: "dwd_user_login_log", tableCn: "用户登录埋点", keyField: "user_name", timeField: "event_time",
      relation: "AND",
      conditions: [
        { field: "is_workday", op: "true", value: "", value1: null, value2: null, range: [] },
        { field: "event_time", op: "timeBetween", value: "", value1: "09:00", value2: "19:00", range: [], grain: "日" },
        { field: "is_office_network", op: "false", value: "", value1: null, value2: null, range: [] }
      ],
      mode: "realtime", schedule: { freq: "每小时", time: "09:00", minute: 0 },
      dedup: { mode: "interval", intervalMinutes: 10 },
      channel: { groups: ["数据安全告警群"], users: ["曾祥竞"] },
      testChannel: { groups: ["告警测试群（仅自己）"], users: ["曾祥竞"] },
      template: {
        style: "card", title: "用户工作时间非公司环境登陆",
        lines: [
          { label: "用户名", value: "{用户名}" },
          { label: "登陆时间", value: "{登陆时间}" },
          { label: "UA", value: "{UA}" },
          { label: "登陆省份", value: "{登陆省份}" },
          { label: "登陆城市", value: "{登陆城市}" }
        ]
      },
      enabled: true, lastTriggered: "2026-09-15 10:24", recent7dCount: 12,
      history: [
        { time: "2026-09-15 10:24", summary: "曾祥竞 工作时间从非公司环境登陆（广东省深圳市），已推送「数据安全告警群」", status: "已推送" },
        { time: "2026-09-12 14:08", summary: "谭嘉颖 工作时间从非公司环境登陆（广东省广州市），已推送「数据安全告警群」", status: "已推送" },
        { time: "2026-09-11 09:31", summary: "林金维 工作时间从非公司环境登陆（海南省海口市），已推送「数据安全告警群」", status: "已推送" }
      ]
    },
    {
      id: "AL20260901002", name: "用户工作时间异地登陆", category: "账号安全",
      desc: "工作日 9:00–19:00 国内且登录城市不在广州时实时提醒", owner: "曾祥竞", creator: "曾祥竞", requester: "黄佩贤",
      table: "dwd_user_login_log", tableCn: "用户登录埋点", keyField: "user_name", timeField: "event_time",
      relation: "AND",
      conditions: [
        { field: "is_workday", op: "true", value: "", value1: null, value2: null, range: [] },
        { field: "event_time", op: "timeBetween", value: "", value1: "09:00", value2: "19:00", range: [], grain: "日" },
        { field: "city", op: "ne", value: ["广州"], value1: null, value2: null, range: [] },
        { field: "is_domestic", op: "true", value: "", value1: null, value2: null, range: [] },
        { field: "is_login", op: "true", value: "", value1: null, value2: null, range: [] }
      ],
      mode: "realtime", schedule: { freq: "每小时", time: "09:00", minute: 0 },
      dedup: { mode: "interval", intervalMinutes: 10 },
      channel: { groups: ["数据安全告警群"], users: ["曾祥竞"] },
      testChannel: { groups: ["告警测试群（仅自己）"], users: ["曾祥竞"] },
      template: {
        style: "card", title: "用户工作时间异地登陆",
        lines: [
          { label: "用户名", value: "{用户名}" },
          { label: "登陆时间", value: "{登陆时间}" },
          { label: "登陆省份", value: "{登陆省份}" },
          { label: "登陆城市", value: "{登陆城市}" }
        ]
      },
      enabled: true, lastTriggered: "2026-09-15 09:12", recent7dCount: 7,
      history: [
        { time: "2026-09-15 09:12", summary: "黄佩贤 工作时间异地登陆（广东省深圳市），已推送「数据安全告警群」", status: "已推送" },
        { time: "2026-09-10 16:47", summary: "李雨航 工作时间异地登陆（北京市），已推送「数据安全告警群」", status: "已推送" }
      ]
    },
    {
      id: "AL20260901003", name: "用户新设备登陆", category: "账号安全",
      desc: "新设备 ID 且新 IP 地址登录时实时提醒", owner: "黄佩贤", creator: "黄佩贤", requester: "李雨航",
      table: "dwd_user_login_log", tableCn: "用户登录埋点", keyField: "user_name", timeField: "event_time",
      relation: "AND",
      conditions: [
        { field: "is_new_device", op: "true", value: "", value1: null, value2: null, range: [] },
        { field: "is_new_ip", op: "true", value: "", value1: null, value2: null, range: [] },
        { field: "is_login", op: "true", value: "", value1: null, value2: null, range: [] }
      ],
      mode: "realtime", schedule: { freq: "每小时", time: "09:00", minute: 0 },
      dedup: { mode: "interval", intervalMinutes: 10 },
      channel: { groups: ["数据安全告警群", "投放运营群"], users: ["黄佩贤"] },
      testChannel: { groups: ["告警测试群（仅自己）"], users: ["黄佩贤"] },
      template: {
        style: "card", title: "用户新设备登陆",
        lines: [
          { label: "用户名", value: "{用户名}" },
          { label: "登陆时间", value: "{登陆时间}" },
          { label: "UA", value: "{UA}" },
          { label: "登陆省份", value: "{登陆省份}" },
          { label: "登陆城市", value: "{登陆城市}" }
        ]
      },
      enabled: true, lastTriggered: "2026-09-14 20:31", recent7dCount: 4,
      history: [
        { time: "2026-09-14 20:31", summary: "林金维 在新设备 DEV-8f3c21a9 登陆（广东省广州市），已推送「数据安全告警群」", status: "已推送" },
        { time: "2026-09-08 11:02", summary: "谭嘉颖 在新设备 DEV-2b71e0c4 登陆（广东省佛山市），已推送「投放运营群」", status: "已推送" }
      ]
    },
    {
      id: "AL20260901004", name: "用户微信环境登陆", category: "账号安全",
      desc: "从微信内置浏览器打开观星台时实时提醒", owner: "李雨航", creator: "李雨航", requester: "谭嘉颖",
      table: "dwd_user_login_log", tableCn: "用户登录埋点", keyField: "user_name", timeField: "event_time",
      relation: "AND",
      conditions: [
        { field: "is_wechat_env", op: "true", value: "", value1: null, value2: null, range: [] },
        { field: "is_login", op: "true", value: "", value1: null, value2: null, range: [] }
      ],
      mode: "realtime", schedule: { freq: "每小时", time: "09:00", minute: 0 },
      dedup: { mode: "interval", intervalMinutes: 10 },
      channel: { groups: ["数据安全告警群"], users: ["李雨航"] },
      testChannel: { groups: ["告警测试群（仅自己）"], users: ["李雨航"] },
      template: {
        style: "card", title: "用户微信环境登陆",
        lines: [
          { label: "用户名", value: "{用户名}" },
          { label: "登陆时间", value: "{登陆时间}" },
          { label: "UA", value: "{UA}" },
          { label: "登陆省份", value: "{登陆省份}" },
          { label: "登陆城市", value: "{登陆城市}" }
        ]
      },
      enabled: true, lastTriggered: "2026-09-13 18:55", recent7dCount: 3,
      history: [
        { time: "2026-09-13 18:55", summary: "王鑫宇 从微信内置浏览器登陆（广东省广州市），已推送「数据安全告警群」", status: "已推送" }
      ]
    },
    {
      id: "AL20260901005", name: "用户今日多设备登陆", category: "账号安全",
      desc: "同一用户当日登录设备数 ≥ 2 时实时提醒，疑似账号共享", owner: "曾祥竞", creator: "曾祥竞", requester: "曾祥竞",
      table: "dwd_user_login_log", tableCn: "用户登录埋点", keyField: "user_name", timeField: "event_time",
      relation: "AND",
      conditions: [
        { field: "today_device_cnt", op: "gte", value: 2, value1: null, value2: null, range: [] },
        { field: "is_login", op: "true", value: "", value1: null, value2: null, range: [] }
      ],
      mode: "realtime", schedule: { freq: "每小时", time: "09:00", minute: 0 },
      dedup: { mode: "interval", intervalMinutes: 10 },
      channel: { groups: ["数据安全告警群"], users: ["曾祥竞"] },
      testChannel: { groups: ["告警测试群（仅自己）"], users: ["曾祥竞"] },
      template: {
        style: "card", title: "用户今日多设备登陆",
        lines: [
          { label: "用户名", value: "{用户名}" },
          { label: "用户今日登陆设备数", value: "{用户今日登陆设备数}" },
          { label: "最近登陆时间", value: "{登陆时间}" }
        ]
      },
      enabled: true, lastTriggered: "2026-09-15 11:40", recent7dCount: 9,
      history: [
        { time: "2026-09-15 11:40", summary: "谭嘉颖 今日已在 2 台设备登陆（最近登陆 11:40），已推送「数据安全告警群」", status: "已推送" },
        { time: "2026-09-15 10:18", summary: "林金维 今日已在 3 台设备登陆（最近登陆 10:18），已推送「数据安全告警群」", status: "已推送" }
      ]
    }
  ];

  /* 数据告警：配置式规则（选表 → 规则 → 模版 → 通道 → 方式），推送走观星台飞书机器人 */
  const AlertManagementApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <el-tabs v-model="status" class="portal-vue-status-tabs" @tab-change="resetPage">
            <el-tab-pane :label="'启用中（' + enabledCount + '）'" name="启用"></el-tab-pane>
            <el-tab-pane :label="'已停用（' + disabledCount + '）'" name="停用"></el-tab-pane>
          </el-tabs>
          <div class="portal-vue-toolbar">
            <div class="portal-vue-toolbar-left">
              <el-input v-model="keyword" class="portal-vue-search" clearable placeholder="搜索告警名称" @input="resetPage"></el-input>
              <el-select v-model="categoryFilter" clearable placeholder="全部分类" style="width:150px" @change="resetPage">
                <el-option v-for="item in managedCategories" :key="item" :label="item" :value="item"></el-option>
              </el-select>
              <el-select v-model="requesterFilter" clearable filterable placeholder="全部需求人" style="width:150px" @change="resetPage">
                <el-option v-for="user in activeUsers" :key="user.name" :label="user.name" :value="user.name"></el-option>
              </el-select>
              <el-select v-model="ownerFilter" clearable filterable placeholder="全部负责人" style="width:150px" @change="resetPage">
                <el-option v-for="user in activeUsers" :key="user.name" :label="user.name" :value="user.name"></el-option>
              </el-select>
              <el-select v-model="groupFilter" clearable filterable placeholder="全部推送群" style="width:150px" @change="resetPage">
                <el-option v-for="group in groupChoices" :key="group" :label="group" :value="group"></el-option>
              </el-select>
              <el-select v-model="pushUserFilter" clearable filterable placeholder="全部推送人" style="width:150px" @change="resetPage">
                <el-option v-for="user in activeUsers" :key="user.name" :label="user.name" :value="user.name"></el-option>
              </el-select>
            </div>
            <div class="portal-vue-actions">
              <el-button @click="categoryManagerVisible = true">分类管理</el-button>
              <el-button v-if="canEdit('数据告警')" type="primary" @click="openCreate">＋ 新建告警</el-button>
            </div>
          </div>
          <el-table :data="pagedRows" class="portal-vue-table portal-vue-alert-table" border empty-text="暂无告警数据，点右上角「新建告警」配置规则">
            <el-table-column label="告警名称" min-width="180" fixed="left">
              <template #default="scope">
                <div class="portal-vue-alert-cell-name">{{ scope.row.name }}</div>
              </template>
            </el-table-column>
            <el-table-column label="分类" min-width="104">
              <template #default="scope">
                <el-tag v-if="scope.row.category" size="small" effect="plain" class="portal-vue-alert-cell-tag">{{ scope.row.category }}</el-tag>
                <span v-else class="portal-vue-muted">—</span>
              </template>
            </el-table-column>
            <el-table-column label="监控表" min-width="150">
              <template #default="scope">
                <div>{{ scope.row.tableCn || scope.row.table }}</div>
                <div class="portal-vue-muted portal-vue-alert-cell-sub">{{ scope.row.table }}</div>
              </template>
            </el-table-column>
            <el-table-column label="需求人" min-width="88">
              <template #default="scope">
                <span>{{ scope.row.requester || "—" }}</span>
              </template>
            </el-table-column>
            <el-table-column label="负责人" min-width="88">
              <template #default="scope">
                <span>{{ scope.row.owner || "—" }}</span>
              </template>
            </el-table-column>
            <el-table-column label="触发条件" min-width="176">
              <template #default="scope">
                <div class="portal-vue-alert-cell-rule">{{ ruleSummary(scope.row) }}</div>
              </template>
            </el-table-column>
            <el-table-column label="告警方式" width="104">
              <template #default="scope">
                <el-tag size="small" :type="scope.row.mode === 'realtime' ? 'primary' : 'warning'" effect="plain">{{ modeLabel(scope.row) }}</el-tag>
                <div v-if="scope.row.mode === 'scheduled'" class="portal-vue-muted portal-vue-alert-cell-sub">{{ scheduleSummary(scope.row) }}</div>
              </template>
            </el-table-column>
            <el-table-column label="重复通知" min-width="136">
              <template #default="scope">
                <span>{{ dedupSummary(scope.row) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="推送通道" min-width="128">
              <template #default="scope">
                <div style="display:flex;flex-wrap:wrap;gap:4px">
                  <el-tag v-for="group in scope.row.channel.groups" :key="group" size="small" type="success" effect="plain">{{ group }}</el-tag>
                  <el-tag v-for="user in scope.row.channel.users" :key="user" size="small" effect="plain">{{ user }}</el-tag>
                  <span v-if="!scope.row.channel.groups.length && !scope.row.channel.users.length" class="portal-vue-muted">未配置</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="最近触发" width="138">
              <template #default="scope">
                <el-button link type="primary" class="portal-vue-alert-cell-link" @click="openHistory(scope.row)">{{ scope.row.lastTriggered === '—' ? '尚未触发' : scope.row.lastTriggered }}</el-button>
              </template>
            </el-table-column>
            <el-table-column label="近7日告警次数" width="112">
              <template #default="scope">
                <span>{{ scope.row.recent7dCount || 0 }} 次</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="92">
              <template #default="scope">
                <div class="portal-vue-alert-cell-status">
                  <el-switch :disabled="!canEdit('数据告警')" v-model="scope.row.enabled" inline-prompt active-text="启用" inactive-text="停用" active-color="#16a34a" @change="toggleEnabled(scope.row)"></el-switch>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="96" fixed="right">
              <template #default="scope">
                <div class="portal-vue-actions">
                  <el-button v-if="canEdit('数据告警')" link type="primary" @click="openEdit(scope.row)">编辑</el-button>
                  <el-button v-if="canEdit('数据告警')" link type="danger" @click="removeAlert(scope.row)">删除</el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
          <div class="portal-vue-pagination"><span>共 {{ filteredRows.length }} 条，当前 {{ rangeText }}</span><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,20,50]" :total="filteredRows.length" layout="sizes, prev, pager, next"></el-pagination></div>
        </section>

        <el-dialog v-model="dialogVisible" fullscreen class="portal-vue-fullscreen-dialog" :close-on-click-modal="false">
          <template #header>
            <div class="portal-vue-alert-dialog-head">
              <el-button link class="portal-vue-alert-back" @click="dialogVisible = false"><span class="portal-vue-alert-back-arrow">←</span> 返回</el-button>
              <span class="portal-vue-alert-dialog-title">{{ (editingId ? '编辑' : '新建') + '数据告警' }}</span>
            </div>
          </template>
          <el-form ref="formRef" :model="form" :rules="formRules" label-position="left" label-width="170px" class="portal-vue-alert-form">
            <section class="portal-vue-alert-section">
              <div class="portal-vue-alert-section-title">1 · 基本信息</div>
              <el-form-item label="告警名称" prop="name">
                <el-input v-model="form.name" maxlength="50" show-word-limit placeholder="例如：用户工作时间非公司环境登陆"></el-input>
              </el-form-item>
              <el-form-item label="告警分类" prop="category">
                <div class="portal-vue-alert-inline">
                  <el-select v-model="form.category" filterable allow-create default-first-option placeholder="选择或输入分类">
                    <el-option v-for="item in managedCategories" :key="item" :label="item" :value="item"></el-option>
                  </el-select>
                  <el-button @click="categoryManagerVisible = true">管理分类</el-button>
                </div>
              </el-form-item>
              <el-form-item label="负责人" prop="owner">
                <el-select v-model="form.owner" filterable>
                  <el-option v-for="user in activeUsers" :key="user.name" :label="user.name" :value="user.name"></el-option>
                </el-select>
              </el-form-item>
              <el-form-item label="需求人" prop="requester">
                <el-select v-model="form.requester" filterable placeholder="选择提出该告警需求的同事">
                  <el-option v-for="user in activeUsers" :key="user.name" :label="user.name" :value="user.name"></el-option>
                </el-select>
              </el-form-item>
              <el-form-item label="告警说明">
                <el-input v-model="form.desc" type="textarea" :rows="2" maxlength="200" show-word-limit placeholder="说明这条告警监控什么、触发后会通知谁"></el-input>
              </el-form-item>
            </section>

            <section class="portal-vue-alert-section">
              <div class="portal-vue-alert-section-title">2 · 选择监控表</div>
              <el-form-item label="监控表" prop="table">
                <el-select v-model="form.table" filterable @change="changeTable">
                  <el-option v-for="table in monitorTables" :key="table.name" :label="table.cn + '（' + table.name + '）'" :value="table.name"></el-option>
                </el-select>
              </el-form-item>
            </section>

            <section class="portal-vue-alert-section">
              <div class="portal-vue-alert-section-title">3 · 配置告警规则</div>
              <el-form-item label="触发条件" prop="conditions" class="portal-vue-alert-wide">
                <div class="portal-vue-alert-rule">
                  <button type="button" class="portal-vue-alert-relation" aria-label="切换条件关系" @click="toggleRelation"><span>{{ form.relation === 'AND' ? '且' : '或' }}</span></button>
                  <div class="portal-vue-alert-condition-list">
                    <div v-for="(condition, index) in form.conditions" :key="index" class="portal-vue-alert-condition-row" :class="{ 'portal-vue-alert-row-grain': condition.op === 'timeBetween' }">
                      <el-select v-model="condition.field" filterable @change="changeConditionField(condition)">
                        <el-option v-for="field in currentFields" :key="field.name" :label="field.cn + '（' + field.name + '）'" :value="field.name"></el-option>
                      </el-select>
                      <el-select v-model="condition.op">
                        <el-option v-for="op in conditionOps(condition)" :key="op.value" :label="op.label" :value="op.value"></el-option>
                      </el-select>
                      <el-select v-if="condition.op === 'timeBetween'" v-model="condition.grain" class="portal-vue-alert-grain" @change="changeConditionGrain(condition)">
                        <el-option v-for="grain in timeGrains" :key="grain" :label="grain" :value="grain"></el-option>
                      </el-select>
                      <span v-if="alertNoValueOps.includes(condition.op)" class="portal-vue-alert-novalue">无需填写值</span>
                      <div v-else-if="condition.op === 'timeBetween' && (condition.grain || '日') === '日'" class="portal-vue-alert-range">
                        <el-time-picker v-model="condition.value1" format="HH:mm" value-format="HH:mm" placeholder="开始时间"></el-time-picker>
                        <span>~</span>
                        <el-time-picker v-model="condition.value2" format="HH:mm" value-format="HH:mm" placeholder="结束时间"></el-time-picker>
                      </div>
                      <div v-else-if="condition.op === 'timeBetween' && condition.grain === '周'" class="portal-vue-alert-range">
                        <el-select v-model="condition.value1" filterable placeholder="开始星期">
                          <el-option v-for="day in weekChoices" :key="day" :label="day" :value="day"></el-option>
                        </el-select>
                        <span>~</span>
                        <el-select v-model="condition.value2" filterable placeholder="结束星期">
                          <el-option v-for="day in weekChoices" :key="day" :label="day" :value="day"></el-option>
                        </el-select>
                      </div>
                      <div v-else-if="condition.op === 'timeBetween' && condition.grain === '月'" class="portal-vue-alert-range">
                        <el-select v-model="condition.value1" filterable placeholder="开始日期">
                          <el-option v-for="day in monthDayChoices" :key="day" :label="day" :value="day"></el-option>
                        </el-select>
                        <span>~</span>
                        <el-select v-model="condition.value2" filterable placeholder="结束日期">
                          <el-option v-for="day in monthDayChoices" :key="day" :label="day" :value="day"></el-option>
                        </el-select>
                      </div>
                      <div v-else-if="condition.op === 'between'" class="portal-vue-alert-range">
                        <el-input-number v-model="condition.value1" :controls="false" placeholder="最小值"></el-input-number>
                        <span>~</span>
                        <el-input-number v-model="condition.value2" :controls="false" placeholder="最大值"></el-input-number>
                      </div>
                      <div v-else-if="condition.op === 'relative'" class="portal-vue-alert-inline">
                        <span>最近</span>
                        <el-input-number v-model="condition.value1" :min="1" :step="1" controls-position="right"></el-input-number>
                        <span>天以内（含今天）</span>
                      </div>
                      <el-date-picker v-else-if="condition.op === 'absolute'" v-model="condition.range" type="datetimerange" range-separator="到" start-placeholder="开始时间" end-placeholder="结束时间" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm"></el-date-picker>
                      <el-select v-else-if="alertMultiValueTypes.includes(conditionType(condition))" v-model="condition.value" multiple filterable allow-create default-first-option placeholder="选择或输入值，可多选">
                        <el-option v-for="value in conditionField(condition).values || []" :key="value" :label="value" :value="value"></el-option>
                      </el-select>
                      <el-input-number v-else-if="conditionType(condition) === '数值'" v-model="condition.value" :controls="false" placeholder="请输入数值"></el-input-number>
                      <el-input v-else v-model="condition.value" placeholder="请输入条件值"></el-input>
                      <el-button v-if="form.conditions.length > 1" link type="danger" title="删除条件" @click="removeCondition(index)">×</el-button>
                      <span v-else></span>
                    </div>
                    <el-button v-if="canEdit('数据告警')" link type="primary" @click="addCondition">+ 添加条件</el-button>
                  </div>
                </div>
              </el-form-item>
            </section>

            <section class="portal-vue-alert-section">
              <div class="portal-vue-alert-section-title">4 · 配置告警模版<span class="portal-vue-alert-section-hint">标题 + 内容行，支持插入变量并实时预览</span></div>
              <el-form-item label="通知标题" prop="template.title">
                <el-input v-model="form.template.title" maxlength="60" placeholder="例如：用户工作时间非公司环境登陆"></el-input>
              </el-form-item>
              <el-form-item label="通知内容" prop="template.lines" class="portal-vue-alert-wide">
                <div class="portal-vue-alert-tpl">
                  <div v-for="(line, index) in form.template.lines" :key="index" class="portal-vue-alert-tpl-row">
                    <el-input v-model="line.label" placeholder="字段名，例如：登陆时间"></el-input>
                    <el-input v-model="line.value" placeholder="值或变量，例如：{登陆时间}"></el-input>
                    <el-dropdown trigger="click" @command="name => insertVariable(index, name)">
                      <el-button>插入变量</el-button>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item v-for="field in currentFields" :key="field.name" :command="field.cn">{{ field.cn }}（{{ field.name }}）</el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                    <el-button v-if="form.template.lines.length > 1" link type="danger" title="删除该行" @click="removeTemplateLine(index)">×</el-button>
                    <span v-else></span>
                  </div>
                  <el-button v-if="canEdit('数据告警')" link type="primary" @click="addTemplateLine">+ 添加内容行</el-button>
                </div>
              </el-form-item>
              <el-form-item label="推送效果预览" class="portal-vue-alert-wide">
                <div class="portal-vue-alert-preview">
                  <div class="portal-vue-alert-preview-head"><img class="portal-vue-alert-preview-avatar" src="assets/momentx-observatory-icon.png" alt="观星台" /><div><strong>{{ botName }}</strong><span>机器人 · 刚刚</span></div></div>
                  <div class="portal-vue-alert-preview-card">
                    <div class="portal-vue-alert-preview-title">{{ previewTitle }}</div>
                    <div class="portal-vue-alert-preview-body">
                      <div v-for="(line, index) in previewLines" :key="index" class="portal-vue-alert-preview-line"><span>{{ line.label }}</span><b>{{ line.text }}</b></div>
                    </div>
                    <div class="portal-vue-alert-preview-foot">观星台 · 数据告警 · {{ modeSummary(form) }}</div>
                  </div>
                </div>
              </el-form-item>
            </section>

            <section class="portal-vue-alert-section">
              <div class="portal-vue-alert-section-title">5 · 配置告警通道</div>
              <el-form-item label="飞书机器人" class="portal-vue-alert-wide">
                <div class="portal-vue-alert-bot"><span class="portal-vue-ai-bot-icon">🤖</span><div><strong>{{ botName }}</strong><span>已接入飞书，触发时按下方群与人员推送卡片消息</span></div><el-tag size="small" type="success" effect="light">已接入</el-tag></div>
              </el-form-item>
              <el-form-item label="告警群" prop="channel.groups">
                <el-select v-model="form.channel.groups" multiple filterable placeholder="选择要通知的飞书群" @change="revalidateChannel">
                  <el-option v-for="group in groupChoices" :key="group" :label="group" :value="group"></el-option>
                </el-select>
                <div class="portal-vue-alert-hint">告警群与通知人<b>至少填写一个</b>，两者都填则同时推送。</div>
              </el-form-item>
              <el-form-item label="通知人" prop="channel.users">
                <el-select v-model="form.channel.users" multiple filterable placeholder="选择要通知的用户" @change="revalidateChannel">
                  <el-option v-for="user in activeUsers" :key="user.name" :label="user.name" :value="user.name"></el-option>
                </el-select>
              </el-form-item>
              <el-form-item label="测试通道" class="portal-vue-alert-wide">
                <div class="portal-vue-alert-test">
                  <div class="portal-vue-alert-test-head"><span class="portal-vue-muted">测试告警只发往测试通道，不会打扰正式告警群</span></div>
                  <div class="portal-vue-alert-test-grid">
                    <div class="portal-vue-alert-field">
                      <label>测试群</label>
                      <el-select v-model="form.testChannel.groups" multiple filterable placeholder="选择测试群">
                        <el-option v-for="group in testGroupChoices" :key="group" :label="group" :value="group"></el-option>
                      </el-select>
                    </div>
                    <div class="portal-vue-alert-field">
                      <label>测试接收人</label>
                      <el-select v-model="form.testChannel.users" multiple filterable placeholder="选择测试接收人">
                        <el-option v-for="user in activeUsers" :key="user.name" :label="user.name" :value="user.name"></el-option>
                      </el-select>
                    </div>
                  </div>
                  <div class="portal-vue-alert-inline">
                    <el-button :loading="testing" @click="sendTestAlert">发送测试告警</el-button>
                    <span v-if="testResult" class="portal-vue-alert-ok">✓ {{ testResult }}</span>
                    <span v-else class="portal-vue-muted">测试通道未配置时无法测试发送</span>
                  </div>
                </div>
              </el-form-item>
            </section>

            <section class="portal-vue-alert-section">
              <div class="portal-vue-alert-section-title">6 · 设置告警方式</div>
              <el-form-item label="告警方式" prop="mode">
                <el-radio-group v-model="form.mode">
                  <el-radio value="realtime">实时（事件到达即计算并通知）</el-radio>
                  <el-radio value="scheduled">定时（按调度周期扫描）</el-radio>
                </el-radio-group>
              </el-form-item>
              <el-form-item v-if="form.mode === 'scheduled'" label="检查频率" prop="schedule.freq">
                <el-select v-model="form.schedule.freq">
                  <el-option v-for="item in freqChoices" :key="item" :label="item" :value="item"></el-option>
                </el-select>
              </el-form-item>
              <el-form-item v-if="form.mode === 'scheduled' && form.schedule.freq === '每周'" label="执行日" prop="schedule.weekday">
                <el-select v-model="form.schedule.weekday" placeholder="选择周几">
                  <el-option v-for="item in weekdayChoices" :key="item" :label="item" :value="item"></el-option>
                </el-select>
              </el-form-item>
              <el-form-item v-if="form.mode === 'scheduled'" label="执行时间" prop="schedule.time">
                <div v-if="form.schedule.freq === '每小时'" class="portal-vue-alert-inline">
                  <span>每小时第</span>
                  <el-input-number v-model="form.schedule.minute" :min="0" :max="59" controls-position="right"></el-input-number>
                  <span>分钟执行</span>
                </div>
                <el-time-picker v-else v-model="form.schedule.time" format="HH:mm" value-format="HH:mm" placeholder="选择时间"></el-time-picker>
              </el-form-item>
              <el-form-item label="重复告警" class="portal-vue-alert-wide" prop="dedup.mode">
                <el-radio-group v-model="form.dedup.mode">
                  <el-radio v-for="item in dedupChoices" :key="item.value" :value="item.value">{{ item.label }}</el-radio>
                </el-radio-group>
              </el-form-item>
              <el-form-item v-if="form.dedup.mode !== 'always'" label="重复判定字段" prop="keyField">
                <el-select v-model="form.keyField" filterable :placeholder="dedupFields.length ? '选择用于判断是否重复的字段' : '该表没有可去重的维度字段'">
                  <el-option v-for="field in dedupFields" :key="field.name" :label="field.cn + '（' + field.name + '）'" :value="field.name"></el-option>
                </el-select>
                <div class="portal-vue-alert-hint">同一<b>{{ keyFieldLabel }}</b>只算同一条告警，是否再次通知由上面的重复规则决定。<span class="portal-vue-muted">只提供维度字段，度量值（数值型）不能作为去重口径。</span></div>
              </el-form-item>
              <el-form-item v-if="form.dedup.mode === 'interval'" label="重复间隔" prop="dedup.intervalMinutes">
                <div class="portal-vue-alert-inline">
                  <span>同一{{ keyFieldLabel }}在</span>
                  <el-input-number v-model="form.dedup.intervalMinutes" :min="1" :max="1440" controls-position="right"></el-input-number>
                  <span>分钟内不重复通知</span>
                </div>
              </el-form-item>
            </section>
          </el-form>
          <template #footer>
            <el-button @click="dialogVisible = false">取消</el-button>
            <el-button v-if="canEdit('数据告警')" type="primary" :loading="saving" @click="saveAlert">保存告警</el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="categoryManagerVisible" title="管理告警分类" width="520px">
          <div class="portal-vue-alert-inline">
            <el-input v-model="categoryDraft" maxlength="20" placeholder="输入新的分类名称"></el-input>
            <el-button type="primary" @click="addCategory">添加</el-button>
          </div>
          <div class="portal-vue-alert-cats">
            <div v-for="item in managedCategories" :key="item" class="portal-vue-alert-cat">
              <span>{{ item }}</span>
              <span class="portal-vue-muted">{{ countByCategory(item) }} 条告警</span>
              <el-button v-if="canEdit('数据告警')" link type="danger" @click="removeCategory(item)">删除</el-button>
            </div>
          </div>
          <template #footer><el-button @click="categoryManagerVisible = false">关闭</el-button></template>
        </el-dialog>

        <el-dialog v-model="historyVisible" :title="historyTitle + ' · 触发记录'" width="560px">
          <div class="portal-vue-skill-drawer">
            <div v-for="item in historyRows" :key="item.time" class="portal-vue-skill-version">
              <div class="portal-vue-skill-version-head"><strong>{{ item.time }}</strong><el-tag size="small" type="success" effect="light">{{ item.status }}</el-tag></div>
              <p>{{ item.summary }}</p>
            </div>
            <p v-if="!historyRows.length" class="portal-vue-muted">暂无触发记录，规则启用后将在这里展示每次触发的推送情况。</p>
          </div>
        </el-dialog>
      </el-config-provider>
    `,
    data: () => ({
      status: "启用", page: 1, pageSize: 10, keyword: "", categoryFilter: "", requesterFilter: "", ownerFilter: "", groupFilter: "", pushUserFilter: "",
      dialogVisible: false, editingId: "", form: createAlertForm(),
      saving: false,
      categoryManagerVisible: false, categoryDraft: "", savedCategories: [],
      testing: false, testResult: "",
      historyVisible: false, historyTitle: "", historyRows: [],
      alerts: [],
      botName: alertBotName, alertNoValueOps, alertRangeOps, alertMultiValueTypes, timeGrains: alertTimeGrains, weekChoices: alertWeekChoices, monthDayChoices: alertMonthDayChoices,
      groupChoices: alertGroupChoices, testGroupChoices: alertTestGroupChoices,
      freqChoices: alertFreqChoices, timeChoices: alertTimeChoices, weekdayChoices: alertWeekdayChoices,
      dedupChoices: alertDedupChoices
    }),
    computed: {
      /* 必填校验：标量字段走 Element Plus 规则，条件/模版等复合项走自定义校验器 */
      formRules() {
        const required = message => ({ required: true, message, trigger: "change" });
        return {
          name: [{ required: true, message: "请填写告警名称", trigger: "blur" }],
          category: [required("请选择告警分类")],
          owner: [required("请选择负责人")],
          requester: [required("请选择需求人")],
          table: [required("请选择监控表")],
          keyField: [
            required("请选择重复判定字段（用于重复通知去重）"),
            { validator: this.validateKeyField, trigger: "change" }
          ],
          conditions: [{ required: true, validator: this.validateConditions, trigger: "change" }],
          "template.title": [{ required: true, message: "请填写通知标题", trigger: "blur" }],
          "template.lines": [{ required: true, validator: this.validateTemplateLines, trigger: "change" }],
          "channel.groups": [{ required: true, validator: this.validateChannelReach, trigger: "change" }],
          /* 通知人只用于渲染必填星标：二者填其一即可，因此自定义校验恒通过，错误提示统一挂在告警群上 */
          "channel.users": [{ required: true, validator: (rule, value, callback) => callback(), trigger: "change" }],
          "schedule.freq": [required("请选择检查频率")],
          mode: [required("请选择告警方式")],
          "dedup.mode": [required("请选择重复告警方式")],
          "dedup.intervalMinutes": [
            required("请输入重复间隔分钟数"),
            { type: "number", min: 1, max: 1440, message: "重复间隔需在 1~1440 分钟之间", trigger: "change" }
          ],
          "schedule.weekday": [required("请选择执行日")],
          "schedule.time": [required("请选择执行时间")]
        };
      },
      currentUser() { refreshTick.value; return state.users.find(user => user.name === loginUserName()) || state.users[0]; },
      pagedRows() {
        const result = paginate(this.filteredRows, this.page, this.pageSize);
        if (result.safePage !== this.page) this.page = result.safePage;
        return result.rows;
      },
      rangeText() {
        if (!this.filteredRows.length) return "0-0";
        return `${(this.page - 1) * this.pageSize + 1}-${Math.min(this.page * this.pageSize, this.filteredRows.length)}`;
      },
      enabledCount() { return this.alerts.filter(item => item.enabled).length; },
      disabledCount() { return this.alerts.filter(item => !item.enabled).length; },
      filteredRows() {
        const keyword = this.keyword.trim().toLowerCase();
        return this.alerts.filter(item => {
          if ((item.enabled ? "启用" : "停用") !== this.status) return false;
          if (this.categoryFilter && item.category !== this.categoryFilter) return false;
          if (this.requesterFilter && item.requester !== this.requesterFilter) return false;
          if (this.ownerFilter && item.owner !== this.ownerFilter) return false;
          if (this.groupFilter && !(item.channel?.groups || []).includes(this.groupFilter)) return false;
          if (this.pushUserFilter && !(item.channel?.users || []).includes(this.pushUserFilter)) return false;
          if (!keyword) return true;
          return String(item.name || "").toLowerCase().includes(keyword);
        });
      },
      activeUsers() { refreshTick.value; return state.users.filter(user => user.status !== "已停用"); },
      managedCategories() {
        const used = this.alerts.map(item => item.category).filter(Boolean);
        return [...new Set([...alertCategoryDefaults, ...this.savedCategories, ...used])];
      },
      monitorTables() {
        const seeded = alertMonitorTables.map(table => ({ ...table }));
        const assets = (state.assets || []).map(asset => ({
          name: asset.table, cn: asset.cnName, bizLine: asset.bizLine, desc: asset.desc,
          keyField: "", timeField: "",
          fields: (asset.fields || []).map(field => ({ name: field.name, cn: field.comment || field.name, type: field.type }))
        }));
        return [...seeded, ...assets];
      },
      currentTable() { return this.monitorTables.find(table => table.name === this.form.table) || null; },
      currentFields() { return this.currentTable?.fields || []; },
      /* 重复判定字段候选：排除度量值（数值型）字段 */
      dedupFields() { return this.currentFields.filter(field => !isMeasureField(field)); },
      keyFieldLabel() { return this.fieldLabel(this.form.keyField) || "用户"; },
      templateVariables() { return this.currentFields.map(field => field.cn); },
      previewTitle() { return this.renderTemplateText(this.form.template.title) || this.form.name || "（未填写通知标题）"; },
      previewLines() {
        return this.form.template.lines
          .filter(line => line.label || line.value)
          .map(line => ({ label: line.label || "字段", text: this.renderTemplateText(line.value) }));
      },
    },
    methods: {
      loadAlerts() {
        let saved = [];
        try { saved = JSON.parse(localStorage.getItem("portal-alert-rules") || "[]"); } catch (error) { saved = []; }
        this.alerts = [
          ...saved.map(item => ({ ...item, conditions: normalizeAlertConditions(item.conditions, this.fieldsOfTable(item.table)) })),
          ...alertSeeds.map(seed => JSON.parse(JSON.stringify(seed)))
        ];
      },
      persistAlerts() {
        try {
          const saved = this.alerts.filter(item => !alertSeeds.some(seed => seed.id === item.id));
          localStorage.setItem("portal-alert-rules", JSON.stringify(saved));
        } catch (error) { /* 隐私模式下仅本次会话生效 */ }
      },
      fieldLabel(fieldName) {
        const field = this.currentFields.find(item => item.name === fieldName);
        return field?.cn || fieldName || "";
      },
      conditionField(condition) {
        return this.currentFields.find(field => field.name === condition.field) || {};
      },
      conditionType(condition) { return alertFieldType(this.conditionField(condition).type); },
      conditionOps(condition) { return alertOpsOf(this.conditionType(condition)); },
      fieldsOfTable(tableName) { return this.monitorTables.find(table => table.name === tableName)?.fields || []; },
      ruleSummary(row) { return alertRuleText(row.conditions, row.relation, this.fieldsOfTable(row.table)); },
      modeLabel(row) { return row.mode === "scheduled" ? "定时" : "实时"; },
      scheduleSummary(row) {
        if (row.mode !== "scheduled") return "事件到达即计算";
        const schedule = row.schedule || {};
        if (schedule.freq === "每小时") return "每小时第 " + (schedule.minute ?? 0) + " 分钟";
        if (schedule.freq === "每周") return "每" + (schedule.weekday || "周一") + " " + (schedule.time || "09:00");
        return (schedule.freq || "每天") + " " + (schedule.time || "09:00");
      },
      modeSummary(row) {
        if (row.mode === "scheduled") {
          const schedule = row.schedule || {};
          if (schedule.freq === "每小时") return "定时 · 每小时第 " + (schedule.minute ?? 0) + " 分钟";
          if (schedule.freq === "每周") return "定时 · 每" + (schedule.weekday || "周一") + " " + (schedule.time || "09:00");
          return "定时 · " + (schedule.freq || "每天") + " " + (schedule.time || "09:00");
        }
        return "实时计算";
      },
      dedupSummary(row) {
        const dedup = row.dedup || {};
        if (dedup.mode === "once") return "仅通知一次";
        if (dedup.mode === "always") return "每次触发都通知";
        return (dedup.intervalMinutes || 10) + " 分钟内不重复通知";
      },
      renderTemplateText(text) {
        return String(text || "").replace(/\{([^}]+)\}/g, (match, key) => {
          const name = String(key).trim();
          if (alertSampleValues[name] !== undefined) return alertSampleValues[name];
          return "（" + name + "）";
        });
      },
      countByCategory(category) { return this.alerts.filter(item => item.category === category).length; },
      addCategory() {
        const name = this.categoryDraft.trim();
        if (!name) return ep.ElMessage.warning("先输入分类名称");
        if (this.managedCategories.includes(name)) return ep.ElMessage.warning("该分类已存在");
        this.savedCategories.push(name);
        this.categoryDraft = "";
        notify("已添加告警分类「" + name + "」");
      },
      async removeCategory(category) {
        const used = this.countByCategory(category);
        const note = used ? "，当前有 " + used + " 条告警正在使用" : "";
        if (!await confirmAction("删除告警分类", "确认删除分类「" + category + "」" + note + "？", "删除")) return;
        this.savedCategories = this.savedCategories.filter(item => item !== category);
        this.alerts.forEach(item => { if (item.category === category) item.category = ""; });
        if (this.form.category === category) this.form.category = "";
        this.persistAlerts();
        notify("告警分类已删除");
      },
      openCreate() {
        this.editingId = "";
        this.form = createAlertForm();
        this.form.owner = this.currentUser?.name || loginUserName();
        this.form.requester = this.currentUser?.name || loginUserName();
        this.testResult = "";
        this.dialogVisible = true;
        this.clearValidation();
      },
      openEdit(row) {
        this.editingId = row.id;
        this.form = JSON.parse(JSON.stringify({
          name: row.name, category: row.category, desc: row.desc, owner: row.owner, requester: row.requester || row.owner,
          table: row.table, keyField: row.keyField, timeField: row.timeField,
          relation: row.relation, conditions: row.conditions, mode: row.mode,
          schedule: { weekday: "周一", ...(row.schedule || {}) }, dedup: row.dedup, channel: row.channel,
          testChannel: row.testChannel || { groups: [], users: [] }, template: row.template
        }));
        this.testResult = "";
        this.dialogVisible = true;
        this.clearValidation();
      },
      changeTable(tableName) {
        const table = this.monitorTables.find(item => item.name === tableName);
        if (!table) return;
        // 重复判定字段只能是维度字段：换了监控表后若原字段不可用，回落到该表 keyField 或第一个维度字段
        const dimensionFields = (table.fields || []).filter(field => !isMeasureField(field));
        const preferred = (table.fields || []).find(field => field.name === table.keyField && !isMeasureField(field));
        this.form.keyField = preferred?.name || dimensionFields[0]?.name || "";
        this.form.timeField = table.timeField || table.fields[0]?.name || "";
        this.form.conditions = [{ field: table.fields[0]?.name || "", op: "eq", value: "", value2: "" }];
        this.clearValidation();
      },
      changeConditionGrain(condition) {
        condition.value1 = null;
        condition.value2 = null;
        this.revalidate("conditions");
      },
      changeConditionField(condition) {
        const type = this.conditionType(condition);
        const allowed = (alertTypeOps[type] || alertTypeOps["文本"]).map(item => item[0]);
        if (!allowed.includes(condition.op)) condition.op = allowed[0];
        condition.value = alertMultiValueTypes.includes(type) ? [] : "";
        condition.value1 = null;
        condition.value2 = null;
        condition.range = [];
        this.revalidate("conditions");
      },
      toggleRelation() { this.form.relation = this.form.relation === "AND" ? "OR" : "AND"; this.revalidate("conditions"); },
      addCondition() {
        const last = this.form.conditions[this.form.conditions.length - 1];
        const nextField = this.currentFields.find(item => item.name === last?.field) || this.currentFields[0];
        this.form.conditions.push(alertNewCondition(nextField ? [nextField] : this.currentFields));
        this.revalidate("conditions");
      },
      removeCondition(index) { this.form.conditions.splice(index, 1); this.revalidate("conditions"); },
      addTemplateLine() { this.form.template.lines.push({ label: "", value: "" }); },
      removeTemplateLine(index) { this.form.template.lines.splice(index, 1); this.revalidate("template.lines"); },
      insertVariable(lineIndex, fieldCn) {
        const token = "{" + (fieldCn || this.currentFields[0]?.cn || "字段") + "}";
        const target = lineIndex >= 0 ? this.form.template.lines[lineIndex] : this.form.template.lines[this.form.template.lines.length - 1];
        if (!target) return;
        target.value = (target.value || "") + token;
      },
      insertTitleVariable() {
        this.form.template.title = (this.form.template.title || "") + "{" + (this.currentFields[0]?.cn || "字段") + "}";
      },
      sendTestAlert() {
        const channel = this.form.testChannel || {};
        if (!channel.groups?.length && !channel.users?.length) return ep.ElMessage.warning("请先配置测试通道（测试群或测试接收人）");
        this.testing = true;
        this.testResult = "";
        setTimeout(() => {
          this.testing = false;
          const target = [...(channel.groups || []), ...(channel.users || [])].join("、");
          this.testResult = "测试告警已发送至 " + target + "，请确认收到后再保存";
          ep.ElMessage.success("测试告警已发送");
        }, 800);
      },
      validateChannelReach(rule, value, callback) {
        const groups = this.form.channel?.groups || [];
        const users = this.form.channel?.users || [];
        if (!groups.length && !users.length) return callback(new Error("告警群与通知人至少选择一个"));
        callback();
      },
      revalidateChannel() {
        const formRef = this.$refs.formRef;
        if (!formRef) return;
        this.$nextTick(() => {
          formRef.validateField("channel.groups").catch(() => {});
          formRef.validateField("channel.users").catch(() => {});
        });
      },
      resetPage() { this.page = 1; },
      revalidate(prop) {
        const formRef = this.$refs.formRef;
        if (!formRef) return;
        this.$nextTick(() => formRef.validateField(prop).catch(() => {}));
      },
      clearValidation() {
        const formRef = this.$refs.formRef;
        if (formRef) this.$nextTick(() => formRef.clearValidate());
      },
      validateConditions(rule, value, callback) {
        const rows = (this.form.conditions || []).filter(condition => condition.field);
        if (!rows.length) return callback(new Error("请至少配置一个触发条件"));
        const blank = value => value === "" || value === undefined || value === null;
        const incomplete = rows.find(condition => {
          if (alertNoValueOps.includes(condition.op)) return false;
          if (condition.op === "between" || condition.op === "timeBetween") return blank(condition.value1) || blank(condition.value2);
          if (condition.op === "relative") return blank(condition.value1);
          if (condition.op === "absolute") { const range = condition.range || []; return !range[0] || !range[1]; }
          if (Array.isArray(condition.value)) return !condition.value.length;
          return blank(condition.value);
        });
        if (incomplete) return callback(new Error("条件「" + (this.fieldLabel(incomplete.field) || "未选择字段") + "」的值未填写完整"));
        callback();
      },
      /* 重复判定字段必须是维度字段：度量值（数值型）不参与去重口径 */
      validateKeyField(rule, value, callback) {
        if (!value) return callback();
        const field = this.currentFields.find(item => item.name === value);
        if (isMeasureField(field)) return callback(new Error(`「${field?.cn || value}」是度量值，不能作为重复判定字段，请选择用户名/设备/渠道等维度字段`));
        if (field && !this.dedupFields.some(item => item.name === value)) return callback(new Error("该字段不是可用的维度字段"));
        callback();
      },
      validateTemplateLines(rule, value, callback) {
        const lines = (this.form.template.lines || []).filter(line => line.label || line.value);
        if (!lines.length) return callback(new Error("请至少配置一行通知内容"));
        const incomplete = lines.find(line => !line.label || !line.value);
        if (incomplete) return callback(new Error("通知内容存在未填写完整的行（字段名与值都需要填写）"));
        const names = this.templateVariables;
        const unknown = [];
        const scan = text => [...String(text || "").matchAll(/\{([^}]+)\}/g)].forEach(match => {
          const name = String(match[1]).trim();
          if (!names.includes(name)) unknown.push(name);
        });
        scan(this.form.template.title);
        lines.forEach(line => scan(line.value));
        if (unknown.length) return callback(new Error("模版变量不在当前监控表中：" + [...new Set(unknown)].join("、")));
        callback();
      },
      async saveAlert() {
        const formRef = this.$refs.formRef;
        if (!formRef) return;
        try {
          await formRef.validate();
        } catch (error) {
          ep.ElMessage.warning("还有必填项未完成，请按表单提示补全后再保存");
          return;
        }
        this.saving = true;
        const table = this.currentTable;
        const payload = {
          name: this.form.name.trim(),
          category: this.form.category, desc: this.form.desc.trim(), owner: this.form.owner, requester: this.form.requester,
          table: this.form.table, tableCn: table?.cn || this.form.table,
          keyField: this.form.keyField, timeField: this.form.timeField,
          relation: this.form.relation, conditions: JSON.parse(JSON.stringify(this.form.conditions)),
          mode: this.form.mode, schedule: { ...this.form.schedule },
          dedup: { ...this.form.dedup },
          channel: { groups: [...(this.form.channel.groups || [])], users: [...(this.form.channel.users || [])] },
          testChannel: { groups: [...(this.form.testChannel.groups || [])], users: [...(this.form.testChannel.users || [])] },
          template: JSON.parse(JSON.stringify(this.form.template))
        };
        if (this.editingId) {
          const target = this.alerts.find(item => item.id === this.editingId);
          if (target) Object.assign(target, payload);
        } else {
          this.alerts.unshift({
            id: "AL" + Date.now(), ...payload, enabled: true,
            creator: this.currentUser?.name || loginUserName(),
            lastTriggered: "—", recent7dCount: 0, history: []
          });
        }
        this.persistAlerts();
        this.saving = false;
        this.dialogVisible = false;
        notify("告警「" + payload.name + "」已保存" + (this.editingId ? "并更新" : "，飞书机器人将按配置推送"));
      },
      toggleEnabled(row) { notify("告警「" + row.name + "」已" + (row.enabled ? "启用，触发时将推送飞书" : "停用，不再推送")); },
      async removeAlert(row) {
        try {
          await ep.ElMessageBox.confirm("删除后该告警将停止推送，确认删除「" + row.name + "」？", "删除告警", { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" });
        } catch (error) { return; }
        this.alerts = this.alerts.filter(item => item.id !== row.id);
        this.persistAlerts();
        notify("告警「" + row.name + "」已删除");
      },
      openHistory(row) { this.historyTitle = row.name; this.historyRows = row.history || []; this.historyVisible = true; }
    },
    mounted() { this.loadAlerts(); }
  };
  window.alertVueApi = mount("#alertManagementView", AlertManagementApp, "alert-management");
})();
