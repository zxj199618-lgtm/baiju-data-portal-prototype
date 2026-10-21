/**
 * 启动：全部页面挂载完成后的收尾（对外 API、首次页面同步、服务端权限同步）
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    bridge,
    canEditMenu,
    canEditPage,
    canViewMenu,
    currentPage,
    denyEdit,
    orgSync,
    refreshTick,
    state,
    syncPrimaryAction
  } = window.PortalVue;


  document.getElementById("portalApp").dataset.elementMigrated = "true";
  document.querySelector(".page-head")?.classList.toggle("portal-vue-head-hidden", ["新增API","新建人群包","Quick BI 展示","配置权限","无权限","维表数据维护"].includes(currentPage.value));
  window.portalVueModuleApi = {
    refresh(page = bridge.getPage()) { currentPage.value = page; refreshTick.value += 1; syncPrimaryAction(); },
    canEdit: canEditMenu,
    canView: canViewMenu,
    canEditPage,
    denyEdit,
    state,
    orgSync
  };
  syncPrimaryAction();
  window.dispatchEvent(new CustomEvent("portal:page-change", { detail: { page: bridge.getPage() } }));
  orgSync.load();
})();
