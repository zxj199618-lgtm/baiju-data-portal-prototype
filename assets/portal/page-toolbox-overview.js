/**
 * 页面：toolbox-overview
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    bridge,
    canEditMenu,
    canViewMenu,
    currentPage,
    mount,
    refreshTick,
    toolItemsOf
  } = window.PortalVue;


  /** 工具总览卡片：名称 / 说明 / 图标 / 是否可写，全部由导航 + 权限派生 */
  function toolboxToolsOf(groupName) {
    return toolItemsOf(groupName).filter(item => canViewMenu(item.name)).map(item => {
      const meta = (bridge.pageMeta && bridge.pageMeta[item.name]) || [];
      return {
        name: item.name,
        desc: meta[1] || "",
        icon: bridge.toolIconPath(item.name) || "assets/nav-toolbox-default.svg",
        editable: canEditMenu(item.name)
      };
    });
  }

  /* 工具总览：卡片全部由 state.nav + 权限过滤派生，不手写第二份工具清单 */
  const ToolboxOverviewApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel portal-vue-toolbox">
          <div class="portal-vue-toolbox-bar">
            <span class="portal-vue-muted">只列出你已授权的工具；点卡片直接进入，右上角标签表示你对该工具是「可写」还是「只读」。</span>
            <el-tag size="small" effect="plain" type="info">共 {{ tools.length }} 个可用工具</el-tag>
          </div>
          <div class="portal-vue-tool-cards">
            <article v-for="tool in tools" :key="tool.name" class="portal-vue-tool-card" tabindex="0" @click="open(tool)" @keydown.enter="open(tool)">
              <img class="portal-vue-tool-card-icon" :src="tool.icon" alt="" />
              <div class="portal-vue-tool-card-main">
                <strong>{{ tool.name }}</strong>
                <p class="portal-vue-muted">{{ tool.desc }}</p>
              </div>
              <div class="portal-vue-tool-card-side">
                <el-tag size="small" effect="plain" :type="tool.editable ? 'primary' : 'info'">{{ tool.editable ? '可写' : '只读' }}</el-tag>
                <span class="portal-vue-tool-card-go">进入 ›</span>
              </div>
            </article>
          </div>
          <el-empty v-if="!tools.length" :description="'还没有已授权的工具，请联系管理员开通「' + box + '」内的工具'" />
        </section>
      </el-config-provider>
    `,
    data: () => ({ bridge }),
    computed: {
      box() { return currentPage.value === "业务工具箱" ? "业务工具箱" : "大数据工具箱"; },
      tools() { refreshTick.value; return toolboxToolsOf(this.box); }
    },
    methods: { open(tool) { bridge.setPage(tool.name); } }
  };

  mount("#toolboxOverviewView", ToolboxOverviewApp, "toolbox-overview");
})();
