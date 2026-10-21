/**
 * 页面：page-head
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    bridge,
    currentPage,
    mount,
    refreshTick
  } = window.PortalVue;


  const PageHeadApp = {
    template: `
      <el-config-provider :locale="locale">
        <div v-if="visible" class="portal-vue-page-head">
          <div>
            <button v-if="backBox" type="button" class="portal-vue-tool-back portal-vue-head-back" @click="backToBox(backBox)">‹ 返回{{ backBox }}</button>
            <h1>{{ title }}</h1><p v-if="subtitle">{{ subtitle }}</p>
          </div>
        </div>
      </el-config-provider>
    `,
    computed: {
      page() { return currentPage.value; },
      meta() { refreshTick.value; return bridge.pageMeta[this.page] || bridge.pageMeta["数据看板"]; },
      // 灵犀智析是整屏工作台，自身已有导航与标签栏标识，不再展示页面标题区。
      visible() { return !["灵犀智析", "新增API", "新建人群包", "Quick BI 展示", "配置权限", "查看权限", "无权限", "维表数据维护", "表详情"].includes(this.page); },
      title() { return this.meta?.[0] || this.page; },
      subtitle() { return this.meta?.[1] || ""; },
      /* 工具箱内的具体工具页：标题上方给出返回所属工具箱的入口 */
      backBox() {
        if (["补数据", "消耗对比", "环境域名"].includes(this.page)) return "大数据工具箱";
        if (["生成人群包", "短剧投放账户上报"].includes(this.page)) return "业务工具箱";
        return "";
      }
    },
    watch: { visible(value) { document.querySelector(".page-head")?.classList.toggle("portal-vue-head-hidden", !value); } },
    mounted() {
      document.querySelector(".page-head")?.classList.toggle("portal-vue-head-hidden", !this.visible);
    }
  };
  mount(".page-head", PageHeadApp, "page-head");
})();
