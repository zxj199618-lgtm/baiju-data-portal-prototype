/**
 * 页面路由表：中文页面名 ⇄ 英文地址（#/permission/users/<用户>/config）。
 * 纯函数、不依赖 DOM，页面里通过 window.PortalRoutes 使用，单元测试直接 require。
 * 对象标识（用户、数据表、看板……）放在地址的参数段里，刷新或把链接发给别人都能打开同一个对象。
 * 新增页面只需在 ROUTES 里加一行；改名只改 path，页面内部仍用中文页面名。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PortalRoutes = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /**
   * page：页面名（与 portal-bridge 的 setSimplePage、侧栏、标签栏一致）
   * path：地址；:xxx 为对象参数（会做 URL 编码）
   * list：对象不存在时回退到的列表页（带参数的详情页必填）
   * menu：访问所需的菜单权限（详情页继承所属菜单；缺省为 page 本身）
   */
  const ROUTES = [
    { page: "灵犀智析", path: "/analysis" },
    { page: "数据看板", path: "/dashboard" },
    { page: "数据看板", path: "/dashboard/:board", optional: true },
    { page: "Quick BI 展示", path: "/dashboard/boards/:board", list: "数据看板", menu: "数据看板" },
    { page: "人群包管理", path: "/service/audience-packages" },
    { page: "新建人群包", path: "/service/audience-packages/new", menu: "人群包管理" },
    { page: "数据开放平台", path: "/service/open-api" },
    { page: "新增API", path: "/service/open-api/new", menu: "数据开放平台" },
    { page: "新增API", path: "/service/open-api/:api/edit", list: "数据开放平台", menu: "数据开放平台" },
    { page: "数据告警", path: "/alerts" },
    { page: "看板管理", path: "/asset/boards" },
    { page: "表管理", path: "/asset/tables" },
    { page: "表详情", path: "/asset/tables/:table", list: "表管理", menu: "表管理" },
    { page: "标签管理", path: "/asset/tags" },
    { page: "维表管理", path: "/asset/dimensions" },
    { page: "维表数据维护", path: "/asset/dimensions/:dim/data", list: "维表管理", menu: "维表管理" },
    { page: "字典管理", path: "/asset/dictionaries" },
    { page: "人群包推送渠道", path: "/push/channels" },
    { page: "大数据工具箱", path: "/toolbox/bigdata" },
    { page: "补数据", path: "/toolbox/bigdata/backfill" },
    { page: "消耗对比", path: "/toolbox/bigdata/compare" },
    { page: "环境域名", path: "/toolbox/bigdata/env" },
    { page: "业务工具箱", path: "/toolbox/biz" },
    { page: "生成人群包", path: "/toolbox/biz/audience-generator" },
    { page: "短剧投放账户上报", path: "/toolbox/biz/drama-report" },
    { page: "用户管理", path: "/permission/users" },
    { page: "配置权限", path: "/permission/users/:user/config", list: "用户管理", menu: "用户管理" },
    { page: "查看权限", path: "/permission/users/:user/view", list: "用户管理", menu: "用户管理" },
    { page: "权限组", path: "/permission/groups" },
    { page: "权限组", path: "/permission/groups/:group", optional: true },
    { page: "Skill 配置", path: "/ai/skills" },
    { page: "模型配置", path: "/ai/models" },
    { page: "运营中心", path: "/ai/ops" },
    { page: "看板访问记录", path: "/system/access-logs" },
    { page: "菜单管理", path: "/system/menus" }
  ].map(route => ({ ...route, segments: route.path.split("/").filter(Boolean), params: route.path.split("/").filter(part => part[0] === ":").map(part => part.slice(1)) }));

  const DEFAULT_PAGE = "灵犀智析";
  const PAGE_NAMES = new Set(ROUTES.map(route => route.page));

  function routesOfPage(page) { return ROUTES.filter(route => route.page === page); }

  /** 页面名 + 对象参数 → 地址（含 #）。参数不全时退回该页面最短的无参地址；页面名未知返回空串 */
  function toHash(page, params = {}) {
    const candidates = routesOfPage(page).filter(route => route.params.every(key => params[key] !== undefined && params[key] !== null && params[key] !== ""));
    if (!candidates.length) return "";
    const best = candidates.sort((a, b) => b.params.length - a.params.length)[0];
    return "#/" + best.segments.map(part => part[0] === ":" ? encodeURIComponent(String(params[part.slice(1)])) : part).join("/");
  }

  function safeDecode(text) {
    try { return decodeURIComponent(text); } catch (error) { return null; }
  }

  /** 新地址 → {page, params}；不是合法新地址返回 null（静态段优先于参数段） */
  function parsePath(hash) {
    const text = String(hash || "");
    if (!text.startsWith("#/")) return null;
    const rawParts = text.slice(2).split(/[?#]/)[0].split("/").filter(Boolean);
    let match = null;
    ROUTES.forEach(route => {
      if (route.segments.length !== rawParts.length) return;
      const params = {};
      let score = 0;
      for (let index = 0; index < route.segments.length; index += 1) {
        const want = route.segments[index];
        if (want[0] === ":") {
          const value = safeDecode(rawParts[index]);
          if (!value) return;
          params[want.slice(1)] = value;
        } else if (want === rawParts[index]) score += 1;
        else return;
      }
      if (!match || score > match.score) match = { page: route.page, params, score };
    });
    return match ? { page: match.page, params: match.params } : null;
  }

  /**
   * 旧地址 #page=中文名[&db=&table=][&board=] → {page, params, legacy:true}。
   * 旧地址从来没带过用户 / 维表 / API 标识，这几类详情页无法还原对象，退回对应列表页（unresolved=true）。
   */
  function parseLegacy(hash) {
    const text = String(hash || "");
    if (!text.startsWith("#page=")) return null;
    const query = new URLSearchParams(text.slice(1));
    const page = query.get("page") || "";
    if (!PAGE_NAMES.has(page) && page !== "无权限") return { page: "", params: {}, legacy: true, invalid: true };
    const params = {};
    if (page === "表详情") {
      const db = query.get("db") || "";
      const table = query.get("table") || "";
      if (db && table) params.table = `${db}.${table}`;
    }
    if ((page === "Quick BI 展示" || page === "数据看板") && query.get("board")) params.board = query.get("board");
    const needs = routesOfPage(page).map(route => route.params);
    const complete = needs.some(keys => keys.every(key => params[key]));
    if (!complete) {
      const list = (routesOfPage(page)[0] || {}).list;
      return { page: list || page, params: {}, legacy: true, unresolved: true, from: page };
    }
    return { page, params, legacy: true };
  }

  function parseHash(hash) {
    return parsePath(hash) || parseLegacy(hash) || null;
  }

  /** 页面所需菜单权限（详情页继承所属菜单） */
  function menuOf(page) {
    const route = routesOfPage(page)[0];
    return (route && route.menu) || page;
  }

  /** 对象不存在时回退到的列表页；无参页面返回自身 */
  function listOf(page) {
    const route = routesOfPage(page).find(item => item.list);
    return route ? route.list : page;
  }

  /** 给页面名与新地址的对照：评审与文档用 */
  function table() {
    return ROUTES.map(route => ({ page: route.page, path: "#" + route.path, params: route.params }));
  }

  return { ROUTES, DEFAULT_PAGE, toHash, parseHash, parsePath, parseLegacy, menuOf, listOf, table, hasPage: page => PAGE_NAMES.has(page) };
});
