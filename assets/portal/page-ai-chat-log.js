/**
 * 组件：AI 对话记录（访问记录页顶部页签之一，仅管理员）
 * 展示灵犀智析每一次问答：谁问的、问了什么、用了哪个 Skill / 模型、响应时长、token、结果、报告地址（生成了报告才有）。
 * 数据来自网关 GET /v1/audit?type=analysis。由 page-operation-log.js 作为子组件使用，需先于它加载。
 */
(() => {
  "use strict";
  const paginate = (...args) => window.PortalVue.paginate(...args);
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

  (() => { if (document.getElementById("aclog-style")) return; const el = document.createElement("style"); el.id = "aclog-style"; el.textContent = ".aclog-ellipsis{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.aclog-skills{display:flex;flex-direction:column;gap:2px}.aclog-skills span{line-height:1.5}.aclog-skills span+span::before{content:\"+ \";color:#98a2b3}"; document.head.appendChild(el); })();

  window.PortalVue.AiChatLogPanel = {
    template: `
      <div>
        <div class="portal-vue-toolbar">
          <div class="portal-vue-toolbar-left">
            <el-input v-model="filter.keyword" placeholder="搜索问题" clearable style="width:220px" @keyup.enter="load" @clear="load"></el-input>
            <el-select v-model="filter.user" filterable clearable placeholder="全部账号" style="width:160px" @change="load"><el-option v-for="name in userNames" :key="name" :label="name" :value="name"></el-option></el-select>
            <el-select v-model="filter.status" style="width:120px" @change="load"><el-option label="全部状态" value=""></el-option><el-option label="成功" value="ok"></el-option><el-option label="失败" value="error"></el-option></el-select>
          </div>
          <div><span class="portal-vue-muted" style="margin-right:12px">命中 {{ result.matched }} 条，显示最近 {{ rows.length }} 条</span><el-button type="primary" @click="load">查询</el-button></div>
        </div>
        <el-table :data="pagedRows" class="portal-vue-table" border :empty-text="loading ? '加载中…' : '暂无对话记录'" data-test="audit-table">
          <el-table-column label="时间" width="170"><template #default="scope">{{ formatTime(scope.row.at) }}</template></el-table-column>
          <el-table-column label="账号" width="140"><template #default="scope">{{ scope.row.user }}<span v-if="scope.row.scope" class="portal-vue-muted">（访客）</span></template></el-table-column>
          <el-table-column label="问题" min-width="280" show-overflow-tooltip><template #default="scope">{{ scope.row.question || "—" }}</template></el-table-column>
          <el-table-column label="会话窗口" min-width="200"><template #default="scope"><template v-if="scope.row.sessionTitle || scope.row.sessionId"><div class="aclog-ellipsis" :title="scope.row.sessionTitle">{{ scope.row.sessionTitle || '（未命名会话）' }}</div><small class="portal-vue-muted">{{ contextText(scope.row) }}</small></template><span v-else class="portal-vue-muted">—</span></template></el-table-column>
          <el-table-column label="Skill / 模型" min-width="190"><template #default="scope"><div class="aclog-skills"><span v-for="name in skillsOf(scope.row)" :key="name">{{ name }}</span><span v-if="!skillsOf(scope.row).length" class="portal-vue-muted">—</span></div><small class="portal-vue-muted">{{ scope.row.model || "—" }}</small></template></el-table-column>
          <el-table-column label="响应时长" width="100" align="right"><template #default="scope">{{ durationText(scope.row.latencyMs) }}</template></el-table-column>
          <el-table-column label="token" width="90" align="right"><template #default="scope">{{ (scope.row.tokens ?? 0).toLocaleString('zh-CN') }}</template></el-table-column>
          <el-table-column label="结果" width="90"><template #default="scope"><el-tooltip :disabled="!scope.row.error" :content="scope.row.error" placement="top"><el-tag :type="scope.row.status === 'error' ? 'danger' : 'success'" effect="light">{{ scope.row.status === 'error' ? '失败' : '成功' }}</el-tag></el-tooltip></template></el-table-column>
          <el-table-column label="反馈" width="90" align="center" fixed="right"><template #default="scope"><el-button v-if="feedbackOf(scope.row)" link type="primary" @click="openFeedback(scope.row)">{{ feedbackOf(scope.row).rating === 'up' ? '👍' : '👎' }} 详情</el-button><span v-else class="portal-vue-muted">—</span></template></el-table-column>
          <el-table-column label="报告地址" min-width="200" show-overflow-tooltip><template #default="scope"><a v-if="scope.row.reportUrl" :href="href(scope.row.reportUrl)" target="_blank" rel="noopener">{{ href(scope.row.reportUrl) }}</a><span v-else class="portal-vue-muted">—</span></template></el-table-column>
        </el-table>
        <div class="portal-vue-pagination"><span>共 {{ rows.length }} 条，当前 {{ rangeOf(rows.length) }}</span><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,20,50]" :total="rows.length" layout="sizes, prev, pager, next"></el-pagination></div>
      </div>
    `,
    data: () => ({ page: 1, pageSize: 10, feedbackMap: {}, loading: false, filter: { keyword: "", user: "", status: "" }, result: { items: [], matched: 0 } }),
    computed: {
      pagedRows() { const result = paginate(this.rows, this.page, this.pageSize); if (result.safePage !== this.page) this.page = result.safePage; return result.rows; },
      userNames() { return [...new Set((window.PortalVue.state.users || []).map(user => user.name).filter(Boolean))]; },
      rows() {
        const keyword = this.filter.keyword.trim().toLowerCase();
        return keyword ? this.result.items.filter(item => String(item.question || "").toLowerCase().includes(keyword)) : this.result.items;
      }
    },
    methods: {
      rangeOf(total) { if (!total) return "0-0"; return `${(this.page - 1) * this.pageSize + 1}-${Math.min(this.page * this.pageSize, total)}`; },
      formatTime, durationText, href: reportHref,
      /** 这一轮带给模型的会话上文：几轮、多少字 */
      contextText(row) {
        if (row.contextTurns === undefined) return "上文长度未记录";
        if (!row.contextTurns) return "首轮，无上文";
        const chars = row.contextChars || 0;
        return `上文 ${row.contextTurns} 轮 · ${chars >= 1000 ? (chars / 1000).toFixed(1) + "k" : chars} 字`;
      },
      /** 一次问答可能用到多个 Skill（通用分析转交、报告生成）；老记录只有一个 skill 字段 */
      skillsOf(row) { return Array.isArray(row.skills) && row.skills.length ? row.skills : [row.skill || row.scenario].filter(Boolean); },
      feedbackOf(row) { return row.requestId ? this.feedbackMap[row.requestId] : null; },
      openFeedback(row) { window.PortalVue.feedbackFocus = row.requestId; window.portalVueBridge.setPage("AI 反馈"); },
      async load() {
        const params = new URLSearchParams({ limit: "100", type: "analysis" });
        if (this.filter.user) params.set("user", this.filter.user);
        if (this.filter.status) params.set("status", this.filter.status);
        this.loading = true;
        /* 两个请求并行，反馈取不到不影响记录显示 */
        const [fb, audit] = await Promise.allSettled([request("/v1/feedback?limit=200"), request(`/v1/audit?${params}`)]);
        this.feedbackMap = fb.status === "fulfilled" ? Object.fromEntries((fb.value.items || []).map(item => [item.requestId, item])) : {};
        if (audit.status === "fulfilled") this.result = audit.value; else ep.ElMessage.warning(audit.reason.message);
        this.loading = false;
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
