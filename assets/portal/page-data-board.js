/**
 * 页面：data-board
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    boardSeed,
    bridge,
    effectiveBoardNames,
    humanCount,
    loginUser,
    mount,
    refreshTick,
    state
  } = window.PortalVue;


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
      scopeBoardNames() { refreshTick.value; return effectiveBoardNames(loginUser()); },
      onlineBoards() { refreshTick.value; const allowed = effectiveBoardNames(loginUser()); return state.boards.filter(board => board.status === "已上线" && allowed.has(board.name)); },
      indexedBoards() {
        const keyword = this.keyword.trim().toLowerCase();
        const allowed = this.scopeBoardNames;
        return state.boards.map((board, index) => ({ board, index })).filter(item => item.board.status === "已上线" && allowed.has(item.board.name) && (!keyword || `${item.board.category} ${item.board.name} ${item.board.quickBiId}`.toLowerCase().includes(keyword)));
      },
      groupedBoards() { return state.categories.filter(category => category !== "全部").map(category => ({ category, items: this.indexedBoards.filter(item => item.board.category === category) })).filter(group => group.items.length); },
      favorites() { return this.indexedBoards.filter(item => state.favorites.has(item.board.quickBiId)); },
      activeBoard() { const current = state.boards[this.activeIndex]; return (current && this.scopeBoardNames.has(current.name)) ? current : (this.indexedBoards[0]?.board || null); },
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
  mount("#dataBoardView", DataBoardApp, "data-board");
})();
