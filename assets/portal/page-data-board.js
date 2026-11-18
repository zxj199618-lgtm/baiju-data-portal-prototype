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
    boardSync,
    effectiveBoardNames,
    humanCount,
    loginUser,
    mount,
    refreshTick,
    state,
    track
  } = window.PortalVue;


  function readDirWidth() { try { const value = Number(localStorage.getItem("portal-board-dir-width")); return value >= 220 && value <= 480 ? value : 290; } catch (error) { return 290; } }
  const DataBoardApp = {
    template: `
      <el-config-provider :locale="locale">
        <div class="portal-vue-directory" :class="{collapsed:directoryCollapsed, resizing:dirResizing}" :style="directoryCollapsed ? null : { gridTemplateColumns: dirWidth + 'px minmax(0, 1fr)' }">
          <aside class="portal-vue-directory-aside" :class="{collapsed:directoryCollapsed}">
            <button class="portal-vue-directory-collapse" type="button" :title="directoryCollapsed ? '展开看板目录' : '向左折叠看板目录'" @click="directoryCollapsed=!directoryCollapsed">{{ directoryCollapsed ? '›' : '‹' }}</button>
            <div v-if="!directoryCollapsed" class="portal-vue-directory-resizer" title="拖动调整目录宽度，双击恢复默认" @mousedown.prevent="startResize" @dblclick="dirWidth=290"></div>
            <div v-show="!directoryCollapsed" class="portal-vue-directory-content">
              <div class="portal-vue-directory-head"><span>数据看板</span><el-tag size="small" effect="plain">{{ onlineBoards.length }}</el-tag></div>
              <el-input v-model="keyword" clearable placeholder="输入分类或看板名称搜索"></el-input>
              <el-scrollbar class="portal-vue-board-scroll">
              <div v-if="favorites.length" class="portal-vue-board-group">
                <div class="portal-vue-board-group-title"><span>★ 我的收藏</span><span>{{ favorites.length }}</span></div>
                <el-popover v-for="item in favorites" :key="'fav-'+item.board.quickBiId" placement="right" trigger="hover" :width="340" :show-after="300" :hide-after="80" popper-class="portal-vue-board-popover">
                  <template #reference><button class="portal-vue-board-item" :class="{active:item.index===activeIndex}" type="button" @click="selectBoard(item.index)"><span class="portal-vue-board-title">{{ item.board.name }}</span><span class="portal-vue-star active" title="取消收藏" @click.stop="toggleFavorite(item.board)">★</span></button></template>
                  <div class="portal-vue-board-popover-content"><strong class="portal-vue-board-popover-title">{{ item.board.name }}</strong><dl class="portal-vue-board-popover-meta"><dt>备注</dt><dd>{{ item.board.desc || '暂无备注' }}</dd><dt>看板负责人</dt><dd>{{ item.board.owner || '—' }}</dd></dl></div>
                </el-popover>
              </div>
              <div v-for="group in groupedBoards" :key="group.category" class="portal-vue-board-group">
                <div class="portal-vue-board-group-title"><span>{{ group.category }}</span><span>{{ group.items.length }}</span></div>
                <el-popover v-for="item in group.items" :key="item.board.quickBiId" placement="right" trigger="hover" :width="340" :show-after="300" :hide-after="80" popper-class="portal-vue-board-popover">
                  <template #reference><button class="portal-vue-board-item" :class="{active:item.index===activeIndex}" type="button" @click="selectBoard(item.index)"><span class="portal-vue-board-title">{{ item.board.name }}</span><span class="portal-vue-star" :class="{active:isFavorite(item.board)}" :title="isFavorite(item.board)?'取消收藏':'收藏'" @click.stop="toggleFavorite(item.board)">★</span></button></template>
                  <div class="portal-vue-board-popover-content"><strong class="portal-vue-board-popover-title">{{ item.board.name }}</strong><dl class="portal-vue-board-popover-meta"><dt>备注</dt><dd>{{ item.board.desc || '暂无备注' }}</dd><dt>看板负责人</dt><dd>{{ item.board.owner || '—' }}</dd></dl></div>
                </el-popover>
              </div>
              </el-scrollbar>
            </div>
          </aside>
          <section v-if="activeBoard" class="portal-vue-board-pane">
            <template v-if="activeBoard.type === 'custom'">
              <div class="portal-vue-board-hero">
                <div><el-tag size="small" effect="plain">{{ activeBoard.category }}</el-tag><el-tag size="small" type="success" effect="light" style="margin-left:6px">自定义看板</el-tag><h2>{{ activeBoard.name }}</h2><p>{{ activeBoard.desc || '自定义看板' }} · 负责人 {{ activeBoard.owner }}</p></div>
                <el-button @click="openFull">新窗口打开</el-button>
              </div>
              <iframe class="portal-vue-custom-frame" :key="activeBoard.quickBiId" :src="activeBoard.url" :title="activeBoard.name" allow="fullscreen" referrerpolicy="no-referrer-when-downgrade"></iframe>
              <p class="portal-vue-muted" style="margin:8px 0 0;font-size:12px">如果这里一直空白，说明该地址不允许被嵌入，请点右上角「新窗口打开」。</p>
            </template>
            <template v-else>
            <div class="pvb-root">
            <div class="pvb-head">
              <div><el-tag size="small" effect="plain">{{ activeBoard.category }}</el-tag><h2>{{ activeBoard.name }}</h2><p>Quick BI 嵌入 · 负责人 {{ activeBoard.owner }} · 已按登录身份加载行级权限</p></div>
              <el-button round @click="openFull">全屏打开</el-button>
            </div>
            <div class="pvb-filters">
              <div class="pvb-filter"><span>日期</span><el-radio-group v-model="datePreset" size="small"><el-radio-button v-for="item in datePresets" :key="item.value" :value="item.value">{{ item.label }}</el-radio-button></el-radio-group></div>
              <div class="pvb-filter"><span>渠道</span><el-select v-model="channel" size="small" style="width:140px"><el-option label="全部渠道" value="all"></el-option><el-option v-for="name in channelNames" :key="name" :label="name" :value="name"></el-option></el-select></div>
              <button type="button" class="pvb-note-btn" @click="showNotes=!showNotes">{{ showNotes ? '收起口径说明' : '口径说明' }}</button>
            </div>
            <div v-if="showNotes" class="pvb-text note">口径：消耗为各渠道含返点后的实际花费；转化数为注册成功后 24 小时内下单的用户数；ROI = 订单收入 ÷ 消耗；环比与上一个同等长度的周期比较。</div>
            <div class="pvb-band">
              <div v-for="(kpi, index) in kpis" :key="kpi.label" class="pvb-kpi"><div class="pvb-kpi-name">{{ kpi.label }}</div><div class="pvb-kpi-val">{{ kpi.value }}</div><div class="pvb-kpi-delta" :class="kpi.delta >= 0 ? 'good' : 'bad'">较上期 {{ kpi.delta >= 0 ? '+' : '' }}{{ kpi.delta.toFixed(1) }}%</div><svg class="pvb-spark" viewBox="0 0 100 34" preserveAspectRatio="none"><path :d="sparkArea(index)" :fill="'url(#pvbArea)'"></path><path :d="sparkLine(index)" fill="none" stroke="#7c6bc4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"></path></svg></div>
            </div>
            <div class="pvb-section"><span class="pvb-dot"></span>渠道与趋势</div>
            <div class="pvb-grid">
              <section class="pvb-panel"><h3>媒体渠道消耗</h3><div class="pvb-bars"><div v-for="(bar, index) in bars" :key="bar.name" class="pvb-bar-col"><em>{{ bar.value }}</em><div class="pvb-bar" :style="{height:bar.height+'px', background: palette[index % palette.length]}"></div><span>{{ bar.name }}</span></div></div></section>
              <section class="pvb-panel"><h3>近 7 日趋势<span class="pvb-legend"><i style="background:#7c6bc4"></i>消耗<i style="background:#94b23a"></i>转化数</span></h3><svg class="pvb-line" viewBox="0 0 420 190" preserveAspectRatio="none"><defs><linearGradient id="pvbArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c6bc4" stop-opacity=".28"></stop><stop offset="1" stop-color="#7c6bc4" stop-opacity="0"></stop></linearGradient></defs><line v-for="y in [40,90,140]" :key="y" x1="10" x2="410" :y1="y" :y2="y" stroke="rgba(48,48,51,.08)"></line><path :d="areaPath" fill="url(#pvbArea)"></path><path :d="smoothPath" fill="none" stroke="#7c6bc4" stroke-width="2.5" stroke-linecap="round"></path><path :d="smoothPath2" fill="none" stroke="#94b23a" stroke-width="2.5" stroke-linecap="round"></path><circle v-for="point in pointList" :key="point.x" :cx="point.x" :cy="point.y" r="3.5" fill="#fff" stroke="#7c6bc4" stroke-width="2"></circle></svg></section>
            </div>
            <div class="pvb-section"><span class="pvb-dot"></span>转化与明细</div>
            <div class="pvb-grid pvb-grid-even">
              <section class="pvb-panel"><h3>转化漏斗</h3><div class="pvb-funnel"><div v-for="stage in funnel" :key="stage.name" class="pvb-stage"><div class="pvb-stage-head"><span>{{ stage.name }}</span><b>{{ stage.value }}</b><small v-if="stage.step">较上一步 {{ stage.step }}</small></div><div class="pvb-stage-track"><div class="pvb-stage-fill" :style="{width: stage.width + '%', background: stage.color}"></div></div></div></div></section>
              <section class="pvb-panel"><h3>渠道明细</h3><el-table :data="tableRows" size="default" class="pvb-table"><el-table-column prop="name" label="渠道" min-width="90"></el-table-column><el-table-column prop="cost" label="消耗" align="right" min-width="90"></el-table-column><el-table-column prop="conv" label="转化数" align="right" min-width="90"></el-table-column><el-table-column prop="roi" label="ROI" align="right" min-width="70"></el-table-column><el-table-column label="环比" align="right" min-width="80"><template #default="scope"><span :class="scope.row.delta >= 0 ? 'pvb-up' : 'pvb-down'">{{ scope.row.delta >= 0 ? '+' : '' }}{{ scope.row.delta.toFixed(1) }}%</span></template></el-table-column></el-table></section>
            </div>
            <div class="pvb-text">提示：折线、柱状与表格支持按用户自选列和系列；以上为示意数据，接入 Quick BI 后以真实数据为准。</div>
            </div>
            </template>
          </section>
          <el-empty v-else description="暂无匹配看板"></el-empty>
        </div>
      </el-config-provider>
    `,
    data: () => ({ keyword: "", activeIndex: 0, directoryCollapsed: false, datePreset: "last7d", channel: "all", showNotes: false, datePresets: [{ value: "yesterday", label: "昨天" }, { value: "last7d", label: "近7天" }, { value: "last30d", label: "近30天" }, { value: "thisMonth", label: "本月" }, { value: "lastMonth", label: "上月" }], channelNames: ["巨量", "广点通", "快手", "OPPO", "VIVO"], dirWidth: readDirWidth(), dirResizing: false }),
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
      seed() { const base = boardSeed(this.activeBoard?.name || "观星台"); const salt = { yesterday: 3, last7d: 0, last30d: 7, thisMonth: 11, lastMonth: 5 }[this.datePreset] || 0; const ch = this.channel === "all" ? 0 : (this.channelNames.indexOf(this.channel) + 1) * 13; return base + salt * 977 + ch * 131; },
      palette() { return ["#7c6bc4", "#94b23a", "#e2967a", "#5fa8a0", "#b9a9e0"]; },
      smoothPath() { const p=this.pointList; if(!p.length)return ""; let d=`M${p[0].x},${p[0].y}`; for(let i=1;i<p.length;i++){const cx=(p[i-1].x+p[i].x)/2;d+=` C${cx},${p[i-1].y} ${cx},${p[i].y} ${p[i].x},${p[i].y}`;} return d; },
      areaPath() { const p=this.pointList; return p.length?`${this.smoothPath} L${p[p.length-1].x},170 L${p[0].x},170 Z`:""; },
      kpis() { return [{ label: "消耗", value: `¥${((this.seed % 800000 + 180000) / 10000).toFixed(1)}万`, delta: this.delta(0) }, { label: "转化数", value: humanCount(this.seed % 26000 + 9000), delta: this.delta(1) }, { label: "ROI", value: ((this.seed % 260) / 100 + .9).toFixed(2), delta: this.delta(2) }, { label: "触达用户", value: `${((this.seed % 620000 + 260000) / 10000).toFixed(1)}万`, delta: this.delta(3) }]; },
      funnel() { const top = this.seed % 900000 + 600000; const rates = [1, .38 + (this.seed % 9) / 100, .52 + (this.seed % 7) / 100, .41 + (this.seed % 5) / 100, .86]; let value = top; const names = ["曝光", "点击", "注册", "下单", "支付"]; const pal = this.palette; return names.map((name, index) => { const prev = value; value = index === 0 ? top : Math.round(prev * rates[index]); return { name, value: humanCount(value), width: Math.max(2, value / top * 100), step: index ? (value / prev * 100).toFixed(1) + "%" : "", color: pal[0] }; }); },
      tableRows() { const names = this.channel === "all" ? this.channelNames : [this.channel]; return names.map((name, index) => { const n = (this.seed >> index) % 97; return { name, cost: `¥${(n * 1300 + 52000).toLocaleString()}`, conv: (n * 31 + 800).toLocaleString(), roi: (1 + (n % 30) / 12).toFixed(2), delta: ((n % 23) - 9) / 1.4 }; }); },
      smoothPath2() { const p = this.pointList.map((point, index) => ({ x: point.x, y: 150 - ((this.seed >> (index + 3)) % 80) })); let d = `M${p[0].x},${p[0].y}`; for (let i = 1; i < p.length; i++) { const cx = (p[i - 1].x + p[i].x) / 2; d += ` C${cx},${p[i - 1].y} ${cx},${p[i].y} ${p[i].x},${p[i].y}`; } return d; },
      bars() { const names = ["巨量", "广点通", "快手", "OPPO", "VIVO"]; return names.map((name, index) => ({ name, height: 50 + ((this.seed >> index) % 120), value: `${(((this.seed >> index) % 120) / 10 + 3).toFixed(1)}万` })); },
      pointList() { return Array.from({ length: 7 }, (_, index) => ({ x: 28 + index * 58, y: 140 - ((this.seed >> index) % 85) })); },
      linePoints() { return this.pointList.map(point => `${point.x},${point.y}`).join(" "); }
    },
    mounted() { this.pageHandler = event => { if (event.detail?.page === "数据看板") { this.syncRoute(); this.trackVisit(); } }; window.addEventListener("portal:page-change", this.pageHandler); this.syncRoute(); },
    beforeUnmount() { window.removeEventListener("portal:page-change", this.pageHandler); },
    watch: { activeBoard() { this.trackVisit(); } },
    methods: {
      /* 访问记录：停留在数据看板页并选中某个看板，就开始一次看板访问（每 10 秒一次心跳） */
      trackVisit() { if (bridge.getPage() === "数据看板" && this.activeBoard) track.startBoardVisit(this.activeBoard); },
      sparkPoints(index) { return Array.from({ length: 12 }, (_, i) => 28 - ((this.seed >> ((i + index) % 11)) % 22) - i * 0.4); },
      sparkLine(index) { const p = this.sparkPoints(index); return p.map((y, i) => `${i ? "L" : "M"}${(i * 100 / 11).toFixed(1)},${Math.max(3, y).toFixed(1)}`).join(" "); },
      sparkArea(index) { return `${this.sparkLine(index)} L100,34 L0,34 Z`; },
      delta(n) { return (((this.seed >> (n + 2)) % 180) - 70) / 10; },
      startResize(event) {
        const startX = event.clientX, startWidth = this.dirWidth;
        this.dirResizing = true;
        const move = e => { this.dirWidth = Math.min(480, Math.max(220, startWidth + e.clientX - startX)); };
        const up = () => { this.dirResizing = false; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); try { localStorage.setItem("portal-board-dir-width", String(this.dirWidth)); } catch (error) { /* 无存储时忽略 */ } };
        window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
      },
      selectBoard(index) { this.activeIndex = index; bridge.setRouteBoard?.(state.boards[index]?.quickBiId); },
      // 地址里指定了看板就选中它；该用户看不到时提示并显示默认看板；最后把实际显示的看板写回地址
      syncRoute() {
        const id = bridge.getRouteBoard?.();
        if (id) {
          const hit = this.indexedBoards.find(item => item.board.quickBiId === id);
          if (hit) this.activeIndex = hit.index;
          else bridge.routeNotice?.("你没有该看板的查看权限，已显示默认看板");
        }
        bridge.setRouteBoard?.(this.activeBoard?.quickBiId);
      },
      isFavorite(board) { return state.favorites.has(board.quickBiId); },
      toggleFavorite(board) { state.favorites.has(board.quickBiId) ? state.favorites.delete(board.quickBiId) : state.favorites.add(board.quickBiId); refreshTick.value += 1; boardSync.pushFavorites(); },
      openFull() { if (this.activeBoard?.type === "custom") { window.open(this.activeBoard.url, "_blank", "noopener"); return; } const index = state.boards.indexOf(this.activeBoard); if (index >= 0) bridge.openQuickBi(index); }
    }
  };
  mount("#dataBoardView", DataBoardApp, "data-board");
})();
