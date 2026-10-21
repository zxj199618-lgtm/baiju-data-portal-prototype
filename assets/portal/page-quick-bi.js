/**
 * 页面：quick-bi
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    boardSeed,
    bridge,
    humanCount,
    mount,
    refreshTick
  } = window.PortalVue;


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
  mount("#quickBiView", QuickBiApp, "quick-bi");
})();
