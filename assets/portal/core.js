/**
 * 门户前端核心：共享状态、权限判断、通用工具，以及被多个页面共用的数据。
 * 页面文件（page-*.js）通过 window.PortalVue 取用这里导出的名字；新增共享内容时在末尾的导出列表里补上。
 */
(() => {
  "use strict";


  const bridge = window.portalVueBridge;
  const cpBridge = window.cpVueBridge;
  const ep = window.ElementPlus;
  const vue = window.Vue;
  if (!bridge || !cpBridge || !ep || !vue) return;

  const { createApp, reactive, ref, computed } = vue;
  const locale = window.ElementPlusLocaleZhCn || undefined;
  const currentPage = ref(bridge.getPage());
  const refreshTick = ref(0);
  const mountedApps = [];
  const state = reactive({
    nav: bridge.nav,
    tabs: bridge.tabs,
    boards: bridge.boards,
    categories: bridge.boardCategories,
    favorites: bridge.favorites,
    assets: bridge.assets,
    apis: bridge.apis,
    users: bridge.users,
    groups: bridge.groups,
    tables: cpBridge.tables,
    targets: cpBridge.targets,
    dictionaries: bridge.dictionaries,
    reportBatches: bridge.reportBatches
  });

  /* Skill 图标既可以是上传的图片（data URL / 远程地址），也可以是随原型分发的内置 SVG 资源 */
  function isImageIconValue(icon) {
    const value = String(icon || "");
    return /^(data:image|https?:|blob:|\/?assets\/)/i.test(value) || /\.(svg|png|jpe?g|gif|webp)$/i.test(value);
  }

  function mount(selector, component, name) {
    const root = document.querySelector(selector);
    if (!root) return null;
    const app = createApp(component);
    app.mixin({ data: () => ({ locale }), methods: { canEdit: canEditMenu, canView: canViewMenu, backToBox: box => bridge.setPage(box) } });
    app.use(ep);
    const vm = app.mount(root);
    root.dataset.elementComponent = name;
    mountedApps.push(app);
    return vm;
  }

  function notify(message) {
    refreshTick.value += 1;
    bridge.notifyDataChange();
    orgSync.schedulePush();
    if (message) ep.ElMessage.success(message);
  }

  /* ===== 权限组 / 账号分组与服务端同步 =====
     登录后读取服务端保存的配置并应用到界面；管理员修改（经 notify）后防抖保存回服务端。
     服务端据此判断数据表权限与管理员角色，并校验内容（例如不能把最后一个管理员降级）。
     服务端拒绝保存时，界面回退到服务端当前配置，避免「界面上改了但实际没生效」。 */
  const orgSync = {
    role: "", accounts: [], ready: false, timer: null, lastSnapshot: "",
    snapshot() {
      const userGroups = {};
      this.accounts.forEach(name => { const user = state.users.find(item => item.name === name); if (user) userGroups[name] = user.group; });
      const groups = state.groups.map(group => ({ name: group.name, desc: group.desc, status: group.status, menus: group.menus, menuEdits: group.menuEdits, boards: group.boards, tables: group.tables }));
      return { groups, userGroups };
    },
    async load() {
      if (!window.portalAuth?.token()) return;
      try {
        const response = await fetch(`${analysisGatewayBase}/v1/org`);
        if (!response.ok) return;
        const org = await response.json();
        this.role = org.role;
        this.accounts = org.accounts || [];
        if (org.groups?.length) {
          if (org.role === "admin") {
            const keep = new Set(org.groups.map(group => group.name));
            for (let index = state.groups.length - 1; index >= 0; index -= 1) if (!keep.has(state.groups[index].name)) state.groups.splice(index, 1);
          }
          org.groups.forEach(serverGroup => {
            const local = state.groups.find(group => group.name === serverGroup.name);
            if (local) Object.assign(local, serverGroup); else state.groups.push({ ...serverGroup });
          });
        }
        Object.entries(org.userGroups || {}).forEach(([name, group]) => {
          const user = state.users.find(item => item.name === name);
          if (user && user.group !== group) user.group = group;
        });
        this.lastSnapshot = JSON.stringify(this.snapshot());
        this.ready = true;
        refreshTick.value += 1;
        bridge.notifyDataChange();
      } catch (error) { /* 网关未启动时保持界面自带的默认配置 */ }
    },
    schedulePush() {
      if (!this.ready || this.role !== "admin") return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.push(), 800);
    },
    /** force=true：即使和上次一致也保存（服务端还没有保存过权限组快照时，需要先把完整的组配置交给服务端） */
    async push(force = false) {
      const body = this.snapshot();
      const serialized = JSON.stringify(body);
      if (!force && serialized === this.lastSnapshot) return;
      try {
        const response = await fetch(`${analysisGatewayBase}/v1/org`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: serialized });
        if (response.ok) { this.lastSnapshot = serialized; return; }
        const data = await response.json().catch(() => ({}));
        ep.ElMessage.warning(`权限配置没有保存到服务器：${data.error || "未知错误"}。已恢复为服务器上的配置`);
        await this.load();
      } catch (error) {
        ep.ElMessage.warning("权限配置没有保存到服务器：无法连接分析网关");
      }
    }
  };

  async function confirmAction(title, message, confirmButtonText = "确认") {
    try {
      await ep.ElMessageBox.confirm(message, title, {
        confirmButtonText,
        cancelButtonText: "取消",
        type: "warning",
        autofocus: false
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  function paginate(rows, page, size) {
    const totalPages = Math.max(1, Math.ceil(rows.length / size));
    const safePage = Math.min(page, totalPages);
    return { totalPages, safePage, rows: rows.slice((safePage - 1) * size, safePage * size) };
  }

  /* ===== 管理范围：按部门配置，部门下用户自动纳入；未配置时默认只看自己 ===== */

  // 当前登录账号（由 gateway-auth.js 写入）；未登录时回落到默认演示账号
  function loginUserName() {
    try { return localStorage.getItem("portalLoginUser") || "曾祥竞"; } catch (error) { return "曾祥竞"; }
  }
  const DEPT_SEPARATOR = " / ";
  const USER_SCOPE_PREFIX = "user:";

  function loginUser() {
    return state.users.find(user => user.name === loginUserName()) || state.users[0] || null;
  }

  function departmentMatched(dept, scope) {
    if (!dept) return false;
    return scope.some(item => item && !isUserScopeItem(item) && (dept === item || dept.startsWith(item + DEPT_SEPARATOR)));
  }

  function isUserScopeItem(item) {
    return typeof item === "string" && item.startsWith(USER_SCOPE_PREFIX);
  }

  function userScopeName(item) {
    return isUserScopeItem(item) ? item.slice(USER_SCOPE_PREFIX.length) : "";
  }

  /* 管理范围命中：部门路径（含下级部门）或直接指定的成员 */
  function scopeMatched(user, scope) {
    if (!user) return false;
    return scope.some(item => {
      if (!item) return false;
      if (isUserScopeItem(item)) return userScopeName(item) === user.name;
      const dept = user.dept || "";
      return dept === item || dept.startsWith(item + DEPT_SEPARATOR);
    });
  }

  function manageScopeOf(user) {
    return Array.isArray(user?.manageScope) ? user.manageScope.filter(Boolean) : [];
  }

  function manageScopeSummary(user) {
    if (user?.manageScopeAll) return "全部用户";
    const scope = manageScopeOf(user);
    if (!scope.length) return "未配置（仅自己）";
    if (scope.length === 1) return isUserScopeItem(scope[0]) ? userScopeName(scope[0]) : scope[0];
    const depts = scope.filter(item => !isUserScopeItem(item));
    const members = scope.filter(isUserScopeItem);
    const parts = [];
    if (depts.length) parts.push(`${depts.length} 个部门`);
    if (members.length) parts.push(`${members.length} 名成员`);
    return parts.join(" + ");
  }

  /* ===== 菜单查看/编辑权限：未配置「编辑」权限时，该菜单下的写操作一律不允许 ===== */

  const MENU_OF_PAGE = {
    "新增API": "数据开放平台",
    "新建人群包": "人群包管理",
    "配置权限": "用户管理",
    "查看权限": "用户管理",
    "维表数据维护": "维表管理",
    "表详情": "表管理",
    "Quick BI 展示": "数据看板"
  };

  function menuOfPage(page) {
    return MENU_OF_PAGE[page] || page;
  }

  /* ===== 工具箱：箱内第一个子项是该箱的总览页（与箱同名），它不是权限项，随箱可见；侧栏只出这一级 ===== */

  function isOverviewItem(item) {
    return Boolean(item && item.overview);
  }

  /** 可授权的菜单项（工具总览不参与权限勾选） */
  function menuGrantItems(section) {
    return (section?.items || []).filter(item => !isOverviewItem(item));
  }

  function toolItemsOf(groupName) {
    const section = (state.nav || []).find(item => item.group === groupName);
    return section ? menuGrantItems(section) : [];
  }

  /* 菜单名别名：工具箱迁移后，旧的「任务运维」仍要能授权到迁移后的工具，存量权限组不丢权限 */
  const MENU_ALIASES = {
    "任务运维": ["补数据", "消耗对比"]
  };

  function expandMenuNames(names) {
    const granted = new Set();
    (names || []).forEach(name => {
      granted.add(name);
      (MENU_ALIASES[name] || []).forEach(alias => granted.add(alias));
    });
    const expanded = new Set();
    state.nav.forEach(section => {
      const sectionGranted = section.items.length > 1 && granted.has(section.group);
      section.items.forEach(item => {
        if (sectionGranted || granted.has(item.name)) expanded.add(item.name);
      });
    });
    return expanded;
  }

  function groupOfUser(user) {
    return state.groups.find(group => group.name === user?.group) || null;
  }

  function effectiveEditMenus(user) {
    const group = groupOfUser(user);
    const personal = Array.isArray(user?.menuEditGrants) ? user.menuEditGrants : [];
    return expandMenuNames([...(group?.menuEdits || []), ...personal]);
  }

  function effectiveViewMenus(user) {
    const group = groupOfUser(user);
    const personal = Array.isArray(user?.menuGrants) ? user.menuGrants : [];
    return expandMenuNames([...(group?.menus || []), ...personal]);
  }

  function canViewMenu(menu) {
    refreshTick.value;
    const me = loginUser();
    if (!me) return true;
    return effectiveViewMenus(me).has(menu);
  }

  function effectiveBoardNames(user) {
    const group = groupOfUser(user);
    const grants = [...(group?.boards || []), ...(Array.isArray(user?.boardGrants) ? user.boardGrants : [])];
    if (grants.includes("全部看板")) return new Set(state.boards.map(board => board.name));
    const names = new Set();
    state.boards.forEach(board => {
      if (grants.includes(board.name) || grants.includes(board.category)) names.add(board.name);
      // 看板管理里「可查看用户」直接授权的看板：不依赖权限组，与权限组授权取并集
      if (Array.isArray(board.users) && board.users.includes(user?.name)) names.add(board.name);
    });
    return names;
  }

  function canEditMenu(menu) {
    refreshTick.value;
    const me = loginUser();
    if (!me) return false;
    return effectiveEditMenus(me).has(menu);
  }

  function canEditPage(page) {
    return canEditMenu(menuOfPage(page));
  }

  function denyEdit() {
    ep.ElMessage.warning("当前菜单未配置「编辑」权限，该操作已被拦截");
    return false;
  }

  function syncPrimaryAction() {
    const button = document.getElementById("primaryAction");
    if (!button) return;
    const page = bridge.getPage();
    const label = (bridge.pageMeta?.[page] || [])[2];
    button.classList.toggle("hidden", !label || !canEditPage(page));
  }

  function enabledDictItems(dict) {
    /* 枚举值无启停概念：维护界面里停用即删除，这里返回全部 */
    return (dict?.items || []).filter(item => item.code && item.name);
  }

  function dictHint(dict) {
    const items = enabledDictItems(dict);
    if (!items.length) return "暂无枚举值";
    return `${items[0].code} → ${items[0].name}${items.length > 1 ? ` 等 ${items.length} 项` : ""}`;
  }

  function boardSeed(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    return hash;
  }

  function humanCount(value) {
    if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
    return Number(value || 0).toLocaleString();
  }

  window.addEventListener("portal:page-change", event => {
    currentPage.value = event.detail?.page || bridge.getPage();
    refreshTick.value += 1;
  });
  window.addEventListener("portal:data-change", () => { refreshTick.value += 1; syncPrimaryAction(); });

  const analysisGatewayBase = (() => {
    // 网关同源托管页面时会注入 window.PORTAL_GATEWAY_BASE（空串），此时直接走相对路径访问同一网关；
    try {
      if (typeof window !== "undefined" && window.PORTAL_GATEWAY_BASE !== undefined) return String(window.PORTAL_GATEWAY_BASE).replace(/\/$/, "");
    } catch (error) { /* 忽略异常 */ }
    try {
      const override = localStorage.getItem("portalGatewayBase");
      if (override !== null) return override.replace(/\/$/, "");
    } catch (error) { /* 忽略隐私模式异常 */ }
    // 页面可能部署在 GitHub Pages，网关固定跑在本机 8787；远程部署时用 localStorage.portalGatewayBase 覆盖。
    return "http://localhost:8787";
  })();
  const MODEL_REASONING_CHOICES = [
    { value: "low", label: "快速" },
    { value: "medium", label: "标准" },
    { value: "high", label: "深度" }
  ];

  const skillRegistrySeed = [
    {
      id: "warehouse-analyst", name: "数据查询与指标解答 Skill", source: "maxcompute-warehouse-analyst", version: "v1.3-portal", grayUsers: [],
      icon: "assets/skill-query.svg", title: "数据查询与指标解答", displayDesc: "先选业务线，再检索表与字段", sort: 10, scenarioKey: "data-query", enabled: true,
      desc: "未指定数据表时先咨询业务线，再在授权资产中检索指标口径、表和字段。",
      scenarios: "指标查询 / 数据解答 / 口径说明",
      clarification: {
        enabled: true,
        questions: [
          { key: "businessLine", label: "业务线", question: "你问的是哪个业务线？", hint: "确定业务线后，会在你有权限的对应表和字段中检索。", options: ["存量", "权益", "保险", "短剧", "其他"] },
          { key: "timeRange", label: "时间范围", question: "需要看哪个时间范围的数据？", hint: "影响数据范围以及同比 / 环比口径。", options: ["近 7 天", "近 30 天", "近 90 天", "本月", "今年至今"] },
          { key: "granularity", label: "汇总粒度", question: "结果按什么粒度汇总？", hint: "决定输出结果的分组维度，可同时选多个。", multiple: true, options: ["按天", "按周", "按渠道", "按计划", "不汇总"] }
        ]
      },
      assetScope: "按业务线检索已授权的表与字段",
      responseContract: ["引用表和字段","指标口径与时间范围","证据限制"],
      prompt: "你是观星台数据平台的数仓分析助手…\n\n## 解释规则\n1. 一句话说明：优先使用表 comment；\n2. 为什么这样设计：依次解释写入方式、JOIN、过滤、聚合、CASE、窗口和分区；\n3. 输出粒度：只根据 operators.group_by、窗口分区和目标字段判断；\n4. 重点口径：按目标字段合并 field_lineage，保留完整表达式。\n\n## 证据标签\n- SQL/DDL 明确证据\n- 结构解释\n- 待业务确认",
      versions: [
        { version: "v1.2-portal", time: "2026-08-31 16:00", operator: "曾祥竞", note: "移植到观星台网关，接入中转站模型", current: true },
        { version: "v1.2", time: "2026-08-20 11:30", operator: "曾祥竞", note: "增加聚合安全与 Quick BI 证据规则" },
        { version: "v1.1", time: "2026-08-05 09:00", operator: "曾祥竞", note: "新增业务口径问答流程" },
        { version: "v1.0", time: "2026-07-12 14:00", operator: "曾祥竞", note: "首版：按表解释 + 血缘分析" }
      ],
      stats: { calls: 128, successRate: "98.4%", avgLatency: "14.2s", tokens: "38.6万" }
    },
    {
      id: "asset-qa", name: "数据资产问答 Skill", source: "asset-qa", version: "v0.9", grayUsers: ["曾祥竞"],
      icon: "assets/skill-asset.svg", title: "数据资产问答", displayDesc: "有哪些表、口径、负责人", sort: 30, scenarioKey: "asset", enabled: true,
      desc: "基于表资产元数据回答有哪些表、口径是什么、负责人是谁。",
      scenarios: "资产检索 / 口径问答",
      clarification: { enabled:false, question:"", options:[] }, assetScope: "全部已授权数据资产", responseContract: ["推荐表","关键字段","负责人"],
      prompt: "你是观星台数据平台的资产问答助手。\n只推荐用户有权限的数据表；清单外的可能性标注「权限外，未纳入」。",
      versions: [
        { version: "v0.9", time: "2026-08-30 10:00", operator: "曾祥竞", note: "接入表权限过滤", current: true, status: "灰度中", grayUsers: ["曾祥竞"] },
        { version: "v0.8", time: "2026-08-12 15:00", operator: "曾祥竞", note: "首版灰度", status: "已发布" }
      ],
      stats: { calls: 42, successRate: "100%", avgLatency: "6.8s", tokens: "9.1万" }
    },
    {
      id: "lineage-analyst", name: "数据血缘与变更影响 Skill", source: "maxcompute-warehouse-analyst", version: "v1.3-portal", grayUsers: [],
      icon: "assets/skill-lineage.svg", title: "数据血缘与变更影响", displayDesc: "上下游依赖与影响面", sort: 20, scenarioKey: "lineage", enabled: true,
      desc: "基于 SQL 语料与 AST 解析输出表/字段的上下游血缘与变更影响面。",
      scenarios: "血缘上下游 / 变更影响分析",
      clarification: { enabled:false, question:"", options:[] }, assetScope: "引用表、字段与下游依赖", responseContract: ["直接影响","间接影响","待核对项"],
      prompt: "你是观星台数据平台的血缘分析助手。\n基于提供的表上下游血缘证据，输出 Markdown 报告。",
      versions: [{ version: "v1.2-portal", time: "2026-08-31 16:10", operator: "曾祥竞", note: "复用数仓语料血缘能力", current: true }],
      stats: { calls: 87, successRate: "97.7%", avgLatency: "11.5s", tokens: "21.3万" }
    },
    {
      id: "attribution-analyst", name: "指标异动诊断 Skill", source: "attribution-analyst", version: "v0.5", grayUsers: [],
      icon: "assets/skill-attribution.svg", title: "指标异动诊断", displayDesc: "指标异动拆解与定位", sort: 40, scenarioKey: "attribution", enabled: true,
      desc: "对指标异动做维度拆解（媒体/产品/计划），定位贡献度与原因。",
      scenarios: "指标异动 / 维度拆解",
      clarification: { enabled:false, question:"", options:[] }, assetScope: "引用指标表与可拆解维度", responseContract: ["异动幅度","维度贡献","证据限制"],
      prompt: "你是观星台数据平台的归因分析助手。\n基于聚合统计对指标异动做维度拆解，所有数字必须来自证据。",
      versions: [{ version: "v0.5", time: "2026-08-29 14:00", operator: "曾祥竞", note: "接入聚合证据层", current: true }],
      stats: { calls: 56, successRate: "100%", avgLatency: "13.8s", tokens: "15.7万" }
    }
  ];

  state.skills = skillRegistrySeed;

  /* ===== 大数据工具箱：箱内每个工具都是独立菜单 + 独立页面 + 独立权限项 ===== */

  /** 箱内多个工具共用的选项：放模块作用域，避免拆开后每个工具各存一份 */
  const OPS_TOOL_OPTIONS = {
    platforms: ["头条 / 字节跳动"],
    envOptions: ["生产", "预发"],
    appOptions: ["伯都（1875017553198140）", "服微（75294102174026）", "小炭（1875282462158952）"],
    apiOptions: ["账户分时消耗", "二级计划分时消耗", "创意分时消耗", "账户分天流水", "账户分时消耗（短剧）", "计划分时消耗（短剧）", "创意分时消耗（短剧）", "投放助手调度任务查看", "广告信息", "项目信息", "账户分时消耗（STD）"],
    apiPaths: { "账户分时消耗": "/bytedance/api/account-hour-cost/account", "二级计划分时消耗": "/bytedance/api/ad-hour-cost/ad", "创意分时消耗": "/bytedance/api/creative-hour-cost/creative", "账户分天流水": "/bytedance/api/account-day-flow/account", "账户分时消耗（短剧）": "/bytedance/api/drama-account-hour-cost/account", "计划分时消耗（短剧）": "/bytedance/api/drama-ad-hour-cost/ad", "创意分时消耗（短剧）": "/bytedance/api/drama-creative-hour-cost/creative", "投放助手调度任务查看": "/bytedance/api/scheduler-task/query", "广告信息": "/bytedance/api/ad-info/ad", "项目信息": "/bytedance/api/project-info/project", "账户分时消耗（STD）": "/bytedance/api/std-account-hour-cost/account" }
  };

  /* 工具页统一的「返回所属箱 + 所属箱 + 可写」标识与只读提示 */
  const TOOL_META_TEMPLATE = (tool, note, box = "大数据工具箱") => `
        <div class="portal-vue-tool-meta">
          <el-tag size="small" effect="plain" type="info">${box}</el-tag>
          <el-tag size="small" effect="plain" :type="canEdit('${tool}') ? 'primary' : 'warning'">{{ canEdit('${tool}') ? '可写' : '只读' }}</el-tag>
          <span class="portal-vue-muted">${note}</span>
        </div>
        <el-alert v-if="!canEdit('${tool}')" type="info" :closable="false" show-icon title="只读模式" description="你对该工具有「查看」权限但没有「编辑」权限，写操作已被拦截；如需开通请联系管理员。" style="margin:14px 20px 0" />`;
  window.PortalVue = {
    DEPT_SEPARATOR,
    MODEL_REASONING_CHOICES,
    OPS_TOOL_OPTIONS,
    TOOL_META_TEMPLATE,
    USER_SCOPE_PREFIX,
    analysisGatewayBase,
    boardSeed,
    bridge,
    canEditMenu,
    canEditPage,
    canViewMenu,
    confirmAction,
    currentPage,
    denyEdit,
    dictHint,
    effectiveBoardNames,
    enabledDictItems,
    ep,
    expandMenuNames,
    groupOfUser,
    humanCount,
    isImageIconValue,
    isOverviewItem,
    isUserScopeItem,
    loginUser,
    loginUserName,
    manageScopeOf,
    manageScopeSummary,
    menuGrantItems,
    mount,
    notify,
    orgSync,
    paginate,
    reactive,
    refreshTick,
    scopeMatched,
    skillRegistrySeed,
    state,
    syncPrimaryAction,
    toolItemsOf,
    userScopeName
  };
})();
