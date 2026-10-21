/**
 * 页面：dimension-management
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    analysisGatewayBase,
    bridge,
    dictHint,
    enabledDictItems,
    ep,
    mount,
    notify,
    paginate,
    refreshTick,
    state
  } = window.PortalVue;


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
            <el-button v-if="canEdit('维表管理')" type="primary" @click="openCreate">新增维表</el-button>
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
            <el-table-column label="操作" width="168" fixed="right"><template #default="scope"><div class="portal-vue-actions"><el-button v-if="canEdit('维表管理')" link type="primary" @click="openMaintain(scope.row)">维护数据</el-button><el-button link type="primary" @click="openDetail(scope.row)">详情</el-button></div></template></el-table-column>
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
                <el-table-column width="70" align="center"><template #default="scope"><el-button v-if="canEdit('维表管理')" link type="danger" :disabled="createForm.fields.length===1" @click="createForm.fields.splice(scope.$index,1)">删除</el-button></template></el-table-column>
              </el-table>
              <el-button v-if="canEdit('维表管理')" class="portal-vue-add-field" @click="createForm.fields.push({name:'',type:'VARCHAR',comment:'',remark:'',dictId:''})">添加字段</el-button>
            </el-form-item>
          </el-form>
          <template #footer><el-button @click="createVisible=false">取消</el-button><el-button v-if="canEdit('维表管理')" type="primary" @click="saveCreate">保存并维护数据</el-button></template>
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
          <template #footer><el-button @click="detailVisible=false">关闭</el-button><el-button v-if="canEdit('维表管理')" type="primary" @click="saveDetail">保存配置</el-button><el-button v-if="canEdit('维表管理')" type="primary" @click="openMaintain(detail)">维护数据</el-button></template>
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
  mount("#dimensionView", DimensionManagementApp, "dimension-management");
})();
