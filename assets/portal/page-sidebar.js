/**
 * 页面：sidebar
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    bridge,
    canViewMenu,
    currentPage,
    isOverviewItem,
    mount,
    refreshTick,
    state,
    toolItemsOf
  } = window.PortalVue;


  /** 箱内至少有一个工具可见时，工具总览页可见 */
  function canViewToolbox(groupName) {
    return toolItemsOf(groupName).some(item => canViewMenu(item.name));
  }

  const SidebarApp = {
    template: `
      <el-config-provider :locale="locale">
        <div class="portal-vue-sidebar">
          <button class="portal-vue-collapse" type="button" :title="collapsed ? '展开侧边栏' : '收起侧边栏'" @click="toggleCollapse">{{ collapsed ? '›' : '‹' }}</button>
          <div class="portal-vue-brand"><img :src="collapsed ? 'assets/momentx-observatory-icon.png' : 'assets/momentx-observatory-logo.jpg'" alt="观星台" /></div>
          <el-scrollbar class="portal-vue-nav-scroll">
            <el-menu class="portal-vue-menu" :collapse="collapsed" :default-active="menuActive" :default-openeds="openGroups" @select="selectPage">
              <template v-for="section in sections" :key="section.group">
                <el-menu-item v-if="section.leaf || (section.items.length === 1 && section.items[0].name === section.group)" :index="section.items[0].name">
                  <img class="portal-nav-icon" :class="section.icon" :src="iconPath(section)" alt="" />
                  <template #title><span>{{ section.group }}</span><span v-if="navBadges(section).length" class="portal-nav-badges"><el-tag v-for="badge in navBadges(section)" :key="badge" class="portal-nav-new" :class="badgeClass(badge)" size="small">{{ badge }}</el-tag></span></template>
                </el-menu-item>
                <el-sub-menu v-else :index="section.group">
                  <template #title>
                    <img class="portal-nav-icon" :class="section.icon" :src="iconPath(section)" alt="" />
                    <span>{{ section.group }}</span><span v-if="navBadges(section).length" class="portal-nav-badges"><el-tag v-for="badge in navBadges(section)" :key="badge" class="portal-nav-new" :class="badgeClass(badge)" size="small">{{ badge }}</el-tag></span>
                  </template>
                  <el-menu-item v-for="item in section.items" :key="item.name" :index="item.name">
                    <span>{{ item.name }}</span><span v-if="navBadges(item).length" class="portal-nav-badges"><el-tag v-for="badge in navBadges(item)" :key="badge" class="portal-nav-new" :class="badgeClass(badge)" size="small">{{ badge }}</el-tag></span>
                  </el-menu-item>
                </el-sub-menu>
              </template>
            </el-menu>
          </el-scrollbar>
        </div>
      </el-config-provider>
    `,
    data: () => ({ collapsed: false }),
    computed: {
      sections() { refreshTick.value; return state.nav.map(section => ({ ...section, items: section.items.filter(item => isOverviewItem(item) ? canViewToolbox(section.group) : canViewMenu(item.name)) })).filter(section => section.items.length); },
      page() { return currentPage.value; },
      menuActive() {
        if (this.page === "新增API") return "数据开放平台";
        if (this.page === "新建人群包") return "人群包管理";
        if (this.page === "维表数据维护") return "维表管理";
        if (this.page === "Quick BI 展示") return "数据看板";
        if (this.page === "配置权限") return "用户管理";
        if (this.page === "表详情") return "表管理";
        /* leaf 箱的工具页不在侧栏里出现，改为点亮所属箱的一级入口 */
        const owner = this.sections.find(section => section.leaf && section.items.some(item => item.name === this.page));
        if (owner) return owner.items[0].name;
        return this.page;
      },
      openGroups() { return this.sections.filter(section => section.items.length > 1).map(section => section.group); }
    },
    methods: {
      isActive(section) { return section.items.some(item => item.name === this.menuActive); },
      iconPath(section) { return bridge.navIconPath(section.icon, this.isActive(section)); },
      navBadges(entry) { return Array.isArray(entry?.badge) ? entry.badge : entry?.badge ? [entry.badge] : []; },
      badgeClass(badge) { return badge === "3.1" ? "portal-nav-badge--v31" : badge === "4.0" ? "portal-nav-badge--v40" : "portal-nav-badge--v20"; },
      selectPage(page) { bridge.setPage(page); },
      toggleCollapse() {
        this.collapsed = !this.collapsed;
        document.getElementById("sidebar").classList.toggle("collapsed", this.collapsed);
      }
    }
  };

  mount("#sidebar", SidebarApp, "sidebar");
})();
