/**
 * 页面：AI 反馈（AI 中心 → AI 反馈，仅管理员）
 * 汇总用户对灵犀智析回答的好评 / 差评，差评带原因。数据来自网关 GET /v1/feedback。
 * 依赖 core.js（window.PortalVue）。
 */
(() => {
  "use strict";
  const paginate = (...args) => window.PortalVue.paginate(...args);
  if (!window.PortalVue) return;
  const { analysisGatewayBase, ep, mount } = window.PortalVue;

  async function request(path) {
    const response = await fetch(`${analysisGatewayBase}${path}`, { headers: { "Content-Type": "application/json" } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
    return data;
  }
  (() => { if (document.getElementById("ai-fb-style")) return; const el = document.createElement("style"); el.id = "ai-fb-style"; el.textContent = ".fbd-rating{display:flex;align-items:baseline;gap:8px;font-size:18px}.fbd-rating small{color:#98a2b3;font-size:12px}.fbd-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:14px 0}.fbd-meta dt{font-size:12px;color:#98a2b3}.fbd-meta dd{margin:2px 0 0;font-size:13px;word-break:break-all}.fbd h4{margin:16px 0 6px;font-size:13px;color:#566174}.fbd-box{margin:0;padding:10px 12px;border-radius:8px;background:#f7f9fc;border:1px solid #edf0f6;line-height:1.7;white-space:pre-wrap;word-break:break-word}.fbd-box.muted{color:#98a2b3}.fbd-answer{max-height:46vh;overflow:auto}.portal-vue-ai-fb-answer{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;cursor:pointer;line-height:1.6}"; document.head.appendChild(el); })();
  const formatTime = iso => (iso ? new Date(iso).toLocaleString("zh-CN", { hour12: false }) : "—");

  const AiFeedbackApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <div class="portal-vue-toolbar">
            <div class="portal-vue-toolbar-left">
              <el-radio-group v-model="rating" @change="load"><el-radio-button label="">全部</el-radio-button><el-radio-button label="down">👎 差评</el-radio-button><el-radio-button label="up">👍 好评</el-radio-button></el-radio-group>
            </div>
            <div><span class="portal-vue-muted" style="margin-right:12px">共 {{ feedback.summary.total }} 条：👍 {{ feedback.summary.up }} · 👎 {{ feedback.summary.down }}</span><el-button @click="load">刷新</el-button></div>
          </div>
          <el-table :data="pagedRows" class="portal-vue-table" border v-loading="loading" empty-text="还没有反馈" data-test="feedback-table">
            <el-table-column label="时间" width="170"><template #default="scope">{{ formatTime(scope.row.at) }}</template></el-table-column>
            <el-table-column label="评价" width="80" align="center"><template #default="scope">{{ scope.row.rating === 'up' ? '👍' : '👎' }}</template></el-table-column>
            <el-table-column prop="user" label="账号" width="120"></el-table-column>
            <el-table-column label="模型 / Skill" min-width="200"><template #default="scope">{{ scope.row.model }}<br /><span class="portal-vue-muted">{{ scope.row.skill }}</span></template></el-table-column>
            <el-table-column prop="question" label="问题" min-width="220" show-overflow-tooltip></el-table-column>
            <el-table-column label="回答结果" min-width="320"><template #default="scope"><el-popover v-if="scope.row.answer" placement="left" :width="520" trigger="click"><template #reference><div class="portal-vue-ai-fb-answer" title="点击查看完整回答">{{ scope.row.answer }}</div></template><div style="max-height:360px;overflow:auto;white-space:pre-wrap;line-height:1.7">{{ scope.row.answer }}</div></el-popover><span v-else class="portal-vue-muted">—（历史记录未保存）</span></template></el-table-column>
            <el-table-column prop="comment" label="原因" min-width="200"></el-table-column>
            <el-table-column label="操作" width="90" fixed="right"><template #default="scope"><el-button link type="primary" @click="openDetail(scope.row)">详情</el-button></template></el-table-column>
          </el-table>
          <div class="portal-vue-pagination"><span>共 {{ feedback.items.length }} 条，当前 {{ rangeOf(feedback.items.length) }}</span><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,20,50]" :total="feedback.items.length" layout="sizes, prev, pager, next"></el-pagination></div>
        </section>
        <el-drawer v-model="detailVisible" title="反馈详情" direction="rtl" size="560px" :close-on-click-modal="true">
          <div v-if="detail" class="fbd">
            <div class="fbd-rating"><span>{{ detail.rating === 'up' ? '👍' : '👎' }}</span><strong>{{ detail.rating === 'up' ? '好评' : '差评' }}</strong><small>{{ formatTime(detail.at) }} · {{ detail.user }}</small></div>
            <dl class="fbd-meta"><div><dt>模型</dt><dd>{{ detail.model || '—' }}</dd></div><div><dt>Skill</dt><dd>{{ detail.skill || '—' }}</dd></div><div><dt>请求编号</dt><dd><code>{{ detail.requestId }}</code></dd></div></dl>
            <h4>问题</h4><p class="fbd-box">{{ detail.question || '—' }}</p>
            <h4>用户反馈原因</h4><p class="fbd-box" :class="{ muted: !detail.comment }">{{ detail.comment || '（未填写）' }}</p>
            <h4>回答结果</h4><p class="fbd-box fbd-answer" :class="{ muted: !detail.answer }">{{ detail.answer || '（历史记录未保存回答内容）' }}</p>
          </div>
        </el-drawer>
      </el-config-provider>
    `,
    data: () => ({ page: 1, pageSize: 10, detailVisible: false, detail: null, rating: "", loading: false, feedback: { summary: { total: 0, up: 0, down: 0, byModel: {}, bySkill: {} }, items: [] } }),
    computed: {
      pagedRows() { const result = paginate(this.feedback.items, this.page, this.pageSize); if (result.safePage !== this.page) this.page = result.safePage; return result.rows; }
    },
    methods: {
      rangeOf(total) { if (!total) return "0-0"; return `${(this.page - 1) * this.pageSize + 1}-${Math.min(this.page * this.pageSize, total)}`; },
      formatTime,
      openDetail(row) { this.detail = row; this.detailVisible = true; },
      async load() {
        this.loading = true;
        try { this.feedback = await request(`/v1/feedback?limit=100${this.rating ? `&rating=${this.rating}` : ""}`); } catch (error) { ep.ElMessage.warning(error.message); } finally { this.loading = false; }
        /* 从「AI 对话记录」点反馈进来：直接打开那一条的详情 */
        const focus = window.PortalVue.feedbackFocus;
        if (focus) { window.PortalVue.feedbackFocus = ""; const hit = this.feedback.items.find(item => item.requestId === focus); if (hit) this.openDetail(hit); }
      }
    },
    mounted() {
      this.pageHandler = event => { if (event.detail?.page === "AI 反馈") this.load(); };
      window.addEventListener("portal:page-change", this.pageHandler);
    },
    beforeUnmount() { window.removeEventListener("portal:page-change", this.pageHandler); }
  };

  mount("#aiFeedbackView", AiFeedbackApp, "ai-feedback");
})();
