/**
 * 组件：AI 对话记录（访问记录页顶部页签之一，仅管理员）
 * 展示灵犀智析每一次问答：谁问的、问了什么、用了哪个 Skill / 模型、响应时长、token、结果、报告地址（生成了报告才有）。
 * 点击问题或右侧「详情」弹窗展示完整会话上下文与模型输出，自动滚动并高亮标记对应记录位置；
 * 同时支持从「AI 反馈」页带 auditContextFocus 直接跳转打开并定位。
 * 数据来自网关 GET /v1/audit?type=analysis 与 GET /v1/audit/context。由 page-operation-log.js 作为子组件使用，需先于它加载。
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

  /** 轻量安全 Markdown 渲染（用于弹窗内展示完整模型输出与报告正文） */
  function renderSimpleMarkdown(md) {
    const esc = v => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const inline = v => esc(v).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    const lines = String(md || "").split(/\r?\n/);
    let html = "", inCode = false, inTable = false, inList = false;
    const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
    const closeTable = () => { if (inTable) { html += "</tbody></table>"; inTable = false; } };
    lines.forEach(raw => {
      const line = raw.trimEnd();
      if (/^```/.test(line)) {
        closeList(); closeTable();
        html += inCode ? "</code></pre>" : "<pre><code>";
        inCode = !inCode;
        return;
      }
      if (inCode) { html += esc(raw) + "\n"; return; }
      if (/^\|.*\|$/.test(line)) {
        const cells = line.replace(/^\||\|$/g, "").split("|");
        if (cells.every(c => /^\s*:?-{2,}:?\s*$/.test(c))) return;
        if (!inTable) { html += '<table class="aclog-md-table"><tbody>'; inTable = true; }
        const tag = html.endsWith("<tbody>") ? "th" : "td";
        html += "<tr>" + cells.map(c => `<${tag}>${inline(c.trim())}</${tag}>`).join("") + "</tr>";
        return;
      }
      closeTable();
      if (/^#{1,4}\s/.test(line)) { closeList(); const lv = line.match(/^#+/)[0].length; html += `<h${lv + 2}>${inline(line.replace(/^#+\s*/, ""))}</h${lv + 2}>`; return; }
      if (/^[-*]\s/.test(line)) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${inline(line.replace(/^[-*]\s*/, ""))}</li>`; return; }
      closeList();
      if (!line.trim()) return;
      html += `<p>${inline(line)}</p>`;
    });
    closeList(); closeTable();
    if (inCode) html += "</code></pre>";
    return html;
  }

  (() => {
    if (document.getElementById("aclog-style")) return;
    const el = document.createElement("style");
    el.id = "aclog-style";
    el.textContent = [
      ".aclog-ellipsis{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".aclog-skills{display:flex;flex-direction:column;gap:2px}",
      ".aclog-skills span{line-height:1.5}",
      ".aclog-skills span+span::before{content:\"+ \";color:#98a2b3}",
      ".aclog-q-link{display:block;width:100%;padding:0;border:0;background:transparent;color:#1f2733;font:inherit;text-align:left;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:color .15s}",
      ".aclog-q-link:hover{color:#0066ff;text-decoration:underline;text-underline-offset:3px}",
      ".aclog-ctx-dialog .el-dialog__header{padding:14px 20px;border-bottom:1px solid #eef0f4;margin-right:0}",
      ".aclog-ctx-dialog .el-dialog__body{padding:16px 20px 20px;max-height:76vh;overflow-y:auto}",
      ".aclog-ctx-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-right:28px}",
      ".aclog-ctx-head-title{display:flex;align-items:center;gap:8px;min-width:0}",
      ".aclog-ctx-head-title strong{font-size:15px;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".aclog-ctx-head-ops{display:flex;align-items:center;gap:8px;flex:none}",
      ".aclog-ctx-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px 14px;padding:12px 14px;margin-bottom:14px;border-radius:10px;background:#f7f9fc;border:1px solid #ebeff5}",
      ".aclog-ctx-meta dt{font-size:11.5px;color:#8a94a6;margin:0}",
      ".aclog-ctx-meta dd{font-size:13px;color:#1f2733;margin:3px 0 0;word-break:break-word}",
      ".aclog-ctx-source{margin:0 0 12px;padding:8px 12px;border-radius:8px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:12.5px}",
      ".aclog-ctx-list{display:flex;flex-direction:column;gap:12px}",
      ".aclog-ctx-msg{position:relative;padding:12px 16px;border-radius:12px;border:1px solid #ebeff5;background:#fff;transition:border-color .2s,box-shadow .2s}",
      ".aclog-ctx-msg.is-user{background:#f8fafc}",
      ".aclog-ctx-msg.is-target{border-color:#2563eb;background:#f0f6ff;box-shadow:0 0 0 3px rgba(37,99,235,.12)}",
      ".aclog-ctx-msg.is-pulse{animation:aclog-pulse 1.2s ease}",
      "@keyframes aclog-pulse{0%{box-shadow:0 0 0 6px rgba(37,99,235,.28)}100%{box-shadow:0 0 0 3px rgba(37,99,235,.12)}}",
      ".aclog-ctx-msg-head{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px;color:#64748b}",
      ".aclog-ctx-role{display:inline-flex;align-items:center;padding:1px 8px;border-radius:999px;font-weight:500;font-size:11.5px}",
      ".aclog-ctx-role.user{background:#e2e8f0;color:#334155}",
      ".aclog-ctx-role.assistant{background:#111827;color:#fff}",
      ".aclog-ctx-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:999px;background:#2563eb;color:#fff;font-size:11.5px;font-weight:500}",
      ".aclog-ctx-msg-body{font-size:13.5px;line-height:1.75;color:#1f2733;word-break:break-word}",
      ".aclog-ctx-msg-body p{margin:6px 0}",
      ".aclog-ctx-msg-body p:first-child{margin-top:0}",
      ".aclog-ctx-msg-body p:last-child{margin-bottom:0}",
      ".aclog-ctx-msg-body h3,.aclog-ctx-msg-body h4,.aclog-ctx-msg-body h5{margin:12px 0 6px;font-weight:600;color:#111827}",
      ".aclog-ctx-msg-body ul{margin:6px 0;padding-left:20px}",
      ".aclog-ctx-msg-body pre{padding:10px 12px;border-radius:8px;background:#f1f5f9;overflow-x:auto;font-size:12.5px}",
      ".aclog-ctx-msg-body code{padding:1px 5px;border-radius:4px;background:#f1f5f9;font-size:12.5px}",
      ".aclog-md-table{width:100%;margin:10px 0;border-collapse:collapse;font-size:12.5px;background:#fff;border:1px solid #e2e8f0}",
      ".aclog-md-table th,.aclog-md-table td{padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:left}",
      ".aclog-md-table th{background:#f8fafc;font-weight:600;color:#475569}",
      ".aclog-ctx-report-title{margin:0 0 8px;padding:6px 10px;border-radius:6px;background:#eef2ff;color:#1e40af;font-size:12.5px;font-weight:600}",
      ".aclog-ctx-msg-meta{margin-top:8px;padding-top:8px;border-top:1px dashed #e2e8f0;font-size:12px;color:#64748b}",
      ".aclog-ctx-tools{margin-top:14px;padding:10px 14px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0}",
      ".aclog-ctx-tools h5{margin:0 0 6px;font-size:12.5px;color:#475569}",
      ".aclog-ctx-tools ul{margin:0;padding-left:18px;font-size:12px;color:#334155;line-height:1.7}"
    ].join("");
    document.head.appendChild(el);
  })();

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
          <el-table-column label="问题" min-width="280"><template #default="scope"><button type="button" class="aclog-q-link" :title="scope.row.question || '查看对话详情'" data-test="audit-question-link" @click="openContext(scope.row)">{{ scope.row.question || "—" }}</button></template></el-table-column>
          <el-table-column label="会话窗口" min-width="200"><template #default="scope"><template v-if="scope.row.sessionTitle || scope.row.sessionId"><div class="aclog-ellipsis" :title="scope.row.sessionTitle">{{ scope.row.sessionTitle || '（未命名会话）' }}</div><small class="portal-vue-muted">{{ contextText(scope.row) }}</small></template><span v-else class="portal-vue-muted" title="该记录产生于会话信息上线之前，没有记录会话窗口">历史记录，未记录会话</span></template></el-table-column>
          <el-table-column label="Skill / 模型" min-width="190"><template #default="scope"><div class="aclog-skills"><span v-for="name in skillsOf(scope.row)" :key="name">{{ name }}</span><span v-if="!skillsOf(scope.row).length" class="portal-vue-muted">—</span></div><small class="portal-vue-muted">{{ scope.row.model || "—" }}</small></template></el-table-column>
          <el-table-column label="响应时长" width="100" align="right"><template #default="scope">{{ durationText(scope.row.latencyMs) }}</template></el-table-column>
          <el-table-column label="token" width="90" align="right"><template #default="scope">{{ (scope.row.tokens ?? 0).toLocaleString('zh-CN') }}</template></el-table-column>
          <el-table-column label="结果" width="90"><template #default="scope"><el-tooltip :disabled="!scope.row.error" :content="scope.row.error" placement="top"><el-tag :type="scope.row.status === 'error' ? 'danger' : 'success'" effect="light">{{ scope.row.status === 'error' ? '失败' : '成功' }}</el-tag></el-tooltip></template></el-table-column>
          <el-table-column label="反馈" width="90" align="center"><template #default="scope"><el-button v-if="feedbackOf(scope.row)" link type="primary" @click="openFeedback(scope.row)">{{ feedbackOf(scope.row).rating === 'up' ? '👍' : '👎' }} 详情</el-button><span v-else class="portal-vue-muted">—</span></template></el-table-column>
          <el-table-column label="报告地址" min-width="180" show-overflow-tooltip><template #default="scope"><a v-if="scope.row.reportUrl" :href="href(scope.row.reportUrl)" target="_blank" rel="noopener">{{ href(scope.row.reportUrl) }}</a><span v-else class="portal-vue-muted">—</span></template></el-table-column>
          <el-table-column label="操作" width="84" align="center" fixed="right"><template #default="scope"><el-button link type="primary" data-test="audit-detail-btn" @click="openContext(scope.row)">详情</el-button></template></el-table-column>
        </el-table>
        <div class="portal-vue-pagination"><span>共 {{ rows.length }} 条，当前 {{ rangeOf(rows.length) }}</span><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,20,50]" :total="rows.length" layout="sizes, prev, pager, next"></el-pagination></div>

        <el-dialog v-model="ctxVisible" width="920px" top="5vh" :close-on-click-modal="true" append-to-body class="aclog-ctx-dialog" data-test="audit-context-dialog">
          <template #header>
            <div class="aclog-ctx-head">
              <div class="aclog-ctx-head-title">
                <strong>{{ ctxData?.session?.title || ctxRow?.sessionTitle || '对话上下文详情' }}</strong>
                <el-tag v-if="ctxData?.messages?.length" size="small" type="info" effect="plain">共 {{ ctxData.messages.length }} 条消息</el-tag>
              </div>
              <div class="aclog-ctx-head-ops">
                <el-button v-if="hasTargetInCtx" size="small" type="primary" plain @click="scrollToTarget(true)">定位到当前记录</el-button>
                <el-button v-if="ctxAuditRow && feedbackOf(ctxAuditRow)" size="small" @click="jumpFeedbackFromCtx">查看反馈详情</el-button>
              </div>
            </div>
          </template>
          <div v-loading="ctxLoading" style="min-height:180px">
            <dl v-if="ctxAuditRow" class="aclog-ctx-meta">
              <div><dt>账号</dt><dd>{{ ctxAuditRow.user || '—' }}<span v-if="ctxAuditRow.scope" class="portal-vue-muted">（访客）</span></dd></div>
              <div><dt>时间</dt><dd>{{ formatTime(ctxAuditRow.at) }}</dd></div>
              <div><dt>模型 / Skill</dt><dd>{{ ctxAuditRow.model || '—' }}<span v-if="skillsOf(ctxAuditRow).length"> · {{ skillsOf(ctxAuditRow).join(' + ') }}</span></dd></div>
              <div><dt>耗时 / token</dt><dd>{{ durationText(ctxAuditRow.latencyMs) }} · {{ (ctxAuditRow.tokens ?? 0).toLocaleString('zh-CN') }}</dd></div>
            </dl>
            <p v-if="ctxData && ctxData.source && ctxData.source !== 'history'" class="aclog-ctx-source">
              {{ ctxData.source === 'ledger' ? '原会话已不在工作台历史中，已从证据账本还原该轮问答与模型输出。' : ctxData.source === 'feedback' ? '原会话已不在工作台历史中，已从用户反馈记录还原上下文与模型输出。' : '原会话未留存在历史记录中，仅展示审计记录摘要。' }}
            </p>
            <div v-if="ctxData && ctxData.messages && ctxData.messages.length" ref="ctxList" class="aclog-ctx-list" data-test="audit-context-list">
              <article v-for="msg in ctxData.messages" :key="msg.index" class="aclog-ctx-msg" :class="{ 'is-user': msg.role === 'user', 'is-target': msg.isTargetQuestion || msg.isTargetAnswer, 'is-pulse': ctxPulse && (msg.isTargetQuestion || msg.isTargetAnswer) }" :data-test="(msg.isTargetQuestion || msg.isTargetAnswer) ? 'audit-target-msg' : 'audit-ctx-msg'" :data-msg-index="msg.index">
                <div class="aclog-ctx-msg-head">
                  <span class="aclog-ctx-role" :class="msg.role">{{ msg.role === 'user' ? '用户提问' : '模型输出' }}</span>
                  <span>#{{ msg.index + 1 }}</span>
                  <span v-if="msg.businessLine" class="portal-vue-muted">业务线：{{ msg.businessLine }}</span>
                  <span v-if="msg.isTargetQuestion" class="aclog-ctx-badge">当前记录 · 提问</span>
                  <span v-else-if="msg.isTargetAnswer" class="aclog-ctx-badge">当前记录 · 模型输出</span>
                </div>
                <div v-if="msg.reportTitle" class="aclog-ctx-report-title">报告：{{ msg.reportTitle }}</div>
                <div v-if="msg.role === 'assistant'" class="aclog-ctx-msg-body" v-html="renderAnswerHtml(msg)"></div>
                <div v-else class="aclog-ctx-msg-body" style="white-space:pre-wrap">{{ msg.text || '—' }}</div>
                <div v-if="msg.meta" class="aclog-ctx-msg-meta">{{ msg.meta }}</div>
              </article>
            </div>
            <el-empty v-else-if="!ctxLoading" description="未找到该记录对应的完整对话上下文"></el-empty>
            <div v-if="ctxData && ctxData.toolCalls && ctxData.toolCalls.length" class="aclog-ctx-tools">
              <h5>本轮工具调用记录（{{ ctxData.toolCalls.length }} 次）</h5>
              <ul>
                <li v-for="(call, idx) in ctxData.toolCalls" :key="idx">
                  <strong>{{ call.tool }}</strong>
                  <span v-if="call.table"> · 表：{{ call.table }}</span>
                  <span v-if="call.ok === false" style="color:#dc2626"> · 失败</span>
                  <span v-if="call.summary" class="portal-vue-muted"> — {{ call.summary }}</span>
                </li>
              </ul>
            </div>
          </div>
        </el-dialog>
      </div>
    `,
    data: () => ({
      page: 1, pageSize: 10, feedbackMap: {}, loading: false,
      filter: { keyword: "", user: "", status: "" },
      result: { items: [], matched: 0 },
      ctxVisible: false, ctxLoading: false, ctxRow: null, ctxData: null, ctxPulse: false
    }),
    computed: {
      pagedRows() { const result = paginate(this.rows, this.page, this.pageSize); if (result.safePage !== this.page) this.page = result.safePage; return result.rows; },
      userNames() { return [...new Set((window.PortalVue.state.users || []).map(user => user.name).filter(Boolean))]; },
      rows() {
        const keyword = this.filter.keyword.trim().toLowerCase();
        return keyword ? this.result.items.filter(item => String(item.question || "").toLowerCase().includes(keyword)) : this.result.items;
      },
      ctxAuditRow() { return this.ctxData?.audit || this.ctxRow || null; },
      hasTargetInCtx() { return Boolean((this.ctxData?.messages || []).some(m => m.isTargetQuestion || m.isTargetAnswer)); }
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
      jumpFeedbackFromCtx() {
        if (!this.ctxAuditRow) return;
        this.ctxVisible = false;
        this.openFeedback(this.ctxAuditRow);
      },
      renderAnswerHtml(msg) {
        if (msg.markdown) return renderSimpleMarkdown(msg.markdown);
        if (msg.html) return msg.html;
        return renderSimpleMarkdown(msg.text || "（无输出内容）");
      },
      scrollToTarget(pulse = false) {
        this.$nextTick(() => {
          const list = this.$refs.ctxList;
          if (!list) return;
          const target = list.querySelector('[data-test="audit-target-msg"]');
          if (!target) return;
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          if (pulse) {
            this.ctxPulse = false;
            this.$nextTick(() => {
              this.ctxPulse = true;
              setTimeout(() => { this.ctxPulse = false; }, 1300);
            });
          }
        });
      },
      async openContext(row) {
        if (!row) return;
        this.ctxRow = row;
        this.ctxData = null;
        this.ctxVisible = true;
        this.ctxLoading = true;
        const params = new URLSearchParams();
        if (row.requestId) params.set("requestId", row.requestId);
        if (row.sessionId) params.set("sessionId", row.sessionId);
        if (row.user) params.set("user", row.user);
        if (row.scope) params.set("scope", row.scope);
        if (row.question) params.set("question", row.question);
        try {
          this.ctxData = await request(`/v1/audit/context?${params}`);
          this.scrollToTarget(true);
        } catch (error) {
          ep.ElMessage.warning(error.message);
        } finally {
          this.ctxLoading = false;
        }
      },
      consumeFocus() {
        const focus = window.PortalVue.auditContextFocus;
        if (!focus) return;
        window.PortalVue.auditContextFocus = null;
        const matched = (this.result.items || []).find(item => focus.requestId && item.requestId === focus.requestId);
        this.openContext(matched || focus);
      },
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
        this.consumeFocus();
      }
    },
    mounted() {
      /* 页面一加载就会挂载，登录前请求会被拒；只在进入「访问记录」页时才取数 */
      this.pageHandler = event => { if (event.detail?.page === "访问记录") this.load(); };
      this.focusHandler = () => { this.consumeFocus(); };
      window.addEventListener("portal:page-change", this.pageHandler);
      window.addEventListener("portal:open-audit-context", this.focusHandler);
      if (window.portalVueBridge?.getPage?.() === "访问记录") this.load();
    },
    beforeUnmount() {
      window.removeEventListener("portal:page-change", this.pageHandler);
      window.removeEventListener("portal:open-audit-context", this.focusHandler);
    }
  };
})();
