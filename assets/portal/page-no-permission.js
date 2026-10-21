/**
 * 页面：no-permission
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    mount
  } = window.PortalVue;


  const NoPermissionApp = {
    template:`<el-config-provider :locale="locale"><el-result icon="warning" title="暂无访问权限" sub-title="当前飞书账号尚未分配门户权限组，请联系管理员处理。"><template #extra><el-button type="primary" @click="logout">退出系统</el-button></template></el-result></el-config-provider>`,
    methods:{logout(){window.portalAuth?.clear();document.getElementById("portalApp").classList.remove("no-permission-mode");document.getElementById("portalApp").classList.add("hidden");document.getElementById("loginView").classList.remove("hidden");}}
  };
  mount("#noPermissionView", NoPermissionApp, "no-permission");
})();
