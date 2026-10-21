/**
 * 页面：operation-log
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    mount,
    paginate
  } = window.PortalVue;


  /* ===== 操作日志：基于前端埋点（页面访问 page_view / 看板心跳 dashboard_view_heartbeat） =====
     schema 同时驱动列表列与详情抽屉，后续新增「权限变更」等事件只需补一份定义与数据。 */
  /* 操作日志当前只对外展示「查看看板」明细：页面访问等埋点先隐藏（数据与定义都保留），
     后续需要时把分类加回白名单即可，列表行、分类页签、分类列会一起恢复。 */
  const OPERATION_LOG_VISIBLE_CATEGORIES = ["查看看板"];
  const operationLogEvents = {
    page_view: {
      category: "页面访问",
      name: "页面访问",
      attrs: [
        ["event_time", "事件发生时间", "time"],
        ["user_name", "用户名称", "string"],
        ["user_id", "用户唯一ID", "string"],
        ["is_login", "是否登陆", "bool"],
        ["menu_name", "菜单名称", "string"],
        ["page_url", "页面URL", "url"],
        ["referrer_url", "来源页面URL", "url"],
        ["distinct_id", "设备ID", "string"],
        ["user_agent", "UA", "ua"],
        ["platform", "平台类型", "string"],
        ["env", "服务环境", "string"],
        ["app_name", "应用名称", "string"],
        ["ip", "IP地址", "string"]
      ]
    },
    dashboard_view_heartbeat: {
      category: "查看看板",
      name: "看板心跳",
      attrs: [
        ["event_time", "事件发生时间", "time"],
        ["visit_id", "页面访问ID", "string"],
        ["user_id", "用户唯一ID", "string"],
        ["dashboard_name", "看板名称", "string"],
        ["dashboard_id", "看板ID", "string"],
        ["duration_seconds", "心跳时长", "seconds"],
        ["page_type", "页面类型", "string"],
        ["url", "页面URL", "url"],
        ["distinct_id", "设备ID", "string"],
        ["user_agent", "UA", "ua"],
        ["platform", "平台类型", "string"],
        ["env", "服务环境", "string"],
        ["app_name", "应用名称", "string"],
        ["ip", "IP地址", "string"]
      ]
    }
  };

  const operationLogUsers = [
    { userId: "u_001", name: "曾祥竞", ip: "183.6.107.59", device: "anon_7f2c9a", platform: "web" },
    { userId: "u_002", name: "黄佩贤", ip: "113.87.42.18", device: "anon_3b81de", platform: "web" },
    { userId: "u_003", name: "林金维", ip: "120.231.18.77", device: "anon_9c4a02", platform: "h5" },
    { userId: "u_004", name: "谭嘉颖", ip: "14.215.176.3", device: "anon_5e77b1", platform: "web" },
    { userId: "u_005", name: "李雨航", ip: "223.104.63.90", device: "anon_c102f8", platform: "h5" }
  ];
  const operationLogUaDesktop = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  const operationLogUaMobile = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
  const operationLogPages = [
    ["https://gxt.lumofyi.com/#page=数据看板", "https://gxt.lumofyi.com/#page=灵犀智析"],
    ["https://gxt.lumofyi.com/#page=数据告警", "https://gxt.lumofyi.com/#page=数据看板"],
    ["https://gxt.lumofyi.com/#page=灵犀智析", ""],
    ["https://gxt.lumofyi.com/#page=人群包管理", "https://gxt.lumofyi.com/#page=数据看板"],
    ["https://gxt.lumofyi.com/#page=表管理", "https://gxt.lumofyi.com/#page=数据资产"],
    ["https://gxt.lumofyi.com/#page=权限组", "https://gxt.lumofyi.com/#page=用户管理"],
    ["https://gxt.lumofyi.com/#page=数据告警", ""],
    ["https://gxt.lumofyi.com/#page=数据看板", "https://gxt.lumofyi.com/#page=人群包管理"],
    ["https://gxt.lumofyi.com/#page=标签管理", "https://gxt.lumofyi.com/#page=表管理"],
    ["https://gxt.lumofyi.com/#page=灵犀智析", "https://gxt.lumofyi.com/#page=数据告警"],
    ["https://gxt.lumofyi.com/#page=人群包推送渠道", "https://gxt.lumofyi.com/#page=人群包管理"],
    ["https://gxt.lumofyi.com/#page=数据看板", ""],
    ["https://gxt.lumofyi.com/#page=用户管理", "https://gxt.lumofyi.com/#page=权限组"],
    ["https://gxt.lumofyi.com/#page=字典管理", "https://gxt.lumofyi.com/#page=表管理"]
  ];
  const operationLogDashboards = [
    ["quickbi_sales_daily", "经营日报看板"],
    ["quickbi_equity_core", "权益核心大盘"],
    ["quickbi_delivery_cost", "投放成本日报"],
    ["quickbi_retain_funnel", "存量转化漏斗"],
    ["quickbi_insurance_gmv", "保险业务 GMV"],
    ["quickbi_shortplay_roi", "短剧投放 ROI"],
    ["quickbi_highvalue_user", "高价值用户分层"],
    ["quickbi_channel_quality", "渠道质量周报"]
  ];

  /* 页面访问埋点上报的菜单名称：与页面 URL 中的 #page= 一致 */
  function operationLogMenuName(url) {
    const matched = String(url || "").match(/[#&?]page=([^&]*)/);
    return matched ? decodeURIComponent(matched[1]) : "";
  }

  function buildOperationLogs() {
    const base = new Date("2026-09-17T10:40:00");
    const pad = value => String(value).padStart(2, "0");
    const fmt = date => date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate())
      + " " + pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds());
    const records = [];

    operationLogPages.forEach((page, index) => {
      const user = operationLogUsers[index % operationLogUsers.length];
      const time = new Date(base.getTime() - (index * 7 + 2) * 60000);
      records.push({
        id: "pv_" + pad(index + 1),
        event: "page_view",
        ts: time.getTime(),
        values: {
          event_time: fmt(time),
          user_name: user.name,
          user_id: user.userId,
          is_login: true,
          menu_name: operationLogMenuName(page[0]),
          page_url: page[0],
          referrer_url: page[1],
          distinct_id: user.device,
          user_agent: user.platform === "h5" ? operationLogUaMobile : operationLogUaDesktop,
          platform: user.platform,
          env: "prod",
          app_name: "观星台",
          ip: user.ip
        }
      });
    });

    /* 看板心跳每 10 秒一次，同一 visit_id 归并为一次看板访问；停留时长取最大心跳时长 */
    operationLogDashboards.forEach((board, index) => {
      const user = operationLogUsers[index % operationLogUsers.length];
      const start = new Date(base.getTime() - (index * 13 + 5) * 60000);
      const visitId = "visit_" + (index + 1).toString(16).padStart(3, "0") + "f3a";
      const beats = 3 + (index % 4);
      for (let beat = 1; beat <= beats; beat += 1) {
        const time = new Date(start.getTime() + (beat - 1) * 10000);
        records.push({
          id: visitId + "_" + beat,
          event: "dashboard_view_heartbeat",
          visitId,
          ts: time.getTime(),
          values: {
            event_time: fmt(time),
            visit_id: visitId,
            user_id: user.userId,
            dashboard_name: board[1],
            dashboard_id: board[0],
            duration_seconds: beat * 10,
            page_type: "quick_bi_dashboard",
            url: "https://gxt.lumofyi.com/#page=数据看板&board=" + board[0],
            distinct_id: user.device,
            user_agent: user.platform === "h5" ? operationLogUaMobile : operationLogUaDesktop,
            platform: user.platform,
            env: "prod",
            app_name: "观星台",
            ip: user.ip
          }
        });
      }
    });

    return records.sort((a, b) => b.ts - a.ts);
  }

  /* UA 摘要：表格里展示「浏览器 · 系统」，完整 UA 放到 tooltip 与详情抽屉 */
  function operationLogUaSummary(ua) {
    const text = String(ua || "");
    if (!text) return "—";
    let browser = "未知浏览器";
    if (/MicroMessenger/.test(text)) browser = "微信内置浏览器";
    else if (/Edg\//.test(text)) browser = "Edge " + (text.match(/Edg\/(\d+)/) || [])[1];
    else if (/Chrome\//.test(text)) browser = "Chrome " + (text.match(/Chrome\/(\d+)/) || [])[1];
    else if (/Version\/[\d.]+ Safari/.test(text)) browser = "Safari " + (text.match(/Version\/(\d+)/) || [])[1];
    else if (/Firefox\//.test(text)) browser = "Firefox " + (text.match(/Firefox\/(\d+)/) || [])[1];
    let system = "未知系统";
    if (/Mac OS X/.test(text)) system = "macOS";
    else if (/Windows NT/.test(text)) system = "Windows";
    else if (/iPhone|iPad/.test(text)) system = "iOS";
    else if (/Android/.test(text)) system = "Android";
    return browser + " · " + system;
  }

  const operationLogSeeds = buildOperationLogs();
  const operationLogUserName = userId => operationLogUsers.find(user => user.userId === userId)?.name || "";

  /* 操作日志：埋点事件明细 + 按访问归并的看板记录，支持按分类/用户/时间/关键词筛选 */
  const OperationLogApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <el-tabs v-if="visibleCategories.length > 1" v-model="category" class="portal-vue-status-tabs" @tab-change="resetPage">
            <el-tab-pane :label="'全部（' + allRows.length + '）'" name="全部"></el-tab-pane>
            <el-tab-pane v-for="item in visibleCategories" :key="item" :label="item + '（' + countOfCategory(item) + '）'" :name="item"></el-tab-pane>
          </el-tabs>
          <div class="portal-vue-toolbar">
            <div class="portal-vue-toolbar-left">
              <el-input v-model="keyword" class="portal-vue-search" clearable placeholder="搜索用户、页面或看板" @input="resetPage"></el-input>
              <el-select v-model="userFilter" clearable filterable placeholder="全部用户" style="width:150px" @change="resetPage">
                <el-option v-for="user in logUsers" :key="user.userId" :label="user.name" :value="user.name"></el-option>
              </el-select>
              <el-select v-model="platformFilter" clearable placeholder="全部端" style="width:130px" @change="resetPage">
                <el-option label="web" value="web"></el-option>
                <el-option label="h5" value="h5"></el-option>
              </el-select>
              <el-date-picker v-model="timeRange" type="datetimerange" range-separator="至" start-placeholder="开始时间" end-placeholder="结束时间" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm" :shortcuts="timeShortcuts" style="width:360px" @change="resetPage"></el-date-picker>
            </div>
          </div>
          <el-table :data="pagedRows" class="portal-vue-table" border empty-text="暂无看板访问记录">
            <el-table-column label="时间" width="180">
              <template #default="scope"><span>{{ rowTime(scope.row) }}</span></template>
            </el-table-column>
            <el-table-column v-if="visibleCategories.length > 1" label="分类" width="100">
              <template #default="scope"><el-tag size="small" :type="scope.row.kind === 'page' ? 'primary' : 'success'" effect="plain">{{ categoryOf(scope.row) }}</el-tag></template>
            </el-table-column>
            <el-table-column label="用户" min-width="140">
              <template #default="scope">
                <div>{{ rowUserName(scope.row) }}</div>
                <div class="portal-vue-muted" style="font-size:12px">{{ rowUserId(scope.row) }}</div>
              </template>
            </el-table-column>
            <el-table-column label="页面名称" min-width="180">
              <template #default="scope">
                <div>{{ pageNameOf(scope.row) || "—" }}</div>
                <div v-if="scope.row.kind === 'dashboard'" class="portal-vue-muted" style="font-size:12px">{{ dashboardIdOf(scope.row) }}</div>
              </template>
            </el-table-column>
            <el-table-column label="停留时长" width="110">
              <template #default="scope">
                <span v-if="scope.row.kind === 'page'" class="portal-vue-muted">—</span>
                <span v-else>{{ durationOf(scope.row) }} 秒</span>
              </template>
            </el-table-column>
            <el-table-column label="终端" width="90">
              <template #default="scope"><el-tag size="small" effect="plain">{{ platformOf(scope.row) }}</el-tag></template>
            </el-table-column>
            <el-table-column label="UA" min-width="170">
              <template #default="scope">
                <el-tooltip :content="uaOf(scope.row)" placement="top" :show-after="300">
                  <span class="portal-vue-log-ua-summary">{{ uaSummaryOf(scope.row) }}</span>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column label="IP地址" width="140">
              <template #default="scope">{{ ipOf(scope.row) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="80" fixed="right">
              <template #default="scope"><el-button link type="primary" @click="openDetail(scope.row)">详情</el-button></template>
            </el-table-column>
          </el-table>
          <div class="portal-vue-pagination"><span>共 {{ filteredRows.length }} 条，当前 {{ rangeText }}</span><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,20,50]" :total="filteredRows.length" layout="sizes, prev, pager, next"></el-pagination></div>
        </section>

        <el-drawer v-model="detailVisible" :title="detailTitle" size="620px" :close-on-click-modal="true">
          <div class="portal-vue-skill-drawer">
            <div class="portal-vue-alert-field"><label>埋点事件</label><div>{{ detailEvent }}</div></div>
            <div class="portal-vue-log-attrs">
              <div v-for="attr in detailAttrs" :key="attr.key" class="portal-vue-log-attr">
                <span>{{ attr.cn }}</span>
                <strong :class="{ 'portal-vue-log-ua': attr.type === 'ua' }">{{ attr.value }}</strong>
              </div>
            </div>
            <template v-if="detailBeats.length">
              <div class="portal-vue-alert-field"><label>心跳明细（{{ detailBeats.length }} 次）</label></div>
              <div class="portal-vue-log-attrs">
                <div v-for="beat in detailBeats" :key="beat.id" class="portal-vue-log-attr">
                  <span>{{ beat.values.event_time }}</span>
                  <strong>{{ beat.values.duration_seconds }} 秒</strong>
                </div>
              </div>
            </template>
          </div>
        </el-drawer>
      </el-config-provider>
    `,
    data: () => ({
      category: "全部", keyword: "", userFilter: "", platformFilter: "", timeRange: [], timeShortcuts: [],
      page: 1, pageSize: 10,
      detailVisible: false, detailTitle: "", detailEvent: "", detailAttrs: [], detailBeats: [],
      logUsers: operationLogUsers,
      records: operationLogSeeds
    }),
    created() {
      /* 快捷区间以最新一条日志为锚点，避免样例数据与真实当前时间漂移导致筛不出结果 */
      const anchor = this.records[0]?.ts || Date.now();
      const back = ms => [new Date(anchor - ms), new Date(anchor)];
      this.timeShortcuts = [
        { text: "近 1 小时", value: () => back(3600000) },
        { text: "近 6 小时", value: () => back(21600000) },
        { text: "近 24 小时", value: () => back(86400000) },
        { text: "近 7 天", value: () => back(604800000) }
      ];
    },
    computed: {
      categories() { return [...new Set(Object.values(operationLogEvents).map(item => item.category))]; },
      /* 当前对外展示的分类：只有一个时不渲染分类页签与分类列 */
      visibleCategories() { return this.categories.filter(item => OPERATION_LOG_VISIBLE_CATEGORIES.includes(item)); },
      /* 看板心跳按 visit_id 归并为一条访问记录；只保留白名单分类（当前仅「查看看板」） */
      allRows() {
        const rows = [];
        const visits = new Map();
        this.records.forEach(record => {
          if (!OPERATION_LOG_VISIBLE_CATEGORIES.includes(operationLogEvents[record.event]?.category)) return;
          if (record.event === "page_view") {
            rows.push({ key: record.id, kind: "page", records: [record], head: record });
            return;
          }
          let visit = visits.get(record.visitId);
          if (!visit) {
            visit = { key: record.visitId, kind: "dashboard", records: [] };
            visits.set(record.visitId, visit);
          }
          visit.records.push(record);
        });
        visits.forEach(visit => {
          visit.records.sort((a, b) => a.ts - b.ts);
          visit.head = visit.records[0];
        });
        return [...rows, ...visits.values()].sort((a, b) => b.head.ts - a.head.ts);
      },
      filteredRows() {
        const keyword = this.keyword.trim().toLowerCase();
        const bounds = this.rangeBounds;
        return this.allRows.filter(row => {
          if (this.category !== "全部" && this.categoryOf(row) !== this.category) return false;
          if (this.userFilter && this.rowUserName(row) !== this.userFilter) return false;
          if (this.platformFilter && this.platformOf(row) !== this.platformFilter) return false;
          if (bounds && (row.head.ts < bounds[0] || row.head.ts > bounds[1])) return false;
          if (!keyword) return true;
          const text = [this.rowUserName(row), this.rowUserId(row), this.pageUrlOf(row), this.dashboardNameOf(row), this.dashboardIdOf(row), this.ipOf(row)].join(" ").toLowerCase();
          return text.includes(keyword);
        });
      },
      /* 时间范围解析：value-format 为 YYYY-MM-DD HH:mm，手动解析避免各浏览器对空格分隔的兼容差异 */
      rangeBounds() {
        const range = Array.isArray(this.timeRange) ? this.timeRange : [];
        if (range.length !== 2) return null;
        const toTs = value => {
          const matched = String(value || "").match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
          return matched ? new Date(+matched[1], +matched[2] - 1, +matched[3], +matched[4], +matched[5]).getTime() : null;
        };
        const start = toTs(range[0]);
        const end = toTs(range[1]);
        return start === null || end === null ? null : [start, end];
      },
      pagedRows() {
        const result = paginate(this.filteredRows, this.page, this.pageSize);
        if (result.safePage !== this.page) this.page = result.safePage;
        return result.rows;
      },
      rangeText() {
        if (!this.filteredRows.length) return "0-0";
        return `${(this.page - 1) * this.pageSize + 1}-${Math.min(this.page * this.pageSize, this.filteredRows.length)}`;
      }
    },
    methods: {
      resetPage() { this.page = 1; },
      categoryOf(row) { return operationLogEvents[row.head.event].category; },
      eventNameOf(row) { return operationLogEvents[row.head.event].name; },
      countOfCategory(category) { return this.allRows.filter(row => this.categoryOf(row) === category).length; },
      headValue(row, key) { return row.head.values[key]; },
      rowTime(row) { return this.headValue(row, "event_time"); },
      rowUserName(row) { return this.headValue(row, "user_name") || operationLogUserName(this.rowUserId(row)) || "—"; },
      rowUserId(row) { return this.headValue(row, "user_id"); },
      pageUrlOf(row) { return row.kind === "page" ? this.headValue(row, "page_url") : this.headValue(row, "url"); },
      dashboardNameOf(row) { return row.kind === "dashboard" ? this.headValue(row, "dashboard_name") : ""; },
      dashboardIdOf(row) { return row.kind === "dashboard" ? this.headValue(row, "dashboard_id") : ""; },
      platformOf(row) { return this.headValue(row, "platform"); },
      ipOf(row) { return this.headValue(row, "ip"); },
      durationOf(row) { return row.records[row.records.length - 1].values.duration_seconds; },
      pageNameOf(row) {
        return row.kind === "page" ? (this.headValue(row, "menu_name") || "") : this.dashboardNameOf(row);
      },
      uaOf(row) { return this.headValue(row, "user_agent") || "—"; },
      uaSummaryOf(row) { return operationLogUaSummary(this.headValue(row, "user_agent")); },
      openDetail(row) {
        const schema = operationLogEvents[row.head.event];
        this.detailTitle = schema.name + " · " + this.rowUserName(row);
        this.detailEvent = row.head.event;
        this.detailAttrs = schema.attrs.map(([key, cn, type]) => ({
          key, cn, type,
          value: row.head.values[key] === "" || row.head.values[key] === undefined ? "—" : String(row.head.values[key])
        }));
        this.detailBeats = row.kind === "dashboard" ? row.records : [];
        this.detailVisible = true;
      }
    }
  };

  window.operationLogVueApi = mount("#operationLogView", OperationLogApp, "operation-log");
})();
