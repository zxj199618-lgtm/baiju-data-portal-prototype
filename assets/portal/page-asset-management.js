/**
 * 页面：asset-management
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    bridge,
    confirmAction,
    dictHint,
    enabledDictItems,
    ep,
    groupOfUser,
    loginUser,
    mount,
    notify,
    paginate,
    refreshTick,
    state
  } = window.PortalVue;


  function effectiveTableNames(user) {
    const group = groupOfUser(user);
    const grants = [...(group?.tables || []), ...(Array.isArray(user?.tableGrants) ? user.tableGrants : [])];
    if (grants.includes("全部数据表")) return new Set(state.assets.map(table => table.cnName));
    return new Set(state.assets.filter(table => grants.includes(table.cnName)).map(table => table.cnName));
  }

  function tableScopeLabel(user, total) {
    if (effectiveTableNames(user).size >= state.assets.length) return "全部数据表";
    return `${effectiveTableNames(user).size} / ${total} 张数据表`;
  }

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
            <el-button v-if="canEdit('表管理')" type="primary" @click="openCreate">新增表</el-button>
          </div>
          <div class="portal-vue-scope-hint"><span>可见范围：<strong>{{ scopeLabel }}</strong></span><span class="portal-vue-muted">{{ canEdit('表管理') ? '可在范围内新增/编辑数据表' : '当前菜单未配置「编辑」权限，仅可查看' }}</span></div>
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
            <el-table-column label="服务状态" width="92" align="center"><template #default="scope"><el-switch :disabled="!canEdit('表管理')" :model-value="scope.row.serviceStatus==='启用'" @change="value=>toggleService(scope.row,value)"></el-switch></template></el-table-column>
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
          <template #footer><el-button @click="createVisible=false">取消</el-button><el-button v-if="canEdit('表管理')" type="primary" @click="saveCreate">保存</el-button></template>
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
          <template #footer><el-button @click="detailVisible=false">关闭</el-button><el-button v-if="canEdit('表管理')" type="primary" @click="saveDetail">保存配置</el-button></template>
        </el-drawer>
      </el-config-provider>
    `,
    data: () => ({ status: "启用", keyword: "", source: "", database: "", owner: "", bizLine: "", page: 1, pageSize: 10, createVisible: false, createForm: {}, detailVisible: false, detail: null, detailDraft: {} }),
    computed: {
      scopeTableNames() { refreshTick.value; return effectiveTableNames(loginUser()); },
      scopeLabel() { refreshTick.value; return tableScopeLabel(loginUser(), state.assets.length); },
      scopeAssets() { refreshTick.value; const allowed = this.scopeTableNames; return state.assets.filter(item => allowed.has(item.cnName)); },
      sources() { return [...new Set(this.scopeAssets.map(item => item.source))]; },
      databases() { return [...new Set(this.scopeAssets.filter(item => !this.source || item.source === this.source).map(item => item.database))]; },
      owners() { return [...new Set(this.scopeAssets.map(item => item.owner).filter(Boolean))].sort((left, right) => left.localeCompare(right, "zh-CN")); },
      bizLines() { return [...new Set(this.scopeAssets.map(item => item.bizLine).filter(Boolean))]; },
      filteredRows() { refreshTick.value; const keyword = this.keyword.trim().toLowerCase(); return state.assets.filter(item => this.scopeTableNames.has(item.cnName) && (item.serviceStatus || "启用") === this.status && (!this.source || item.source === this.source) && (!this.database || item.database === this.database) && (!this.owner || item.owner === this.owner) && (!this.bizLine || item.bizLine === this.bizLine) && (!keyword || `${item.table} ${item.externalName} ${item.cnName}`.toLowerCase().includes(keyword))); },
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
      openDetail(asset) { bridge.setTableDetailAsset(asset); bridge.setPage("表详情"); },
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
  mount("#dataAssetView", AssetManagementApp, "asset-management");
})();
