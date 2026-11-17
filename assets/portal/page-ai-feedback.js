/**
 * 页面：AI 反馈（AI 中心 → AI 反馈，仅管理员）
 * 汇总用户对灵犀智析回答的好评 / 差评，差评带原因。数据来自网关 GET /v1/feedback。
 * 依赖 core.js（window.PortalVue）。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const { analysisGatewayBase, ep, mount } = window.PortalVue;

  async function request(path) {
    const response = await fetch(`${analysisGatewayBase}${path}`, { headers: { "Content-Type": "application/json" } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
    return data;
  }
  (() => { if (document.getElementById("ai-fb-style")) return; const el = document.createElement("style"); el.id = "ai-fb-style"; el.textContent = ".portal-vue-ai-fb-answer{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;cursor:pointer;line-height:1.6}"; document.head.appendChild(el); })();
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
          <el-table :data="feedback.items" class="portal-vue-table" border v-loading="loading" empty-text="还没有反馈" data-test="feedback-table">
            <el-table-column label="时间" width="170"><template #default="scope">{{ formatTime(scope.row.at) }}</template></el-table-column>
            <el-table-column label="评价" width="80" align="center"><template #default="scope">{{ scope.row.rating === 'up' ? '👍' : '👎' }}</template></el-table-column>
            <el-table-column prop="user" label="账号" width="120"></el-table-column>
            <el-table-column label="模型 / Skill" min-width="200"><template #default="scope">{{ scope.row.model }}<br /><span class="portal-vue-muted">{{ scope.row.skill }}</span></template></el-table-column>
            <el-table-column prop="question" label="问题" min-width="220" show-overflow-tooltip></el-table-column>
            <el-table-column label="回答结果" min-width="320"><template #default="scope"><el-popover v-if="scope.row.answer" placement="left" :width="520" trigger="click"><template #reference><div class="portal-vue-ai-fb-answer" title="点击查看完整回答">{{ scope.row.answer }}</div></template><div style="max-height:360px;overflow:auto;white-space:pre-wrap;line-height:1.7">{{ scope.row.answer }}</div></el-popover><span v-else class="portal-vue-muted">—（历史记录未保存）</span></template></el-table-column>
            <el-table-column prop="comment" label="原因" min-width="200"></el-table-column>
          </el-table>
        </section>
      </el-config-provider>
    `,
    data: () => ({ rating: "", loading: false, feedback: { summary: { total: 0, up: 0, down: 0, byModel: {}, bySkill: {} }, items: [] } }),
    methods: {
      formatTime,
      async load() {
        this.loading = true;
        try { this.feedback = await request(`/v1/feedback?limit=100${this.rating ? `&rating=${this.rating}` : ""}`); } catch (error) { ep.ElMessage.warning(error.message); } finally { this.loading = false; }
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
