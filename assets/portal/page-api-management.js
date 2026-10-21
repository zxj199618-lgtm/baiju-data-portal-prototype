/**
 * 页面：api-management
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    bridge,
    confirmAction,
    ep,
    mount,
    notify,
    paginate,
    refreshTick,
    state
  } = window.PortalVue;


  const ApiManagementApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <el-tabs v-model="status" class="portal-vue-status-tabs" @tab-change="page=1"><el-tab-pane label="启用中" name="启用"></el-tab-pane><el-tab-pane label="已停用" name="停用"></el-tab-pane></el-tabs>
          <div class="portal-vue-toolbar"><div class="portal-vue-toolbar-left"><el-input v-model="keyword" class="portal-vue-search" clearable placeholder="搜索接口名称、表名" @input="page=1"></el-input></div><el-button v-if="canEdit('数据开放平台')" type="primary" @click="openEditor(-1)">新增 API</el-button></div>
          <el-table :data="pagedRows" class="portal-vue-table" border empty-text="暂无 API">
            <el-table-column label="接口名称" width="190" fixed="left" show-overflow-tooltip><template #default="scope"><span class="portal-vue-name">{{ scope.row.name }}</span></template></el-table-column>
            <el-table-column label="关联表" width="130"><template #default="scope"><el-tooltip placement="top" :content="assetTooltip(scope.row)"><span>共 {{ apiAssets(scope.row).length }} 张表</span></el-tooltip></template></el-table-column>
            <el-table-column label="授权字段" width="100" align="center"><template #default="scope">{{ fieldCount(scope.row) }} 个</template></el-table-column>
            <el-table-column prop="usage" label="使用场景" min-width="230" show-overflow-tooltip></el-table-column>
            <el-table-column label="最近30日调用次数" width="150" align="right"><template #default="scope">{{ Number(scope.row.callCount30d || scope.row.callCount || 0).toLocaleString() }}</template></el-table-column>
            <el-table-column label="状态" width="86" align="center"><template #default="scope"><el-switch :disabled="!canEdit('数据开放平台')" :model-value="scope.row.tokenStatus==='启用'" @change="value=>toggleStatus(scope.row,value)"></el-switch></template></el-table-column>
            <el-table-column prop="creator" label="创建人" width="100"></el-table-column>
            <el-table-column prop="lastCall" label="最近调用" width="170"></el-table-column>
            <el-table-column label="操作" width="190" fixed="right"><template #default="scope"><div class="portal-vue-actions"><el-button v-if="canEdit('数据开放平台')" link type="primary" @click="openEditor(state.apis.indexOf(scope.row))">编辑</el-button><el-button link type="primary" @click="copyToken(scope.row)">复制 Token</el-button></div></template></el-table-column>
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
  mount("#apiConfigView", ApiManagementApp, "api-management");
})();
