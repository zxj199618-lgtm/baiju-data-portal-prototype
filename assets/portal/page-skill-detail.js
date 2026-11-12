/**
 * 页面：skill-detail
 * 依赖 core.js（window.PortalVue）。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    bridge,
    ep,
    mount,
    state
  } = window.PortalVue;

  const SkillDetailApp = {
    template: `
      <el-config-provider :locale="locale">
        <div>
          <el-page-header class="portal-vue-form-header" title="返回 Skill 管理" :content="headerTitle" @back="back"></el-page-header>
          <div v-if="!skill" style="padding:60px 20px"><el-empty description="请先从「Skill 配置」选择一个 Skill 进入详情" /></div>
        </div>
      </el-config-provider>
    `,
    setup() {
      return { locale: ep.zhCn };
    },
    data() {
      return { skillId: "" };
    },
    computed: {
      skill() { return (state.skills || []).find(item => item.id === this.skillId) || null; },
      headerTitle() { return this.skill?.name || "Skill 详情"; }
    },
    methods: {
      back() { bridge.setPage("Skill 配置"); },
      loadSkill() {
        this.skillId = bridge.getSkillDetailId?.() || "";
      }
    },
    mounted() {
      this.pageHandler = event => { if (event.detail?.page === "Skill 详情") this.loadSkill(); };
      window.addEventListener("portal:page-change", this.pageHandler);
      if (bridge.getPage() === "Skill 详情") this.loadSkill();
    },
    beforeUnmount() {
      window.removeEventListener("portal:page-change", this.pageHandler);
    }
  };

  mount("#skillDetailView", SkillDetailApp, "skill-detail");
})();
