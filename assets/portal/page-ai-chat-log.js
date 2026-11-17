/**
 * 组件：AI 对话记录（访问记录页顶部页签之一，仅管理员）
 * 展示灵犀智析每一次问答：谁问的、问了什么、用了哪个 Skill / 模型、响应时长、token、结果、报告地址（生成了报告才有）。
 * 数据来自网关 GET /v1/audit?type=analysis。由 page-operation-log.js 作为子组件使用，需先于它加载。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const { analysisGatewayBase, ep } = window.PortalVue;

  async function request(path) {
    const response = await fetch(`${analysisGatewayBase}${path}`, { headers: { "Content-Type": "application/json" } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
    return data;
  }
  const formatTime = iso => (iso ? new Date(iso).toLocaleString("zh-CN", { hour12: false }) : "—");
  /** 响应时长：不到 1 秒显示毫秒，其余显示秒 */
  const durationText = ms => (ms === undefined || ms === null ? "—" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
  const reportHref = url => (!url ? "" : /^https?:\/\//.test(url) ? url : `${location.origin}${location.pathname}${String(url).replace(/^\//, "")}`);

  window.PortalVue.AiChatLogPanel = {
    template: `
      <div>
        <div class="portal-vue-toolbar">
          <div class="portal-vue-toolbar-left">
            <el-input v-model="filter.keyword" placeholder="搜索问题" clearable style="width:220px" @keyup.enter="load" @clear="load"></el-input>
            <el-input v-model="filter.user" placeholder="账号" clearable style="width:140px" @keyup.enter="load" @clear="load"></el-input>
            <el-select v-model="filter.status" style="width:120px" @change="load"><el-option label="全部状态" value=""></el-option><el-option label="成功" value="ok"></el-option><el-option label="失败" value="error"></el-option></el-select>
          </div>
          <div><span class="portal-vue-muted" style="margin-right:12px">命中 {{ result.matched }} 条，显示最近 {{ rows.length }} 条</span><el-button type="primary" @click="load">查询</el-button></div>
        </div>
        <el-table :data="rows" class="portal-vue-table" border v-loading="loading" empty-text="暂无对话记录" data-test="audit-table">
          <el-table-column label="时间" width="170"><template #default="scope">{{ formatTime(scope.row.at) }}</template></el-table-column>
          <el-table-column label="账号" width="140"><template #default="scope">{{ scope.row.user }}<span v-if="scope.row.scope" class="portal-vue-muted">（访客）</span></template></el-table-column>
          <el-table-column label="问题" min-width="280" show-overflow-tooltip><template #default="scope">{{ scope.row.question || "—" }}</template></el-table-column>
          <el-table-column label="Skill / 模型" min-width="190"><template #default="scope"><div>{{ scope.row.skill || scope.row.scenario || "—" }}</div><small class="portal-vue-muted">{{ scope.row.model || "—" }}</small></template></el-table-column>
          <el-table-column label="响应时长" width="100" align="right"><template #default="scope">{{ durationText(scope.row.latencyMs) }}</template></el-table-column>
          <el-table-column label="token" width="90" align="right"><template #default="scope">{{ (scope.row.tokens ?? 0).toLocaleString('zh-CN') }}</template></el-table-column>
          <el-table-column label="结果" width="90"><template #default="scope"><el-tooltip :disabled="!scope.row.error" :content="scope.row.error" placement="top"><el-tag :type="scope.row.status === 'error' ? 'danger' : 'success'" effect="light">{{ scope.row.status === 'error' ? '失败' : '成功' }}</el-tag></el-tooltip></template></el-table-column>
          <el-table-column label="报告地址" min-width="200" show-overflow-tooltip><template #default="scope"><a v-if="scope.row.reportUrl" :href="href(scope.row.reportUrl)" target="_blank" rel="noopener">{{ href(scope.row.reportUrl) }}</a><span v-else class="portal-vue-muted">—</span></template></el-table-column>
        </el-table>
      </div>
    `,
    data: () => ({ loading: false, filter: { keyword: "", user: "", status: "" }, result: { items: [], matched: 0 } }),
    computed: {
      rows() {
        const keyword = this.filter.keyword.trim().toLowerCase();
        return keyword ? this.result.items.filter(item => String(item.question || "").toLowerCase().includes(keyword)) : this.result.items;
      }
    },
    methods: {
      formatTime, durationText, href: reportHref,
      async load() {
        const params = new URLSearchParams({ limit: "100", type: "analysis" });
        if (this.filter.user) params.set("user", this.filter.user);
        if (this.filter.status) params.set("status", this.filter.status);
        this.loading = true;
        try { this.result = await request(`/v1/audit?${params}`); } catch (error) { ep.ElMessage.warning(error.message); } finally { this.loading = false; }
      }
    },
    mounted() {
      /* 页面一加载就会挂载，登录前请求会被拒；只在进入「访问记录」页时才取数 */
      this.pageHandler = event => { if (event.detail?.page === "访问记录") this.load(); };
      window.addEventListener("portal:page-change", this.pageHandler);
      if (window.portalVueBridge?.getPage?.() === "访问记录") this.load();
    },
    beforeUnmount() { window.removeEventListener("portal:page-change", this.pageHandler); }
  };
})();
