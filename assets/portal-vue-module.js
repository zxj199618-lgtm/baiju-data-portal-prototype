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
    dictionaries: bridge.dictionaries
  });

  function mount(selector, component, name) {
    const root = document.querySelector(selector);
    if (!root) return null;
    const app = createApp(component);
    app.mixin({ data: () => ({ locale }) });
    app.use(ep);
    const vm = app.mount(root);
    root.dataset.elementComponent = name;
    mountedApps.push(app);
    return vm;
  }

  function notify(message) {
    refreshTick.value += 1;
    bridge.notifyDataChange();
    if (message) ep.ElMessage.success(message);
  }

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

  function enabledDictItems(dict) {
    return (dict?.items || []).filter(item => item.enabled !== false);
  }

  function dictHint(dict) {
    const items = enabledDictItems(dict);
    if (!items.length) return "暂无启用枚举值";
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
  window.addEventListener("portal:data-change", () => { refreshTick.value += 1; });

  const SidebarApp = {
    template: `
      <el-config-provider :locale="locale">
        <div class="portal-vue-sidebar">
          <button class="portal-vue-collapse" type="button" :title="collapsed ? '展开侧边栏' : '收起侧边栏'" @click="toggleCollapse">{{ collapsed ? '›' : '‹' }}</button>
          <div class="portal-vue-brand"><img :src="collapsed ? 'assets/momentx-observatory-icon.png' : 'assets/momentx-observatory-logo.jpg'" alt="观星台" /></div>
          <el-scrollbar class="portal-vue-nav-scroll">
            <el-menu class="portal-vue-menu" :collapse="collapsed" :default-active="menuActive" :default-openeds="openGroups" @select="selectPage">
              <template v-for="section in sections" :key="section.group">
                <el-menu-item v-if="section.items.length === 1" :index="section.items[0].name">
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
      sections() { refreshTick.value; return state.nav; },
      page() { return currentPage.value; },
      menuActive() {
        if (this.page === "新增API") return "数据开放平台";
        if (this.page === "新建人群包") return "人群包管理";
        if (this.page === "维表数据维护") return "维表管理";
        if (this.page === "Quick BI 展示") return "数据看板";
        if (this.page === "配置权限") return "用户管理";
        return this.page;
      },
      openGroups() { return state.nav.filter(section => section.items.length > 1).map(section => section.group); }
    },
    methods: {
      isActive(section) { return section.items.some(item => item.name === this.menuActive); },
      iconPath(section) { return bridge.navIconPath(section.icon, this.isActive(section)); },
      navBadges(entry) { return Array.isArray(entry?.badge) ? entry.badge : entry?.badge ? [entry.badge] : []; },
      badgeClass(badge) { return badge === "4.0" ? "portal-nav-badge--v40" : badge === "3.0" ? "portal-nav-badge--v30" : "portal-nav-badge--v20"; },
      selectPage(page) { bridge.setPage(page); },
      toggleCollapse() {
        this.collapsed = !this.collapsed;
        document.getElementById("sidebar").classList.toggle("collapsed", this.collapsed);
      }
    }
  };

  const TopbarApp = {
    template: `
      <el-config-provider :locale="locale">
        <div class="portal-vue-topbar">
          <div class="portal-vue-tabs">
            <span class="portal-vue-home">首页</span>
            <button v-for="tab in tabs" :key="tab.name" class="portal-vue-tab" :class="{active:isActive(tab)}" type="button" @click="openTab(tab)">
              <img :src="bridge.navIconPath(tab.icon, isActive(tab))" alt="" /><span>{{ tab.name }}</span>
              <span v-if="tab.closable" class="portal-vue-tab-close" title="关闭" @click.stop="closeTab(tab)">×</span>
            </button>
          </div>
          <el-dropdown trigger="click" @command="handleUserCommand">
            <span class="portal-vue-user"><el-avatar :size="34" style="background:#1677ff">曾</el-avatar><span>曾祥竞</span></span>
            <template #dropdown><el-dropdown-menu><el-dropdown-item command="logout">退出系统</el-dropdown-item></el-dropdown-menu></template>
          </el-dropdown>
        </div>
      </el-config-provider>
    `,
    data: () => ({ bridge }),
    computed: {
      tabs() { refreshTick.value; return state.tabs; },
      page() { return currentPage.value; },
      activeBoard() { refreshTick.value; return bridge.getActiveBoard(); }
    },
    methods: {
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
      handleUserCommand(command) {
        if (command !== "logout") return;
        document.getElementById("portalApp").classList.add("hidden");
        document.getElementById("loginView").classList.remove("hidden");
        ep.ElMessage.success("已退出系统");
      }
    }
  };

  const PageHeadApp = {
    template: `
      <el-config-provider :locale="locale">
        <div v-if="visible" class="portal-vue-page-head" :class="{ 'portal-vue-head-compact': page === '灵犀智析' }">
          <div class="portal-vue-page-head-row">
            <div><h1>{{ title }}</h1><p v-if="subtitle">{{ subtitle }}</p></div>
            <button v-if="page === '灵犀智析' && !feishuBotAdded" type="button" class="portal-vue-ai-bot-btn" @click="feishuOpen = true"><span class="portal-vue-ai-bot-icon">🤖</span><span>添加飞书机器人</span></button>
          </div>
        </div>
        <el-drawer v-if="page === '灵犀智析'" v-model="feishuOpen" title="观星台 · 飞书机器人" size="420px" :close-on-click-modal="true">
          <div class="portal-vue-ai-feishu-drawer">
            <p class="portal-vue-muted">在飞书里直接和「观星台」机器人对话即可完成数据分析，无需登录门户；机器人的沟通记录会自动同步到左侧会话列表。</p>
            <div class="portal-vue-ai-feishu-steps">
              <span><b>1</b>飞书搜索并关注「观星台」机器人</span>
              <span><b>2</b>首次使用发送「绑定」，完成飞书账号与门户账号关联</span>
              <span><b>3</b>直接提问，如「近7天巨量渠道CPA趋势」；分析结果以卡片回复，沟通记录自动同步到工作台</span>
            </div>
            <p class="portal-vue-muted">机器人与工作台使用同一套表权限：只能分析你有权限的数据表。</p>
            <el-button v-if="!feishuBotAdded" type="primary" style="width:100%" @click="markBotAdded">我已完成添加，不再展示此入口</el-button>
          </div>
        </el-drawer>
      </el-config-provider>
    `,
    data:()=>({feishuOpen:false,feishuBotAdded:false}),
    computed: {
      page() { return currentPage.value; },
      meta() { refreshTick.value; return bridge.pageMeta[this.page] || bridge.pageMeta["数据看板"]; },
      visible() { return !["新增API", "新建人群包", "Quick BI 展示", "配置权限", "无权限", "维表数据维护"].includes(this.page); },
      title() { return this.meta?.[0] || this.page; },
      subtitle() { return this.meta?.[1] || ""; }
    },
    watch: { visible(value) { document.querySelector(".page-head")?.classList.toggle("portal-vue-head-hidden", !value); } },
    mounted() {
      document.querySelector(".page-head")?.classList.toggle("portal-vue-head-hidden", !this.visible);
      try { this.feishuBotAdded = localStorage.getItem("feishuBotAdded") === "1"; } catch (error) { this.feishuBotAdded = false; }
    },
    methods: {
      markBotAdded() {
        this.feishuBotAdded = true;
        try { localStorage.setItem("feishuBotAdded", "1"); } catch (error) { /* 隐私模式下仅本次会话生效 */ }
        this.feishuOpen = false;
        ep.ElMessage.success("飞书机器人已添加，沟通记录将同步到灵犀智析");
      }
    }
  };

  const DataBoardApp = {
    template: `
      <el-config-provider :locale="locale">
        <div class="portal-vue-directory" :class="{collapsed:directoryCollapsed}">
          <aside class="portal-vue-directory-aside" :class="{collapsed:directoryCollapsed}">
            <button class="portal-vue-directory-collapse" type="button" :title="directoryCollapsed ? '展开看板目录' : '向左折叠看板目录'" @click="directoryCollapsed=!directoryCollapsed">{{ directoryCollapsed ? '›' : '‹' }}</button>
            <div v-show="!directoryCollapsed" class="portal-vue-directory-content">
              <div class="portal-vue-directory-head"><span>数据看板</span><el-tag size="small" effect="plain">{{ onlineBoards.length }}</el-tag></div>
              <el-input v-model="keyword" clearable placeholder="输入分类或看板名称搜索"></el-input>
              <el-scrollbar class="portal-vue-board-scroll">
              <div v-if="favorites.length" class="portal-vue-board-group">
                <div class="portal-vue-board-group-title"><span>★ 我的收藏</span><span>{{ favorites.length }}</span></div>
                <el-popover v-for="item in favorites" :key="'fav-'+item.board.quickBiId" placement="right" trigger="hover" :width="340" :show-after="300" :hide-after="80" popper-class="portal-vue-board-popover">
                  <template #reference><button class="portal-vue-board-item" :class="{active:item.index===activeIndex}" type="button" @click="activeIndex=item.index"><span class="portal-vue-board-title">{{ item.board.name }}</span><span class="portal-vue-star active" title="取消收藏" @click.stop="toggleFavorite(item.board)">★</span></button></template>
                  <div class="portal-vue-board-popover-content"><strong class="portal-vue-board-popover-title">{{ item.board.name }}</strong><dl class="portal-vue-board-popover-meta"><dt>备注</dt><dd>{{ item.board.desc || '暂无备注' }}</dd><dt>看板负责人</dt><dd>{{ item.board.owner || '—' }}</dd></dl></div>
                </el-popover>
              </div>
              <div v-for="group in groupedBoards" :key="group.category" class="portal-vue-board-group">
                <div class="portal-vue-board-group-title"><span>{{ group.category }}</span><span>{{ group.items.length }}</span></div>
                <el-popover v-for="item in group.items" :key="item.board.quickBiId" placement="right" trigger="hover" :width="340" :show-after="300" :hide-after="80" popper-class="portal-vue-board-popover">
                  <template #reference><button class="portal-vue-board-item" :class="{active:item.index===activeIndex}" type="button" @click="activeIndex=item.index"><span class="portal-vue-board-title">{{ item.board.name }}</span><span class="portal-vue-star" :class="{active:isFavorite(item.board)}" :title="isFavorite(item.board)?'取消收藏':'收藏'" @click.stop="toggleFavorite(item.board)">★</span></button></template>
                  <div class="portal-vue-board-popover-content"><strong class="portal-vue-board-popover-title">{{ item.board.name }}</strong><dl class="portal-vue-board-popover-meta"><dt>备注</dt><dd>{{ item.board.desc || '暂无备注' }}</dd><dt>看板负责人</dt><dd>{{ item.board.owner || '—' }}</dd></dl></div>
                </el-popover>
              </div>
              </el-scrollbar>
            </div>
          </aside>
          <section v-if="activeBoard" class="portal-vue-board-pane">
            <div class="portal-vue-board-hero">
              <div><el-tag size="small" effect="plain">{{ activeBoard.category }}</el-tag><h2>{{ activeBoard.name }}</h2><p>Quick BI 嵌入 · 负责人 {{ activeBoard.owner }} · 已按登录身份加载行级权限</p></div>
              <el-button @click="openFull">全屏打开</el-button>
            </div>
            <div class="portal-vue-kpis">
              <div v-for="kpi in kpis" :key="kpi.label" class="portal-vue-kpi"><span>{{ kpi.label }}</span><strong>{{ kpi.value }}</strong></div>
            </div>
            <div class="portal-vue-chart-grid">
              <section class="portal-vue-chart"><h3>媒体渠道消耗</h3><div class="portal-vue-bars"><div v-for="bar in bars" :key="bar.name" class="portal-vue-bar" :style="{height:bar.height+'px'}"><span>{{ bar.name }}</span></div></div></section>
              <section class="portal-vue-chart"><h3>近 7 日趋势</h3><svg class="portal-vue-line" viewBox="0 0 420 190" preserveAspectRatio="none"><polyline :points="linePoints" fill="none" stroke="#1677ff" stroke-width="3"></polyline><circle v-for="point in pointList" :key="point.x" :cx="point.x" :cy="point.y" r="4" fill="#1677ff"></circle></svg></section>
            </div>
          </section>
          <el-empty v-else description="暂无匹配看板"></el-empty>
        </div>
      </el-config-provider>
    `,
    data: () => ({ keyword: "", activeIndex: 0, directoryCollapsed: false }),
    computed: {
      onlineBoards() { refreshTick.value; return state.boards.filter(board => board.status === "已上线"); },
      indexedBoards() {
        const keyword = this.keyword.trim().toLowerCase();
        return state.boards.map((board, index) => ({ board, index })).filter(item => item.board.status === "已上线" && (!keyword || `${item.board.category} ${item.board.name} ${item.board.quickBiId}`.toLowerCase().includes(keyword)));
      },
      groupedBoards() { return state.categories.filter(category => category !== "全部").map(category => ({ category, items: this.indexedBoards.filter(item => item.board.category === category) })).filter(group => group.items.length); },
      favorites() { return this.indexedBoards.filter(item => state.favorites.has(item.board.quickBiId)); },
      activeBoard() { return state.boards[this.activeIndex] || this.indexedBoards[0]?.board || null; },
      seed() { return boardSeed(this.activeBoard?.name || "观星台"); },
      kpis() { return [{ label: "消耗", value: `¥${((this.seed % 800000 + 180000) / 10000).toFixed(1)}万` }, { label: "转化数", value: humanCount(this.seed % 26000 + 9000) }, { label: "ROI", value: ((this.seed % 260) / 100 + .9).toFixed(2) }, { label: "触达用户", value: `${((this.seed % 620000 + 260000) / 10000).toFixed(1)}万` }]; },
      bars() { const names = ["巨量", "广点通", "快手", "OPPO", "VIVO"]; return names.map((name, index) => ({ name, height: 50 + ((this.seed >> index) % 120) })); },
      pointList() { return Array.from({ length: 7 }, (_, index) => ({ x: 28 + index * 58, y: 140 - ((this.seed >> index) % 85) })); },
      linePoints() { return this.pointList.map(point => `${point.x},${point.y}`).join(" "); }
    },
    methods: {
      isFavorite(board) { return state.favorites.has(board.quickBiId); },
      toggleFavorite(board) { state.favorites.has(board.quickBiId) ? state.favorites.delete(board.quickBiId) : state.favorites.add(board.quickBiId); refreshTick.value += 1; },
      openFull() { const index = state.boards.indexOf(this.activeBoard); if (index >= 0) bridge.openQuickBi(index); }
    }
  };

  const BoardManagementApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <el-tabs v-model="status" class="portal-vue-status-tabs" @tab-change="resetPage"><el-tab-pane label="已上线" name="已上线"></el-tab-pane><el-tab-pane label="已下线" name="已下线"></el-tab-pane></el-tabs>
          <div class="portal-vue-toolbar">
            <div class="portal-vue-toolbar-left">
              <el-input v-model="keyword" class="portal-vue-search" clearable placeholder="搜索看板名称、Quick BI ID" @input="resetPage"></el-input>
              <el-select v-model="category" class="portal-vue-filter" placeholder="全部分类" @change="resetPage"><el-option label="全部分类" value="全部分类"></el-option><el-option v-for="item in categories" :key="item" :label="item" :value="item"></el-option></el-select>
              <el-select v-model="owner" class="portal-vue-filter" placeholder="全部负责人" @change="resetPage"><el-option label="全部负责人" value="全部负责人"></el-option><el-option v-for="item in owners" :key="item" :label="item" :value="item"></el-option></el-select>
            </div>
            <div><el-button @click="categoryDialog=true">管理分类</el-button><el-button type="primary" @click="openForm()">新增看板</el-button></div>
          </div>
          <el-table :data="pagedRows" class="portal-vue-table" border empty-text="暂无看板">
            <el-table-column label="看板名称" width="200" fixed="left" show-overflow-tooltip><template #default="scope"><span class="portal-vue-name">{{ scope.row.name }}</span></template></el-table-column>
            <el-table-column prop="category" label="所属分类" width="120"></el-table-column>
            <el-table-column prop="quickBiId" label="Quick BI 看板 ID" width="160"><template #default="scope"><code class="portal-vue-code">{{ scope.row.quickBiId }}</code></template></el-table-column>
            <el-table-column prop="desc" label="看板说明" min-width="210" show-overflow-tooltip><template #default="scope">{{ scope.row.desc || '—' }}</template></el-table-column>
            <el-table-column label="可查看权限组" width="150" show-overflow-tooltip><template #default="scope">{{ scope.row.groups.join('、') }}</template></el-table-column>
            <el-table-column label="可查看用户" width="190">
              <template #default="scope">
                <el-popover v-if="boardViewers(scope.row).length" placement="right" trigger="hover" :width="340" popper-class="portal-vue-viewer-popover">
                  <template #reference>
                    <div class="portal-vue-viewer-summary">
                      <div class="portal-vue-avatar-stack"><el-avatar v-for="user in boardViewers(scope.row).slice(0,3)" :key="user.feishu || user.name" :size="28" :style="avatarStyle(user.name)">{{ avatarText(user.name) }}</el-avatar></div>
                      <span>{{ boardViewers(scope.row).length }} 人</span>
                      <el-tag v-if="boardViewers(scope.row).length>3" size="small" effect="plain">+{{ boardViewers(scope.row).length-3 }}</el-tag>
                    </div>
                  </template>
                  <div class="portal-vue-viewer-head"><strong>可查看用户</strong><span>{{ boardViewers(scope.row).length }} 人</span></div>
                  <el-scrollbar max-height="260px">
                    <div v-for="user in boardViewers(scope.row)" :key="user.feishu || user.name" class="portal-vue-viewer-item">
                      <el-avatar :size="30" :style="avatarStyle(user.name)">{{ avatarText(user.name) }}</el-avatar>
                      <div><strong>{{ user.name }}</strong><span>{{ user.dept || '未挂部门' }}</span></div>
                    </div>
                  </el-scrollbar>
                </el-popover>
                <span v-else class="portal-vue-muted">暂无</span>
              </template>
            </el-table-column>
            <el-table-column prop="owner" label="负责人" width="100"></el-table-column>
            <el-table-column label="状态" width="86" align="center"><template #default="scope"><el-switch :model-value="scope.row.status==='已上线'" @change="value=>toggleStatus(scope.row,value)"></el-switch></template></el-table-column>
            <el-table-column prop="updatedAt" label="更新时间" width="170"></el-table-column>
            <el-table-column label="操作" width="96" fixed="right"><template #default="scope"><el-button link type="primary" @click="openForm(scope.row)">编辑</el-button></template></el-table-column>
          </el-table>
          <div class="portal-vue-pagination"><span>共 {{ filteredRows.length }} 条，当前 {{ rangeText }}</span><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,20,50]" :total="filteredRows.length" layout="sizes, prev, pager, next"></el-pagination></div>
        </section>

        <el-dialog v-model="formVisible" :title="editingIndex<0?'新增看板':'编辑看板'" width="620px" destroy-on-close>
          <el-form class="portal-vue-dialog-form" label-position="top">
            <el-form-item label="看板名称" required><el-input v-model="form.name" placeholder="请输入看板名称"></el-input></el-form-item>
            <el-form-item label="Quick BI 看板 ID" required><el-input v-model="form.quickBiId" placeholder="例如：QB_073"></el-input></el-form-item>
            <el-form-item label="所属分类" required><el-select v-model="form.category"><el-option v-for="item in categories" :key="item" :label="item" :value="item"></el-option></el-select></el-form-item>
            <el-form-item label="负责人" required><el-select v-model="form.owner" filterable><el-option v-for="item in userNames" :key="item" :label="item" :value="item"></el-option></el-select></el-form-item>
            <el-form-item label="看板说明"><el-input v-model="form.desc" type="textarea" :rows="3" placeholder="说明看板用途和数据口径"></el-input></el-form-item>
            <el-form-item label="可查看权限组" required><el-select v-model="form.groups" multiple><el-option v-for="item in groupNames" :key="item" :label="item" :value="item"></el-option></el-select></el-form-item>
          </el-form>
          <template #footer><el-button @click="formVisible=false">取消</el-button><el-button type="primary" @click="saveBoard">保存</el-button></template>
        </el-dialog>

        <el-dialog v-model="categoryDialog" title="管理看板分类" width="520px">
          <div style="display:flex;gap:10px;margin-bottom:16px"><el-input v-model="newCategory" placeholder="输入新分类名称" @keyup.enter="addCategory"></el-input><el-button type="primary" @click="addCategory">新增</el-button></div>
          <div v-for="item in categories" :key="item" style="display:flex;align-items:center;justify-content:space-between;min-height:44px;border-top:1px solid #eef1f5"><span>{{ item }}</span><el-button link type="danger" @click="deleteCategory(item)">删除</el-button></div>
        </el-dialog>
      </el-config-provider>
    `,
    data: () => ({ status: "已上线", keyword: "", category: "全部分类", owner: "全部负责人", page: 1, pageSize: 10, formVisible: false, editingIndex: -1, categoryDialog: false, newCategory: "", form: {} }),
    computed: {
      categories() { refreshTick.value; return state.categories.filter(item => item !== "全部"); },
      owners() { return [...new Set(state.boards.map(board => board.owner))]; },
      userNames() { return state.users.map(user => user.name); },
      groupNames() { return state.groups.map(group => group.name); },
      filteredRows() { refreshTick.value; const keyword = this.keyword.trim().toLowerCase(); return state.boards.filter(board => board.status === this.status && (this.category === "全部分类" || board.category === this.category) && (this.owner === "全部负责人" || board.owner === this.owner) && (!keyword || `${board.name} ${board.quickBiId}`.toLowerCase().includes(keyword))); },
      pagedRows() { const result = paginate(this.filteredRows, this.page, this.pageSize); if (result.safePage !== this.page) this.page = result.safePage; return result.rows; },
      rangeText() { if (!this.filteredRows.length) return "0-0"; return `${(this.page-1)*this.pageSize+1}-${Math.min(this.page*this.pageSize,this.filteredRows.length)}`; }
    },
    mounted() { this.primaryHandler = event => { if (event.detail?.page === "看板管理") this.openForm(); }; window.addEventListener("portal:primary-action", this.primaryHandler); },
    beforeUnmount() { window.removeEventListener("portal:primary-action", this.primaryHandler); },
    methods: {
      resetPage() { this.page = 1; },
      boardViewers(board) {
        const directGroups = Array.isArray(board.groups) ? board.groups : [];
        const visibleGroups = new Set(state.groups.filter(group => directGroups.includes(group.name)
          || group.boards.includes("全部看板")
          || group.boards.includes(board.name)
          || group.boards.includes(board.category)).map(group => group.name));
        return state.users.filter(user => user.status !== "已停用" && visibleGroups.has(user.group));
      },
      avatarText(name) { return String(name || "用").slice(0,1); },
      avatarStyle(name) { const colors = ["#1677ff","#13a8a8","#7c3aed","#d97706","#dc4c64","#35805b"]; const seed = [...String(name || "")].reduce((total,char)=>total+char.charCodeAt(0),0); return { background: colors[seed % colors.length], color: "#fff" }; },
      openForm(board = null) { this.editingIndex = board ? state.boards.indexOf(board) : -1; this.form = board ? { ...board, groups: [...board.groups] } : { name: "", quickBiId: `QB_${String(state.boards.length + 1).padStart(3,"0")}`, category: this.categories[0] || "", owner: "曾祥竞", desc: "", groups: ["门户管理员"], status: "已上线", updatedAt: "2026-07-15 10:00" }; this.formVisible = true; },
      saveBoard() {
        if (!this.form.name.trim() || !this.form.quickBiId.trim() || !this.form.category || !this.form.owner || !this.form.groups.length) return ep.ElMessage.warning("请补全看板必填信息");
        const payload = { ...this.form, name: this.form.name.trim(), quickBiId: this.form.quickBiId.trim(), updatedAt: "2026-07-15 10:00" };
        if (this.editingIndex < 0) state.boards.unshift(payload); else Object.assign(state.boards[this.editingIndex], payload);
        this.formVisible = false; notify(`看板「${payload.name}」已保存`);
      },
      async toggleStatus(board, enabled) { const next = enabled ? "已上线" : "已下线"; if (!await confirmAction(enabled ? "上线看板" : "下线看板", `确认${enabled ? "上线" : "下线"}「${board.name}」？`)) return; board.status = next; board.updatedAt = "2026-07-15 10:00"; notify(`看板已${enabled ? "上线" : "下线"}`); },
      addCategory() { const name = this.newCategory.trim(); if (!name) return ep.ElMessage.warning("请输入分类名称"); if (state.categories.includes(name)) return ep.ElMessage.warning("分类已存在"); state.categories.push(name); this.newCategory = ""; notify("分类已新增"); },
      async deleteCategory(name) { if (state.boards.some(board => board.category === name)) return ep.ElMessage.warning("该分类下仍有看板，不能删除"); if (!await confirmAction("删除分类", `确认删除「${name}」？`)) return; state.categories.splice(state.categories.indexOf(name),1); notify("分类已删除"); }
    }
  };

  const AssetManagementApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <el-tabs v-model="status" class="portal-vue-status-tabs" @tab-change="resetPage"><el-tab-pane label="启用中" name="启用"></el-tab-pane><el-tab-pane label="已停用" name="停用"></el-tab-pane></el-tabs>
          <div class="portal-vue-toolbar">
            <div class="portal-vue-toolbar-left">
              <el-input v-model="keyword" class="portal-vue-search" clearable placeholder="搜索表名、对外表名、表中文名" @input="resetPage"></el-input>
              <el-select v-model="source" class="portal-vue-filter" placeholder="全部数据源" @change="changeSource"><el-option label="全部数据源" value=""></el-option><el-option v-for="item in sources" :key="item" :label="item" :value="item"></el-option></el-select>
              <el-select v-model="database" class="portal-vue-filter" placeholder="全部库名" @change="resetPage"><el-option label="全部库名" value=""></el-option><el-option v-for="item in databases" :key="item" :label="item" :value="item"></el-option></el-select>
              <el-select v-model="owner" class="portal-vue-filter" placeholder="全部表负责人" @change="resetPage"><el-option label="全部表负责人" value=""></el-option><el-option v-for="item in owners" :key="item" :label="item" :value="item"></el-option></el-select>
              <el-select v-model="bizLine" class="portal-vue-filter" placeholder="全部业务线" @change="resetPage"><el-option label="全部业务线" value=""></el-option><el-option v-for="item in bizLines" :key="item" :label="item" :value="item"></el-option></el-select>
            </div>
            <el-button type="primary" @click="openCreate">新增表</el-button>
          </div>
          <el-table :data="pagedRows" class="portal-vue-table" border empty-text="暂无数据表">
            <el-table-column prop="assetId" label="表编号" width="92" fixed="left"></el-table-column>
            <el-table-column label="对外表名" width="210" fixed="left" show-overflow-tooltip><template #default="scope"><span class="portal-vue-name">{{ scope.row.externalName }}</span></template></el-table-column>
            <el-table-column prop="table" label="表名" width="300" show-overflow-tooltip><template #default="scope"><code class="portal-vue-code">{{ scope.row.table }}</code></template></el-table-column>
            <el-table-column label="表类型" width="120"><template #default="scope"><div class="portal-vue-type-tags"><el-tag v-if="scope.row.dimension" size="small" type="warning" effect="light">维表</el-tag><el-tag v-if="isTagTable(scope.row)" size="small" effect="plain">标签表</el-tag><span v-if="!scope.row.dimension && !isTagTable(scope.row)" class="portal-vue-muted">数仓表</span></div></template></el-table-column>
            <el-table-column label="业务线" width="100"><template #default="scope"><el-tag v-if="scope.row.bizLine" size="small" effect="plain">{{ scope.row.bizLine }}</el-tag><span v-else class="portal-vue-muted">—</span></template></el-table-column>
            <el-table-column prop="source" label="数据源" width="120"></el-table-column>
            <el-table-column prop="database" label="库名" width="150"></el-table-column>
            <el-table-column prop="cnName" label="表中文名" width="170" show-overflow-tooltip></el-table-column>
            <el-table-column prop="desc" label="表描述" min-width="260" show-overflow-tooltip></el-table-column>
            <el-table-column prop="owner" label="表负责人" width="120" show-overflow-tooltip></el-table-column>
            <el-table-column label="字段数" width="86" align="center"><template #default="scope">{{ scope.row.fields.length }}</template></el-table-column>
            <el-table-column label="服务状态" width="92" align="center"><template #default="scope"><el-switch :model-value="scope.row.serviceStatus==='启用'" @change="value=>toggleService(scope.row,value)"></el-switch></template></el-table-column>
            <el-table-column prop="lastSync" label="最近同步时间" width="170"></el-table-column>
            <el-table-column label="最近30日调用次数" width="150" align="right"><template #default="scope">{{ callCount(scope.row).toLocaleString() }}</template></el-table-column>
            <el-table-column label="操作" width="88" fixed="right"><template #default="scope"><div class="portal-vue-actions"><el-button link type="primary" @click="openDetail(scope.row)">详情</el-button></div></template></el-table-column>
          </el-table>
          <div class="portal-vue-pagination"><span>共 {{ filteredRows.length }} 条，当前 {{ rangeText }}</span><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,20,50]" :total="filteredRows.length" layout="sizes, prev, pager, next"></el-pagination></div>
        </section>

        <el-dialog v-model="createVisible" title="新增数据表" width="620px">
          <el-form class="portal-vue-dialog-form" label-position="top">
            <el-form-item label="数据源" required><el-select v-model="createForm.source"><el-option label="StarRocks-拉端" value="StarRocks-拉端"></el-option><el-option label="StarRocks-存量" value="StarRocks-存量"></el-option></el-select></el-form-item>
            <el-form-item label="库名" required><el-input v-model="createForm.database" placeholder="例如：prod_cloud"></el-input></el-form-item>
            <el-form-item label="表名" required><el-input v-model="createForm.table" placeholder="小写字母与下划线"></el-input></el-form-item>
            <el-form-item label="对外表名" required><el-input v-model="createForm.externalName" placeholder="例如：open_user_profile_tag"></el-input></el-form-item>
            <el-form-item label="表中文名" required><el-input v-model="createForm.cnName" placeholder="请输入表中文名"></el-input></el-form-item>
            <el-form-item label="业务线" required><el-select v-model="createForm.bizLine" placeholder="选择表所属业务线"><el-option v-for="item in bizLines" :key="item" :label="item" :value="item"></el-option></el-select></el-form-item>
            <el-form-item label="表描述"><el-input v-model="createForm.desc" type="textarea" :rows="3"></el-input></el-form-item>
            <el-form-item label="表类型">
              <div class="portal-vue-type-checks">
                <el-checkbox v-model="createForm.dimension">设为维表，保存后可在「维表管理」中维护数据</el-checkbox>
                <el-checkbox v-model="createForm.tagTable">设为标签表，保存后出现在「标签管理」；导出字段请到详情中配置</el-checkbox>
              </div>
            </el-form-item>
          </el-form>
          <template #footer><el-button @click="createVisible=false">取消</el-button><el-button type="primary" @click="saveCreate">保存</el-button></template>
        </el-dialog>

          <el-drawer v-model="detailVisible" :title="detail ? (detail.cnName || detail.table) + ' · 表详情' : '表详情'" size="860px" destroy-on-close :close-on-click-modal="true">
          <template v-if="detail">
            <div class="portal-vue-detail-grid portal-vue-asset-detail-meta">
              <div v-for="item in detailMeta" :key="item.label" class="portal-vue-detail-item"><span>{{ item.label }}</span><strong :class="{'portal-vue-code':item.code}">{{ item.value }}</strong></div>
            </div>
            <div class="portal-vue-section-line">
              <h3>基本信息</h3>
              <el-form class="portal-vue-dialog-form portal-vue-asset-basic-form" label-position="top">
                <el-form-item label="表负责人" required>
                  <el-select v-model="detailDraft.owner" filterable placeholder="请选择表负责人">
                    <el-option v-for="user in activeUsers" :key="user.name" :label="user.name" :value="user.name">
                      <div class="portal-vue-asset-owner-option"><span>{{ user.name }}</span><small>{{ user.dept }} · {{ user.role }}</small></div>
                    </el-option>
                  </el-select>
                </el-form-item>
                <el-form-item label="表描述"><el-input v-model="detailDraft.desc" type="textarea" :rows="3" placeholder="请输入表描述"></el-input></el-form-item>
              </el-form>
            </div>
            <div class="portal-vue-section-line"><h3>标签表设置</h3><el-checkbox v-model="detailDraft.tagTable">设为标签表</el-checkbox></div>
            <div class="portal-vue-section-line"><h3>维表设置</h3><el-checkbox v-model="detailDraft.dimension">设为维表</el-checkbox><p class="portal-vue-muted">勾选后该表会出现在「维表管理」，可在线维护行数据。</p></div>
            <div v-if="detailDraft.tagTable" class="portal-vue-section-line"><h3>人群包导出字段配置</h3><el-checkbox-group v-model="detailDraft.exportFields" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px"><el-checkbox v-for="field in detail.fields" :key="field.name" :value="field.name">{{ field.name }} / {{ field.comment || field.type }}</el-checkbox></el-checkbox-group></div>
            <div class="portal-vue-section-line"><h3>字段列表</h3><el-table :data="detailDraft.fields" class="portal-vue-table" border><el-table-column prop="name" label="字段名称" width="170"></el-table-column><el-table-column prop="type" label="字段类型" width="110"></el-table-column><el-table-column prop="comment" label="字段中文名" width="130"></el-table-column><el-table-column label="关联字典" width="220"><template #default="scope"><el-select v-model="scope.row.dictId" clearable filterable placeholder="不关联" popper-class="portal-vue-dict-select"><el-option v-for="dict in enabledDicts" :key="dict.dictId" :label="dict.name" :value="dict.dictId"><el-tooltip placement="right" :show-after="180" :hide-after="80" popper-class="portal-vue-dict-popper"><template #content><div class="portal-vue-dict-preview"><strong>{{ dict.name }}</strong><span>{{ dict.code }} · {{ enabledDictItems(dict).length }} 个枚举值</span><p v-for="item in enabledDictItems(dict)" :key="item.code">{{ item.code }} → {{ item.name }}</p></div></template><span class="portal-vue-dict-option">{{ dict.name }}<small>{{ dictHint(dict) }}</small></span></el-tooltip></el-option></el-select></template></el-table-column><el-table-column label="字段备注" min-width="180"><template #default="scope"><el-input v-model="scope.row.remark"></el-input></template></el-table-column></el-table></div>
          </template>
          <template #footer><el-button @click="detailVisible=false">关闭</el-button><el-button type="primary" @click="saveDetail">保存配置</el-button></template>
        </el-drawer>
      </el-config-provider>
    `,
    data: () => ({ status: "启用", keyword: "", source: "", database: "", owner: "", bizLine: "", page: 1, pageSize: 10, createVisible: false, createForm: {}, detailVisible: false, detail: null, detailDraft: {} }),
    computed: {
      sources() { refreshTick.value; return [...new Set(state.assets.map(item => item.source))]; },
      databases() { return [...new Set(state.assets.filter(item => !this.source || item.source === this.source).map(item => item.database))]; },
      owners() { return [...new Set(state.assets.map(item => item.owner).filter(Boolean))].sort((left, right) => left.localeCompare(right, "zh-CN")); },
      bizLines() { refreshTick.value; return [...new Set(state.assets.map(item => item.bizLine).filter(Boolean))]; },
      filteredRows() { refreshTick.value; const keyword = this.keyword.trim().toLowerCase(); return state.assets.filter(item => (item.serviceStatus || "启用") === this.status && (!this.source || item.source === this.source) && (!this.database || item.database === this.database) && (!this.owner || item.owner === this.owner) && (!this.bizLine || item.bizLine === this.bizLine) && (!keyword || `${item.table} ${item.externalName} ${item.cnName}`.toLowerCase().includes(keyword))); },
      pagedRows() { const result = paginate(this.filteredRows, this.page, this.pageSize); if (result.safePage !== this.page) this.page = result.safePage; return result.rows; },
      rangeText() { if (!this.filteredRows.length) return "0-0"; return `${(this.page-1)*this.pageSize+1}-${Math.min(this.page*this.pageSize,this.filteredRows.length)}`; },
      enabledDicts() { refreshTick.value; return state.dictionaries.filter(item => item.status === "启用"); },
      detailMeta() { if (!this.detail) return []; return [{label:"表编号",value:this.detail.assetId || "—"},{label:"对外表名",value:this.detail.externalName || "—"},{label:"数据源",value:this.detail.source},{label:"业务线",value:this.detail.bizLine || "—"},{label:"库名",value:this.detail.database},{label:"表名",value:this.detail.table,code:true},{label:"最近同步时间",value:this.detail.lastSuccessSync || "—"},{label:"字段数量",value:this.detail.fields.length},{label:"近30日调用次数",value:this.callCount(this.detail).toLocaleString()}]; },
      activeUsers() { return state.users.filter(user => user.status !== "已停用"); }
    },
    mounted() { this.primaryHandler = event => { if (event.detail?.page === "表管理") this.openCreate(); }; window.addEventListener("portal:primary-action", this.primaryHandler); },
    beforeUnmount() { window.removeEventListener("portal:primary-action", this.primaryHandler); },
    methods: {
      resetPage() { this.page = 1; },
      changeSource() { if (this.database && !this.databases.includes(this.database)) this.database = ""; this.resetPage(); },
      apiAssets(api) { return Array.isArray(api.assets) && api.assets.length ? api.assets : [{ database: api.database, table: api.assetTable }]; },
      callCount(asset) { return state.apis.filter(api => this.apiAssets(api).some(item => item.database === asset.database && item.table === asset.table)).reduce((sum,api)=>sum+Number(api.callCount30d || api.callCount || 0),0); },
      isTagTable(asset) { return state.tables.some(table => table.name === asset.table); },
      enabledDictItems,
      dictHint,
      openCreate() { this.createForm = { source: "StarRocks-拉端", database: "", table: "", externalName: "", cnName: "", bizLine: "", desc: "", dimension: false, tagTable: false }; this.createVisible = true; },
      saveCreate() {
        const form = this.createForm;
        if (![form.source,form.database,form.table,form.externalName,form.cnName,form.bizLine].every(value => String(value).trim())) return ep.ElMessage.warning("请补全数据表必填信息");
        if (!/^[a-z]+(?:_[a-z0-9]+)*$/.test(form.table)) return ep.ElMessage.warning("表名仅支持小写字母、数字与下划线");
        if (state.assets.some(item => item.database === form.database && item.table === form.table)) return ep.ElMessage.warning("该数据表已存在");
        const notes = [];
        state.assets.unshift({ assetId:`T${String(state.assets.length+1).padStart(3,"0")}`, source:form.source, database:form.database, table:form.table, externalName:form.externalName, cnName:form.cnName, bizLine:form.bizLine, desc:form.desc || `${form.cnName}，用于数据服务与分析。`, serviceStatus:"启用", status:"同步成功", lastSync:"2026-07-15 10:00", lastSuccessSync:"2026-07-15 10:00", nextSync:"每日 02:30", owner:"曾祥竞", dimension:!!form.dimension, maintainMode:"sync", rows:[], lastMaintained:"", maintainer:"", fields:[] });
        if (form.dimension) notes.push("已加入维表管理");
        if (form.tagTable) {
          if (!state.tables.some(table => table.name === form.table)) state.tables.push({ name:form.table, cn:form.cnName, exportFields:[], fields:[] });
          notes.push("已加入标签管理");
        }
        this.createVisible = false; notify(`数据表「${form.externalName}」已新增${notes.length ? "，" + notes.join("，") : ""}`);
      },
      openDetail(asset) { this.detail = asset; const tag = state.tables.find(table => table.name === asset.table); this.detailDraft = { owner:asset.owner || "", desc:asset.desc || "", tagTable:!!tag, dimension:!!asset.dimension, exportFields:[...(tag?.exportFields || [])], fields:asset.fields.map(field => ({...field, dictId: field.dictId || ""})) }; this.detailVisible = true; },
      semanticType(type) { const value = String(type || "").toUpperCase(); if (/DATE|TIME/.test(value)) return "日期"; if (/BOOL/.test(value)) return "布尔"; if (/ARRAY/.test(value)) return "数组"; if (/INT|DECIMAL|DOUBLE|FLOAT|BIGINT|NUMERIC/.test(value)) return "数值"; return "文本"; },
      saveDetail() {
        if (!this.detailDraft.owner) return ep.ElMessage.warning("请选择表负责人");
        this.detail.owner = this.detailDraft.owner; this.detail.desc = this.detailDraft.desc.trim(); this.detail.dimension = !!this.detailDraft.dimension; this.detail.fields.splice(0,this.detail.fields.length,...this.detailDraft.fields.map(field=>({...field, dictId: field.dictId || ""})));
        if (this.detail.dimension && !Array.isArray(this.detail.rows)) this.detail.rows = [];
        const tagIndex = state.tables.findIndex(table => table.name === this.detail.table);
        if (this.detailDraft.tagTable && tagIndex < 0) state.tables.push({ name:this.detail.table, cn:this.detail.cnName || this.detail.table, exportFields:[...this.detailDraft.exportFields], fields:this.detail.fields.map(field=>({name:field.name,cn:field.comment||field.name,type:this.semanticType(field.type),cov:80,def:"",calc:"",freq:"",enumv:""})) });
        else if (this.detailDraft.tagTable && tagIndex >= 0) state.tables[tagIndex].exportFields = [...this.detailDraft.exportFields];
        else if (!this.detailDraft.tagTable && tagIndex >= 0) state.tables.splice(tagIndex,1);
        this.detailVisible = false; notify("表详情配置已保存");
      },
      async toggleService(asset, enabled) { if (enabled && asset.status !== "同步成功") return ep.ElMessage.warning("同步成功后才能启用该表"); const related = state.apis.filter(api => api.tokenStatus === "启用" && this.apiAssets(api).some(item => item.database===asset.database && item.table===asset.table)).length; const note = !enabled && related ? `，当前有 ${related} 个启用中的 API 关联该表` : ""; if (!await confirmAction(enabled?"启用数据表":"停用数据表",`确认${enabled?"启用":"停用"}「${asset.table}」${note}？`)) return; asset.serviceStatus = enabled?"启用":"停用"; notify(`数据表已${asset.serviceStatus}`); }
    }
  };

  const ApiManagementApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <el-tabs v-model="status" class="portal-vue-status-tabs" @tab-change="page=1"><el-tab-pane label="启用中" name="启用"></el-tab-pane><el-tab-pane label="已停用" name="停用"></el-tab-pane></el-tabs>
          <div class="portal-vue-toolbar"><div class="portal-vue-toolbar-left"><el-input v-model="keyword" class="portal-vue-search" clearable placeholder="搜索接口名称、表名" @input="page=1"></el-input></div><el-button type="primary" @click="openEditor(-1)">新增 API</el-button></div>
          <el-table :data="pagedRows" class="portal-vue-table" border empty-text="暂无 API">
            <el-table-column label="接口名称" width="190" fixed="left" show-overflow-tooltip><template #default="scope"><span class="portal-vue-name">{{ scope.row.name }}</span></template></el-table-column>
            <el-table-column label="关联表" width="130"><template #default="scope"><el-tooltip placement="top" :content="assetTooltip(scope.row)"><span>共 {{ apiAssets(scope.row).length }} 张表</span></el-tooltip></template></el-table-column>
            <el-table-column label="授权字段" width="100" align="center"><template #default="scope">{{ fieldCount(scope.row) }} 个</template></el-table-column>
            <el-table-column prop="usage" label="使用场景" min-width="230" show-overflow-tooltip></el-table-column>
            <el-table-column label="最近30日调用次数" width="150" align="right"><template #default="scope">{{ Number(scope.row.callCount30d || scope.row.callCount || 0).toLocaleString() }}</template></el-table-column>
            <el-table-column label="状态" width="86" align="center"><template #default="scope"><el-switch :model-value="scope.row.tokenStatus==='启用'" @change="value=>toggleStatus(scope.row,value)"></el-switch></template></el-table-column>
            <el-table-column prop="creator" label="创建人" width="100"></el-table-column>
            <el-table-column prop="lastCall" label="最近调用" width="170"></el-table-column>
            <el-table-column label="操作" width="190" fixed="right"><template #default="scope"><div class="portal-vue-actions"><el-button link type="primary" @click="openEditor(state.apis.indexOf(scope.row))">编辑</el-button><el-button link type="primary" @click="copyToken(scope.row)">复制 Token</el-button></div></template></el-table-column>
          </el-table>
          <div class="portal-vue-pagination"><span>共 {{ filteredRows.length }} 条，当前 {{ rangeText }}</span><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,20,50]" :total="filteredRows.length" layout="sizes, prev, pager, next"></el-pagination></div>
        </section>
      </el-config-provider>
    `,
    data: () => ({ status:"启用", keyword:"", page:1, pageSize:10, state }),
    computed: {
      filteredRows() { refreshTick.value; const keyword=this.keyword.trim().toLowerCase(); return state.apis.filter(api=>api.tokenStatus===this.status && (!keyword || `${api.name} ${this.apiAssets(api).map(item=>item.table).join(" ")}`.toLowerCase().includes(keyword))); },
      pagedRows() { const result=paginate(this.filteredRows,this.page,this.pageSize); if(result.safePage!==this.page)this.page=result.safePage; return result.rows; },
      rangeText() { if(!this.filteredRows.length)return "0-0"; return `${(this.page-1)*this.pageSize+1}-${Math.min(this.page*this.pageSize,this.filteredRows.length)}`; }
    },
    mounted() { this.primaryHandler=event=>{if(event.detail?.page==="数据开放平台")this.openEditor(-1);}; window.addEventListener("portal:primary-action",this.primaryHandler); },
    beforeUnmount() { window.removeEventListener("portal:primary-action",this.primaryHandler); },
    methods: {
      apiAssets(api) { return Array.isArray(api.assets)&&api.assets.length?api.assets:[{database:api.database,table:api.assetTable,fieldNames:api.fieldNames||[]}]; },
      fieldCount(api) { return this.apiAssets(api).reduce((sum,item)=>sum+(item.fieldNames||[]).length,0); },
      assetTooltip(api) { return this.apiAssets(api).map(item=>{const asset=state.assets.find(row=>row.database===item.database&&row.table===item.table);return `${asset?.externalName||item.table}（${asset?.cnName||"—"}）`;}).join("\n"); },
      openEditor(index) { window.portalApiEditingIndex=index; bridge.setPage("新增API"); },
      copyToken(api) { bridge.copyToken(api.token); ep.ElMessage.success("Token 已复制"); },
      async toggleStatus(api,enabled) { if(!await confirmAction(enabled?"启用 API":"停用 API",`确认${enabled?"启用":"停用"}「${api.name}」？${enabled?"":"停用后该 Token 将无法继续调用。"}`))return; api.tokenStatus=enabled?"启用":"停用"; notify(`${api.name} 已${api.tokenStatus}`); }
    }
  };

  const ApiCreateApp = {
    template: `
      <el-config-provider :locale="locale">
        <div class="portal-vue-form-page">
          <el-page-header class="portal-vue-form-header" title="返回" :content="editingIndex<0?'新增 API':'编辑 API'" @back="back"></el-page-header>
          <div class="portal-vue-api-layout">
            <section class="portal-vue-api-picker">
              <div class="portal-vue-form-panel-head"><span>选择数据表</span><el-tag size="small">{{ selected.length }} 张</el-tag></div>
              <div class="portal-vue-form-panel-body"><el-input v-model="tableKeyword" clearable placeholder="搜索库名、表名、表中文名"></el-input><div v-for="asset in availableAssets" :key="asset.database+'.'+asset.table" class="portal-vue-source-item"><el-checkbox :model-value="isSelected(asset)" @change="value=>toggleAsset(asset,value)"><el-tooltip :content="(asset.externalName || asset.table) + '（' + asset.cnName + '）'" placement="right" :show-after="300"><strong>{{ asset.externalName || asset.table }}</strong></el-tooltip><small>{{ asset.cnName }} · {{ asset.fields.length }} 字段</small></el-checkbox></div></div>
            </section>
            <section class="portal-vue-api-config">
              <div class="portal-vue-form-panel-head"><span>接口配置</span></div>
              <div class="portal-vue-form-panel-body">
                <el-form label-position="top" class="portal-vue-dialog-form">
                  <el-form-item label="接口名称" required><el-input v-model="form.name" placeholder="例如：广告投放日报接口"></el-input></el-form-item>
                  <el-form-item label="使用场景" required><el-input v-model="form.usage" type="textarea" :rows="3" placeholder="说明调用系统、业务用途和责任人"></el-input></el-form-item>
                </el-form>
                <div v-for="item in selected" :key="item.database+'.'+item.table" class="portal-vue-selected-table">
                  <div class="portal-vue-selected-head"><div><span class="portal-vue-name">{{ assetFor(item)?.externalName || item.table }}</span><div class="portal-vue-muted" style="margin-top:4px">{{ assetFor(item)?.cnName }}</div></div><div style="display:flex;align-items:center;gap:8px"><span>调用频次</span><el-input-number v-model="item.rateLimit" :min="1" :controls="false"></el-input-number><span>次/分钟</span></div></div>
                  <div class="portal-vue-field-grid"><el-checkbox v-for="field in assetFor(item)?.fields || []" :key="field.name" :model-value="item.fieldNames.includes(field.name)" @change="value=>toggleField(item,field.name,value)">{{ field.name }} / {{ field.comment }}</el-checkbox></div>
                </div>
                <el-empty v-if="!selected.length" description="请先从左侧选择数据表"></el-empty>
              </div>
            </section>
          </div>
          <div class="portal-vue-form-actions"><el-button @click="back">取消</el-button><el-button type="primary" :loading="saving" @click="save">{{ editingIndex<0?'生成 Token':'保存修改' }}</el-button></div>
        </div>
        <el-dialog v-model="tokenVisible" title="Token 生成成功" width="560px" :close-on-click-modal="false"><el-alert title="请妥善保存 Token，调用数据服务时需作为身份凭证。" type="success" :closable="false"></el-alert><div class="portal-vue-detail-grid" style="margin-top:16px"><div class="portal-vue-detail-item"><span>API 名称</span><strong>{{ savedApi?.name }}</strong></div><div class="portal-vue-detail-item"><span>授权范围</span><strong>{{ selected.length }} 张表 / {{ selectedFieldCount }} 个字段</strong></div></div><el-input :model-value="savedApi?.token" readonly><template #append><el-button @click="copySavedToken">复制</el-button></template></el-input><template #footer><el-button type="primary" @click="finish">完成</el-button></template></el-dialog>
      </el-config-provider>
    `,
    data: () => ({ editingIndex:-1, tableKeyword:"", form:{name:"",usage:""}, selected:[], saving:false, tokenVisible:false, savedApi:null }),
    computed: {
      availableAssets() { refreshTick.value; const keyword=this.tableKeyword.trim().toLowerCase(); return state.assets.filter(asset=>asset.status==="同步成功"&&(asset.serviceStatus||"启用")==="启用"&&(!keyword||`${asset.database} ${asset.table} ${asset.externalName} ${asset.cnName}`.toLowerCase().includes(keyword))); },
      selectedFieldCount() { return this.selected.reduce((sum,item)=>sum+item.fieldNames.length,0); }
    },
    mounted() { this.pageHandler=event=>{if(event.detail?.page==="新增API")this.load();}; window.addEventListener("portal:page-change",this.pageHandler); this.load(); },
    beforeUnmount() { window.removeEventListener("portal:page-change",this.pageHandler); },
    methods: {
      apiAssets(api) { return Array.isArray(api?.assets)&&api.assets.length?api.assets:[{database:api?.database,table:api?.assetTable,fieldNames:api?.fieldNames||[],rateLimit:Number(String(api?.rateLimit||"").match(/\d+/)?.[0])||60}]; },
      load() { this.editingIndex=Number.isInteger(window.portalApiEditingIndex)?window.portalApiEditingIndex:-1; const api=state.apis[this.editingIndex]; this.form=api?{name:api.name,usage:api.usage}:{name:"",usage:""}; this.selected=api?this.apiAssets(api).map(item=>({database:item.database,table:item.table,fieldNames:[...(item.fieldNames||[])],rateLimit:Number(item.rateLimit)||60})):[]; this.tableKeyword=""; },
      assetFor(item) { return state.assets.find(asset=>asset.database===item.database&&asset.table===item.table); },
      isSelected(asset) { return this.selected.some(item=>item.database===asset.database&&item.table===asset.table); },
      toggleAsset(asset,checked) { const index=this.selected.findIndex(item=>item.database===asset.database&&item.table===asset.table); if(checked&&index<0)this.selected.push({database:asset.database,table:asset.table,fieldNames:asset.fields.slice(0,3).map(field=>field.name),rateLimit:60}); else if(!checked&&index>=0)this.selected.splice(index,1); },
      toggleField(item,name,checked) { const index=item.fieldNames.indexOf(name); if(checked&&index<0)item.fieldNames.push(name); else if(!checked&&index>=0)item.fieldNames.splice(index,1); },
      back() { window.portalApiEditingIndex=-1; bridge.setPage("数据开放平台"); },
      save() {
        if(!this.form.name.trim()||!this.form.usage.trim())return ep.ElMessage.warning("请填写接口名称和使用场景");
        if(!this.selected.length)return ep.ElMessage.warning("请至少选择 1 张数据表");
        if(this.selected.some(item=>!item.fieldNames.length))return ep.ElMessage.warning("每张数据表至少授权 1 个字段");
        this.saving=true;
        window.setTimeout(()=>{
          const first=this.selected[0]; const existing=state.apis[this.editingIndex]; const payload={name:this.form.name.trim(),usage:this.form.usage.trim(),assetTable:first.table,database:first.database,fieldNames:[...first.fieldNames],assets:this.selected.map(item=>({...item,fieldNames:[...item.fieldNames]})),rateLimit:`每分钟 ${first.rateLimit} 次`,tokenStatus:existing?.tokenStatus||"启用",creator:existing?.creator||"曾祥竞",createdAt:existing?.createdAt||"2026-07-15 10:00",lastCall:existing?.lastCall||"尚未调用",callCount:existing?.callCount||0,callCount30d:existing?.callCount30d||0,token:existing?.token||`bjgw_live_${Date.now().toString(36)}****`};
          if(this.editingIndex<0)state.apis.unshift(payload);else Object.assign(existing,payload);
          this.savedApi=payload;this.saving=false;notify();
          if(this.editingIndex<0)this.tokenVisible=true;else{ep.ElMessage.success("API 配置已保存");this.back();}
        },700);
      },
      copySavedToken(){if(this.savedApi)bridge.copyToken(this.savedApi.token);ep.ElMessage.success("Token 已复制");},
      finish(){this.tokenVisible=false;this.back();}
    }
  };

  const TagManagementApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <div class="portal-vue-toolbar">
            <div class="portal-vue-toolbar-left"><span style="color:#566174;font-weight:650">标签主体</span><el-select v-model="subject" class="portal-vue-filter-wide" @change="page=1"><el-option v-for="table in tables" :key="table.name" :label="table.cn+'（'+table.name+'）'" :value="table.name"></el-option></el-select><el-input v-model="keyword" class="portal-vue-search" clearable placeholder="搜索标签名、字段名" @input="page=1"></el-input></div>
            <el-tag effect="plain">{{ currentTable?.fields.length || 0 }} 个标签字段</el-tag>
          </div>
          <el-table :data="pagedRows" class="portal-vue-table" border empty-text="暂无标签字段">
            <el-table-column prop="name" label="字段名" width="190" fixed="left"><template #default="scope"><code class="portal-vue-code">{{ scope.row.name }}</code></template></el-table-column>
            <el-table-column prop="cn" label="标签名称" width="160"><template #default="scope"><span class="portal-vue-name">{{ scope.row.cn }}</span></template></el-table-column>
            <el-table-column prop="type" label="标签类型" width="110"></el-table-column>
            <el-table-column label="枚举值" width="210" show-overflow-tooltip><template #default="scope">{{ scope.row.enumv || (scope.row.values || []).join('，') || '—' }}</template></el-table-column>
            <el-table-column prop="def" label="业务定义" min-width="220" show-overflow-tooltip><template #default="scope">{{ scope.row.def || '—' }}</template></el-table-column>
            <el-table-column prop="calc" label="计算口径" min-width="240" show-overflow-tooltip><template #default="scope">{{ scope.row.calc || '—' }}</template></el-table-column>
            <el-table-column prop="freq" label="更新频率" width="100"><template #default="scope">{{ scope.row.freq || '—' }}</template></el-table-column>
            <el-table-column label="覆盖率" width="100" align="right"><template #default="scope">{{ scope.row.cov ?? '—' }}<span v-if="scope.row.cov!==undefined">%</span></template></el-table-column>
            <el-table-column label="操作" width="88" fixed="right"><template #default="scope"><el-button link type="primary" @click="openEdit(scope.row)">编辑</el-button></template></el-table-column>
          </el-table>
          <div class="portal-vue-pagination"><span>共 {{ filteredRows.length }} 条，当前 {{ rangeText }}</span><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,20,50]" :total="filteredRows.length" layout="sizes, prev, pager, next"></el-pagination></div>
        </section>
        <el-drawer v-model="editVisible" title="编辑标签信息" direction="rtl" size="680px" class="tag-enum-drawer" :close-on-click-modal="true">
          <el-form v-if="editForm" class="tag-enum-drawer-form" label-position="top">
            <el-form-item label="字段名"><el-input :model-value="editForm.name" disabled></el-input></el-form-item>
            <el-form-item label="标签名称" required><el-input v-model="editForm.cn"></el-input></el-form-item>
            <el-form-item label="业务定义"><el-input v-model="editForm.def" type="textarea" :rows="2"></el-input></el-form-item>
            <el-form-item label="计算口径"><el-input v-model="editForm.calc" type="textarea" :rows="2"></el-input></el-form-item>
            <section class="tag-enum-section">
              <div class="tag-enum-section-head"><strong>枚举值</strong><el-button v-if="editForm.enumMode==='manual'" link type="primary" @click="addEnumValue">添加枚举值</el-button></div>
              <el-radio-group v-model="editForm.enumMode" class="tag-enum-mode"><el-radio value="manual">手动添加</el-radio><el-radio value="upload">上传枚举值</el-radio></el-radio-group>
              <div v-if="editForm.enumMode==='upload'" class="tag-enum-import">
                <div class="tag-enum-import-copy"><strong>上传枚举值</strong><span>仅支持 UTF-8 TXT 格式，每行一个枚举值；不允许空行、重复值或逗号分隔。</span></div>
                <input ref="enumFileInput" class="tag-enum-file-input" type="file" accept=".txt,text/plain" @change="importEnumFile">
                <div class="tag-enum-import-actions"><el-button link type="primary" @click="downloadEnumTemplate">下载模板</el-button><el-button @click="triggerEnumFileInput">选择文件</el-button></div>
              </div>
              <div v-if="editForm.enumMode==='upload'&&editForm.enumImportedFileName" class="tag-enum-import-status"><strong>已导入 {{ editForm.enumValues.length }} 个枚举值</strong><span>{{ editForm.enumImportedFileName }}</span><el-button link type="danger" title="删除上传文件" @click="removeImportedEnumFile">删除</el-button></div>
              <div v-else-if="editForm.enumMode==='manual'" class="tag-enum-list">
                <div v-for="(value,index) in editForm.enumValues" :key="index" class="tag-enum-row">
                  <span class="tag-enum-row-index">{{ index + 1 }}</span>
                  <el-input v-model="editForm.enumValues[index]" :placeholder="'请输入第 ' + (index + 1) + ' 个枚举值'"></el-input>
                  <el-button text type="danger" title="删除枚举值" :disabled="editForm.enumValues.length===1" @click="removeEnumValue(index)">×</el-button>
                </div>
              </div>
            </section>
            <el-form-item label="更新频率" class="tag-enum-section"><el-select v-model="editForm.freq"><el-option label="实时" value="实时"></el-option><el-option label="小时" value="小时"></el-option><el-option label="离线" value="离线"></el-option></el-select></el-form-item>
          </el-form>
          <template #footer><el-button @click="editVisible=false">取消</el-button><el-button type="primary" @click="saveEdit">保存</el-button></template>
        </el-drawer>
      </el-config-provider>
    `,
    data: () => ({ subject:state.tables[0]?.name||"",keyword:"",page:1,pageSize:10,editVisible:false,editForm:null,editTarget:null }),
    computed: {
      tables(){refreshTick.value;if(!state.tables.some(table=>table.name===this.subject))this.subject=state.tables[0]?.name||"";return state.tables;},
      currentTable(){return state.tables.find(table=>table.name===this.subject);},
      filteredRows(){refreshTick.value;const keyword=this.keyword.trim().toLowerCase();return (this.currentTable?.fields||[]).filter(field=>!keyword||`${field.name} ${field.cn}`.toLowerCase().includes(keyword));},
      pagedRows(){const result=paginate(this.filteredRows,this.page,this.pageSize);if(result.safePage!==this.page)this.page=result.safePage;return result.rows;},
      rangeText(){if(!this.filteredRows.length)return "0-0";return `${(this.page-1)*this.pageSize+1}-${Math.min(this.page*this.pageSize,this.filteredRows.length)}`;}
    },
    methods:{
      normalizeEnumValues(values){return [...new Set((values||[]).map(value=>String(value).trim()).filter(Boolean))];},
      openEdit(field){const values=this.normalizeEnumValues(field.values?.length?field.values:String(field.enumv||"").split(/[，,]/));this.editTarget=field;this.editForm={...field,enumMode:"manual",enumValues:values.length?values:[""],enumImportedFileName:""};this.editVisible=true;},
      addEnumValue(){this.editForm?.enumValues.push("");},
      removeEnumValue(index){if(!this.editForm||this.editForm.enumValues.length===1)return;this.editForm.enumValues.splice(index,1);},
      triggerEnumFileInput(){this.$refs.enumFileInput?.click();},
      downloadEnumTemplate(){const content="枚举值示例 1\n枚举值示例 2\n";const url=URL.createObjectURL(new Blob([content],{type:"text/plain;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download="标签枚举值模板.txt";document.body.appendChild(link);link.click();link.remove();},
      validateEnumFileContent(content){const source=String(content||"").replace(/^\uFEFF/,"");if(!source.trim())return {error:"文件内容为空，请按每行一个枚举值填写"};if(source.includes("\uFFFD"))return {error:"文件编码异常，请使用 UTF-8 编码的 TXT 文件"};const rows=source.split(/\r?\n/);if(rows.length>1&&rows.at(-1)==="")rows.pop();const values=[];const seen=new Map();for(let index=0;index<rows.length;index+=1){const lineNumber=index+1;const raw=rows[index];const value=raw.trim();if(!value)return {error:`第 ${lineNumber} 行为空，请保证每行只填写一个枚举值`};if(/[，,；;]/.test(raw))return {error:`第 ${lineNumber} 行包含分隔符，请每行只填写一个枚举值`};if(/[\t\f\v]/.test(raw))return {error:`第 ${lineNumber} 行包含制表符或特殊分隔符，请每行只填写一个枚举值`};if(seen.has(value))return {error:`第 ${lineNumber} 行与第 ${seen.get(value)} 行重复，请删除重复枚举值`};seen.set(value,lineNumber);values.push(value);}return {values};},
      async importEnumFile(event){const file=event.target?.files?.[0];if(!file)return;if(!/\.txt$/i.test(file.name)&&file.type!=="text/plain"){ep.ElMessage.warning("请上传 TXT 格式文件");event.target.value="";return;}const result=this.validateEnumFileContent(await file.text());event.target.value="";if(result.error){ep.ElMessage.error(`枚举值文件格式校验失败：${result.error}`);return;}this.editForm.enumValues=result.values;this.editForm.enumImportedFileName=file.name;ep.ElMessage.success(`枚举值文件格式校验通过，已导入 ${result.values.length} 个枚举值`);},
      removeImportedEnumFile(){if(!this.editForm)return;this.editForm.enumValues=[];this.editForm.enumImportedFileName="";ep.ElMessage.success("已删除上传的枚举值文件");},
      saveEdit(){if(!this.editForm?.cn.trim())return ep.ElMessage.warning("请输入标签名称");if(this.editForm.enumMode==="upload"&&!this.editForm.enumImportedFileName)return ep.ElMessage.warning("请上传 TXT 枚举值文件");const values=this.normalizeEnumValues(this.editForm.enumValues);Object.assign(this.editTarget,this.editForm,{values,enumv:values.join("，")});this.editVisible=false;notify("标签信息已保存");}
    }
  };

  const TargetManagementApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <el-tabs v-model="status" class="portal-vue-status-tabs" @tab-change="page=1"><el-tab-pane label="启用中" name="启用"></el-tab-pane><el-tab-pane label="已停用" name="停用"></el-tab-pane></el-tabs>
          <div class="portal-vue-toolbar"><div class="portal-vue-toolbar-left"><el-input v-model="keyword" class="portal-vue-search" clearable placeholder="搜索目标名称、存储桶" @input="page=1"></el-input></div><el-button type="primary" @click="openCreate">新增推送目标</el-button></div>
          <el-table :data="pagedRows" class="portal-vue-table" border empty-text="暂无推送目标">
            <el-table-column label="目标名称" width="190" fixed="left"><template #default="scope"><span class="portal-vue-name">{{ scope.row.name }}</span></template></el-table-column>
            <el-table-column label="类型" width="90"><template #default><el-tag effect="plain">OSS</el-tag></template></el-table-column>
            <el-table-column prop="bucket" label="存储桶名称" min-width="200" show-overflow-tooltip><template #default="scope"><code class="portal-vue-code">{{ scope.row.bucket }}</code></template></el-table-column>
            <el-table-column prop="region" label="存储地域" width="150"></el-table-column>
            <el-table-column prop="endpoint" label="访问域名" min-width="260" show-overflow-tooltip></el-table-column>
            <el-table-column prop="refs" label="被引用" width="100" align="right"><template #default="scope">{{ scope.row.refs || 0 }} 个人群包</template></el-table-column>
            <el-table-column prop="last" label="最近使用" width="170"></el-table-column>
            <el-table-column label="状态" width="86" align="center"><template #default="scope"><el-switch :model-value="(scope.row.status||'启用')==='启用'" @change="value=>toggleStatus(scope.row,value)"></el-switch></template></el-table-column>
          </el-table>
          <div class="portal-vue-pagination"><span>共 {{ filteredRows.length }} 条，当前 {{ rangeText }}</span><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,20,50]" :total="filteredRows.length" layout="sizes, prev, pager, next"></el-pagination></div>
        </section>
        <el-dialog v-model="createVisible" title="新增推送目标" width="620px" @closed="resetCreateForm">
          <el-form ref="targetFormRef" :model="form" :rules="targetRules" class="portal-vue-dialog-form" label-position="top">
            <el-form-item label="目标名称" prop="name"><el-input v-model="form.name" placeholder="例如：巨量DMP-OSS"></el-input></el-form-item>
            <el-form-item label="存储桶名称（bucket_name）" prop="bucket"><el-input v-model="form.bucket"></el-input></el-form-item>
            <el-form-item label="存储地域（Region）" prop="region"><el-input v-model="form.region" placeholder="例如：cn-shenzhen"></el-input></el-form-item>
            <el-form-item label="访问域名（endpoint）" prop="endpoint"><el-input v-model="form.endpoint"></el-input></el-form-item>
            <el-form-item label="访问密钥 ID（access_key_id）" prop="ak"><el-input v-model="form.ak"></el-input></el-form-item>
            <el-form-item label="访问密钥 Secret（access_key_secret）" prop="sk"><el-input v-model="form.sk" type="password" show-password></el-input></el-form-item>
          </el-form>
          <template #footer><el-button @click="createVisible=false">取消</el-button><el-button type="primary" @click="saveCreate">保存目标</el-button></template>
        </el-dialog>
      </el-config-provider>
    `,
    data:()=>({
      status:"启用",
      keyword:"",
      page:1,
      pageSize:10,
      createVisible:false,
      form:{name:"",bucket:"",region:"",endpoint:"",ak:"",sk:""},
      targetRules:{
        name:[{required:true,whitespace:true,message:"请输入目标名称",trigger:"blur"}],
        bucket:[{required:true,whitespace:true,message:"请输入存储桶名称",trigger:"blur"}],
        region:[{required:true,whitespace:true,message:"请输入存储地域",trigger:"blur"}],
        endpoint:[{required:true,whitespace:true,message:"请输入访问域名",trigger:"blur"}],
        ak:[{required:true,whitespace:true,message:"请输入访问密钥 ID",trigger:"blur"}],
        sk:[{required:true,whitespace:true,message:"请输入访问密钥 Secret",trigger:"blur"}]
      }
    }),
    computed:{
      filteredRows(){refreshTick.value;const keyword=this.keyword.trim().toLowerCase();return state.targets.filter(item=>(item.status||"启用")===this.status&&(!keyword||`${item.name} ${item.bucket}`.toLowerCase().includes(keyword)));},
      pagedRows(){const result=paginate(this.filteredRows,this.page,this.pageSize);if(result.safePage!==this.page)this.page=result.safePage;return result.rows;},
      rangeText(){if(!this.filteredRows.length)return "0-0";return `${(this.page-1)*this.pageSize+1}-${Math.min(this.page*this.pageSize,this.filteredRows.length)}`;}
    },
    mounted(){this.primaryHandler=event=>{if(event.detail?.page==="人群包推送渠道")this.openCreate();};window.addEventListener("portal:primary-action",this.primaryHandler);},
    beforeUnmount(){window.removeEventListener("portal:primary-action",this.primaryHandler);},
    methods:{
      openCreate(){this.form={name:"",bucket:"flink-baiju-prod",region:"cn-shenzhen",endpoint:"https://oss-cn-shenzhen.aliyuncs.com",ak:"",sk:""};this.createVisible=true;this.$nextTick(()=>this.$refs.targetFormRef?.clearValidate());},
      resetCreateForm(){this.$refs.targetFormRef?.resetFields();},
      async saveCreate(){const valid=await this.$refs.targetFormRef?.validate().catch(()=>false);if(!valid)return;const payload=Object.fromEntries(Object.entries(this.form).map(([key,value])=>[key,String(value).trim()]));state.targets.unshift({...payload,sk:"********",refs:0,last:"尚未使用",status:"启用"});this.createVisible=false;notify(`推送目标「${payload.name}」已保存`);},
      async toggleStatus(target,enabled){const refs=Number(target.refs||0);const note=!enabled&&refs?`，当前有 ${refs} 个人群包正在引用` : "";if(!await confirmAction(enabled?"启用推送目标":"停用推送目标",`确认${enabled?"启用":"停用"}「${target.name}」${note}？`))return;target.status=enabled?"启用":"停用";notify(`推送目标已${target.status}`);}
    }
  };

  const UserManagementApp = {
    template: `
      <el-config-provider :locale="locale">
        <div class="portal-vue-user-layout">
          <aside class="portal-vue-user-groups"><button v-for="item in groupOptions" :key="item.name" class="portal-vue-user-group" :class="{active:item.name===group}" type="button" @click="selectGroup(item.name)"><span>{{ item.name }}</span><span>{{ item.count }}</span></button></aside>
          <section class="portal-vue-user-main">
            <div class="portal-vue-toolbar"><div class="portal-vue-toolbar-left"><el-input v-model="keyword" class="portal-vue-search" clearable placeholder="搜索姓名、邮箱、部门" @input="page=1"></el-input><el-select v-model="status" class="portal-vue-filter" @change="page=1"><el-option label="全部状态" value="全部状态"></el-option><el-option label="启用中" value="启用中"></el-option><el-option label="已停用" value="已停用"></el-option></el-select></div><el-button @click="syncUsers">同步飞书用户</el-button></div>
            <el-table :data="pagedRows" class="portal-vue-table" border empty-text="暂无用户">
              <el-table-column label="用户" width="140" fixed="left"><template #default="scope"><div class="portal-vue-user-cell"><el-avatar :size="30">{{ scope.row.name.slice(0,1) }}</el-avatar><span class="portal-vue-name">{{ scope.row.name }}</span></div></template></el-table-column>
              <el-table-column prop="dept" label="部门组织" min-width="220" show-overflow-tooltip></el-table-column>
              <el-table-column prop="role" label="岗位角色" width="130"></el-table-column>
              <el-table-column prop="email" label="邮箱" width="210" show-overflow-tooltip></el-table-column>
              <el-table-column label="所属权限组" width="130"><template #default="scope"><el-tag :type="scope.row.group==='未分配'?'warning':'primary'" effect="light">{{ scope.row.group }}</el-tag></template></el-table-column>
              <el-table-column label="账号状态" width="100"><template #default="scope"><el-tag :type="scope.row.status==='已停用'?'info':'success'" effect="plain">{{ scope.row.status==='已停用'?'已停用':'启用中' }}</el-tag></template></el-table-column>
              <el-table-column prop="login" label="最近登录" width="170"></el-table-column>
              <el-table-column label="操作" width="190" fixed="right"><template #default="scope"><div class="portal-vue-actions"><el-button link type="primary" @click="openAssign(scope.row)">设置权限组</el-button><el-button link type="primary" @click="openPermission(scope.row)">配置权限</el-button></div></template></el-table-column>
            </el-table>
            <div class="portal-vue-pagination"><span>共 {{ filteredRows.length }} 条，当前 {{ rangeText }}</span><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,20,50]" :total="filteredRows.length" layout="sizes, prev, pager, next"></el-pagination></div>
          </section>
        </div>
        <el-dialog v-model="assignVisible" :title="assignUser ? assignUser.name + ' · 设置权限组' : '设置权限组'" width="520px"><div v-if="assignUser" class="portal-vue-detail-grid"><div class="portal-vue-detail-item"><span>部门组织</span><strong>{{ assignUser.dept }}</strong></div><div class="portal-vue-detail-item"><span>岗位角色</span><strong>{{ assignUser.role }}</strong></div></div><el-form label-position="top" class="portal-vue-dialog-form"><el-form-item label="选择权限组"><el-select v-model="assignGroup"><el-option label="未分配" value="未分配"></el-option><el-option v-for="item in state.groups" :key="item.name" :label="item.name" :value="item.name"></el-option></el-select></el-form-item></el-form><template #footer><el-button @click="assignVisible=false">取消</el-button><el-button type="primary" @click="saveAssign">保存权限组</el-button></template></el-dialog>
      </el-config-provider>
    `,
    data:()=>({keyword:"",status:"全部状态",group:"全部权限组",page:1,pageSize:10,assignVisible:false,assignUser:null,assignGroup:"",state}),
    computed:{
      groupOptions(){refreshTick.value;return ["全部权限组","未分配",...state.groups.map(item=>item.name)].map(name=>({name,count:name==="全部权限组"?state.users.length:state.users.filter(user=>user.group===name).length}));},
      filteredRows(){refreshTick.value;const keyword=this.keyword.trim().toLowerCase();return state.users.filter(user=>(this.group==="全部权限组"||user.group===this.group)&&(this.status==="全部状态"||(this.status==="已停用"?user.status==="已停用":user.status!=="已停用"))&&(!keyword||`${user.name} ${user.email} ${user.dept} ${user.role}`.toLowerCase().includes(keyword)));},
      pagedRows(){const result=paginate(this.filteredRows,this.page,this.pageSize);if(result.safePage!==this.page)this.page=result.safePage;return result.rows;},
      rangeText(){if(!this.filteredRows.length)return "0-0";return `${(this.page-1)*this.pageSize+1}-${Math.min(this.page*this.pageSize,this.filteredRows.length)}`;}
    },
    methods:{
      selectGroup(name){this.group=name;this.page=1;},syncUsers(){ep.ElMessage.success("已发起飞书用户同步");},openAssign(user){this.assignUser=user;this.assignGroup=user.group;this.assignVisible=true;},saveAssign(){this.assignUser.group=this.assignGroup;this.assignVisible=false;notify(`${this.assignUser.name} 已分配到「${this.assignGroup}」`);},openPermission(user){bridge.setActiveUserIndex(state.users.indexOf(user));bridge.setPage("配置权限");}
    }
  };

  const PermissionGroupApp = {
    template: `
      <el-config-provider :locale="locale">
        <div class="portal-vue-split">
          <aside class="portal-vue-split-left">
            <div class="portal-vue-split-head"><strong>权限组</strong><el-button link type="primary" @click="openCreate">新增</el-button></div>
            <el-scrollbar height="558px"><div class="portal-vue-split-body"><article v-for="(item,index) in state.groups" :key="item.name" class="portal-vue-group-card" :class="{active:index===selectedIndex}" @click="selectGroup(index)"><div class="portal-vue-group-meta"><div><h3>{{ item.name }}</h3><span class="portal-vue-muted">{{ userCount(item.name) }} 人</span></div><el-dropdown trigger="click" @command="command=>groupCommand(command,index)" @click.stop><el-button text circle title="更多操作">⋮</el-button><template #dropdown><el-dropdown-menu><el-dropdown-item command="edit">编辑</el-dropdown-item><el-dropdown-item command="delete" divided>删除</el-dropdown-item></el-dropdown-menu></template></el-dropdown></div><p>{{ item.desc }}</p><div class="portal-vue-muted" style="margin-top:8px">{{ item.boards.includes('全部看板')?'全部看板':item.boards.length+' 个看板' }} · {{ item.tables?.includes('全部数据表')?'全部数据表':(item.tables?.length||0)+' 张数据表' }}</div></article></div></el-scrollbar>
          </aside>
          <section class="portal-vue-split-right">
            <div class="portal-vue-split-head"><strong>{{ activeGroup?.name || '权限组详情' }}</strong><div class="portal-vue-group-detail-actions"><el-button class="portal-vue-member-entry" @click="memberDrawer=true">成员 <el-tag size="small" round>{{ activeGroupUsers.length }}</el-tag></el-button><el-button type="primary" :disabled="!dirty" @click="saveGroup">保存</el-button></div></div>
            <div class="portal-vue-permission-body">
              <el-tabs v-model="activeTab" class="portal-vue-group-tabs"><el-tab-pane label="菜单权限" name="menus"></el-tab-pane><el-tab-pane name="boards"><template #label>看板查看范围 <el-tag size="small" round>{{ boardBadge }}</el-tag></template></el-tab-pane><el-tab-pane name="tables"><template #label>数据表权限 <el-tag size="small" round>{{ tableBadge }}</el-tag></template></el-tab-pane></el-tabs>
              <section v-show="activeTab==='menus'" class="portal-vue-group-permission-panel">
                <div class="portal-vue-permission-card-grid portal-vue-menu-card-grid">
                  <article v-for="section in state.nav" :key="section.group" class="portal-vue-group-permission-card">
                    <el-checkbox class="portal-vue-parent-check" :model-value="sectionChecked(section)" :indeterminate="sectionIndeterminate(section)" @change="value=>toggleSection(section,value)">{{ section.group }}</el-checkbox>
                    <div v-if="section.items.length>1" class="portal-vue-child-checks"><el-checkbox v-for="item in section.items" :key="item.name" :model-value="selectedMenus.includes(item.name)" @change="value=>toggleMenu(item.name,value)">{{ item.name }}</el-checkbox></div>
                  </article>
                </div>
              </section>
              <section v-show="activeTab==='boards'" class="portal-vue-group-permission-panel">
                <div class="portal-vue-board-range-toolbar"><span>按看板分类配置可查看范围</span><el-checkbox v-model="allBoards" @change="toggleAllBoards">全部看板</el-checkbox></div>
                <div class="portal-vue-permission-card-grid portal-vue-board-card-grid">
                  <article v-for="group in boardGroups" :key="group.category" class="portal-vue-group-permission-card">
                    <strong class="portal-vue-permission-card-title">{{ group.category }}</strong>
                    <div class="portal-vue-child-checks portal-vue-board-checks"><el-checkbox v-for="board in group.boards" :key="board.name" :disabled="allBoards" :model-value="selectedBoards.includes(board.name)" @change="value=>toggleBoard(board.name,value)">{{ board.name }}</el-checkbox></div>
                  </article>
                </div>
              </section>
              <section v-show="activeTab==='tables'" class="portal-vue-group-permission-panel">
                <div class="portal-vue-board-range-toolbar"><span>配置该权限组可在灵犀智析和 API 服务中使用的数据表</span><el-checkbox :model-value="allTablesSelected" :indeterminate="tablesIndeterminate" @change="toggleAllTables">全部数据表</el-checkbox></div>
                <div class="portal-vue-permission-card-grid portal-vue-board-card-grid">
                  <article v-for="group in tableGroups" :key="group.source" class="portal-vue-group-permission-card">
                    <strong class="portal-vue-permission-card-title">{{ group.source }}</strong>
                    <div class="portal-vue-child-checks portal-vue-board-checks"><el-checkbox v-for="table in group.tables" :key="table.cnName" :model-value="selectedTables.includes(table.cnName)" @change="value=>toggleTable(table.cnName,value)">{{ table.cnName }}</el-checkbox></div>
                  </article>
                </div>
                <p class="portal-vue-muted" style="margin-top:12px">未勾选任何数据表时，该权限组成员无法在灵犀智析发起分析和调用数据 API。</p>
              </section>
            </div>
          </section>
        </div>
        <el-drawer v-model="memberDrawer" :title="(activeGroup?.name || '权限组') + ' · 成员'" size="760px" class="portal-vue-member-drawer" :close-on-click-modal="true">
          <div class="portal-vue-member-toolbar"><div><strong>拥有此权限组的人</strong><span>共 {{ activeGroupUsers.length }} 人</span></div><el-button type="primary" @click="openMemberDialog">添加成员</el-button></div>
          <el-table :data="activeGroupUsers" class="portal-vue-table portal-vue-member-table" border max-height="calc(100vh - 190px)" empty-text="该权限组暂无成员">
            <el-table-column label="用户" min-width="180"><template #default="scope"><div class="portal-vue-member-user"><el-avatar :size="30" :style="avatarStyle(scope.row.name)">{{ avatarText(scope.row.name) }}</el-avatar><div><strong>{{ scope.row.name }}</strong><span>{{ scope.row.email || '—' }}</span></div></div></template></el-table-column>
            <el-table-column prop="dept" label="组织" min-width="220" show-overflow-tooltip></el-table-column>
            <el-table-column prop="role" label="角色" width="120"></el-table-column>
            <el-table-column label="操作" width="90" align="center"><template #default="scope"><el-button link type="danger" @click="removeMember(scope.row)">移除</el-button></template></el-table-column>
          </el-table>
        </el-drawer>
        <el-dialog v-model="formVisible" :title="editingIndex<0?'新增权限组':'编辑权限组'" width="560px"><el-form class="portal-vue-dialog-form" label-position="top"><el-form-item label="权限组名称" required><el-input v-model="groupForm.name"></el-input></el-form-item><el-form-item label="描述"><el-input v-model="groupForm.desc" type="textarea" :rows="3"></el-input></el-form-item></el-form><template #footer><el-button @click="formVisible=false">取消</el-button><el-button type="primary" @click="saveGroupForm">保存</el-button></template></el-dialog>
        <el-dialog v-model="memberVisible" title="添加权限组成员" width="620px">
          <el-form class="portal-vue-dialog-form" label-position="top"><el-form-item label="选择用户"><el-select v-model="memberSelection" multiple filterable collapse-tags collapse-tags-tooltip :max-collapse-tags="3" placeholder="搜索姓名或组织"><el-option v-for="user in availableUsers" :key="user.feishu || user.name" :label="user.name + ' · ' + (user.dept || '未挂部门')" :value="user.feishu || user.name"><div class="portal-vue-member-option"><span>{{ user.name }}</span><small>{{ user.dept || '未挂部门' }} · 当前 {{ user.group || '未分配' }}</small></div></el-option></el-select></el-form-item></el-form>
          <template #footer><el-button @click="memberVisible=false">取消</el-button><el-button type="primary" :disabled="!memberSelection.length" @click="addMembers">添加成员</el-button></template>
        </el-dialog>
      </el-config-provider>
    `,
    data:()=>({state,selectedIndex:0,activeTab:"menus",selectedMenus:[],selectedBoards:[],allBoards:false,selectedTables:[],dirty:false,formVisible:false,editingIndex:-1,groupForm:{},memberDrawer:false,memberVisible:false,memberSelection:[]}),
    computed:{
      activeGroup(){refreshTick.value;return state.groups[this.selectedIndex]||state.groups[0];},
      boardGroups(){return state.categories.filter(category=>category!=="全部").map(category=>({category,boards:state.boards.filter(board=>board.category===category&&board.status==="已上线")})).filter(group=>group.boards.length);},
      boardBadge(){if(this.allBoards)return state.boards.filter(board=>board.status==="已上线").length;return this.selectedBoards.length;},
      tableGroups(){const groups=[];state.assets.forEach(table=>{let group=groups.find(item=>item.source===table.source);if(!group){group={source:table.source,tables:[]};groups.push(group);}group.tables.push(table);});return groups;},
      allTableNames(){return state.assets.map(table=>table.cnName);},
      allTablesSelected(){return this.selectedTables.length>0&&this.selectedTables.length>=this.allTableNames.length;},
      tablesIndeterminate(){return this.selectedTables.length>0&&this.selectedTables.length<this.allTableNames.length;},
      tableBadge(){return this.selectedTables.length;},
      activeGroupUsers(){refreshTick.value;const groupName=this.activeGroup?.name;return groupName?state.users.filter(user=>user.group===groupName):[];},
      availableUsers(){refreshTick.value;const groupName=this.activeGroup?.name;return state.users.filter(user=>user.group!==groupName&&user.status!=="已停用");}
    },
    mounted(){this.loadGroup();this.primaryHandler=event=>{if(event.detail?.page==="权限组")this.openCreate();};window.addEventListener("portal:primary-action",this.primaryHandler);},
    beforeUnmount(){window.removeEventListener("portal:primary-action",this.primaryHandler);},
    methods:{
      userCount(name){return state.users.filter(user=>user.group===name).length;},
      avatarText(name){return String(name||"用").slice(0,1);},
      avatarStyle(name){const colors=["#1677ff","#13a8a8","#7c3aed","#d97706","#dc4c64","#35805b"];const seed=[...String(name||"")].reduce((total,char)=>total+char.charCodeAt(0),0);return{background:colors[seed%colors.length],color:"#fff"};},
      selectGroup(index){this.selectedIndex=index;this.activeTab="menus";this.memberDrawer=false;this.loadGroup();},
      loadGroup(){const group=state.groups[this.selectedIndex]||state.groups[0];if(!group)return;this.selectedMenus=[...group.menus];this.allBoards=group.boards.includes("全部看板");this.selectedBoards=this.allBoards?[]:state.boards.filter(board=>group.boards.includes(board.name)||group.boards.includes(board.category)).map(board=>board.name);const tablesGrant=group.tables||[];this.selectedTables=tablesGrant.includes("全部数据表")?[...this.allTableNames]:state.assets.filter(table=>tablesGrant.includes(table.cnName)).map(table=>table.cnName);this.dirty=false;},
      sectionNames(section){return section.items.length===1?[section.items[0].name]:[section.group,...section.items.map(item=>item.name)];},
      sectionChecked(section){const names=this.sectionNames(section);return names.every(name=>this.selectedMenus.includes(name));},
      sectionIndeterminate(section){const names=this.sectionNames(section);const count=names.filter(name=>this.selectedMenus.includes(name)).length;return count>0&&count<names.length;},
      toggleSection(section,checked){this.sectionNames(section).forEach(name=>this.toggleMenu(name,checked,false));this.dirty=true;},
      toggleMenu(name,checked,mark=true){const index=this.selectedMenus.indexOf(name);if(checked&&index<0)this.selectedMenus.push(name);else if(!checked&&index>=0)this.selectedMenus.splice(index,1);if(mark)this.dirty=true;},
      toggleAllBoards(value){this.allBoards=value;if(value)this.selectedBoards=[];this.dirty=true;},
      toggleBoard(name,checked){const index=this.selectedBoards.indexOf(name);if(checked&&index<0)this.selectedBoards.push(name);else if(!checked&&index>=0)this.selectedBoards.splice(index,1);this.dirty=true;},
      toggleAllTables(value){this.selectedTables=value?[...this.allTableNames]:[];this.dirty=true;},
      toggleTable(name,checked){const index=this.selectedTables.indexOf(name);if(checked&&index<0)this.selectedTables.push(name);else if(!checked&&index>=0)this.selectedTables.splice(index,1);this.dirty=true;},
      saveGroup(){this.activeGroup.menus=[...this.selectedMenus];this.activeGroup.boards=this.allBoards?["全部看板"]:[...this.selectedBoards];this.activeGroup.tables=this.selectedTables.length>=this.allTableNames.length?["全部数据表"]:[...this.selectedTables];this.dirty=false;notify("权限组配置已保存");},
      openMemberDialog(){this.memberSelection=[];this.memberVisible=true;},
      addMembers(){if(!this.memberSelection.length)return;const groupName=this.activeGroup?.name;if(!groupName)return;const selected=new Set(this.memberSelection);let count=0;state.users.forEach(user=>{if(selected.has(user.feishu||user.name)){user.group=groupName;if(user.status!=="已停用")user.status="启用";count+=1;}});this.memberVisible=false;this.memberSelection=[];notify(`已添加 ${count} 名成员到「${groupName}」`);},
      async removeMember(user){const groupName=this.activeGroup?.name;if(!groupName||!await confirmAction("移除权限组成员",`确认将「${user.name}」从「${groupName}」移除？`))return;user.group="未分配";if(user.status!=="已停用")user.status="未分配权限组";notify(`已从「${groupName}」移除 ${user.name}`);},
      openCreate(){this.editingIndex=-1;this.groupForm={name:"",desc:""};this.formVisible=true;},
      openEdit(index){this.editingIndex=index;this.groupForm={name:state.groups[index].name,desc:state.groups[index].desc};this.formVisible=true;},
      async groupCommand(command,index){if(command==="edit")return this.openEdit(index);const group=state.groups[index];if(this.userCount(group.name)>0)return ep.ElMessage.warning("该权限组下仍有用户，不能删除");if(!await confirmAction("删除权限组",`确认删除「${group.name}」？`))return;state.groups.splice(index,1);this.selectedIndex=Math.max(0,Math.min(this.selectedIndex,state.groups.length-1));this.loadGroup();notify("权限组已删除");},
      saveGroupForm(){const name=this.groupForm.name.trim();if(!name)return ep.ElMessage.warning("请输入权限组名称");if(state.groups.some((group,index)=>index!==this.editingIndex&&group.name===name))return ep.ElMessage.warning("权限组名称已存在");if(this.editingIndex<0){state.groups.push({name,desc:this.groupForm.desc.trim()||"自定义权限组。",menus:["灵犀智析","数据看板"],boards:[],tables:[],status:"启用"});this.selectedIndex=state.groups.length-1;}else{const group=state.groups[this.editingIndex];const oldName=group.name;group.name=name;group.desc=this.groupForm.desc.trim()||"自定义权限组。";state.users.forEach(user=>{if(user.group===oldName)user.group=name;});}this.formVisible=false;this.loadGroup();notify("权限组已保存");}
    }
  };

  const PermissionConfigApp = {
    template: `
      <el-config-provider :locale="locale">
        <div class="portal-vue-form-page">
          <el-page-header class="portal-vue-form-header" title="返回用户管理" content="配置用户权限" @back="back"></el-page-header>
          <div class="portal-vue-split" style="grid-template-columns:280px minmax(0,1fr)">
            <aside class="portal-vue-split-left"><div class="portal-vue-split-body" v-if="user"><div style="display:flex;align-items:center;gap:12px;margin-bottom:18px"><el-avatar :size="42">{{ user.name.slice(0,1) }}</el-avatar><div><span class="portal-vue-name">{{ user.name }}</span><div class="portal-vue-muted" style="margin-top:4px">{{ user.dept }}</div></div></div><div class="portal-vue-detail-item"><span>岗位角色</span><strong>{{ user.role }}</strong></div><div class="portal-vue-detail-item" style="margin-top:10px"><span>当前权限组</span><strong>{{ user.group }}</strong></div><div class="portal-vue-detail-item" style="margin-top:10px"><span>账号状态</span><strong>{{ user.status }}</strong></div></div></aside>
            <section class="portal-vue-split-right"><div class="portal-vue-permission-body"><el-tabs v-model="activeTab"><el-tab-pane label="菜单权限" name="menus"></el-tab-pane><el-tab-pane label="看板权限" name="boards"></el-tab-pane><el-tab-pane label="表权限" name="tables"></el-tab-pane></el-tabs><div v-show="activeTab==='menus'" class="portal-vue-permission-grid"><div v-for="section in state.nav" :key="section.group" class="portal-vue-permission-block"><strong>{{ section.group }}</strong><el-checkbox v-for="item in section.items" :key="item.name" v-model="selectedMenus" :value="item.name" style="display:flex;margin:8px 0">{{ item.name }}</el-checkbox></div></div><div v-show="activeTab==='boards'" class="portal-vue-permission-grid"><div v-for="group in boardGroups" :key="group.category" class="portal-vue-permission-block"><strong>{{ group.category }}</strong><el-checkbox v-for="board in group.boards" :key="board.name" v-model="selectedBoards" :value="board.name" style="display:flex;margin:8px 0">{{ board.name }}</el-checkbox></div></div><div v-show="activeTab==='tables'" class="portal-vue-permission-grid"><div class="portal-vue-permission-block" style="grid-column:1/-1"><el-checkbox :model-value="allTablesSelected" :indeterminate="tablesIndeterminate" @change="toggleAllTables">全部数据表</el-checkbox><p class="portal-vue-muted" style="margin:6px 0 0">默认跟随「{{ user.group }}」权限组的表权限；未勾选任何数据表时，该用户无法在灵犀智析发起分析。</p></div><div v-for="group in tableGroups" :key="group.source" class="portal-vue-permission-block"><strong>{{ group.source }}</strong><el-checkbox v-for="table in group.tables" :key="table.cnName" v-model="selectedTables" :value="table.cnName" style="display:flex;margin:8px 0">{{ table.cnName }}</el-checkbox></div></div></div></section>
          </div>
          <div class="portal-vue-form-actions"><el-button @click="back">取消</el-button><el-button type="primary" @click="save">保存权限</el-button></div>
        </div>
      </el-config-provider>
    `,
    data:()=>({state,activeTab:"menus",selectedMenus:[],selectedBoards:[],selectedTables:[]}),
    computed:{
      user(){refreshTick.value;return state.users[bridge.getActiveUserIndex()]||state.users[0];},
      group(){return state.groups.find(group=>group.name===this.user?.group);},
      boardGroups(){return state.categories.filter(category=>category!=="全部").map(category=>({category,boards:state.boards.filter(board=>board.category===category&&board.status==="已上线")})).filter(group=>group.boards.length);},
      tableGroups(){const groups=[];state.assets.forEach(table=>{let group=groups.find(item=>item.source===table.source);if(!group){group={source:table.source,tables:[]};groups.push(group);}group.tables.push(table);});return groups;},
      allTableNames(){return state.assets.map(table=>table.cnName);},
      allTablesSelected(){return this.selectedTables.length>0&&this.selectedTables.length>=this.allTableNames.length;},
      tablesIndeterminate(){return this.selectedTables.length>0&&this.selectedTables.length<this.allTableNames.length;}
    },
    mounted(){this.pageHandler=event=>{if(event.detail?.page==="配置权限")this.load();};window.addEventListener("portal:page-change",this.pageHandler);this.load();},
    beforeUnmount(){window.removeEventListener("portal:page-change",this.pageHandler);},
    methods:{load(){this.selectedMenus=[...(this.group?.menus||[])];this.selectedBoards=this.group?.boards?.includes("全部看板")?state.boards.filter(board=>board.status==="已上线").map(board=>board.name):[...(this.group?.boards||[])];const grants=this.user?.tableGrants;const source=Array.isArray(grants)?grants:(this.group?.tables||[]);this.selectedTables=source.includes("全部数据表")?[...this.allTableNames]:[...state.assets.filter(table=>source.includes(table.cnName)).map(table=>table.cnName)];},back(){bridge.setPage("用户管理");},toggleAllTables(value){this.selectedTables=value?[...this.allTableNames]:[];},async save(){const tables=this.selectedTables.length>=this.allTableNames.length?["全部数据表"]:[...this.selectedTables];this.user.tableGrants=[...tables];let persisted=false;try{const response=await fetch(`${analysisGatewayBase}/v1/permissions/${encodeURIComponent(this.user.name)}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({tables})});persisted=response.ok;}catch(error){/* 网关未启动时仅保存在页面状态 */}notify(`${this.user.name} 的权限配置已保存（${tables.includes("全部数据表")?"全部数据表":tables.length+" 张数据表"}）${persisted?"，已同步到分析网关":"（本地演示，网关未连接）"}`);this.back();}}
  };

  const QuickBiApp = {
    template:`
      <el-config-provider :locale="locale">
        <div class="portal-vue-form-page">
          <el-page-header class="portal-vue-form-header" title="返回数据看板" :content="board?.name || 'Quick BI 展示'" @back="back"></el-page-header>
          <section v-if="board" class="portal-vue-board-pane" style="padding:20px 0"><div class="portal-vue-board-hero"><div><el-tag>{{ board.category }}</el-tag><h2>{{ board.name }}</h2><p>Quick BI 看板 ID：{{ board.quickBiId }} · 负责人 {{ board.owner }}</p></div><el-button type="primary">打开 Quick BI</el-button></div><div class="portal-vue-kpis"><div v-for="item in kpis" :key="item.label" class="portal-vue-kpi"><span>{{ item.label }}</span><strong>{{ item.value }}</strong></div></div><div class="portal-vue-chart-grid"><section class="portal-vue-chart"><h3>核心指标趋势</h3><svg class="portal-vue-line" viewBox="0 0 420 190" preserveAspectRatio="none"><polyline :points="linePoints" fill="none" stroke="#1677ff" stroke-width="3"></polyline></svg></section><section class="portal-vue-chart"><h3>渠道结构</h3><div class="portal-vue-bars"><div v-for="bar in bars" :key="bar.name" class="portal-vue-bar" :style="{height:bar.height+'px'}"><span>{{ bar.name }}</span></div></div></section></div></section>
        </div>
      </el-config-provider>`,
    computed:{board(){refreshTick.value;return bridge.getActiveBoard();},seed(){return boardSeed(this.board?.name||"");},kpis(){return [{label:"消耗",value:`¥${((this.seed%800000+180000)/10000).toFixed(1)}万`},{label:"转化数",value:humanCount(this.seed%26000+9000)},{label:"ROI",value:((this.seed%260)/100+.9).toFixed(2)},{label:"触达用户",value:`${((this.seed%620000+260000)/10000).toFixed(1)}万`}];},points(){return Array.from({length:7},(_,index)=>({x:28+index*58,y:140-((this.seed>>index)%85)}));},linePoints(){return this.points.map(point=>`${point.x},${point.y}`).join(" ");},bars(){return ["巨量","广点通","快手","OPPO","VIVO"].map((name,index)=>({name,height:50+((this.seed>>index)%120)}));}},methods:{back(){bridge.setPage("数据看板");}}
  };

  const DimensionManagementApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <el-tabs v-model="status" class="portal-vue-status-tabs" @tab-change="page=1"><el-tab-pane label="启用中" name="启用"></el-tab-pane><el-tab-pane label="已停用" name="停用"></el-tab-pane></el-tabs>
          <div class="portal-vue-toolbar">
            <div class="portal-vue-toolbar-left">
              <el-input v-model="keyword" class="portal-vue-search" clearable placeholder="搜索表名、中文名" @input="page=1"></el-input>
              <el-select v-model="origin" class="portal-vue-filter" placeholder="全部来源" @change="page=1"><el-option label="全部来源" value=""></el-option><el-option label="表管理标记" value="sync"></el-option><el-option label="门户新建" value="portal"></el-option></el-select>
            </div>
            <el-button type="primary" @click="openCreate">新增维表</el-button>
          </div>
          <el-table :data="pagedRows" class="portal-vue-table" border empty-text="暂无维表">
            <el-table-column prop="assetId" label="表编号" width="92" fixed="left"></el-table-column>
            <el-table-column label="对外表名" min-width="200" show-overflow-tooltip><template #default="scope"><span class="portal-vue-name">{{ scope.row.externalName }}</span></template></el-table-column>
            <el-table-column prop="table" label="表名" min-width="220" show-overflow-tooltip><template #default="scope"><code class="portal-vue-code">{{ scope.row.table }}</code></template></el-table-column>
            <el-table-column prop="cnName" label="表中文名" min-width="150" show-overflow-tooltip></el-table-column>
            <el-table-column label="来源" width="120"><template #default="scope">{{ scope.row.maintainMode === "portal" ? "门户新建" : "表管理标记" }}</template></el-table-column>
            <el-table-column prop="owner" label="负责人" width="110"></el-table-column>
            <el-table-column label="行数" width="90" align="right"><template #default="scope">{{ rowCount(scope.row) }}</template></el-table-column>
            <el-table-column prop="lastMaintained" label="最近维护时间" width="170"><template #default="scope">{{ scope.row.lastMaintained || "—" }}</template></el-table-column>
            <el-table-column label="操作" width="168" fixed="right"><template #default="scope"><div class="portal-vue-actions"><el-button link type="primary" @click="openMaintain(scope.row)">维护数据</el-button><el-button link type="primary" @click="openDetail(scope.row)">详情</el-button></div></template></el-table-column>
          </el-table>
          <div class="portal-vue-pagination"><span>共 {{ filteredRows.length }} 条，当前 {{ rangeText }}</span><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,20,50]" :total="filteredRows.length" layout="sizes, prev, pager, next"></el-pagination></div>
        </section>
        <el-dialog v-model="createVisible" title="新增维表" width="720px">
          <el-form class="portal-vue-dialog-form" label-position="top">
            <el-form-item label="表名" required><el-input v-model="createForm.table" placeholder="例如：dim_channel"></el-input></el-form-item>
            <el-form-item label="对外表名" required><el-input v-model="createForm.externalName" placeholder="例如：open_dim_channel"></el-input></el-form-item>
            <el-form-item label="表中文名" required><el-input v-model="createForm.cnName" placeholder="例如：渠道维表"></el-input></el-form-item>
            <el-form-item label="表负责人" required>
              <el-select v-model="createForm.owner" filterable placeholder="请选择表负责人">
                <el-option v-for="user in activeUsers" :key="user.name" :label="user.name" :value="user.name"></el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="表描述"><el-input v-model="createForm.desc" type="textarea" :rows="2"></el-input></el-form-item>
            <el-form-item label="字段定义" required>
              <el-table :data="createForm.fields" class="portal-vue-table" border>
                <el-table-column label="字段名" min-width="140"><template #default="scope"><el-input v-model="scope.row.name" placeholder="channel_id"></el-input></template></el-table-column>
                <el-table-column label="类型" width="130"><template #default="scope"><el-select v-model="scope.row.type"><el-option label="VARCHAR" value="VARCHAR"></el-option><el-option label="BIGINT" value="BIGINT"></el-option><el-option label="DATE" value="DATE"></el-option></el-select></template></el-table-column>
                <el-table-column label="中文名" min-width="120"><template #default="scope"><el-input v-model="scope.row.comment"></el-input></template></el-table-column>
                <el-table-column label="关联字典" width="200"><template #default="scope"><el-select v-model="scope.row.dictId" clearable placeholder="不关联" popper-class="portal-vue-dict-select"><el-option v-for="dict in enabledDicts" :key="dict.dictId" :label="dict.name" :value="dict.dictId"><el-tooltip placement="right" :show-after="180" :hide-after="80" popper-class="portal-vue-dict-popper"><template #content><div class="portal-vue-dict-preview"><strong>{{ dict.name }}</strong><span>{{ dict.code }} · {{ enabledDictItems(dict).length }} 个枚举值</span><p v-for="item in enabledDictItems(dict)" :key="item.code">{{ item.code }} → {{ item.name }}</p></div></template><span class="portal-vue-dict-option">{{ dict.name }}<small>{{ dictHint(dict) }}</small></span></el-tooltip></el-option></el-select></template></el-table-column>
                <el-table-column width="70" align="center"><template #default="scope"><el-button link type="danger" :disabled="createForm.fields.length===1" @click="createForm.fields.splice(scope.$index,1)">删除</el-button></template></el-table-column>
              </el-table>
              <el-button class="portal-vue-add-field" @click="createForm.fields.push({name:'',type:'VARCHAR',comment:'',remark:'',dictId:''})">添加字段</el-button>
            </el-form-item>
          </el-form>
          <template #footer><el-button @click="createVisible=false">取消</el-button><el-button type="primary" @click="saveCreate">保存并维护数据</el-button></template>
        </el-dialog>
        <el-drawer v-model="detailVisible" :title="detail ? (detail.cnName || detail.table) + ' · 维表详情' : '维表详情'" size="760px" destroy-on-close :close-on-click-modal="true">
          <template v-if="detail">
            <div class="portal-vue-detail-grid">
              <div class="portal-vue-detail-item"><span>表编号</span><strong>{{ detail.assetId }}</strong></div>
              <div class="portal-vue-detail-item"><span>来源</span><strong>{{ detail.maintainMode === "portal" ? "门户新建" : "表管理标记" }}</strong></div>
              <div class="portal-vue-detail-item"><span>负责人</span><strong>{{ detail.owner }}</strong></div>
              <div class="portal-vue-detail-item"><span>最近维护</span><strong>{{ detail.lastMaintained || "—" }}</strong></div>
            </div>
            <p class="portal-vue-muted" style="margin:12px 0 16px">{{ detail.desc }}</p>
            <p class="portal-vue-muted" style="margin:0 0 10px">关联字典后，维护数据时该字段会变成下拉，选项来自字典枚举值。</p>
            <el-table :data="detailFields" class="portal-vue-table" border>
              <el-table-column prop="name" label="字段名" width="160"></el-table-column>
              <el-table-column prop="comment" label="中文名" width="140"></el-table-column>
              <el-table-column prop="type" label="类型" width="110"></el-table-column>
              <el-table-column label="关联字典" min-width="200"><template #default="scope"><el-select v-model="scope.row.dictId" clearable placeholder="不关联" popper-class="portal-vue-dict-select"><el-option v-for="dict in enabledDicts" :key="dict.dictId" :label="dict.name" :value="dict.dictId"><el-tooltip placement="right" :show-after="180" :hide-after="80" popper-class="portal-vue-dict-popper"><template #content><div class="portal-vue-dict-preview"><strong>{{ dict.name }}</strong><span>{{ dict.code }} · {{ enabledDictItems(dict).length }} 个枚举值</span><p v-for="item in enabledDictItems(dict)" :key="item.code">{{ item.code }} → {{ item.name }}</p></div></template><span class="portal-vue-dict-option">{{ dict.name }}<small>{{ dictHint(dict) }}</small></span></el-tooltip></el-option></el-select></template></el-table-column>
            </el-table>
          </template>
          <template #footer><el-button @click="detailVisible=false">关闭</el-button><el-button type="primary" @click="saveDetail">保存配置</el-button><el-button type="primary" @click="openMaintain(detail)">维护数据</el-button></template>
        </el-drawer>
      </el-config-provider>
    `,
    data: () => ({ status: "启用", keyword: "", origin: "", page: 1, pageSize: 10, createVisible: false, createForm: {}, detailVisible: false, detail: null, detailFields: [], gatewayCounts: null }),
    computed: {
      enabledDicts() { refreshTick.value; return state.dictionaries.filter(item => item.status === "启用"); },
      activeUsers() { return state.users.filter(user => user.status !== "已停用"); },
      filteredRows() {
        refreshTick.value;
        const keyword = this.keyword.trim().toLowerCase();
        return state.assets.filter(item => item.dimension && (item.serviceStatus || "启用") === this.status && (!this.origin || (item.maintainMode || "sync") === this.origin) && (!keyword || `${item.table} ${item.externalName} ${item.cnName}`.toLowerCase().includes(keyword)));
      },
      pagedRows() { const result = paginate(this.filteredRows, this.page, this.pageSize); if (result.safePage !== this.page) this.page = result.safePage; return result.rows; },
      rangeText() { if (!this.filteredRows.length) return "0-0"; return `${(this.page-1)*this.pageSize+1}-${Math.min(this.page*this.pageSize,this.filteredRows.length)}`; }
    },
    mounted() { this.primaryHandler = event => { if (event.detail?.page === "维表管理") { this.openCreate.call(this); this.loadGatewayCounts(); } }; window.addEventListener("portal:primary-action", this.primaryHandler); window.addEventListener("portal:data-change", this.loadGatewayCounts = () => this.fetchGatewayCounts()); this.fetchGatewayCounts(); },
    beforeUnmount() { window.removeEventListener("portal:primary-action", this.primaryHandler); },
    methods: {
      async fetchGatewayCounts() {
        try {
          const response = await fetch(`${analysisGatewayBase}/v1/catalog`);
          if (!response.ok) return;
          const data = await response.json();
          const counts = {};
          (data.tables || []).forEach(table => { counts[table.name] = table.rows; });
          this.gatewayCounts = counts;
        } catch (error) { /* 网关未启动时显示本地行数 */ }
      },
      rowCount(row) {
        if (this.gatewayCounts && this.gatewayCounts[row.cnName] !== undefined) return this.gatewayCounts[row.cnName];
        return (row.rows || []).length;
      },
      dictName(dictId) { return state.dictionaries.find(item => item.dictId === dictId)?.name || "—"; },
      enabledDictItems,
      dictHint,
      openCreate() { this.createForm = { table: "", externalName: "", cnName: "", owner: "曾祥竞", desc: "", fields: [{ name: "", type: "VARCHAR", comment: "", remark: "", dictId: "" }] }; this.createVisible = true; },
      saveCreate() {
        const form = this.createForm;
        if (![form.table, form.externalName, form.cnName, form.owner].every(value => String(value).trim())) return ep.ElMessage.warning("请补全维表必填信息");
        if (!/^[a-z]+(?:_[a-z0-9]+)*$/.test(form.table)) return ep.ElMessage.warning("表名仅支持小写字母、数字与下划线");
        if (state.assets.some(item => item.database === "portal_dim" && item.table === form.table)) return ep.ElMessage.warning("该维表已存在");
        const fields = form.fields.filter(field => field.name.trim()).map(field => ({ name: field.name.trim(), type: field.type, comment: field.comment.trim(), remark: "", dictId: field.dictId || "" }));
        if (!fields.length) return ep.ElMessage.warning("请至少定义 1 个字段");
        const asset = {
          assetId: `T${String(state.assets.length + 1).padStart(3, "0")}`, source: "门户维护", database: "portal_dim", table: form.table.trim(),
          externalName: form.externalName.trim(), cnName: form.cnName.trim(), desc: form.desc.trim() || `${form.cnName}，由门户在线维护。`,
          serviceStatus: "启用", status: "同步成功", lastSync: "2026-08-28 16:00", lastSuccessSync: "2026-08-28 16:00", nextSync: "按维护写入",
          owner: form.owner, dimension: true, maintainMode: "portal", rows: [], lastMaintained: "", maintainer: "", fields
        };
        state.assets.unshift(asset);
        this.createVisible = false;
        notify(`维表「${asset.cnName}」已创建`);
        this.openMaintain(asset);
      },
      openDetail(asset) { this.detail = asset; this.detailFields = (asset.fields || []).map(field => ({ ...field, dictId: field.dictId || "" })); this.detailVisible = true; },
      saveDetail() {
        if (!this.detail) return;
        this.detail.fields.splice(0, this.detail.fields.length, ...this.detailFields.map(field => ({ ...field, dictId: field.dictId || "" })));
        this.detailVisible = false;
        notify("维表字段配置已保存");
      },
      openMaintain(asset) {
        if (!asset) return;
        if (this.detail === asset && this.detailFields.length) this.detail.fields.splice(0, this.detail.fields.length, ...this.detailFields.map(field => ({ ...field, dictId: field.dictId || "" })));
        this.detailVisible = false;
        bridge.setDimensionAssetId(asset.assetId);
        bridge.setPage("维表数据维护");
      }
    }
  };

  const DimensionDataApp = {
    template: `
      <el-config-provider :locale="locale">
        <div class="portal-vue-form-page" v-if="asset">
          <el-page-header class="portal-vue-form-header" title="返回维表管理" :content="asset.cnName + ' · 数据维护'" @back="back"></el-page-header>
          <div class="portal-vue-dim-meta">
            <div><span>表名</span><code class="portal-vue-code">{{ asset.table }}</code></div>
            <div><span>来源</span><strong>{{ asset.maintainMode === "portal" ? "门户新建" : "表管理标记" }}</strong></div>
            <div><span>负责人</span><strong>{{ asset.owner }}</strong></div>
            <div><span>最近维护</span><strong>{{ asset.lastMaintained || "尚未维护" }}</strong></div>
          </div>
          <div class="portal-vue-toolbar" style="padding:0 0 12px">
            <div class="portal-vue-toolbar-left"><span class="portal-vue-muted">带下拉的字段来自「关联字典」配置。默认行只读，点「编辑」后可修改；字段较多超宽时可切换「弹窗编辑」逐字段维护。<template v-if="gatewayLive">当前展示网关模拟数据前 100 行（共 {{ totalRows }} 行），保存后写回网关，AI 分析将使用最新数据。</template></span></div>
            <div class="portal-vue-actions">
              <el-button @click="toggleViewMode">{{ viewMode === "table" ? "⛶ 弹窗编辑" : "▦ 表格编辑" }}</el-button>
              <el-button type="primary" @click="addRow">＋ 新增行</el-button>
            </div>
          </div>
          <el-table v-if="viewMode === 'table'" :data="draftRows" class="portal-vue-table" border empty-text="暂无数据，请新增行">
            <el-table-column v-for="field in editorFields" :key="field.name" min-width="180">
              <template #header>
                <span>{{ field.comment || field.name }}</span>
                <el-tag v-if="field.dictId" size="small" effect="plain" class="portal-vue-field-dict">{{ dictLabel(field) }}</el-tag>
              </template>
              <template #default="scope">
                <template v-if="scope.$index === editingKey">
                  <el-select v-if="field.dictId" v-model="scope.row[field.name]" clearable filterable placeholder="请选择枚举值">
                    <el-option v-for="item in dictItems(field.dictId)" :key="item.code" :label="item.code + ' / ' + item.name" :value="item.code"></el-option>
                  </el-select>
                  <el-input v-else v-model="scope.row[field.name]"></el-input>
                </template>
                <span v-else class="portal-vue-dim-cell">{{ displayValue(scope.row[field.name], field) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right"><template #default="scope">
              <template v-if="scope.$index === editingKey">
                <el-button link type="primary" @click="saveRow">保存</el-button>
                <el-button link @click="cancelRow(scope.$index)">取消</el-button>
              </template>
              <template v-else>
                <el-button link type="primary" @click="editRow(scope.$index)">编辑</el-button>
                <el-button link type="danger" @click="removeRow(scope.$index)">删除</el-button>
              </template>
            </template></el-table-column>
          </el-table>
          <div v-else class="portal-vue-dim-cards">
            <div v-for="(row, index) in draftRows" :key="index" class="portal-vue-dim-card" :class="{ editing: index === editingKey }" v-if="draftRows.length">
              <div class="portal-vue-dim-card-head">
                <strong>#{{ index + 1 }}</strong><span class="portal-vue-muted">{{ summaryOf(row) }}</span>
                <template v-if="index === editingKey">
                  <el-button size="small" type="primary" @click="saveRow">保存</el-button>
                  <el-button size="small" @click="cancelRow(index)">取消</el-button>
                </template>
                <template v-else>
                  <el-button size="small" @click="editRow(index)">编辑</el-button>
                  <el-button size="small" type="danger" plain @click="removeRow(index)">删除</el-button>
                </template>
              </div>
              <div v-if="index === editingKey" class="portal-vue-dim-card-form">
                <div v-for="field in editorFields" :key="field.name" class="portal-vue-alert-field">
                  <label>{{ field.comment || field.name }}<el-tag v-if="field.dictId" size="small" effect="plain" style="margin-left:6px">{{ dictLabel(field) }}</el-tag></label>
                  <el-select v-if="field.dictId" v-model="row[field.name]" clearable filterable placeholder="请选择枚举值">
                    <el-option v-for="item in dictItems(field.dictId)" :key="item.code" :label="item.code + ' / ' + item.name" :value="item.code"></el-option>
                  </el-select>
                  <el-input v-else v-model="row[field.name]"></el-input>
                </div>
              </div>
              <div v-else class="portal-vue-dim-card-grid">
                <div v-for="field in editorFields" :key="field.name" class="portal-vue-dim-card-field">
                  <label>{{ field.comment || field.name }}</label>
                  <span>{{ displayValue(row[field.name], field) }}</span>
                </div>
              </div>
            </div>
            <el-empty v-if="!draftRows.length" description="暂无数据，请新增行"></el-empty>
          </div>
          <div class="portal-vue-form-actions" style="margin-top:16px"><el-button @click="back">取消</el-button><el-button type="primary" @click="save">保存数据</el-button></div>
        </div>
        <el-empty v-else description="未找到要维护的维表"></el-empty>
      </el-config-provider>
    `,
    data: () => ({ draftRows: [], gatewayFields: null, gatewayTotal: 0, gatewayLive: false, saving: false, viewMode: "table", editingKey: null, editBackup: null }),
    computed: {
      asset() { refreshTick.value; return state.assets.find(item => item.assetId === bridge.getDimensionAssetId()) || null; },
      editorFields() { return this.gatewayFields || this.asset?.fields || []; },
      totalRows() { return this.gatewayLive ? this.gatewayTotal : this.draftRows.length; },
      currentUser() { refreshTick.value; return state.users.find(user => user.name === "曾祥竞") || state.users[0]; }
    },
    mounted() { this.pageHandler = event => { if (event.detail?.page === "维表数据维护") this.load(); }; window.addEventListener("portal:page-change", this.pageHandler); this.load(); },
    beforeUnmount() { window.removeEventListener("portal:page-change", this.pageHandler); },
    methods: {
      async load() {
        this.draftRows = (this.asset?.rows || []).map(row => ({ ...row }));
        this.gatewayFields = null; this.gatewayTotal = 0; this.gatewayLive = false;
        const name = this.asset?.cnName;
        if (!name) return;
        try {
          const response = await fetch(`${analysisGatewayBase}/v1/table-rows?name=${encodeURIComponent(name)}`);
          if (!response.ok) return;
          const data = await response.json();
          this.gatewayFields = data.fields || null;
          this.gatewayTotal = data.total || 0;
          this.gatewayLive = true;
          this.draftRows = (data.rows || []).slice(0, 100).map(row => ({ ...row }));
        } catch (error) { /* 网关未启动时使用本地演示数据 */ }
      },
      dictName(dictId) { return state.dictionaries.find(item => item.dictId === dictId)?.name || "字典"; },
      dictLabel(field) {
        const name = this.dictName(field.dictId);
        const title = field.comment || field.name;
        return name === title ? "枚举" : name;
      },
      dictItems(dictId) { return enabledDictItems(state.dictionaries.find(item => item.dictId === dictId)); },
      toggleViewMode() { this.viewMode = this.viewMode === "table" ? "modal" : "table"; this.editingKey = null; this.editBackup = null; },
      displayValue(value, field) {
        if (value === undefined || value === null || value === "") return "—";
        if (field.dictId) {
          const item = this.dictItems(field.dictId).find(item => item.code === value);
          return item ? `${item.code} / ${item.name}` : value;
        }
        return value;
      },
      summaryOf(row) { return this.editorFields.slice(0, 2).map(field => this.displayValue(row[field.name], field)).filter(v => v !== "—").join(" · ") || "空行"; },
      addRow() { this.editingKey = 0; this.editBackup = null; const row = {}; this.editorFields.forEach(field => { row[field.name] = ""; }); this.draftRows.unshift(row); },
      editRow(index) { if (index === this.editingKey) return; this.editingKey = index; this.editBackup = { ...this.draftRows[index] }; },
      saveRow() { this.editingKey = null; this.editBackup = null; },
      cancelRow(index) { if (this.editBackup) { this.draftRows[index] = this.editBackup; } this.editBackup = null; this.editingKey = null; },
      async removeRow(index) { if (!await confirmAction("删除行", "确认删除该行数据？")) return; if (this.editingKey === index) this.editingKey = null; this.draftRows.splice(index, 1); },
      async save() {
        const rows = this.draftRows.map(row => ({ ...row }));
        this.asset.rows = rows.map(row => ({ ...row }));
        this.asset.lastMaintained = new Date().toLocaleString("zh-CN", { hour12: false }).replaceAll("/", "-");
        this.asset.maintainer = this.currentUser?.name || "曾祥竞";
        if (this.gatewayLive) {
          try {
            const response = await fetch(`${analysisGatewayBase}/v1/table-rows/${encodeURIComponent(this.asset.cnName)}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ rows })
            });
            if (!response.ok) throw new Error("保存失败");
            notify(`维表「${this.asset.cnName}」已保存并写回网关，AI 分析将使用最新数据`);
          } catch (error) {
            ep.ElMessage.warning("已保存到页面，但写回网关失败（网关未启动？）");
          }
        } else {
          notify(`维表「${this.asset.cnName}」已保存 ${rows.length} 行`);
        }
        this.back();
      },
      back() { bridge.setPage("维表管理"); }
    }
  };

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

  // 工作台场景卡片由「Skill 配置」驱动：icon/标题/描述/排序均来自 skill 注册表
  const skillScenarioFallback = [
    { id: "single", icon: "📊", title: "单表分析", displayDesc: "趋势、分布与异常", sort: 10 }
  ];

  let analysisSeq = 100;
  function createAnalysisSession(seed) {
    return {
      id: seed?.id || `AN${Date.now()}${analysisSeq += 1}`,
      title: seed?.title || "新的分析",
      channel: seed?.channel || "工作台对话",
      scenario: seed?.scenario || "单表分析",
      status: seed?.status || "进行中",
      time: seed?.time || new Date().toLocaleString("zh-CN", { hour12: false }).replaceAll("/", "-"),
      messages: seed?.messages ? seed.messages.map(msg => ({ ...msg, lines: [...msg.lines], refs: msg.refs ? [...msg.refs] : undefined })) : [],
      suggested: seed?.suggested || false
    };
  }

  const analysisSessionsSeed = [
    createAnalysisSession({
      id: "AN20260831001", title: "近 7 天媒体消耗趋势", channel: "飞书机器人", scenario: "单表分析", status: "已完成", time: "2026-08-31 10:24", suggested: true,
      messages: [
        { role: "user", lines: ["近 7 天各媒体消耗趋势如何？CPA 有没有异常波动？"] },
        { role: "assistant", lines: ["近 7 天总消耗 286.4 万元，环比上涨 12.3%。", "巨量渠道 CPA 上升 18%，主要来自「小说推文」计划组，建议关注。"], refs: ["广告计划日报表"] }
      ]
    }),
    createAnalysisSession({
      id: "AN20260830002", title: "渠道归因相关表与口径", channel: "工作台对话", scenario: "数据资产问答", status: "已完成", time: "2026-08-30 16:51", suggested: true,
      messages: [
        { role: "user", lines: ["有哪些表可以看渠道归因？口径是什么？"] },
        { role: "assistant", lines: ["找到 2 张相关表：「渠道归因明细」（负责人 李雨航）和「广告计划日报表」中 activate_cnt 字段（按归因口径统计）。"], refs: ["渠道归因明细", "广告计划日报表"] }
      ]
    }),
    createAnalysisSession({
      id: "AN20260830001", title: "CPA 环比上涨归因", channel: "飞书机器人", scenario: "归因分析", status: "已完成", time: "2026-08-30 09:12", suggested: true,
      messages: [
        { role: "user", lines: ["本周 CPA 环比上涨的原因是什么？"] },
        { role: "assistant", lines: ["按媒体拆解：巨量贡献 78% 的涨幅；按产品拆解：「网赚-02」产品新上 3 条计划拉高整体成本。"], refs: ["广告计划日报表"] }
      ]
    }),
    createAnalysisSession({
      id: "AN20260829003", title: "tag_value 字段下游影响", channel: "工作台对话", scenario: "数据血缘分析", status: "已完成", time: "2026-08-29 15:40", suggested: true,
      messages: [
        { role: "user", lines: ["如果修改 tag_value 字段长度，会影响哪些下游？"] },
        { role: "assistant", lines: ["下游影响 2 张表：「用户画像标签明细表」API 服务接口、「用户生命周期日报」ETL 任务。建议同步负责人调整。"], refs: ["dwd_user_profile_tag"] }
      ]
    })
  ];

  let analysisReportSeq = 0;
  function createAnalysisReport(seed) {
    return {
      id: seed.id || `RPT${Date.now()}${analysisReportSeq += 1}`,
      title: seed.title,
      scenario: seed.scenario,
      channel: seed.channel || "工作台对话",
      time: seed.time,
      tables: seed.tables || [],
      summary: seed.summary || "",
      model: seed.model || "",
      messages: seed.messages ? seed.messages.map(msg => ({ ...msg, lines: msg.lines ? [...msg.lines] : undefined, refs: msg.refs ? [...msg.refs] : undefined })) : [],
      markdown: seed.markdown || "",
      starred: seed.starred || false
    };
  }

  const analysisReportsSeed = [
    createAnalysisReport({
      id: "RPT20260831001", title: "近 7 天媒体消耗趋势报告", scenario: "单表分析", channel: "飞书机器人", time: "2026-08-31 10:24", tables: ["广告计划日报表"], starred: true,
      summary: "近 7 天总消耗 286.4 万元，环比上涨 12.3%；巨量渠道 CPA 上升 18%，建议关注「小说推文」计划组。",
      messages: [
        { role: "user", lines: ["近 7 天各媒体消耗趋势如何？CPA 有没有异常波动？"] },
        { role: "assistant", lines: ["近 7 天总消耗 286.4 万元，环比上涨 12.3%。", "巨量渠道 CPA 上升 18%，主要来自「小说推文」计划组，建议关注。"], refs: ["广告计划日报表"] }
      ]
    }),
    createAnalysisReport({
      id: "RPT20260830002", title: "CPA 环比上涨归因报告", scenario: "归因分析", channel: "飞书机器人", time: "2026-08-30 09:12", tables: ["广告计划日报表"],
      summary: "按媒体拆解：巨量贡献 78% 的涨幅；按产品拆解：「网赚-02」新上 3 条计划拉高整体成本。",
      messages: [
        { role: "user", lines: ["本周 CPA 环比上涨的原因是什么？"] },
        { role: "assistant", lines: ["按媒体拆解：巨量贡献 78% 的涨幅；按产品拆解：「网赚-02」产品新上 3 条计划拉高整体成本。"], refs: ["广告计划日报表"] }
      ]
    }),
    createAnalysisReport({
      id: "RPT20260829003", title: "tag_value 字段血缘影响报告", scenario: "数据血缘分析", channel: "工作台对话", time: "2026-08-29 15:40", tables: ["用户画像标签明细表"],
      summary: "下游影响 2 张表：「用户画像标签明细表」API 服务、「用户生命周期日报」ETL 任务。",
      messages: [
        { role: "user", lines: ["如果修改 tag_value 字段长度，会影响哪些下游？"] },
        { role: "assistant", lines: ["下游影响 2 张表：「用户画像标签明细表」API 服务接口、「用户生命周期日报」ETL 任务。建议同步负责人调整。"], refs: ["用户画像标签明细表"] }
      ]
    }),
    createAnalysisReport({
      id: "RPT20260828004", title: "渠道归因资产盘点报告", scenario: "数据资产问答", channel: "工作台对话", time: "2026-08-28 11:05", tables: ["渠道归因明细"],
      summary: "渠道归因相关表 2 张，推荐「渠道归因明细」做渠道效果分析，口径见 activate_cnt 字段注释。",
      messages: [
        { role: "user", lines: ["有哪些表可以看渠道归因？"] },
        { role: "assistant", lines: ["找到 2 张相关表：「渠道归因明细」（负责人 李雨航）和「广告计划日报表」中 activate_cnt 字段（按归因口径统计）。"], refs: ["渠道归因明细", "广告计划日报表"] }
      ]
    })
  ];

  const AnalysisWorkbenchApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <div class="portal-vue-ai-layout">
            <aside class="portal-vue-ai-side">
              <button type="button" class="portal-vue-ai-asset-btn" :class="{ active: assetView }" @click="assetView = true">
                <span class="portal-vue-ai-asset-btn-icon">📊</span>
                <span class="portal-vue-ai-asset-btn-text">分析资产</span>
                <el-tag size="small" round effect="plain">{{ reports.length }} 份报告</el-tag>
              </button>
              <el-scrollbar class="portal-vue-ai-session-scroll">
                <div class="portal-vue-ai-sessions">
                  <el-button class="portal-vue-ai-new" type="primary" plain @click="newSession">＋ 新的分析</el-button>
                  <p class="portal-vue-ai-group-label">会话记录 <span>含飞书机器人</span></p>
                  <template v-if="ongoingSessions.length">
                    <article v-for="session in ongoingSessions" :key="session.id" class="portal-vue-ai-session" :class="{ active: session.id === activeId && !assetView }" @click="openSessionFromList(session.id)">
                      <div class="portal-vue-ai-session-top"><strong>{{ session.title }}</strong><time>{{ session.time.slice(5, 16) }}</time></div>
                      <div class="portal-vue-ai-session-meta"><el-tag size="small" :type="session.channel === '飞书机器人' ? 'success' : 'primary'" :effect="session.channel === '飞书机器人' ? 'plain' : 'light'">{{ session.channel }}</el-tag><span>{{ session.scenario }}</span><span class="portal-vue-ai-session-status running">{{ session.status }}</span></div>
                    </article>
                  </template>
                  <article v-for="session in historySessions" :key="session.id" class="portal-vue-ai-session" :class="{ active: session.id === activeId && !assetView }" @click="openSessionFromList(session.id)">
                    <div class="portal-vue-ai-session-top"><strong>{{ session.title }}</strong><time>{{ session.time.slice(5, 16) }}</time></div>
                    <div class="portal-vue-ai-session-meta"><el-tag size="small" :type="session.channel === '飞书机器人' ? 'success' : 'primary'" :effect="session.channel === '飞书机器人' ? 'plain' : 'light'">{{ session.channel }}</el-tag><span>{{ session.scenario }}</span></div>
                  </article>
                  <p v-if="!sessions.length" class="portal-vue-muted">暂无会话</p>
                </div>
              </el-scrollbar>
              <div class="portal-vue-ai-side-summary">
                <div><span>可用数据表</span><strong>{{ myTables.length }} 张</strong></div>
                <div><span>当前模型</span><strong>{{ model || "加载中" }}</strong></div>
              </div>
            </aside>
            <section class="portal-vue-ai-main">
              <div v-if="assetView" class="portal-vue-ai-assets-page">
                <div class="portal-vue-ai-assets-head">
                  <div><h3>分析资产</h3><span class="portal-vue-muted">共 {{ reports.length }} 份分析报告，点击查看详情，右上角可复制链接分享给同事</span></div>
                  <el-button @click="assetView=false">← 返回对话</el-button>
                </div>
                <div class="portal-vue-ai-assets-grid">
                  <article v-for="report in reports" :key="report.id" class="portal-vue-ai-asset-card" @click="openReport(report)">
                    <div class="portal-vue-ai-asset-card-head">
                      <strong>{{ report.title }}</strong>
                      <time>{{ (report.time || "").slice(5, 16) }}</time>
                    </div>
                    <div class="portal-vue-ai-asset-card-tags">
                      <el-tag size="small" :type="report.channel === '飞书机器人' ? 'success' : 'primary'" :effect="report.channel === '飞书机器人' ? 'plain' : 'light'">{{ report.channel }}</el-tag>
                      <el-tag size="small" effect="plain">{{ report.scenario }}</el-tag>
                      <el-tag v-if="report.model" size="small" effect="plain">{{ report.model }}</el-tag>
                    </div>
                    <p class="portal-vue-ai-asset-card-summary">{{ report.summary || (report.markdown || "").slice(0, 80) || "（无摘要）" }}</p>
                    <div v-if="report.tables.length" class="portal-vue-ai-refs"><el-tag v-for="table in report.tables.slice(0, 3)" :key="table" size="small" effect="plain">{{ table }}</el-tag></div>
                  </article>
                  <el-empty v-if="!reports.length" description="暂无分析报告，发起一次分析后自动归档到这里"></el-empty>
                </div>
              </div>
              <div v-else class="portal-vue-ai-scenarios">
                <button v-for="scene in scenarios" :key="scene.key" type="button" class="portal-vue-ai-scenario" :class="{ active: scenario === scene.key }" @click="setScenario(scene.key)">
                  <span class="portal-vue-ai-scene-icon"><img v-if="isImageIcon(scene.icon)" :src="scene.icon" alt="" style="width:17px;height:17px;object-fit:contain" /><span v-else>{{ scene.icon }}</span></span>
                  <span><strong>{{ scene.name }}</strong><small>{{ scene.desc }}</small></span>
                </button>
              </div>
              <div v-if="!assetView" class="portal-vue-ai-chat" ref="chatBox">
                <div v-if="!activeSession.messages.length" class="portal-vue-ai-welcome">
                  <h3>{{ scenarioName }}</h3>
                  <p class="portal-vue-muted">输入问题开始分析，可在输入框用 @ 引用你有权限的数据表；也可以直接在飞书机器人提问，记录同步到这里。</p>
                  <div class="portal-vue-ai-suggests">
                    <el-button v-for="text in suggests" :key="text" size="small" round @click="input = text">{{ text }}</el-button>
                  </div>
                </div>
                <div v-for="(msg, index) in activeSession.messages" :key="index" class="portal-vue-ai-message" :class="msg.role">
                  <div class="portal-vue-ai-bubble" :class="{ 'portal-vue-ai-report': msg.html, 'portal-vue-ai-bubble-streaming': msg.streaming }">
                    <template v-if="msg.reportId"><p v-if="msg.leadMsg" class="portal-vue-ai-report-lead">{{ msg.leadMsg }}</p><div class="portal-vue-ai-report-card">
  <div class="portal-vue-ai-report-card-head"><span class="portal-vue-ai-report-card-file">📄</span><strong class="portal-vue-ai-report-card-title">{{ reportTitleOf(msg.reportId) }}</strong><button type="button" class="portal-vue-ai-report-open-btn" @click.stop="openReportById(msg.reportId)">打开展示所有 ›</button></div>
  <div v-if="reportMarkdownOf(msg.reportId)" class="portal-vue-ai-report-preview"><div class="portal-vue-ai-report-body" v-html="reportMarkdownHtmlOf(msg.reportId)"></div></div>
</div><p v-if="msg.trailMsg" class="portal-vue-ai-report-trail">{{ msg.trailMsg }}</p><p v-if="msg.meta" class="portal-vue-ai-report-meta">{{ msg.meta }}</p></template>
                    <template v-else-if="msg.html"><div class="portal-vue-ai-report-body" v-html="msg.html"></div><p v-if="msg.meta" class="portal-vue-ai-report-meta">{{ msg.meta }}</p></template>
                    <template v-else><p v-for="(line, li) in msg.lines" :key="li">{{ line }}</p><div v-if="msg.refs" class="portal-vue-ai-refs"><el-tag v-for="ref in msg.refs" :key="ref" size="small" effect="plain">{{ ref }}</el-tag></div></template>
                  </div>
                </div>
                <div v-if="thinking" class="portal-vue-ai-message assistant"><div class="portal-vue-ai-bubble"><p class="portal-vue-muted">正在基于你有权限的数据表进行分析…</p></div></div>
              </div>
              <div v-if="!assetView" class="portal-vue-ai-input">
                <div v-if="mentionOpen" class="portal-vue-ai-mention">
                  <div class="portal-vue-ai-mention-head"><span>引用数据表</span><span class="portal-vue-muted">仅限你有权限的 {{ myTables.length }} 张表</span></div>
                  <div class="portal-vue-ai-mention-list">
                    <button v-for="table in mentionTables" :key="table" type="button" @click="insertMention(table)">{{ table }}</button>
                    <p v-if="!mentionTables.length" class="portal-vue-muted">没有匹配的数据表，或当前权限组未配置数据表权限。</p>
                  </div>
                </div>
                <div class="portal-vue-ai-composer">
                  <el-input v-model="input" type="textarea" :rows="2" resize="none" placeholder="输入分析问题，@ 可引用数据表；回车发送" @keydown.enter.native="onEnter" @input="onInput"></el-input>
                  <div class="portal-vue-ai-composer-bar">
                    <el-cascader v-model="activeTablePath" size="small" clearable filterable class="portal-vue-ai-chip-table-cascader" :options="tableCascadeOptions" :show-all-levels="false" placeholder="选择数据表" popper-class="portal-vue-ai-select-popper" @change="changeTablePath"></el-cascader>
                    <el-select v-model="model" size="small" filterable class="portal-vue-ai-chip-model-select" :loading="modelsLoading" :disabled="!models.length" placeholder="请选择" popper-class="portal-vue-ai-select-popper" @change="applyMaxModelSettings">
                      <el-option v-for="item in models" :key="item" :label="item" :value="item"></el-option>
                    </el-select>
                    <el-button type="primary" size="small" class="portal-vue-ai-composer-send" :disabled="!input.trim() || thinking" @click="sendMessage">发送</el-button>
                  </div>
                </div>
              </div>
              </div>

          <el-dialog v-model="reportDialog" width="1100px" top="4vh" :close-on-click-modal="true" class="portal-vue-ai-report-dialog">
<template #header>
              <div style="width:100%">
                <div class="portal-vue-ai-report-dialog-head">
                  <strong>{{ activeReport()?.title || "分析报告" }}</strong>
                  <div class="portal-vue-ai-report-dialog-actions">
                    <el-button size="small" :loading="activeReport()?._sharing" @click="shareReport(activeReport())">{{ activeReport()?._shared ? "已复制链接" : "复制分享链接" }}</el-button>
                    <el-button v-if="activeReport()?.sourceId && findSession(activeReport().sourceId)" size="small" @click="jumpToSource(activeReport())">打开来源会话</el-button>
                  </div>
                </div>
                <div v-if="activeReport()?._shareUrl" class="portal-vue-ai-share-line">
                  <span class="portal-vue-muted">分享链接</span>
                  <el-input :model-value="activeReport()._shareUrl" readonly size="small" class="portal-vue-ai-share-input" @click="selectShareInput">
                    <template #append><el-button @click.stop="copyShareUrl(activeReport())">复制</el-button></template>
                  </el-input>
                </div>
              </div>
            </template>
            <div v-if="activeReport()" class="portal-vue-ai-report-dialog-body">
              <div class="portal-vue-ai-refs" style="margin-bottom:10px">
                <el-tag size="small" :type="activeReport().channel === '飞书机器人' ? 'success' : 'primary'" :effect="activeReport().channel === '飞书机器人' ? 'plain' : 'light'">{{ activeReport().channel }}</el-tag>
                <el-tag size="small" effect="plain">{{ activeReport().scenario }}</el-tag>
                <el-tag v-for="table in activeReport().tables" :key="table" size="small" effect="plain">{{ table }}</el-tag>
                <time style="margin-left:auto;font-size:12px;color:#a5aebd">{{ activeReport().time }}</time>
              </div>
              <p v-if="activeReport().summary" class="portal-vue-ai-report-summary"><span>结论摘要</span>{{ activeReport().summary }}</p>
              <div class="portal-vue-ai-report-dialog-content">
                <div v-if="activeReport().markdown" class="portal-vue-ai-report-body portal-vue-ai-report-dialog-markdown" v-html="reportMarkdownHtml(activeReport())"></div>
                <div v-if="!activeReport().markdown && activeReport().messages.length" v-for="(msg, index) in activeReport().messages" :key="index" class="portal-vue-ai-message" :class="msg.role">
                  <div class="portal-vue-ai-bubble" :class="{ 'portal-vue-ai-report': msg.html }">
                    <template v-if="msg.html"><div class="portal-vue-ai-report-body" v-html="msg.html"></div></template>
                    <template v-else><p v-for="(line, li) in msg.lines" :key="li">{{ line }}</p><div v-if="msg.refs" class="portal-vue-ai-refs"><el-tag v-for="ref in msg.refs" :key="ref" size="small" effect="plain">{{ ref }}</el-tag></div></template>
                  </div>
                </div>
                <p v-if="!activeReport().markdown && !activeReport().messages.length" class="portal-vue-muted">{{ activeReport().summary || "（无内容）" }}</p>
              </div>
            </div>
          </el-dialog>
          <el-dialog v-model="businessLineVisible" title="业务线咨询" width="460px" :close-on-click-modal="false">
            <div class="portal-vue-skill-drawer">
              <p style="margin:0;color:#1f2733;font-size:15px;font-weight:600">{{ activeSkill?.clarification?.question || "你问的是哪个业务线？" }}</p>
              <p class="portal-vue-muted" style="margin:6px 0 14px">确定业务线后，数据查询与指标解答 Skill 会在你有权限的对应表和字段中检索。</p>
              <div style="display:flex;flex-wrap:wrap;gap:10px">
                <el-button v-for="line in businessLineOptions" :key="line" @click="confirmBusinessLine(line)">{{ line }}</el-button>
              </div>
            </div>
          </el-dialog>
            </section>
          </div>
        </section>
      </el-config-provider>
    `,
    data:()=>({
      feishuOpen: false,
      scenario: "data-query",
      input: "",
      thinking: false,
      mentionOpen: false,
      mentionKeyword: "",
      activeTable: "",
      activeTablePath: [],
      businessLineVisible: false,
      pendingQuestion: "",
      models: [],
      modelsLoading: false,
      model: "",
      sessions: analysisSessionsSeed.map(session => createAnalysisSession(session)),
      gatewayTables: [],
      reasoning: "high",
      maxTokens: 1000000,
      defaultModel: "",
      modelLimits: {},
      historyTimer: null,
      historyLastAt: 0,
      reports: analysisReportsSeed.map(report => createAnalysisReport(report)),
      assetView: false,
      reportDialog: false,
      activeReportId: "",
      activeId: analysisSessionsSeed[0]?.id || "",
      suggests: ["近 7 天各媒体消耗趋势如何？", "哪些计划 CPA 超过目标值？", "本周消耗环比上涨的原因是什么？", "有哪些表可以看渠道归因？"]
    }),
    computed:{
      scenarios(){refreshTick.value;return this.skillScenarios;},
      skillScenarios(){
        const source = state.skills?.length ? state.skills : skillScenarioFallback;
        return source.filter(item=>item.id!=="numa-warehouse"&&item.enabled!==false&&item.status!=="已停用").sort((a,b)=>(a.sort||99)-(b.sort||99)).map(item=>({...item,key:item.scenarioKey||item.id,icon:item.icon||"✦",name:item.title||item.name,desc:item.displayDesc||item.desc||""}));
      },
      activeSkill(){return this.skillScenarios.find(item=>item.key===this.scenario);},
      scenarioName(){return this.activeSkill?.name||"单表分析";},
      activeSession(){return this.sessions.find(item => item.id === this.activeId) || this.sessions[0] || { messages: [] };},
      currentUser(){refreshTick.value;return state.users.find(user=>user.name==="曾祥竞")||state.users[0];},
      myTables(){refreshTick.value;return this.gatewayTables.length?this.gatewayTables:this.fallbackTables;},
      fallbackTables(){
        const group=state.groups.find(item=>item.name===this.currentUser?.group);
        if(!group)return[];
        if(group.tables?.includes("全部数据表"))return state.assets.map(table=>table.cnName);
        return group.tables||[];
      },
      mentionTables(){
        const keyword=this.mentionKeyword.trim().toLowerCase();
        return this.myTables.filter(table=>!keyword||table.toLowerCase().includes(keyword));
      },
      bizLineMeta(){
        const meta={};
        state.assets.forEach(table=>{if(table.bizLine)meta[table.cnName]=table.bizLine;});
        return meta;
      },
      tableGroups(){
        const groups=[];
        const lines=[...new Set(this.myTables.map(table=>this.bizLineMeta[table]).filter(Boolean))];
        for(const line of lines){
          const tables=this.myTables.filter(table=>this.bizLineMeta[table]===line);
          if(tables.length)groups.push({name:line,tables});
        }
        const rest=this.myTables.filter(table=>!this.bizLineMeta[table]);
        if(rest.length)groups.push({name:"其他",tables:rest});
        return groups;
      },
      tableCascadeOptions(){return this.tableGroups.map(group=>({value:group.name,label:group.name,children:group.tables.map(table=>({value:table,label:table}))}));},
      businessLineOptions(){return this.activeSkill?.clarification?.options||["存量","权益","保险","短剧","其他"];},
      currentContextLimit(){return this.modelLimits[this.model]||1000000;},
      ongoingSessions(){return this.sessions.filter(item=>item.status==="进行中");},
      historySessions(){return this.sessions.filter(item=>item.status!=="进行中");},
      archivedReports(){refreshTick.value;return this.reports;},
      assetTree(){
        const groups={};
        this.reports.forEach(report=>{
          (groups[report.scenario]=groups[report.scenario]||[]).push(report);
        });
        return Object.entries(groups).map(([scenario,list])=>({
          id:`folder-${scenario}`,label:scenario,type:"scenario",count:list.length,
          children:list.map(report=>({id:report.id,label:report.title,type:"report",reportId:report.id}))
        }));
      }
    },
    mounted(){
      this.pageHandler=event=>{if(event.detail?.page==="灵犀智析"){this.loadGatewaySkills();this.loadMyTables();this.loadModels();this.$nextTick(()=>this.$refs.chatBox?.scrollTo({top:this.$refs.chatBox.scrollHeight}));}};
      window.addEventListener("portal:page-change",this.pageHandler);
      this.loadModels();
      this.loadGatewaySkills();
      this.loadHistory();
    },
    beforeUnmount(){window.removeEventListener("portal:page-change",this.pageHandler);},
    methods:{
      async loadGatewaySkills(){
        try{
          const response=await fetch(`${analysisGatewayBase}/v1/skills`);
          if(!response.ok)return;
          const list=await response.json();
          if(Array.isArray(list)&&list.length){
            state.skills=list.map(entry=>{
              const builtin=skillRegistrySeed.find(item=>item.id===entry.id);
              return builtin?{...entry,name:builtin.name,version:builtin.version,icon:builtin.icon,title:builtin.title,displayDesc:builtin.displayDesc,sort:builtin.sort,scenarioKey:builtin.scenarioKey,desc:builtin.desc,clarification:entry.clarification||builtin.clarification,assetScope:entry.assetScope||builtin.assetScope,responseContract:entry.responseContract||builtin.responseContract,versions:entry.versions||builtin.versions,stats:entry.stats||builtin.stats}:{...entry,versions:entry.versions||[],stats:entry.stats||{calls:0,successRate:"—",avgLatency:"—",tokens:"—"}};
            });
          }
        }catch(error){/* 网关未启动时保留内置注册表 */}
      },
      async loadHistory(){
        try{
          const response=await fetch(`${analysisGatewayBase}/v1/history`);
          if(!response.ok)return;
          const data=await response.json();
          const sessions=Array.isArray(data.sessions)?data.sessions:[];
          const reports=Array.isArray(data.reports)?data.reports:[];
          if(sessions.length){
            this.sessions=sessions.map(s=>createAnalysisSession({
              ...s,
              messages:(s.messages||[]).map(m=>({...m,lines:Array.isArray(m.lines)?[...m.lines]:[],refs:m.refs?[...m.refs]:undefined,streaming:false}))
            }));
            this.sessions.forEach(s=>{if(s.status==="进行中")s.status="已完成";});
            this.activeId=this.sessions[0]?.id||this.activeId;
          }
          if(reports.length){
            this.reports=reports.map(r=>createAnalysisReport({
              ...r,
              messages:(r.messages||[]).map(m=>({...m,lines:Array.isArray(m.lines)?[...m.lines]:undefined,refs:m.refs?[...m.refs]:undefined}))
            }));
          }
          if(!sessions.length&&!reports.length){
            // 首次运行：把内置演示记录一次性写入网关，所有访客看到一致的历史
            this.persistHistory();
          }
        }catch(error){/* 网关未启动时保留本地种子 */}
      },
      persistHistory(){
        clearTimeout(this.historyTimer);
        this.historyTimer=setTimeout(()=>{
          fetch(`${analysisGatewayBase}/v1/history`,{
            method:"PUT",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({sessions:this.sessions.map(s=>({...s,messages:s.messages.map(m=>({...m,streaming:false}))})),reports:this.reports})
          }).catch(()=>{/* 网关未启动时忽略 */});
        },600);
      },
      async loadMyTables(){
        try{
          const user=encodeURIComponent(this.currentUser?.name||"曾祥竞");
          const response=await fetch(`${analysisGatewayBase}/v1/permissions`);
          if(!response.ok)return;
          const data=await response.json();
          const mine=(data.users||[]).find(item=>item.name===this.currentUser?.name);
          if(mine)this.gatewayTables=mine.effectiveTables||[];
        }catch(error){/* 网关未启动时回退到权限组本地数据 */}
      },
      async loadModels(){
        this.modelsLoading=true;
        try{
          const response=await fetch(`${analysisGatewayBase}/v1/models`);
          if(response.ok){const data=await response.json();this.models=data.models||[];this.defaultModel=data.default||this.models[0]||"";if(!this.models.includes(this.model))this.model=this.defaultModel;this.modelLimits={};(data.details||[]).forEach(item=>{this.modelLimits[item.id]=item.contextLimit;});this.applyMaxModelSettings();}
        }catch(error){/* 网关未启动时保持空列表，界面显示提示 */}
        this.modelsLoading=false;
      },
      applyMaxModelSettings(){
        this.reasoning="high";
        this.maxTokens=this.currentContextLimit;
      },
      changeTablePath(path){
        this.activeTable=Array.isArray(path)?path[1]||"":"";
      },
      newSession(){
        this.assetView=false;
        const session=createAnalysisSession({title:"新的分析",scenario:this.scenarioName});
        session.status="进行中";
        this.sessions.unshift(session);
        this.activeId=session.id;
        this.input="";
        this.mentionOpen=false;
        this.persistHistory();
      },
      openSession(id){
        this.activeId=id;
        const session=this.sessions.find(item=>item.id===id);
        if(session)this.scenario=this.skillScenarios.find(scene=>scene.name===session.scenario)?.key||this.skillScenarios[0]?.key||"single";
        this.$nextTick(()=>this.$refs.chatBox?.scrollTo({top:this.$refs.chatBox.scrollHeight}));
      },
      setScenario(key){
        this.scenario=key;
        const session=this.activeSession;
        if(session&&!session.messages.length&&!session.suggested)session.scenario=this.scenarioName;
      },
      isImageIcon(icon){return /^(data:image|https?:|blob:)/i.test(String(icon||""));},
      async removeReport(report){
        if(!await confirmAction("删除报告",`确认从分析资产中删除「${report.title}」？`))return;
        this.reports=this.reports.filter(item=>item.id!==report.id);
        if(this.activeReportId===report.id)this.reportDialog=false;
        notify(`报告「${report.title}」已删除`);
        fetch(`${analysisGatewayBase}/v1/history/report/${encodeURIComponent(report.id)}`,{method:"DELETE"}).catch(()=>{/* 网关未启动忽略 */});
        this.persistHistory();
      },
      findSession(id){return this.sessions.find(item=>item.id===id);},
      openAssets(){this.assetView=true;},
      openReport(report){
        this.activeReportId=report.id;
        this.reportDialog=true;
        // 打开弹窗后自动滚动到正文最底部，方便直接读到报告结尾
        this.$nextTick(()=>{
          const body=document.querySelector(".portal-vue-ai-report-dialog .el-dialog__body");
          if(body)body.scrollTop=body.scrollHeight;
        });
      },
      activeReport(){return this.reports.find(item=>item.id===this.activeReportId);},
      openReportById(reportId){
        const report=this.reports.find(item=>item.id===reportId);
        if(!report){ep.ElMessage.info("该报告不存在或已被删除");return;}
        this.openReport(report);
      },
      reportTitleOf(reportId){
        const report=this.reports.find(item=>item.id===reportId);
        return report?.title?.replace(/ · 报告$/,"")||"分析报告";
      },
      reportMarkdownOf(reportId){
        const report=this.reports.find(item=>item.id===reportId);
        return report?.markdown||"";
      },
      reportMarkdownHtmlOf(reportId){return this.renderMarkdown(this.reportMarkdownOf(reportId));},
      reportMarkdownHtml(report){return this.renderMarkdown(report?.markdown||"");},
      openSessionFromList(id){this.assetView=false;this.openSession(id);},
      async shareReport(report){
        report._sharing=true;
        try{
          const gatewayBase=analysisGatewayBase;
          const response=await fetch(`${gatewayBase}/v1/shares`,{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({
              title:report.title,
              scenario:report.scenario,
              model:report.model||"",
              tablesUsed:report.tables,
              question:(report.messages.find(msg=>msg.role==="user")?.lines||[]).join(" "),
              report:report.markdown||report.messages.filter(msg=>msg.role==="assistant").map(msg=>(msg.lines||[]).join("\n")).filter(Boolean).join("\n\n")||report.summary||"",
              createdBy:this.currentUser?.name||""
            })
          });
          const data=await response.json();
          if(!response.ok)throw new Error(data.error||"生成失败");
          const shareUrl=`${location.origin}${location.pathname}share.html?id=${data.id}`;
          report._shareUrl=shareUrl;
          report._shared=true;
          try{await navigator.clipboard.writeText(shareUrl);}catch(error){/* 无剪贴板权限时用户可从界面手动复制 */}
        }catch(error){
          ep.ElMessage.error(`生成分享链接失败：${error.message}，请确认网关已启动`);
        }
        report._sharing=false;
      },
      async shareChatReport(msg){
        const report=this.reports.find(item=>item.id===msg._reportId);
        if(!report){ep.ElMessage.warning("该报告尚未归档，无法分享");return;}
        msg._sharing=true;
        await this.shareReport(report);
        msg._sharing=false;
        msg._shared=report._shared;
      },
      copyShareUrl(report){
        try{navigator.clipboard.writeText(report._shareUrl);ep.ElMessage.success("分享链接已复制");}catch(error){ep.ElMessage.warning("复制失败，请点击链接手动选择复制");}
      },
      selectShareInput(event){event?.target?.select?.();},
      buildPortalContext(cnNames){
        return cnNames.map(cnName => {
          const asset = state.assets.find(item => item.cnName === cnName);
          if (!asset) return null;
          const dictIds = [...new Set((asset.fields || []).map(field => field.dictId).filter(Boolean))];
          const dictEnums = dictIds.map(dictId => {
            const dict = state.dictionaries.find(item => item.dictId === dictId);
            if (!dict) return null;
            return { name: dict.name, items: enabledDictItems(dict).map(item => item.code + "=" + item.name) };
          }).filter(Boolean);
          const tagTable = state.tables.find(table => table.name === asset.table);
          return {
            cnName: asset.cnName,
            externalName: asset.externalName || "",
            desc: asset.desc || "",
            bizLine: asset.bizLine || "",
            fields: (asset.fields || []).map(field => ({
              name: field.name,
              comment: field.comment || "",
              remark: field.remark || "",
              dict: field.dictId ? (state.dictionaries.find(item => item.dictId === field.dictId)?.name || "") : ""
            })),
            dictEnums,
            tagConfig: tagTable ? { 名称: tagTable.cn || "", 标签字段: tagTable.exportFields || [] } : null,
            dimensionRows: (asset.rows || []).slice(0, 30)
          };
        }).filter(Boolean);
      },
      dictNameById(dictId){ return state.dictionaries.find(item => item.dictId === dictId)?.name || ""; },
      jumpToSource(report){
        const session=report.sourceId?this.findSession(report.sourceId):null;
        if(!session){ep.ElMessage.info("演示数据：来源会话已归档，可在左侧会话记录中查看");return;}
        this.reportDialog=false;
        this.assetView=false;
        this.openSession(session.id);
      },
      toggleStar(report){
        report.starred=!report.starred;
        notify(report.starred?"已收藏":"已取消收藏");
      },
      archiveReport(session,question,reportData,markdownText,liveMsg,meta){
        const report=createAnalysisReport({
          sourceId:session.id,
          title:`${session.title} · 报告`,
          scenario:session.scenario,
          channel:session.channel==="飞书机器人"?"飞书机器人":"工作台对话",
          time:session.time,
          tables:reportData.tablesUsed||[],
          summary:reportData.summary,
          model:meta?.model||"",
          markdown:String(markdownText||""),
          messages:session.messages.filter(msg=>msg.role==="user"||msg.html||msg.lines?.length).map(msg=>({role:msg.role,lines:msg.lines||[],html:msg.html||"",refs:msg.refs}))
        });
        this.reports.unshift(report);
        if(liveMsg)liveMsg.reportId=report.id;
        this.persistHistory();
      },
      onEnter(event){
        if(event.shiftKey)return;
        event.preventDefault();
        this.sendMessage();
      },
      onInput(value){
        const match=String(value||"").match(/@([^@\s]*)$/);
        if(match){this.mentionOpen=true;this.mentionKeyword=match[1];}
        else this.mentionOpen=false;
      },
      insertMention(table){
        this.input=String(this.input||"").replace(/@([^@\s]*)$/,`@${table} `);
        this.mentionOpen=false;
        this.mentionKeyword="";
      },
      tablesForBusinessLine(line){return this.tableGroups.find(group=>group.name===line)?.tables||[];},
      confirmBusinessLine(line){
        const question=this.pendingQuestion;
        this.businessLineVisible=false;
        this.pendingQuestion="";
        this.sendMessage({question,businessLine:line});
      },
      async sendMessage({question:questionOverride="",businessLine=""}={}){
        const question=(questionOverride||this.input).trim();
        if(!question||this.thinking)return;
        const explicitlyReferenced=this.myTables.some(table=>question.includes(`@${table}`))||!!this.activeTable;
        if(this.activeSkill?.clarification?.enabled&&!explicitlyReferenced&&!businessLine){
          this.pendingQuestion=question;
          this.businessLineVisible=true;
          return;
        }
        const assetCandidates=businessLine?this.tablesForBusinessLine(businessLine):[];
        let session=this.activeSession;
        if(!session.id||session.suggested){
          session=createAnalysisSession({title:question.slice(0,18)||"新的分析",scenario:this.scenarioName});
          this.sessions.unshift(session);
          this.activeId=session.id;
        }
        const mentionedTables=[...new Set([...this.myTables.filter(table=>question.includes(`@${table}`)),...(this.activeTable?[this.activeTable]:[])])];
        const evidenceTables=assetCandidates.length?assetCandidates:mentionedTables;
        session.messages.push({role:"user",lines:[question],refs:evidenceTables.length?evidenceTables:undefined});
        session.title=session.title==="新的分析"?question.slice(0,18):session.title;
        this.input="";
        this.mentionOpen=false;
        this.thinking=true;
        this.persistHistory();
        const gatewayAvailable=this.models.length>0;
        if(!gatewayAvailable){
          await new Promise(resolve=>setTimeout(resolve,700));
          this.thinking=false;
          session.status="已完成";
          session.time=new Date().toLocaleString("zh-CN",{hour12:false}).replaceAll("/","-");
          const lines=this.myTables.length
            ?["本地分析网关未启动（scripts/analysis-gateway.cjs），当前为原型演示回复。","启动方式：RELAY_API_KEY=<中转站Key> node scripts/analysis-gateway.cjs，刷新后即可获得真实分析报告。"]
            :["当前权限组未配置数据表权限，无法发起分析，请联系管理员在「权限组 → 数据表权限」中授权。"];
          session.messages.push({role:"assistant",lines:businessLine?[`已按「${businessLine}」业务线筛选 ${assetCandidates.length} 张可检索数据表。`,...lines]:lines,refs:(evidenceTables.length?evidenceTables:this.myTables).slice(0,3)});
          return this.$nextTick(()=>{this.$refs.chatBox?.scrollTo({top:this.$refs.chatBox.scrollHeight,behavior:"smooth"});});
        }
        try{
          const response=await fetch(`${analysisGatewayBase}/v1/analyze`,{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({user:this.currentUser?.name||"曾祥竞",question,scenario:this.scenario,skillId:this.activeSkill?.id||"",tables:mentionedTables,assetCandidates,businessLine,model:this.model,reasoningEffort:this.reasoning,maxTokens:this.maxTokens,stream:true,portalContext:this.buildPortalContext(evidenceTables)})
          });
          const contentType=response.headers.get("content-type")||"";
          if(!response.ok||(contentType.includes("application/json")&&!contentType.includes("event-stream"))){
            const data=await response.json().catch(()=>({}));
            session.status="已完成";
            session.time=new Date().toLocaleString("zh-CN",{hour12:false}).replaceAll("/","-");
            session.messages.push({role:"assistant",lines:[`分析失败：${data.error||"未知错误"}`]});
            this.persistHistory();
          }else{
            const live={role:"assistant",lines:[""],streaming:true};
            session.messages.push(live);
            const liveMsg=session.messages[session.messages.length-1];
            const reader=response.body.getReader();
            const decoder=new TextDecoder();
            let buffer="",full="",meta=null,errorMsg="",reasoningText="";
            const idleTimeoutMs=45000, textIdleMs=60000;
            let lastDataAt=Date.now(), lastTextAt=Date.now();
            const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
            while(true){
              const elapsedData=Date.now()-lastDataAt;
              if(elapsedData>idleTimeoutMs){errorMsg="连接空闲超时（45s 无数据），模型响应中断，请重试";break;}
              if((full||reasoningText)&&Date.now()-lastTextAt>textIdleMs){errorMsg="模型输出停滞（60s 无新内容），请重试";break;}
              let chunk;
              try{
                chunk=await Promise.race([
                  reader.read(),
                  wait(Math.min(idleTimeoutMs-elapsedData, textIdleMs))
                ]);
              }catch(err){errorMsg="模型响应中断，请重试";break;}
              if(!chunk)continue;
              const {done,value}=chunk;
              if(done)break;
              lastDataAt=Date.now();
              buffer+=decoder.decode(value,{stream:true});
              const parts=buffer.split("\n\n");
              buffer=parts.pop();
              for(const part of parts){
                const line=part.trim();
                if(!line.startsWith("data:")||line==="# hb")continue;
                let evt;try{evt=JSON.parse(line.slice(5).trim());}catch(err){continue;}
                if(evt.delta){
                  this.thinking=false;
                  lastTextAt=Date.now();
                  full+=evt.delta;
                  // 流式中按 markdown 渲染，换行/列表/标题即时生效，避免整段文本挤在一起
                  liveMsg.html=this.renderMarkdown(full);
                  liveMsg.lines=[];
                  if(Date.now()-this.historyLastAt>5000){this.historyLastAt=Date.now();this.persistHistory();}
                  this.$nextTick(()=>{const box=this.$refs.chatBox;if(box)box.scrollTop=box.scrollHeight;});
                }
                if(evt.reasoning){
                  this.thinking=false;
                  lastTextAt=Date.now();
                  reasoningText+=evt.reasoning;
                  if(!full)liveMsg.lines=["🤔 思考中："+reasoningText.slice(-80)];
                  if(Date.now()-this.historyLastAt>5000){this.historyLastAt=Date.now();this.persistHistory();}
                  this.$nextTick(()=>{const box=this.$refs.chatBox;if(box)box.scrollTop=box.scrollHeight;});
                }
                if(evt.done)meta=evt.meta||{};
                if(evt.error)errorMsg=evt.error;
              }
            }
            this.thinking=false;
            liveMsg.streaming=false;
            session.status="已完成";
            session.time=new Date().toLocaleString("zh-CN",{hour12:false}).replaceAll("/","-");
            if(errorMsg&&!full){
              session.messages.splice(session.messages.indexOf(liveMsg),1,{role:"assistant",lines:[`分析失败：${errorMsg}`]});
            }else{
              // 上下总结：取自报告首两行（lead）与末尾要点（trail），报告本体只以超链形式置于中间
              const allLines=String(full).split(/\r?\n/).map(line=>line.replace(/[#*`|>]/g,"").trim()).filter(Boolean);
              const lead=allLines.slice(0,2).join("；").slice(0,120);
              const trail=(allLines.slice(2).map(line=>line.replace(/^[-•\d、.\s]+/,"").trim()).filter(line=>line.length>6&&!line.startsWith("证据限制")&&!line.includes("证据限制")).pop()||"分析详情、指标口径与上下游血缘见报告全文。").slice(0,80);
              const isReport=!errorMsg&&full.trim().length>=80;
              liveMsg.meta=this.buildMetaLine(meta||{})+(errorMsg?` · ⚠️ ${errorMsg}`:"");
              if(isReport){
                // 真正的分析报告：消息上下总结 + 中间报告超链，归档到分析资产
                liveMsg.html="";
                liveMsg.lines=[];
                liveMsg.leadMsg=lead;
                liveMsg.trailMsg=trail;
                this.archiveReport(session,question,{tablesUsed:meta?.tablesUsed||[],summary:lead},full,liveMsg,meta);
              }else{
                // 非报告的回答（过短/中断/普通问答）：不归档，直接在聊天区展示内容
                liveMsg.html=this.renderMarkdown(full);
                liveMsg.lines=[];
              }
            }
          }
        }catch(error){
          this.thinking=false;
          session.status="已完成";
          session.messages.push({role:"assistant",lines:[`分析请求失败：${error.message}。请确认本地网关已启动（node scripts/analysis-gateway.cjs）。`]});
          this.persistHistory();
        }
        this.$nextTick(()=>{this.$refs.chatBox?.scrollTo({top:this.$refs.chatBox.scrollHeight,behavior:"smooth"});});
        this.$nextTick(()=>{this.$refs.chatBox?.scrollTo({top:this.$refs.chatBox.scrollHeight,behavior:"smooth"});});
      },
      buildMetaLine(meta){
        let line=`${meta.scenario||""} · ${meta.model||""} · 推理 ${meta.reasoningEffort||"default"}${meta.maxTokens?` · 上下文 ${meta.maxTokens>=1024?Math.round(meta.maxTokens/1024)+"K":meta.maxTokens}`:""} · 引用表 ${(meta.tablesUsed||[]).join("、")||"—"} · 耗时 ${((meta.latencyMs||0)/1000).toFixed(1)}s${meta.usage?` · tokens ${meta.usage.total_tokens}`:""}`;
        if(meta.warning)line+=` · ⚠️ ${meta.warning}`;
        if(meta.deniedTables?.length)line+=` · 无权限表 ${meta.deniedTables.join("、")}`;
        return line;
      },
      renderMarkdown(markdown){
        const escape=value=>String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        const lines=String(markdown).split(/\r?\n/);
        let html="",inCode=false,inTable=false,inList=false,inMermaid=false,mermaidLines=[];
        const inline=value=>escape(value)
          .replace(/`([^`]+)`/g,"<code>$1</code>")
          .replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>");
        const closeList=()=>{if(inList){html+="</ul>";inList=false;}};
        const closeTable=()=>{if(inTable){html+="</tbody></table>";inTable=false;}};
        lines.forEach(raw=>{
          const line=raw.trimEnd();
          if(/^```/.test(line)){
            closeList();closeTable();
            if(inCode){
              if(inMermaid){html+="</div>";inMermaid=false;}else{html+="</code></pre>";}
              inCode=false;
            }else{
              const next=(lines[lines.indexOf(line)+1]||"");
              if(/^mermaid/i.test(next)&&(next.includes("flowchart")||next.includes("graph"))){html+='<div class="portal-vue-mermaid" data-mermaid="1">';inMermaid=true;inCode=true;mermaidLines=[];lines.indexOf(line);return;}
              html+='<pre><code>';inCode=true;
            }
            return;
          }
          if(inMermaid){mermaidLines.push(raw);return;}
          if(inCode){html+=escape(raw)+"\n";return;}
          if(/^\|.*\|$/.test(line)){
            const cells=line.replace(/^\||\|$/g,"").split("|");
            if(cells.every(cell=>/^\s*:?-{2,}:?\s*$/.test(cell)))return;
            if(!inTable){html+='<table class="portal-vue-ai-report-table"><tbody>';inTable=true;}
            html+="<tr>"+cells.map((cell,index)=>`<${inTable&&html.endsWith("<tbody>")?"th":"td"}>${inline(cell.trim())}</${inTable&&html.endsWith("<tbody>")?"th":"td"}>`).join("")+"</tr>";
            return;
          }
          closeTable();
          if(/^#{1,4}\s/.test(line)){closeList();const level=line.match(/^#+/)[0].length;html+=`<h${level+2}>${inline(line.replace(/^#+\s*/,""))}</h${level+2}>`;return;}
          if(/^[-*]\s/.test(line)){if(!inList){html+="<ul>";inList=true;}html+=`<li>${inline(line.replace(/^[-*]\s*/,""))}</li>`;return;}
          if(/^\d+\.\s/.test(line)){closeList();html+=`<p class="portal-vue-ai-report-ol">${inline(line)}</p>`;return;}
          closeList();
          if(!line.trim())return;
          html+=`<p>${inline(line)}</p>`;
        });
        closeList();closeTable();
        if(inCode)html+="</code></pre>";
        if(inMermaid)html+=this.renderMermaidSvg(mermaidLines.join("\n"));
        return html;
      },
      renderMermaidSvg(source){
        const esc=value=>String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        const nodeDefs={};
        const edgeRe=/(\w+)\s*-{2,}>\s*(?:\|([^|]*)\|\s*)?(\w+)/g;
        const nodeRe=/(\w+)\s*(?:[\[\(]([^\]\)]+)[\]\)])?/g;
        let direction="LR";
        const bodyLines=[];
        source.split(/\r?\n/).forEach(line=>{
          const t=line.trim();
          if(/^flowchart\b/i.test(t)||/^graph\b/i.test(t)){const m=t.match(/\b(TB|TD|LR|RL|BT)\b/i);if(m)direction=m[1].toUpperCase();return;}
          if(!t||/^%%/.test(t))return;
          bodyLines.push(t);
        });
        const text=bodyLines.join("\n");
        let m;
        while((m=nodeRe.exec(text))){const id=m[1];if(!nodeDefs[id]&&!/^(flowchart|graph)$/i.test(id))nodeDefs[id]={id,label:id};}
        while((m=edgeRe.exec(text))){
          const from=m[1],to=m[3],label=(m[2]||"").trim();
          if(!nodeDefs[from])nodeDefs[from]={id:from,label:from};
          if(!nodeDefs[to])nodeDefs[to]={id:to,label:to};
          nodeDefs[from].edges=nodeDefs[from].edges||[];
          nodeDefs[from].edges.push({to,label});
        }
        const nodes=Object.values(nodeDefs);
        if(!nodes.length)return '<pre><code>'+esc(source)+'</code></pre>';
        const incoming={},outgoing={};
        nodes.forEach(n=>(n.edges||[]).forEach(e=>{incoming[e.to]=(incoming[e.to]||0)+1;outgoing[n.id]=(outgoing[n.id]||0)+1;}));
        const column=n=>{const i=incoming[n.id]||0,o=outgoing[n.id]||0;if(i===0)return 0;if(o===0)return 2;return 1;};
        const cols=[[],[],[]];
        nodes.forEach(n=>cols[column(n)].push(n));
        const nodeW=150,nodeH=44,gapX=60,gapY=26;
        const colX=[20,20+nodeW+gapX,20+2*(nodeW+gapX)];
        const maxRows=Math.max(...cols.map(c=>c.length),1);
        const width=20*3+nodeW*3+gapX*2;
        const height=Math.max(maxRows*(nodeH+gapY)+20,140);
        const pos={};
        cols.forEach((col,ci)=>col.forEach((n,ri)=>{
          const colHeight=col.length*(nodeH+gapY)-gapY;
          const startY=(height-colHeight)/2;
          pos[n.id]={x:colX[ci],y:startY+ri*(nodeH+gapY)};
        }));
        const colors=["#1677ff","#13a8a8","#7c3aed","#d97706","#35805b"];
        let svg=`<div class="portal-vue-mermaid-figure"><div class="portal-vue-mermaid-title">血缘图（${direction==="LR"?"从左到右":"从上到下"} · ${nodes.length} 个节点）</div>`;
        svg+=`<svg viewBox="0 0 ${width} ${height}" style="width:100%;height:auto">`;
        nodes.forEach(n=>{
          (n.edges||[]).forEach(e=>{
            const a=pos[n.id],b=pos[e.to];
            if(!a||!b)return;
            const x1=a.x+nodeW,y1=a.y+nodeH/2,x2=b.x,y2=b.y+nodeH/2;
            const mx=(x1+x2)/2;
            svg+=`<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="#9db8e8" stroke-width="1.5" marker-end="url(#arrow)"/>`;
            if(e.label)svg+=`<text x="${mx}" y="${(y1+y2)/2-6}" text-anchor="middle" font-size="11" fill="#6b7280">${esc(e.label)}</text>`;
          });
        });
        svg+=`<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#9db8e8"/></marker></defs>`;
        nodes.forEach((n,ni)=>{
          const p=pos[n.id];
          const color=colors[ni%colors.length];
          svg+=`<g><rect x="${p.x}" y="${p.y}" width="${nodeW}" height="${nodeH}" rx="8" fill="#fff" stroke="${color}" stroke-width="1.5"/><text x="${p.x+nodeW/2}" y="${p.y+nodeH/2+4}" text-anchor="middle" font-size="12" fill="#1f2733">${esc(n.label).slice(0,14)}</text></g>`;
        });
        svg+="</svg></div>";
        return svg;
      }
    }
  };

  const DictionaryManagementApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <el-tabs v-model="status" class="portal-vue-status-tabs" @tab-change="page=1"><el-tab-pane label="启用中" name="启用"></el-tab-pane><el-tab-pane label="已停用" name="停用"></el-tab-pane></el-tabs>
          <div class="portal-vue-toolbar">
            <div class="portal-vue-toolbar-left"><el-input v-model="keyword" class="portal-vue-search" clearable placeholder="搜索字典名称、编码" @input="page=1"></el-input></div>
            <el-button type="primary" @click="openForm(null)">新增字典</el-button>
          </div>
          <el-table :data="pagedRows" class="portal-vue-table" border empty-text="暂无字典">
            <el-table-column prop="dictId" label="字典编号" width="110" fixed="left"></el-table-column>
            <el-table-column prop="code" label="字典编码" width="150"><template #default="scope"><code class="portal-vue-code">{{ scope.row.code }}</code></template></el-table-column>
            <el-table-column prop="name" label="字典名称" width="160"><template #default="scope"><span class="portal-vue-name">{{ scope.row.name }}</span></template></el-table-column>
            <el-table-column prop="desc" label="说明" min-width="240" show-overflow-tooltip></el-table-column>
            <el-table-column label="枚举值数" width="100" align="right"><template #default="scope">{{ scope.row.items.length }}</template></el-table-column>
            <el-table-column label="被引用" width="128"><template #default="scope"><el-tooltip v-if="refList(scope.row).length" placement="left" :show-after="200" :hide-after="80" popper-class="portal-vue-ref-tooltip"><template #content><p v-for="item in refList(scope.row)" :key="item.key">{{ item.line }}</p></template><span class="portal-vue-ref-trigger">被 {{ refList(scope.row).length }} 处引用</span></el-tooltip><span v-else class="portal-vue-muted">—</span></template></el-table-column>
            <el-table-column prop="owner" label="负责人" width="110"></el-table-column>
            <el-table-column prop="updatedAt" label="更新时间" width="170"></el-table-column>
            <el-table-column label="状态" width="86" align="center"><template #default="scope"><el-switch :model-value="scope.row.status==='启用'" @change="value=>toggleStatus(scope.row,value)"></el-switch></template></el-table-column>
            <el-table-column label="操作" width="180" fixed="right"><template #default="scope"><div class="portal-vue-actions"><el-button link type="primary" @click="openItems(scope.row)">维护枚举值</el-button><el-button link type="primary" @click="openForm(scope.row)">编辑</el-button></div></template></el-table-column>
          </el-table>
          <div class="portal-vue-pagination"><span>共 {{ filteredRows.length }} 条，当前 {{ rangeText }}</span><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,20,50]" :total="filteredRows.length" layout="sizes, prev, pager, next"></el-pagination></div>
        </section>
        <el-dialog v-model="formVisible" :title="editing ? '编辑字典' : '新增字典'" width="560px">
          <el-form class="portal-vue-dialog-form" label-position="top">
            <el-form-item label="字典编码" required><el-input v-model="form.code" :disabled="!!editing" placeholder="例如：media_source"></el-input></el-form-item>
            <el-form-item label="字典名称" required><el-input v-model="form.name" placeholder="例如：媒体来源"></el-input></el-form-item>
            <el-form-item label="负责人" required><el-select v-model="form.owner" filterable><el-option v-for="user in activeUsers" :key="user.name" :label="user.name" :value="user.name"></el-option></el-select></el-form-item>
            <el-form-item label="说明"><el-input v-model="form.desc" type="textarea" :rows="3"></el-input></el-form-item>
          </el-form>
          <template #footer><el-button @click="formVisible=false">取消</el-button><el-button type="primary" @click="saveForm">保存</el-button></template>
        </el-dialog>
        <el-drawer v-model="itemVisible" :title="current ? current.name + ' · 维护枚举值' : '维护枚举值'" size="680px" class="tag-enum-drawer" :close-on-click-modal="true">
          <div v-if="current" class="tag-enum-drawer-form">
            <p class="portal-vue-muted">枚举编码需唯一。表字段关联本字典后，维护数据时按编码转成中文。</p>
            <div class="tag-enum-list" style="margin-top:16px">
              <div v-for="(item,index) in draftItems" :key="index" class="portal-vue-dict-row">
                <span class="tag-enum-row-index">{{ index + 1 }}</span>
                <el-input v-model="item.code" placeholder="编码"></el-input>
                <el-input v-model="item.name" placeholder="中文名"></el-input>
                <el-switch v-model="item.enabled" inline-prompt active-text="启用" inactive-text="停用"></el-switch>
                <el-button text type="danger" :disabled="draftItems.length===1" @click="removeItem(index)">×</el-button>
              </div>
            </div>
            <el-button class="tag-enum-add" @click="draftItems.push({code:'',name:'',sort:draftItems.length+1,enabled:true})">添加枚举值</el-button>
          </div>
          <template #footer><el-button @click="itemVisible=false">取消</el-button><el-button type="primary" @click="saveItems">保存枚举值</el-button></template>
        </el-drawer>
      </el-config-provider>
    `,
    data: () => ({ status: "启用", keyword: "", page: 1, pageSize: 10, formVisible: false, editing: null, form: {}, itemVisible: false, current: null, draftItems: [] }),
    computed: {
      activeUsers() { return state.users.filter(user => user.status !== "已停用"); },
      filteredRows() { refreshTick.value; const keyword = this.keyword.trim().toLowerCase(); return state.dictionaries.filter(item => item.status === this.status && (!keyword || `${item.code} ${item.name}`.toLowerCase().includes(keyword))); },
      pagedRows() { const result = paginate(this.filteredRows, this.page, this.pageSize); if (result.safePage !== this.page) this.page = result.safePage; return result.rows; },
      rangeText() { if (!this.filteredRows.length) return "0-0"; return `${(this.page-1)*this.pageSize+1}-${Math.min(this.page*this.pageSize,this.filteredRows.length)}`; }
    },
    mounted() { this.primaryHandler = event => { if (event.detail?.page === "字典管理") this.openForm(null); }; window.addEventListener("portal:primary-action", this.primaryHandler); },
    beforeUnmount() { window.removeEventListener("portal:primary-action", this.primaryHandler); },
    methods: {
      refList(dict) {
        refreshTick.value;
        const rows = [];
        state.assets.forEach(asset => {
          (asset.fields || []).forEach(field => {
            if (field.dictId !== dict.dictId) return;
            rows.push({
              key: `${asset.assetId || asset.table}.${field.name}`,
              line: `${asset.cnName || asset.table}（${asset.table}） / ${field.comment || field.name}（${field.name}）`
            });
          });
        });
        return rows;
      },
      refCount(dict) { return this.refList(dict).length; },
      openForm(dict) { this.editing = dict; this.form = dict ? { code: dict.code, name: dict.name, owner: dict.owner, desc: dict.desc } : { code: "", name: "", owner: "曾祥竞", desc: "" }; this.formVisible = true; },
      saveForm() {
        if (![this.form.code, this.form.name, this.form.owner].every(value => String(value).trim())) return ep.ElMessage.warning("请补全字典必填信息");
        if (!/^[a-z]+(?:_[a-z0-9]+)*$/.test(this.form.code.trim())) return ep.ElMessage.warning("字典编码仅支持小写字母、数字与下划线");
        if (!this.editing && state.dictionaries.some(item => item.code === this.form.code.trim())) return ep.ElMessage.warning("字典编码已存在");
        if (this.editing) Object.assign(this.editing, { name: this.form.name.trim(), owner: this.form.owner, desc: this.form.desc.trim(), updatedAt: "2026-08-28 16:40" });
        else state.dictionaries.unshift({ dictId: `DICT${String(state.dictionaries.length + 1).padStart(3, "0")}`, code: this.form.code.trim(), name: this.form.name.trim(), desc: this.form.desc.trim(), owner: this.form.owner, status: "启用", updatedAt: "2026-08-28 16:40", items: [{ code: "", name: "", sort: 1, enabled: true }] });
        this.formVisible = false; notify(this.editing ? "字典已保存" : "字典已新增");
      },
      openItems(dict) { this.current = dict; this.draftItems = dict.items.map(item => ({ ...item, enabled: item.enabled !== false })); this.itemVisible = true; },
      async removeItem(index) { if (!await confirmAction("删除枚举值", "确认删除该枚举值？")) return; this.draftItems.splice(index, 1); },
      async toggleStatus(dict, enabled) {
        const refs = this.refCount(dict);
        if (!enabled && refs) {
          if (!await confirmAction("停用字典", `「${dict.name}」仍被 ${refs} 处引用，确认停用？停用后这些字段将无法继续转中文。`)) return;
        } else if (!await confirmAction(enabled ? "启用字典" : "停用字典", `确认${enabled ? "启用" : "停用"}「${dict.name}」？`)) return;
        dict.status = enabled ? "启用" : "停用";
        dict.updatedAt = "2026-08-28 16:40";
        notify(`字典已${dict.status}`);
      },
      saveItems() {
        const items = this.draftItems.filter(item => item.code.trim() && item.name.trim()).map((item, index) => ({ code: item.code.trim(), name: item.name.trim(), sort: index + 1, enabled: item.enabled !== false }));
        if (!items.length) return ep.ElMessage.warning("请至少保留 1 个有效枚举值");
        const codes = items.map(item => item.code);
        if (new Set(codes).size !== codes.length) return ep.ElMessage.warning("编码不能重复");
        this.current.items.splice(0, this.current.items.length, ...items);
        this.current.updatedAt = "2026-08-28 16:40";
        this.itemVisible = false; notify(`字典「${this.current.name}」枚举值已更新`);
      }
    }
  };

  const NoPermissionApp = {
    template:`<el-config-provider :locale="locale"><el-result icon="warning" title="暂无访问权限" sub-title="当前飞书账号尚未分配门户权限组，请联系管理员处理。"><template #extra><el-button type="primary" @click="logout">退出系统</el-button></template></el-result></el-config-provider>`,
    methods:{logout(){document.getElementById("portalApp").classList.remove("no-permission-mode");document.getElementById("portalApp").classList.add("hidden");document.getElementById("loginView").classList.remove("hidden");}}
  };

  const menuTreeSeed = [
    { id: "M100", name: "数据看板", icon: "pie", sort: 100, path: "/data-board/index", cache: true, permission: "data_board", children: [] },
    {
      id: "M300", name: "数据资产", icon: "asset", sort: 300, path: "/data-asset", cache: true, permission: "data_asset",
      children: [
        { id: "M310", name: "看板管理", icon: "--", sort: 10, path: "/board-management/index", cache: true, permission: "board_management", children: [] },
        { id: "M320", name: "表管理", icon: "--", sort: 20, path: "/data-asset/table-management/index", cache: true, permission: "table_management", children: [] }
      ]
    },
    {
      id: "M500", name: "数据服务", icon: "service", sort: 500, path: "/data-service", cache: true, permission: "data_service",
      children: [
        { id: "M510", name: "开放 API", icon: "--", sort: 10, path: "/data-service/api-config/index", cache: true, permission: "api_config", children: [] }
      ]
    },
    {
      id: "M900", name: "权限管理", icon: "permission", sort: 900, path: "/privilege", cache: true, permission: "privilege_management",
      children: [
        { id: "M910", name: "用户管理", icon: "--", sort: 10, path: "/privilege/user-management/index", cache: true, permission: "user_management", children: [] },
        { id: "M920", name: "权限组", icon: "--", sort: 20, path: "/privilege/permission-group/index", cache: true, permission: "permission_group", children: [] }
      ]
    },
    {
      id: "M1000", name: "系统管理", icon: "system", sort: 10000, path: "/system", cache: true, permission: "system_management",
      children: [
        { id: "M1010", name: "菜单管理", icon: "--", sort: 10, path: "/system/menu-management/index", cache: true, permission: "system_menu_management", children: [] },
        { id: "M1030", name: "模型配置", icon: "--", sort: 30, path: "/system/model-config/index", cache: true, permission: "system_model_config", children: [] },
        { id: "M1020", name: "Skill 配置", icon: "--", sort: 20, path: "/system/skill-management/index", cache: true, permission: "system_skill_management", children: [] }
      ]
    }
  ];

  const menuIcons = ["pie", "asset", "service", "permission", "system", "analysis", "push"];

  const ModelConfigApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <div class="portal-vue-toolbar">
            <div class="portal-vue-toolbar-left"><el-input v-model="keyword" class="portal-vue-search" clearable placeholder="搜索模型名称"></el-input></div>
            <div><el-button :loading="loading" @click="load">刷新</el-button></div>
          </div>
          <el-table :data="filteredRows" class="portal-vue-table" border empty-text="网关未连接或中转站不可达">
            <el-table-column prop="id" label="模型" min-width="220"><template #default="scope"><code class="portal-vue-code">{{ scope.row.id }}</code></template></el-table-column>
            <el-table-column label="状态" width="110"><template #default="scope"><el-tag :type="scope.row.enabled ? 'success' : 'info'" effect="light">{{ scope.row.enabled ? "可用" : "已禁用" }}</el-tag></template></el-table-column>
            <el-table-column label="禁用时间" width="180"><template #default="scope">{{ scope.row.disabledAt ? scope.row.disabledAt.slice(0, 16).replace("T", " ") : "—" }}</template></el-table-column>
            <el-table-column label="操作" width="130" fixed="right"><template #default="scope"><el-switch :model-value="scope.row.enabled" inline-prompt active-text="启用" inactive-text="禁用" @change="value=>toggleModel(scope.row, value)"></el-switch></template></el-table-column>
          </el-table>
          <div class="portal-vue-muted" style="margin-top:12px">禁用后模型立即从灵犀智析的下拉框隐藏，进行中的分析不受影响；配置保存在网关数据卷，重启不丢失。</div>
        </section>
      </el-config-provider>
    `,
    data:()=>({models:[],keyword:"",loading:false}),
    computed:{
      filteredRows(){const keyword=this.keyword.trim().toLowerCase();return this.models.filter(item=>!keyword||item.id.toLowerCase().includes(keyword));}
    },
    mounted(){this.pageHandler=event=>{if(event.detail?.page==="模型配置")this.load();};window.addEventListener("portal:page-change",this.pageHandler);this.load();},
    beforeUnmount(){window.removeEventListener("portal:page-change",this.pageHandler);},
    methods:{
      async load(){
        this.loading=true;
        try{
          const response=await fetch(`${analysisGatewayBase}/v1/model-config`);
          if(response.ok){const data=await response.json();this.models=data.models||[];}
        }catch(error){this.models=[];}
        this.loading=false;
      },
      async toggleModel(row,value){
        await this.putConfig(row.id,{enabled:value});
        row.enabled=value;
        row.disabledAt=value?"":new Date().toISOString();
        notify(`模型「${row.id}」已${value?"启用":"禁用"}`);
      },
      async putConfig(modelId,body){
        try{
          const response=await fetch(`${analysisGatewayBase}/v1/model-config/${encodeURIComponent(modelId)}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
          if(!response.ok)ep.ElMessage.error("保存失败，请确认网关已启动");
        }catch(error){ep.ElMessage.error("保存失败，请确认网关已启动");}
      }
    }
  };

  const MenuManagementApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <div class="portal-vue-toolbar">
            <div class="portal-vue-toolbar-left"><el-button type="primary" @click="openForm(null, null)">＋ 添加</el-button></div>
          </div>
          <el-table :data="treeRows" row-key="id" :tree-props="{ children: 'children' }" default-expand-all class="portal-vue-table" border empty-text="暂无菜单">
            <el-table-column label="菜单显示名称" min-width="220"><template #default="scope"><span :class="{ 'portal-vue-name': !scope.row.parentId }">{{ scope.row.name }}</span></template></el-table-column>
            <el-table-column label="图标" width="80" align="center"><template #default="scope"><el-icon v-if="scope.row.icon !== '--'" :size="16"><span>{{ iconGlyph(scope.row.icon) }}</span></el-icon><span v-else class="portal-vue-muted">--</span></template></el-table-column>
            <el-table-column prop="sort" label="排序" width="90" align="center"></el-table-column>
            <el-table-column prop="path" label="组件路径" min-width="240"><template #default="scope"><code class="portal-vue-code">{{ scope.row.path }}</code></template></el-table-column>
            <el-table-column label="缓冲" width="90" align="center"><template #default="scope"><el-switch :model-value="scope.row.cache" @change="value=>toggleCache(scope.row,value)"></el-switch></template></el-table-column>
            <el-table-column prop="permission" label="权限标识" min-width="200"><template #default="scope"><code class="portal-vue-code">{{ scope.row.permission }}</code></template></el-table-column>
            <el-table-column label="操作" width="240" fixed="right"><template #default="scope"><div class="portal-vue-actions"><el-button link type="primary" @click="openForm(null, scope.row)" :disabled="scope.row.children.length>=3">＋ 添加</el-button><el-button link type="primary" @click="openForm(scope.row, null)">✎ 编辑</el-button><el-button link type="danger" @click="removeMenu(scope.row)">🗑 删除</el-button></div></template></el-table-column>
          </el-table>
        </section>
        <el-dialog v-model="formVisible" :title="editingId ? '编辑菜单' : (parentMenu ? '添加子菜单' : '添加菜单')" width="640px">
          <el-form class="portal-vue-dialog-form" label-position="top">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px">
              <el-form-item label="菜单显示名称" required><el-input v-model="form.name" placeholder="如：数据看板"></el-input></el-form-item>
              <el-form-item label="上级菜单"><el-select v-model="form.parentId" clearable placeholder="不选则为顶级目录"><el-option v-for="item in rootMenus" :key="item.id" :label="item.name" :value="item.id"></el-option></el-select></el-form-item>
              <el-form-item label="图标"><el-select v-model="form.icon"><el-option label="--（子菜单）" value="--"></el-option><el-option v-for="icon in icons" :key="icon" :label="icon" :value="icon"></el-option></el-select></el-form-item>
              <el-form-item label="排序" required><el-input-number v-model="form.sort" :min="1" :max="99999" style="width:100%"></el-input-number></el-form-item>
              <el-form-item label="组件路径" required><el-input v-model="form.path" placeholder="/system/menu-management/index"></el-input></el-form-item>
              <el-form-item label="权限标识" required><el-input v-model="form.permission" placeholder="system_menu_management"></el-input></el-form-item>
            </div>
            <el-form-item label="缓冲（页面缓存）"><el-switch v-model="form.cache"></el-switch></el-form-item>
          </el-form>
          <template #footer><el-button @click="formVisible=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template>
        </el-dialog>
      </el-config-provider>
    `,
    data:()=>({menus:menuTreeSeed.map(item=>({...item,children:item.children.map(child=>({...child,parentId:item.id}))})),formVisible:false,editingId:"",parentId:"",form:{},icons:menuIcons}),
    computed:{
      rootMenus(){return this.menus;},
      treeRows(){return this.menus;}
    },
    methods:{
      iconGlyph(icon){return {pie:"◔",asset:"▤",service:"▣",permission:"🔒",system:"⚙",analysis:"✦",push:"⇩"}[icon]||"●";},
      findMenu(id,list=this.menus,parent=null){for(const item of list){if(item.id===id)return{menu:item,parent};const found=this.findMenu(id,item.children,item);if(found)return found;}return null;},
      toggleCache(row,value){const found=this.findMenu(row.id);if(found){found.menu.cache=value;notify(`「${row.name}」缓存已${value?"开启":"关闭"}`);}},
      openForm(row,parent){this.editingId=row?.id||"";this.parentId=parent?.id||row?.parentId||"";this.form=row?{name:row.name,parentId:row.parentId||"",icon:row.icon,sort:row.sort,path:row.path,cache:row.cache,permission:row.permission}:{name:"",parentId:parent?.id||"",icon:parent?"--":"pie",sort:parent?(parent.children.length+1)*10:100,path:"",cache:true,permission:""};this.formVisible=true;},
      save(){
        const name=String(this.form.name||"").trim();
        const path=String(this.form.path||"").trim();
        const permission=String(this.form.permission||"").trim();
        if(!name)return ep.ElMessage.warning("请输入菜单显示名称");
        if(!path)return ep.ElMessage.warning("请输入组件路径");
        if(!permission)return ep.ElMessage.warning("请输入权限标识");
        if(this.editingId){
          const found=this.findMenu(this.editingId);
          if(!found)return ep.ElMessage.error("菜单不存在");
          Object.assign(found.menu,{name,icon:this.form.icon,sort:this.form.sort,path,cache:this.form.cache,permission});
          notify(`菜单「${name}」已保存`);
        }else{
          const id=`M${Date.now()}`;
          const node={id,name,icon:this.form.icon,sort:this.form.sort,path,cache:this.form.cache,permission,children:[],parentId:this.form.parentId||""};
          if(this.form.parentId){const found=this.findMenu(this.form.parentId);if(!found)return ep.ElMessage.error("上级菜单不存在");found.menu.children.push(node);}
          else this.menus.push(node);
          notify(`菜单「${name}」已添加`);
        }
        this.formVisible=false;
      },
      async removeMenu(row){
        if(row.children.length)return ep.ElMessage.warning("请先删除子菜单");
        if(!await confirmAction("删除菜单",`确认删除菜单「${row.name}」？删除后相关权限组的菜单权限将同步失效。`))return;
        if(row.parentId){const parent=this.findMenu(row.parentId);parent.menu.children=parent.menu.children.filter(item=>item.id!==row.id);}
        else this.menus=this.menus.filter(item=>item.id!==row.id);
        notify(`菜单「${row.name}」已删除`);
      }
    }
  };

  const skillRegistrySeed = [
    {
      id: "warehouse-analyst", name: "数据查询与指标解答 Skill", source: "maxcompute-warehouse-analyst", version: "v1.3-portal", grayUsers: [],
      icon: "📊", title: "数据查询与指标解答", displayDesc: "先选业务线，再检索表与字段", sort: 10, scenarioKey: "data-query", enabled: true,
      desc: "未指定数据表时先咨询业务线，再在授权资产中检索指标口径、表和字段。",
      scenarios: "指标查询 / 数据解答 / 口径说明",
      clarification: { enabled:true, question:"你问的是哪个业务线？", options:["存量","权益","保险","短剧","其他"] },
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
      icon: "📚", title: "数据资产问答", displayDesc: "有哪些表、口径、负责人", sort: 30, scenarioKey: "asset", enabled: true,
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
      icon: "🔗", title: "数据血缘与变更影响", displayDesc: "上下游依赖与影响面", sort: 20, scenarioKey: "lineage", enabled: true,
      desc: "基于 SQL 语料与 AST 解析输出表/字段的上下游血缘与变更影响面。",
      scenarios: "血缘上下游 / 变更影响分析",
      clarification: { enabled:false, question:"", options:[] }, assetScope: "引用表、字段与下游依赖", responseContract: ["直接影响","间接影响","待核对项"],
      prompt: "你是观星台数据平台的血缘分析助手。\n基于提供的表上下游血缘证据，输出 Markdown 报告。",
      versions: [{ version: "v1.2-portal", time: "2026-08-31 16:10", operator: "曾祥竞", note: "复用数仓语料血缘能力", current: true }],
      stats: { calls: 87, successRate: "97.7%", avgLatency: "11.5s", tokens: "21.3万" }
    },
    {
      id: "attribution-analyst", name: "指标异动诊断 Skill", source: "attribution-analyst", version: "v0.5", grayUsers: [],
      icon: "🎯", title: "指标异动诊断", displayDesc: "指标异动拆解与定位", sort: 40, scenarioKey: "attribution", enabled: true,
      desc: "对指标异动做维度拆解（媒体/产品/计划），定位贡献度与原因。",
      scenarios: "指标异动 / 维度拆解",
      clarification: { enabled:false, question:"", options:[] }, assetScope: "引用指标表与可拆解维度", responseContract: ["异动幅度","维度贡献","证据限制"],
      prompt: "你是观星台数据平台的归因分析助手。\n基于聚合统计对指标异动做维度拆解，所有数字必须来自证据。",
      versions: [{ version: "v0.5", time: "2026-08-29 14:00", operator: "曾祥竞", note: "接入聚合证据层", current: true }],
      stats: { calls: 56, successRate: "100%", avgLatency: "13.8s", tokens: "15.7万" }
    }
  ];

  state.skills = skillRegistrySeed;

  const SkillManagementApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <div class="portal-vue-toolbar">
            <div class="portal-vue-toolbar-left"><el-input v-model="keyword" class="portal-vue-search" clearable placeholder="搜索 Skill 名称、来源"></el-input></div>
            <el-button type="primary" :loading="uploading" @click="uploadInput?.click()">上传 Skill</el-button>
            <input ref="uploadInput" type="file" accept=".zip" style="display:none" @change="onUploadFile"></input>
          </div>
          <el-table :data="filteredRows" class="portal-vue-table" border empty-text="暂无 Skill">
            <el-table-column label="Skill" min-width="240"><template #default="scope"><div><span class="portal-vue-name">{{ scope.row.name }}</span><div class="portal-vue-muted" style="margin-top:2px">{{ scope.row.desc }}</div></div></template></el-table-column>
            <el-table-column prop="source" label="来源包" width="230"><template #default="scope"><code class="portal-vue-code">{{ scope.row.source }}</code></template></el-table-column>
            <el-table-column label="工作台展示" min-width="200"><template #default="scope"><div v-if="scope.row.enabled!==false" style="display:flex;align-items:center;gap:6px"><img v-if="isImageIcon(scope.row.icon)" :src="scope.row.icon" alt="" style="width:17px;height:17px;object-fit:contain" /><span v-else>{{ scope.row.icon }}</span><div><span style="font-size:13px">{{ scope.row.title }}</span><div class="portal-vue-muted" style="font-size:12px">{{ scope.row.displayDesc }}</div></div><el-tag size="small" effect="plain" style="margin-left:4px">排序 {{ scope.row.sort }}</el-tag></div><span v-else class="portal-vue-muted">已下线</span></template></el-table-column>
            <el-table-column prop="version" label="当前版本" width="120"></el-table-column>
            <el-table-column label="状态" width="150"><template #default="scope"><div style="display:flex;align-items:center;gap:6px"><el-switch v-model="scope.row.enabled" inline-prompt active-text="上线" inactive-text="下线" active-color="#16a34a" @change="toggleEnabled(scope.row)"></el-switch><el-tag v-if="scope.row.enabled!==false && skillStatus(scope.row)!=='已发布'" size="small" :type="skillStatus(scope.row)==='未发布' ? 'info' : 'warning'" effect="light">{{ skillStatus(scope.row) }}</el-tag></div></template></el-table-column>
            <el-table-column label="灰度用户" min-width="170"><template #default="scope"><div v-if="scope.row.grayUsers.length" style="display:flex;flex-wrap:wrap;gap:4px"><el-tag v-for="user in scope.row.grayUsers.slice(0,3)" :key="user" size="small" effect="plain">{{ user }}</el-tag><span v-if="scope.row.grayUsers.length>3" class="portal-vue-muted">+{{ scope.row.grayUsers.length-3 }}</span></div><span v-else class="portal-vue-muted">全量发布</span></template></el-table-column>
            <el-table-column label="调用次数" width="100" align="right"><template #default="scope">{{ scope.row.stats.calls }}</template></el-table-column>
            <el-table-column label="操作" width="100" fixed="right"><template #default="scope"><el-button link type="primary" @click="openVersionManage(scope.row)">版本管理</el-button></template></el-table-column>
          </el-table>
          <div class="portal-vue-muted" style="margin-top:12px">Skill 以 ZIP 包（SKILL.md + 脚本 + 依赖清单）上传到网关统一执行；提示词与版本更新即时生效，无需发版。</div>
        </section>
        <el-drawer v-model="editVisible" :title="(addMode ? '新增版本' : '编辑版本') + ' · ' + (activeSkill?.name || '')" size="620px" direction="rtl" class="portal-vue-edit-drawer" :close-on-click-modal="true">
          <div v-if="activeSkill" class="portal-vue-skill-drawer">
            <div class="portal-vue-skill-section"><el-form-item label="标题" required><el-input v-model="editForm.title" placeholder="如：数据查询与指标解答"></el-input></el-form-item></div>
            <div class="portal-vue-skill-section"><el-form-item label="图标">
              <div class="portal-vue-skill-icon-upload" @click="openIconPicker">
                <span class="portal-vue-skill-icon-preview"><img v-if="isImageIcon(editForm.icon)" :src="editForm.icon" alt="图标" /><span v-else>{{ editForm.icon || "✦" }}</span></span>
                <span class="portal-vue-skill-icon-tips"><strong>点击上传图标</strong><small>支持 png / jpg / gif / svg，不超过 300KB</small></span>
              </div>
              <input ref="iconInput" type="file" accept="image/*" style="display:none" @change="onIconUpload"></input>
            </el-form-item></div>
            <div class="portal-vue-skill-section"><el-form-item label="描述"><el-input v-model="editForm.displayDesc" placeholder="如：趋势、分布与异常"></el-input></el-form-item></div>
            <div class="portal-vue-skill-section"><el-form-item label="排序（越小越靠前）"><el-input-number v-model="editForm.sort" :min="1" :max="999"></el-input-number></el-form-item></div>
            <div class="portal-vue-skill-section"><el-form-item label="提示词"><el-input v-model="editForm.prompt" type="textarea" :rows="9" resize="none"></el-input></el-form-item></div>
            <div class="portal-vue-skill-section"><el-form-item label="上线状态"><el-switch v-model="editForm.enabled" inline-prompt active-text="上线" inactive-text="下线" active-color="#16a34a"></el-switch><span class="portal-vue-muted" style="margin-left:10px;font-size:12px">下线后该 Skill 立即从灵犀智析隐藏</span></el-form-item></div>
            <div class="portal-vue-skill-section">
              <el-form-item label="版本号" required><el-input v-model="editForm.version" placeholder="如：v1.4" :disabled="!addMode"></el-input><span v-if="!addMode" class="portal-vue-muted" style="margin-left:8px;font-size:12px">编辑未发布版本不可改版本号</span></el-form-item>
              <el-form-item label="版本内容说明"><el-input v-model="editForm.versionNote" type="textarea" :rows="2" resize="none" placeholder="如：新增自动澄清、修复口径问题"></el-input></el-form-item>
            </div>
          </div>
          <template #footer>
            <div style="display:flex;justify-content:flex-end;gap:10px"><el-button @click="editVisible=false">取消</el-button><el-button type="primary" @click="saveAll">{{ addMode ? "保存为新版本" : "保存修改" }}</el-button></div>
          </template>
        </el-drawer>
        <el-drawer v-model="publishVisible" size="640px" :close-on-click-modal="true">
          <template #header>
            <div style="display:flex;align-items:center;justify-content:space-between;width:100%">
              <span style="font-size:16px;font-weight:600">{{ publishSkill?.name || "" }} · 版本管理</span>
              <el-button type="primary" size="small" @click="openNewVersion">＋ 新增版本</el-button>
            </div>
          </template>
          <div class="portal-vue-skill-drawer">
            <el-alert type="info" :closable="false" title="新增/编辑生成的是未发布版本：可编辑、可选灰度用户测试，验证没问题后「发版」成为正式版本；历史版本可查看，正式版本可回滚。" :show-icon="true"></el-alert>
            <div v-for="item in publishSkill?.versions || []" :key="item.version" class="portal-vue-skill-version" :class="{ current: item.current }">
              <div class="portal-vue-skill-version-head">
                <strong>{{ item.version }}</strong><el-tag v-if="item.current" size="small" type="success" effect="light">当前</el-tag><el-tag size="small" :type="versionStatusType(item)" effect="light">{{ versionStatusName(item) }}</el-tag><time>{{ item.time }}</time>
              </div>
              <p>{{ item.note }}</p>
              <div v-if="item.grayUsers?.length" style="display:flex;flex-wrap:wrap;gap:4px;margin:6px 0"><el-tag v-for="user in item.grayUsers" :key="user" size="small" effect="plain">{{ user }}</el-tag><span class="portal-vue-muted" style="font-size:12px">（灰度用户）</span></div>
              <div class="portal-vue-muted">操作人：{{ item.operator }}</div>
              <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
                <template v-if="versionStatusName(item) !== '已发布'">
                  <el-button size="small" @click="openEditVersion(item)">编辑</el-button>
                  <el-button v-if="versionStatusName(item) === '未发布'" size="small" @click="openGrayDraft(item)">灰度</el-button>
                  <el-button v-if="versionStatusName(item) === '灰度中'" size="small" @click="openGrayDraft(item)">调整灰度</el-button>
                  <el-button v-if="versionStatusName(item) === '灰度中'" size="small" type="primary" @click="publishVersion(item)">发版</el-button>
                </template>
                <template v-else>
                  <el-button size="small" @click="openViewVersion(item)">查看</el-button>
                  <el-button v-if="!item.current" size="small" @click="rollback(item)">回滚到此版本</el-button>
                </template>
              </div>
            </div>
            <p v-if="!publishSkill?.versions?.length" class="portal-vue-muted">暂无版本，点右上角「新增版本」创建</p>
          </div>
        </el-drawer>
        <el-drawer v-model="viewVisible" :title="(publishSkill?.name || '') + ' · ' + (viewVersion?.version || '') + ' 版本详情'" size="560px" :close-on-click-modal="true">
          <div v-if="viewVersion" class="portal-vue-skill-drawer">
            <div style="display:flex;align-items:center;gap:10px;padding:12px;border:1px solid #e9edf4;border-radius:10px;background:#fafcff">
              <span class="portal-vue-skill-icon-preview" style="width:48px;height:48px"><img v-if="isImageIcon(viewVersion.snapshot?.icon)" :src="viewVersion.snapshot?.icon" alt="" /><span v-else style="font-size:22px">{{ viewVersion.snapshot?.icon || "✦" }}</span></span>
              <div style="display:grid;gap:2px"><strong style="font-size:14px">{{ viewVersion.snapshot?.title || publishSkill?.title || "—" }}</strong><span class="portal-vue-muted" style="font-size:12px">{{ viewVersion.snapshot?.displayDesc || "（无描述）" }}</span></div>
              <el-tag style="margin-left:auto" size="small" :type="versionStatusType(viewVersion)" effect="light">{{ versionStatusName(viewVersion) }}</el-tag>
            </div>
            <div class="portal-vue-alert-field"><label>排序</label><span>{{ viewVersion.snapshot?.sort ?? publishSkill?.sort ?? "—" }}</span></div>
            <div class="portal-vue-alert-field"><label>上线状态</label><span>{{ viewVersion.snapshot?.enabled === false ? "下线" : "上线" }}</span></div>
            <div class="portal-vue-alert-field"><label>版本内容说明</label><span>{{ viewVersion.note || "—" }}</span></div>
            <div class="portal-vue-alert-field"><label>灰度用户</label><div style="display:flex;flex-wrap:wrap;gap:4px"><el-tag v-for="user in viewVersion.grayUsers || []" :key="user" size="small" effect="plain">{{ user }}</el-tag><span v-if="!viewVersion.grayUsers?.length" class="portal-vue-muted">无（全量发布）</span></div></div>
            <div class="portal-vue-alert-field"><label>提示词</label><pre class="portal-vue-alert-sql" style="white-space:pre-wrap">{{ viewVersion.snapshot?.prompt || publishSkill?.prompt || "（无）" }}</pre></div>
            <div class="portal-vue-muted" style="font-size:12px">版本时间：{{ viewVersion.time }} · 操作人：{{ viewVersion.operator }}</div>
          </div>
        </el-drawer>
        <el-dialog v-model="grayDialogVisible" :title="'灰度测试 - ' + (grayVersion?.version || '')" width="520px">
          <div class="portal-vue-skill-drawer">
            <el-alert type="info" :closable="false" title="选择灰度测试用户，仅这些用户可见该版本；验证没问题后再点「发版」全量发布。" :show-icon="true"></el-alert>
            <el-select v-model="grayDraft" multiple filterable collapse-tags collapse-tags-tooltip placeholder="选择灰度用户" style="width:100%">
              <el-option v-for="user in activeUsers" :key="user.name" :label="user.name" :value="user.name"><span>{{ user.name }}</span><span class="portal-vue-muted" style="float:right;font-size:12px">{{ user.dept }}</span></el-option>
            </el-select>
          </div>
          <template #footer><el-button @click="grayDialogVisible=false">取消</el-button><el-button type="primary" @click="saveGrayDraft">确定灰度</el-button></template>
        </el-dialog>
      </el-config-provider>
    `,
    data:()=>({keyword:"",uploading:false,editVisible:false,editForm:{},addMode:true,editingVersion:null,activeSkill:null,publishVisible:false,publishSkill:null,viewVisible:false,viewVersion:null,grayDialogVisible:false,grayVersion:null,grayDraft:[]}),
    computed:{
      skills(){refreshTick.value;return (state.skills||[]).filter(item=>item.id!=="numa-warehouse");},
      filteredRows(){const keyword=this.keyword.trim().toLowerCase();return this.skills.filter(item=>!keyword||`${item.name} ${item.source}`.toLowerCase().includes(keyword));},
      activeUsers(){refreshTick.value;return state.users.filter(user=>user.status!=="已停用");}
    },
    methods:{
      async onUploadFile(event){
        const file=event.target.files?.[0];
        event.target.value="";
        if(!file)return;
        if(!file.name.toLowerCase().endsWith(".zip"))return ep.ElMessage.warning("请选择 .zip 格式的 Skill 包（skill.json + SKILL.md + tools/）");
        this.uploading=true;
        try{
          const response=await fetch(`${analysisGatewayBase}/v1/skills/upload`,{method:"POST",headers:{"Content-Type":"application/zip"},body:file});
          const data=await response.json();
          if(!response.ok)throw new Error(data.error||"上传失败");
          await this.loadGatewaySkills();
          ep.ElMessage.success(`Skill「${data.name}」已上传并注册到网关，即时生效`);
        }catch(error){ep.ElMessage.error(`上传失败：${error.message}`);}
        this.uploading=false;
      },
      async loadGatewaySkills(){
        try{
          const response=await fetch(`${analysisGatewayBase}/v1/skills`);
          if(!response.ok)return;
          const list=await response.json();
          if(Array.isArray(list)&&list.length){
            state.skills=list.map(entry=>({ ...entry, versions: entry.versions || [], stats: entry.stats || { calls: 0, successRate: "—", avgLatency: "—", tokens: "—" } }));
          }
        }catch(error){/* 网关未启动时保留内置注册表 */}
      },
      openVersionManage(row){this.publishSkill=row;this.publishVisible=true;},
      openNewVersion(){
        const row=this.publishSkill;
        this.activeSkill=row;
        this.addMode=true;
        this.editingVersion=null;
        this.editForm={icon:row.icon||"✦",title:row.title||"",displayDesc:row.displayDesc||"",sort:row.sort||50,enabled:row.enabled!==false,prompt:row.prompt||"",version:this.nextVersion(),versionNote:""};
        this.editVisible=true;
      },
      openEditVersion(item){
        const row=this.publishSkill;
        this.activeSkill=row;
        this.addMode=false;
        this.editingVersion=item;
        this.editForm={icon:item.snapshot?.icon||row.icon||"✦",title:item.snapshot?.title??row.title,displayDesc:item.snapshot?.displayDesc??row.displayDesc,sort:item.snapshot?.sort??row.sort,enabled:(item.snapshot?.enabled!==undefined?item.snapshot.enabled:row.enabled)!==false,prompt:item.snapshot?.prompt??row.prompt,version:item.version,versionNote:item.note||""};
        this.editVisible=true;
      },
      openViewVersion(item){this.viewVersion=item;this.viewVisible=true;},
      async saveAll(){
        const form=this.editForm;
        if(!String(form.title||"").trim())return ep.ElMessage.warning("请输入标题");
        const note=String(form.versionNote||"").trim()||"更新配置";
        const snapshot={icon:form.icon||"✦",title:form.title.trim(),displayDesc:form.displayDesc.trim(),sort:form.sort,enabled:form.enabled,prompt:form.prompt};
        Object.assign(this.activeSkill,snapshot);
        if(this.addMode){
          const version=String(form.version||"").trim()||this.nextVersion();
          this.activeSkill.versions=(this.activeSkill.versions||[]).map(item=>({...item,current:false}));
          this.activeSkill.versions.unshift({version,time:new Date().toLocaleString("zh-CN",{hour12:false}).replaceAll("/","-"),operator:this.currentUser?.name||"曾祥竞",note,current:true,status:"未发布",grayUsers:[],snapshot});
          this.activeSkill.version=version;
          try{await fetch(`${analysisGatewayBase}/v1/skills/${encodeURIComponent(this.activeSkill.id)}/config`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({icon:snapshot.icon,title:snapshot.title,displayDesc:snapshot.displayDesc,sort:snapshot.sort,enabled:snapshot.enabled,prompt:snapshot.prompt,latestVersion:{version,note,status:"未发布",grayUsers:[]}})});}catch(error){/* 网关未连接时保留原型状态 */}
          this.editVisible=false;
          notify(`「${this.activeSkill.name}」已保存为 ${version}（未发布，可到「版本管理」灰度/发布）`);
        }else{
          const item=this.editingVersion;
          if(item){item.note=note;item.snapshot={...snapshot};}
          try{await fetch(`${analysisGatewayBase}/v1/skills/${encodeURIComponent(this.activeSkill.id)}/config`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({icon:snapshot.icon,title:snapshot.title,displayDesc:snapshot.displayDesc,sort:snapshot.sort,enabled:snapshot.enabled,prompt:snapshot.prompt,latestVersion:{version:item?.version||this.activeSkill.version,note,status:item?.status||"未发布",grayUsers:item?.grayUsers||[]}})});}catch(error){/* 网关未连接时保留原型状态 */}
          this.editVisible=false;
          notify(`「${this.activeSkill.name}」${item?.version||""} 已更新`);
        }
      },
      nextVersion(){
        const current=String(this.activeSkill?.version||"v1.0");
        const match=current.match(/^v(\d+)\.(\d+)/);
        return match?`v${match[1]}.${Number(match[2])+1}`:"v1.1";
      },
      async toggleEnabled(row){
        const enabled=row.enabled!==false;
        try{await fetch(`${analysisGatewayBase}/v1/skills/${encodeURIComponent(row.id)}/config`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled})});}catch(error){/* 网关未连接时保留原型状态 */}
        notify(`「${row.name}」已${enabled?"上线，灵犀智析恢复展示":"下线，灵犀智析立即隐藏"}`);
      },
      isImageIcon(icon){return /^(data:image|https?:|blob:)/i.test(String(icon||""));},
      openIconPicker(){this.$refs.iconInput?.click();},
      onIconUpload(event){
        const file=event.target.files?.[0];
        event.target.value="";
        if(!file)return;
        if(!/^image\/(png|jpe?g|gif|svg\+xml|webp)$/i.test(file.type))return ep.ElMessage.warning("请选择图片文件");
        if(file.size>300*1024)return ep.ElMessage.warning("图片不能超过 300KB");
        const reader=new FileReader();
        reader.onload=()=>{this.editForm.icon=String(reader.result||"").slice(0,200000);ep.ElMessage.success("图标已上传，保存后生效");};
        reader.readAsDataURL(file);
      },
      openVersionManage(row){this.publishSkill=row;this.publishVisible=true;},
      versionStatusName(item){return item.status||"已发布";},
      versionStatusType(item){
        const status=item.status||"已发布";
        return status==="未发布"?"info":status==="灰度中"?"warning":"success";
      },
      openGrayDraft(item){this.grayVersion=item;this.grayDraft=[...(item.grayUsers||[])];this.grayDialogVisible=true;},
      saveGrayDraft(){
        if(!this.grayVersion)return;
        this.grayVersion.grayUsers=[...this.grayDraft];
        this.grayVersion.status="灰度中";
        this.grayDialogVisible=false;
        notify(`「${this.publishSkill?.name}」${this.grayVersion.version} 已灰度给 ${this.grayDraft.length} 位用户测试`);
      },
      async publishVersion(item){
        try{await ep.ElMessageBox.confirm(`确认将「${this.publishSkill?.name}」${item.version} 发布为正式版本（全量可见）？`, "发版确认", { type: "warning", confirmButtonText: "发版", cancelButtonText: "取消" });}catch(error){return;}
        item.status="已发布";
        notify(`「${this.publishSkill?.name}」${item.version} 已正式发布`);
      },
      rollback(item){
        const skill=this.publishSkill||this.activeSkill;
        if(item.snapshot){
          Object.assign(skill,{icon:item.snapshot.icon,title:item.snapshot.title,displayDesc:item.snapshot.displayDesc,sort:item.snapshot.sort,enabled:item.snapshot.enabled,prompt:item.snapshot.prompt});
          try{fetch(`${analysisGatewayBase}/v1/skills/${encodeURIComponent(skill.id)}/config`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({icon:item.snapshot.icon,title:item.snapshot.title,displayDesc:item.snapshot.displayDesc,sort:item.snapshot.sort,enabled:item.snapshot.enabled,prompt:item.snapshot.prompt})});}catch(error){}
        }
        skill.versions.forEach(version=>version.current=version===item);
        skill.version=item.version;
        notify(`「${skill.name}」已回滚到 ${item.version}${item.snapshot?"，配置已恢复":""}`);
      },
      skillStatus(row){
        const current=(row.versions||[]).find(item=>item.current);
        if(!current)return row.grayUsers?.length?"灰度中":"已发布";
        return current.status||"已发布";
      },
    }
  };

  const alertMetricChoices = [
    { label: "消耗金额", field: "consume_amount" },
    { label: "CPA（获客成本）", field: "cpa" },
    { label: "点击量", field: "click_cnt" },
    { label: "订单数", field: "order_cnt" },
    { label: "新增用户数", field: "new_user_cnt" }
  ];
  const alertFrequencyChoices = ["每小时", "每天", "每周"];
  const alertTimeChoices = ["08:00", "09:00", "10:00", "18:00"];
  const alertGroupChoices = ["投放运营群", "数据分析师群", "权益业务群", "高管数据群"];
  const alertExampleTexts = [
    "近 7 天广告计划日报表中，巨量渠道消耗环比下降超过 20% 时每天提醒",
    "广告计划日报表里 CPA 连续 3 天超过 80 元的时候提醒我",
    "用户订单明细表每日订单数环比波动超过 30% 时发预警",
    "渠道归因明细表中，新增用户数每周减少超过 15% 时提醒"
  ];
  const alertSeeds = [
    {
      id: "AL20260901001", name: "巨量渠道消耗突降预警", text: "近 7 天广告计划日报表中，巨量渠道消耗环比下降超过 20% 时每天提醒", creator: "曾祥竞",
      table: "广告计划日报表", metric: "消耗金额", agg: "SUM", filters: ["渠道=巨量"], rule: "环比下降超过 20%", frequency: "每天", time: "09:00",
      sql: "SELECT ds, SUM(consume_amount) AS 消耗金额\nFROM 广告计划日报表\nWHERE 渠道 = '巨量' AND ds >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)\nGROUP BY ds\nHAVING (SUM(consume_amount) - LAG(SUM(consume_amount)) OVER (ORDER BY ds)) / LAG(SUM(consume_amount)) OVER (ORDER BY ds) <= -0.2",
      enabled: true, users: ["曾祥竞"], groups: ["投放运营群"], lastTriggered: "2026-09-03 09:01", triggerCount: 3,
      history: [
        { time: "2026-09-03 09:01", summary: "巨量渠道昨日消耗 12.4 万，环比下降 23.6%，触发预警并推送飞书", status: "已推送" },
        { time: "2026-09-02 09:00", summary: "巨量渠道昨日消耗 16.2 万，环比下降 21.1%，触发预警并推送飞书", status: "已推送" },
        { time: "2026-08-31 09:00", summary: "巨量渠道昨日消耗 15.1 万，环比下降 20.4%，触发预警并推送飞书", status: "已推送" }
      ]
    },
    {
      id: "AL20260901002", name: "CPA 连续超目标预警", text: "广告计划日报表里 CPA 连续 3 天超过 80 元的时候提醒我", creator: "李雨航",
      table: "广告计划日报表", metric: "CPA（获客成本）", agg: "AVG", filters: [], rule: "CPA 连续 3 天超过 80 元", frequency: "每天", time: "10:00",
      sql: "SELECT ds, AVG(cpa) AS CPA\nFROM 广告计划日报表\nWHERE ds >= DATE_SUB(CURDATE(), INTERVAL 3 DAY)\nGROUP BY ds\nHAVING AVG(cpa) > 80",
      enabled: true, users: ["李雨航"], groups: ["数据分析师群"], lastTriggered: "2026-09-02 18:30", triggerCount: 2,
      history: [
        { time: "2026-09-02 18:30", summary: "CPA 已连续 3 天高于 80 元（82.4 / 81.7 / 84.2），触发预警并推送飞书", status: "已推送" },
        { time: "2026-08-28 18:05", summary: "CPA 已连续 3 天高于 80 元（81.2 / 80.9 / 83.5），触发预警并推送飞书", status: "已推送" }
      ]
    },
    {
      id: "AL20260901003", name: "订单量波动预警", text: "用户订单明细表每日订单数环比波动超过 30% 时发预警", creator: "王鑫宇",
      table: "用户订单明细", metric: "订单数", agg: "COUNT", filters: [], rule: "订单数环比波动超过 30%", frequency: "每天", time: "08:30",
      sql: "SELECT ds, COUNT(order_id) AS 订单数\nFROM 用户订单明细\nWHERE ds >= DATE_SUB(CURDATE(), INTERVAL 1 DAY)\nGROUP BY ds\nHAVING ABS(COUNT(order_id) - LAG(COUNT(order_id)) OVER (ORDER BY ds)) / LAG(COUNT(order_id)) OVER (ORDER BY ds) > 0.3",
      enabled: false, users: ["王鑫宇"], groups: [], lastTriggered: "2026-08-28 08:31", triggerCount: 1,
      history: [{ time: "2026-08-28 08:31", summary: "昨日订单数 3,214，环比下降 34.2%，触发预警并推送飞书", status: "已推送" }]
    }
  ];

  /* 数据预警：自然语言描述 → AI 解析为指标配置/SQL 规则 → 业务核对保存 → 飞书机器人推送 */
  const AlertManagementApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <div class="portal-vue-toolbar">
            <div class="portal-vue-toolbar-left">
              <el-radio-group v-model="view" size="default">
                <el-radio-button value="mine">我的<template v-if="myCount !== allCount">&nbsp;（{{ myCount }}）</template></el-radio-button>
                <el-radio-button v-if="canViewAll" value="all">全部（{{ allCount }}）</el-radio-button>
              </el-radio-group>
              <el-input v-model="keyword" class="portal-vue-search" clearable placeholder="搜索预警名称、监控表或指标"></el-input>
            </div>
            <el-button type="primary" @click="openCreate">＋ 新建预警</el-button>
          </div>
          <el-table :data="filteredRows" class="portal-vue-table" border :empty-text="view === 'mine' ? '你还没有创建预警，点右上角「新建预警」用一句话创建' : '暂无预警数据，点右上角「新建预警」用一句话创建'">
            <el-table-column label="预警名称" min-width="230"><template #default="scope"><div><span class="portal-vue-name">{{ scope.row.name }}</span><div class="portal-vue-muted" style="margin-top:2px;max-width:340px">{{ scope.row.text }}</div></div></template></el-table-column>
            <el-table-column label="监控指标" min-width="180"><template #default="scope"><div style="display:flex;flex-direction:column;gap:3px"><el-tag size="small" effect="plain" style="width:fit-content">{{ scope.row.table }}</el-tag><span style="font-size:13px">{{ scope.row.agg }}（{{ scope.row.metric }}）</span></div></template></el-table-column>
            <el-table-column label="触发条件" min-width="200"><template #default="scope"><div><span style="font-size:13px">{{ scope.row.rule }}</span><div class="portal-vue-muted" style="font-size:12px;margin-top:2px">{{ scope.row.frequency }}{{ scope.row.frequency==='每天' ? ' ' + scope.row.time : '' }} · {{ scope.row.filters.length ? '筛选：' + scope.row.filters.join('，') : '无筛选' }}</div></div></template></el-table-column>
            <el-table-column label="推送对象" min-width="180"><template #default="scope"><div style="display:flex;flex-wrap:wrap;gap:4px"><el-tag v-for="user in scope.row.users" :key="user" size="small" effect="plain">{{ user }}</el-tag><el-tag v-for="group in scope.row.groups" :key="group" size="small" type="success" effect="plain">{{ group }}</el-tag><span v-if="!scope.row.users.length && !scope.row.groups.length" class="portal-vue-muted">未配置</span></div></template></el-table-column>
            <el-table-column label="最近触发" width="150"><template #default="scope"><div><span style="font-size:13px">{{ scope.row.lastTriggered === '—' ? '—' : scope.row.lastTriggered }}</span><div v-if="scope.row.triggerCount" class="portal-vue-muted" style="font-size:12px;margin-top:2px">累计触发 {{ scope.row.triggerCount }} 次</div></div></template></el-table-column>
            <el-table-column label="状态" width="90"><template #default="scope"><el-switch v-model="scope.row.enabled" inline-prompt active-text="启用" inactive-text="停用" active-color="#16a34a" @change="toggleEnabled(scope.row)"></el-switch></template></el-table-column>
            <el-table-column label="操作" width="150" fixed="right"><template #default="scope"><div class="portal-vue-actions"><el-button link type="primary" @click="openEdit(scope.row)">编辑</el-button><el-button link type="primary" @click="openHistory(scope.row)">记录</el-button><el-button link type="danger" @click="removeAlert(scope.row)">删除</el-button></div></template></el-table-column>
          </el-table>
          <div class="portal-vue-muted" style="margin-top:12px">预警规则完全来自自然语言描述，AI 解析出的配置与 SQL 需业务核对确认；推送走内置「观星台预警助手」飞书机器人。</div>
        </section>
        <el-dialog v-model="dialogVisible" :title="(editingId ? '编辑' : '新建') + '数据预警'" fullscreen class="portal-vue-fullscreen-dialog" :close-on-click-modal="false">
          <div class="portal-vue-skill-drawer" style="gap:14px">
            <div class="portal-vue-alert-step"><b>1</b><div><strong>描述预警需求</strong><span class="portal-vue-muted">用一句话说明监控什么、变化多大时提醒</span></div></div>
            <el-input v-model="text" type="textarea" :rows="3" resize="none" placeholder="例：近 7 天广告计划日报表中，巨量渠道消耗环比下降超过 20% 时每天提醒"></el-input>
            <div style="display:flex;flex-wrap:wrap;gap:6px"><span class="portal-vue-muted" style="font-size:12px;line-height:24px">试试：</span><el-button v-for="sample in alertExampleTexts" :key="sample" size="small" round plain @click="text = sample">{{ sample }}</el-button></div>
            <div style="display:flex;align-items:center;gap:12px">
              <el-button type="primary" :loading="parsing" @click="runParse">🤖 AI 解析为配置清单</el-button>
              <span v-if="parsing" class="portal-vue-muted">正在把需求解析为指标配置与 SQL 规则…</span>
              <span v-else-if="parsed" class="portal-vue-alert-ok">✓ AI 解析完成，请业务核对下方配置</span>
            </div>
            <template v-if="parsed">
              <div class="portal-vue-alert-step"><b>2</b><div><strong>核对配置清单</strong><span class="portal-vue-muted">可修改任意字段，SQL 会随之更新</span></div></div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 14px">
                <div class="portal-vue-alert-field"><label>监控表</label><el-select v-model="parsed.table" filterable><el-option v-for="table in alertTables" :key="table" :label="table" :value="table"></el-option></el-select></div>
                <div class="portal-vue-alert-field"><label>监控指标</label><el-select v-model="parsed.metric"><el-option v-for="item in alertMetricChoices" :key="item.label" :label="item.label" :value="item.label"></el-option></el-select></div>
                <div class="portal-vue-alert-field"><label>聚合方式</label><el-select v-model="parsed.agg"><el-option v-for="item in ['SUM','AVG','COUNT','MAX','MIN']" :key="item" :label="item" :value="item"></el-option></el-select></div>
                <div class="portal-vue-alert-field"><label>检查频率</label><el-select v-model="parsed.frequency"><el-option v-for="item in alertFrequencyChoices" :key="item" :label="item" :value="item"></el-option></el-select></div>
                <div class="portal-vue-alert-field"><label>执行时间</label><el-select v-model="parsed.time"><el-option v-for="item in alertTimeChoices" :key="item" :label="item" :value="item"></el-option></el-select></div>
                <div class="portal-vue-alert-field"><label>预警名称</label><el-input v-model="parsed.name" placeholder="自动生成，可修改"></el-input></div>
              </div>
              <div class="portal-vue-alert-field"><label>筛选条件</label>
                <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
                  <el-tag v-for="(filter, index) in parsed.filters" :key="filter" closable @close="parsed.filters.splice(index, 1)">{{ filter }}</el-tag>
                  <el-input v-model="filterDraft" size="small" style="width:180px" placeholder="如：渠道=巨量" @keyup.enter="parsed.filters.push(filterDraft);filterDraft=''"></el-input>
                  <el-button size="small" @click="parsed.filters.push(filterDraft);filterDraft=''">添加</el-button>
                </div>
              </div>
              <div class="portal-vue-alert-field"><label>触发规则</label><el-input v-model="parsed.rule" placeholder="如：环比下降超过 20%"></el-input></div>
              <div class="portal-vue-alert-field"><label>背后 SQL（随配置自动生成）</label><pre class="portal-vue-alert-sql">{{ alertSql }}</pre></div>
            </template>
            <template v-if="parsed">
              <div class="portal-vue-alert-step"><b>3</b><div><strong>设置推送通道</strong><span class="portal-vue-muted">通过内置飞书机器人通知对应人与对应群</span></div></div>
              <div class="portal-vue-alert-bot"><span class="portal-vue-ai-bot-icon">🤖</span><div><strong>观星台预警助手</strong><span class="portal-vue-muted">已接入飞书，触发时按下方对象推送卡片消息（人 + 群可多选）</span></div><el-tag size="small" type="success" effect="light">已接入</el-tag></div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 14px">
                <div class="portal-vue-alert-field"><label>通知人</label><el-select v-model="users" multiple filterable placeholder="选择要通知的用户"><el-option v-for="user in activeUsers" :key="user.name" :label="user.name" :value="user.name"><span>{{ user.name }}</span><span class="portal-vue-muted" style="float:right;font-size:12px">{{ user.dept }}</span></el-option></el-select></div>
                <div class="portal-vue-alert-field"><label>通知群</label><el-select v-model="groups" multiple filterable placeholder="选择要通知的飞书群"><el-option v-for="group in alertGroupChoices" :key="group" :label="group" :value="group"></el-option></el-select></div>
              </div>
            </template>
          </div>
          <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" :disabled="!parsed || (!users.length && !groups.length)" @click="saveAlert">保存预警</el-button></template>
        </el-dialog>
        <el-dialog v-model="historyVisible" :title="historyTitle + ' · 触发记录'" width="560px">
          <div class="portal-vue-skill-drawer">
            <div v-for="item in historyRows" :key="item.time" class="portal-vue-skill-version">
              <div class="portal-vue-skill-version-head"><strong>{{ item.time }}</strong><el-tag size="small" type="success" effect="light">{{ item.status }}</el-tag></div>
              <p>{{ item.summary }}</p>
            </div>
            <p v-if="!historyRows.length" class="portal-vue-muted">暂无触发记录，规则启用后将在这里展示每次触发的推送情况。</p>
          </div>
        </el-dialog>
      </el-config-provider>
    `,
    data: () => ({ view: "mine", keyword: "", dialogVisible: false, historyVisible: false, historyTitle: "", historyRows: [], editingId: "", text: "", parsing: false, parsed: null, filterDraft: "", users: [], groups: [], alertExampleTexts, alertGroupChoices, alertFrequencyChoices, alertTimeChoices, alertMetricChoices, alerts: [] }),
    computed: {
      currentUser() { refreshTick.value; return state.users.find(user => user.name === "曾祥竞") || state.users[0]; },
      canViewAll() { return this.currentUser?.group === "门户管理员"; },
      myCount() { return this.alerts.filter(item => (item.creator || "曾祥竞") === this.currentUser?.name).length; },
      allCount() { return this.alerts.length; },
      filteredRows() {
        const keyword = this.keyword.trim().toLowerCase();
        const base = this.view === "all" ? this.alerts : this.alerts.filter(item => (item.creator || "曾祥竞") === this.currentUser?.name);
        if (!keyword) return base;
        return base.filter(item => `${item.name} ${item.table} ${item.metric} ${item.rule}`.toLowerCase().includes(keyword));
      },
      alertTables() { return state.assets.map(table => table.cnName); },
      activeUsers() { refreshTick.value; return state.users.filter(user => user.status !== "已停用"); },
      alertSql() {
        const parsed = this.parsed;
        if (!parsed) return "";
        const metric = alertMetricChoices.find(item => item.label === parsed.metric)?.field || "value";
        const filters = [...parsed.filters];
        const dateFilter = parsed.frequency === "每周" ? "ds >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)" : "ds = DATE_SUB(CURDATE(), INTERVAL 1 DAY)";
        return `SELECT ds, ${parsed.agg}(${metric}) AS ${parsed.metric}\nFROM ${parsed.table}\n${filters.length ? "WHERE " + filters.map(item => item.includes("=") ? item.split("=")[0] + " = '" + item.split("=").slice(1).join("=") + "'" : item).join(" AND ") + " AND " : "WHERE "}${dateFilter}\nGROUP BY ds\nHAVING ${parsed.rule}`;
      }
    },
    methods: {
      loadAlerts() {
        let saved = [];
        try { saved = JSON.parse(localStorage.getItem("portal-alert-rules") || "[]"); } catch (error) { saved = []; }
        this.alerts = [...saved, ...alertSeeds];
      },
      persistAlerts() {
        try {
          const saved = this.alerts.filter(item => !alertSeeds.some(seed => seed.id === item.id));
          localStorage.setItem("portal-alert-rules", JSON.stringify(saved));
        } catch (error) { /* 隐私模式下仅本次会话生效 */ }
      },
      openCreate() {
        this.editingId = "";
        this.text = "";
        this.parsed = null;
        this.users = [];
        this.groups = [];
        this.dialogVisible = true;
      },
      openEdit(row) {
        this.editingId = row.id;
        this.text = row.text;
        this.parsed = { name: row.name, table: row.table, metric: row.metric, agg: row.agg, filters: [...row.filters], rule: row.rule, frequency: row.frequency, time: row.time };
        this.users = [...row.users];
        this.groups = [...row.groups];
        this.dialogVisible = true;
      },
      runParse() {
        if (!String(this.text || "").trim()) return ep.ElMessage.warning("先描述预警需求，再点解析");
        this.parsing = true;
        this.parsed = null;
        setTimeout(() => {
          this.parsed = this.parseAlertBrain(this.text.trim());
          this.parsing = false;
        }, 900);
      },
      /* AI 解析器（原型内置规则版，后续可切换为网关模型解析） */
      parseAlertBrain(text) {
        const lower = text.toLowerCase();
        let table = "广告计划日报表";
        if (lower.includes("订单") || lower.includes("成交")) table = "用户订单明细";
        else if (lower.includes("画像") || lower.includes("标签")) table = "用户画像标签明细表";
        else if (lower.includes("归因")) table = "渠道归因明细";
        else if (lower.includes("媒体消耗") || lower.includes("消耗汇总")) table = "媒体消耗汇总";
        let metric = "消耗金额", agg = "SUM";
        if (lower.includes("cpa") || lower.includes("获客成本")) { metric = "CPA（获客成本）"; agg = "AVG"; }
        else if (lower.includes("点击")) { metric = "点击量"; agg = "SUM"; }
        else if (lower.includes("订单") || lower.includes("成交")) { metric = "订单数"; agg = "COUNT"; }
        else if (lower.includes("新增用户") || lower.includes("用户数")) { metric = "新增用户数"; agg = "COUNT"; }
        const filters = [];
        ["巨量", "抖音", "腾讯", "快手"].forEach(channel => { if (text.includes(channel)) filters.push(`渠道=${channel}`); });
        ["存量", "权益", "保险", "短剧"].forEach(line => { if (text.includes(line)) filters.push(`业务线=${line}`); });
        if (text.includes("计划")) filters.push("计划层级=全部");
        let rule = "环比变化超过 20%";
        const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
        const pct = match ? match[1] : "20";
        if (text.includes("环比")) {
          if (text.includes("下降") || text.includes("跌")) rule = `环比下降超过 ${pct}%`;
          else if (text.includes("上升") || text.includes("涨")) rule = `环比上升超过 ${pct}%`;
          else if (text.includes("波动") || text.includes("变化")) rule = `环比${text.includes("波动") ? "波动" : "变化"}超过 ${pct}%`;
          else rule = `环比变化超过 ${pct}%`;
        } else if (text.includes("连续") && text.includes("天")) {
          const days = text.match(/连续\s*(\d+)\s*天/);
          rule = `${metric} 连续 ${days ? days[1] : "3"} 天超过阈值`;
        } else if (text.includes("减少") || text.includes("下降") || text.includes("跌")) {
          rule = `环比下降超过 ${pct}%`;
        } else if (text.includes("增长") || text.includes("上升") || text.includes("涨")) {
          rule = `环比上升超过 ${pct}%`;
        } else if (text.includes("超过") || text.includes("大于") || text.includes("高于")) {
          const value = text.match(/(\d+(?:\.\d+)?)/);
          rule = `${metric} 超过 ${value ? value[1] : "80"}`;
        }
        let frequency = "每天", time = "09:00";
        if (text.includes("每小") || text.includes("每小时")) frequency = "每小时";
        else if (text.includes("每周")) frequency = "每周";
        const timeMatch = text.match(/(\d{1,2})[:：](\d{2})/);
        if (timeMatch) time = `${String(Number(timeMatch[1])).padStart(2, "0")}:${timeMatch[2]}`;
        return { name: `${metric}${rule.includes("连续") ? "连续异常" : rule.replace(metric, "").replace(/超过/g, "超").replace(/大于/g, ">")}预警`, table, metric, agg, filters: filters.slice(0, 6), rule, frequency, time };
      },
      saveAlert() {
        if (!this.parsed) return;
        if (!this.users.length && !this.groups.length) return ep.ElMessage.warning("至少配置一个通知人或通知群");
        const payload = {
          name: this.parsed.name || `${this.parsed.metric}预警`,
          text: this.text.trim(),
          table: this.parsed.table, metric: this.parsed.metric, agg: this.parsed.agg,
          filters: [...this.parsed.filters], rule: this.parsed.rule, frequency: this.parsed.frequency, time: this.parsed.time,
          sql: this.alertSql, enabled: true, users: [...this.users], groups: [...this.groups],
          creator: this.currentUser?.name || "曾祥竞",
          lastTriggered: "—", triggerCount: 0, history: []
        };
        if (this.editingId) {
          const target = this.alerts.find(item => item.id === this.editingId);
          if (target) Object.assign(target, payload, { enabled: target.enabled, lastTriggered: target.lastTriggered, triggerCount: target.triggerCount, history: target.history, creator: target.creator });
        } else {
          this.alerts.unshift({ id: "AL" + Date.now(), ...payload });
        }
        this.persistAlerts();
        this.dialogVisible = false;
        notify(`预警「${payload.name}」已保存${this.editingId ? "并更新" : "，飞书机器人将按配置推送"}`);
      },
      toggleEnabled(row) {
        notify(`预警「${row.name}」已${row.enabled ? "启用，触发时将推送飞书" : "停用，不再推送"}`);
      },
      async removeAlert(row) {
        try {
          await ep.ElMessageBox.confirm(`删除后该预警将停止推送，确认删除「${row.name}」？`, "删除预警", { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" });
        } catch (error) { return; }
        this.alerts = this.alerts.filter(item => item.id !== row.id);
        this.persistAlerts();
        notify(`预警「${row.name}」已删除`);
      },
      openHistory(row) {
        this.historyTitle = row.name;
        this.historyRows = row.history || [];
        this.historyVisible = true;
      }
    },
    mounted() { this.loadAlerts(); }
  };

  mount("#sidebar", SidebarApp, "sidebar");
  mount("#analysisWorkbenchView", AnalysisWorkbenchApp, "analysis-workbench");
  mount(".topbar", TopbarApp, "topbar");
  mount(".page-head", PageHeadApp, "page-head");
  mount("#dataBoardView", DataBoardApp, "data-board");
  mount("#boardManagementView", BoardManagementApp, "board-management");
  mount("#dataAssetView", AssetManagementApp, "asset-management");
  mount("#dimensionView", DimensionManagementApp, "dimension-management");
  mount("#dimensionDataView", DimensionDataApp, "dimension-data");
  mount("#dictionaryView", DictionaryManagementApp, "dictionary-management");
  mount("#apiConfigView", ApiManagementApp, "api-management");
  mount("#apiCreateView", ApiCreateApp, "api-create");
  mount("#tagCatalogView", TagManagementApp, "tag-management");
  mount("#pushTargetView", TargetManagementApp, "target-management");
  mount("#userManagementView", UserManagementApp, "user-management");
  mount("#permissionGroupView", PermissionGroupApp, "permission-groups");
  mount("#permissionConfigView", PermissionConfigApp, "permission-config");
  mount("#quickBiView", QuickBiApp, "quick-bi");
  mount("#noPermissionView", NoPermissionApp, "no-permission");
  mount("#menuManagementView", MenuManagementApp, "menu-management");
  mount("#modelConfigView", ModelConfigApp, "model-config");
  mount("#skillManagementView", SkillManagementApp, "skill-management");
  window.alertVueApi = mount("#alertManagementView", AlertManagementApp, "alert-management");

  document.getElementById("portalApp").dataset.elementMigrated = "true";
  document.querySelector(".page-head")?.classList.toggle("portal-vue-head-hidden", ["新增API","新建人群包","Quick BI 展示","配置权限","无权限","维表数据维护"].includes(currentPage.value));
  window.portalVueModuleApi = {
    refresh(page = bridge.getPage()) { currentPage.value = page; refreshTick.value += 1; },
    state
  };
  window.dispatchEvent(new CustomEvent("portal:page-change", { detail: { page: bridge.getPage() } }));
})();
