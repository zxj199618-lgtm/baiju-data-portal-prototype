/**
 * 页面：topbar
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    analysisGatewayBase,
    bridge,
    currentPage,
    ep,
    loginUserName,
    mount,
    refreshTick,
    state
  } = window.PortalVue;


  const TopbarApp = {
    template: `
      <el-config-provider :locale="locale">
        <div class="portal-vue-topbar">
          <div class="portal-vue-tabs">
            <span class="portal-vue-home">首页</span>
            <button v-for="tab in tabs" :key="tab.name" class="portal-vue-tab" :class="{active:isActive(tab)}" type="button" @click="openTab(tab)">
              <img :src="tabIcon(tab)" alt="" /><span>{{ tab.name }}</span>
              <span v-if="tab.closable" class="portal-vue-tab-close" title="关闭" @click.stop="closeTab(tab)">×</span>
            </button>
          </div>
          <el-dropdown trigger="click" @command="handleUserCommand">
            <span class="portal-vue-user"><el-avatar :size="34" style="background:#1677ff">{{ userName.slice(0, 1) }}</el-avatar><span class="portal-vue-user-name">{{ userName }}</span></span>
            <template #dropdown><el-dropdown-menu><el-dropdown-item command="password">修改密码</el-dropdown-item><el-dropdown-item command="logout">退出系统</el-dropdown-item></el-dropdown-menu></template>
          </el-dropdown>
        </div>
      </el-config-provider>
    `,
    data: () => ({ bridge }),
    computed: {
      tabs() { refreshTick.value; return state.tabs; },
      page() { return currentPage.value; },
      // 页头显示当前登录账号（原来写死为「曾祥竞」，任何人登录都显示同一个名字）
      userName() { refreshTick.value; return loginUserName(); },
      activeBoard() { refreshTick.value; return bridge.getActiveBoard(); }
    },
    methods: {
      tabIcon(tab) { return bridge.toolIconPath(tab.page) || bridge.navIconPath(tab.icon, this.isActive(tab)); },
      isActive(tab) { return (tab.page === this.page || (tab.page === "维表管理" && this.page === "维表数据维护")) && (tab.boardIndex === undefined || tab.name === this.activeBoard?.name); },
      openTab(tab) { tab.boardIndex === undefined ? bridge.setPage(tab.page) : bridge.openQuickBi(tab.boardIndex); },
      closeTab(tab) {
        const index = state.tabs.indexOf(tab);
        if (index < 0) return;
        const wasActive = this.isActive(tab);
        state.tabs.splice(index, 1);
        if (wasActive) {
          const next = state.tabs[Math.max(0, index - 1)] || state.tabs[0];
          if (next) this.openTab(next);
        }
        refreshTick.value += 1;
      },
      async changePassword() {
        const ask = (message, title) => ep.ElMessageBox.prompt(message, title, { inputType: "password", confirmButtonText: "下一步", cancelButtonText: "取消", inputPattern: /\S+/, inputErrorMessage: "不能为空" });
        try {
          const oldPassword = (await ask("请输入当前密码", "修改密码")).value;
          const newPassword = (await ask("请输入新密码（至少 8 位）", "修改密码")).value;
          const response = await fetch(`${analysisGatewayBase}/v1/auth/password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ oldPassword, newPassword }) });
          const data = await response.json().catch(() => ({}));
          if (response.ok) ep.ElMessage.success("密码已修改，下次登录请使用新密码");
          else ep.ElMessage.warning(data.error || "修改失败");
        } catch (cancelled) { /* 用户取消 */ }
      },
      handleUserCommand(command) {
        if (command === "password") return this.changePassword();
        if (command !== "logout") return;
        window.portalAuth?.clear();
        document.getElementById("portalApp").classList.add("hidden");
        document.getElementById("loginView").classList.remove("hidden");
        ep.ElMessage.success("已退出系统");
      }
    }
  };
  mount(".topbar", TopbarApp, "topbar");
})();
