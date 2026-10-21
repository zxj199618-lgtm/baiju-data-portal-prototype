/**
 * 页面：dimension-data
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    analysisGatewayBase,
    bridge,
    confirmAction,
    enabledDictItems,
    ep,
    mount,
    notify,
    refreshTick,
    state
  } = window.PortalVue;


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
            <div class="portal-vue-toolbar-left"><span class="portal-vue-muted">带下拉的字段来自「关联字典」配置。默认行只读，点「编辑」后可修改；也可切换到「弹窗编辑」，新增/编辑都在右侧弹窗逐字段操作。<template v-if="gatewayLive">当前展示网关模拟数据前 100 行（共 {{ totalRows }} 行），保存后写回网关，AI 分析将使用最新数据。</template></span></div>
            <div class="portal-vue-actions">
              <el-radio-group v-model="viewMode" size="default">
                <el-radio-button value="row">行编辑</el-radio-button>
                <el-radio-button value="modal">弹窗编辑</el-radio-button>
              </el-radio-group>
              <el-button v-if="canEdit('维表管理')" type="primary" @click="addRow">＋ 新增行</el-button>
            </div>
          </div>
          <el-table v-if="viewMode === 'row' || viewMode === 'modal'" :data="draftRows" class="portal-vue-table" border empty-text="暂无数据，请新增行">
            <el-table-column v-for="field in editorFields" :key="field.name" min-width="180">
              <template #header>
                <span>{{ field.comment || field.name }}</span>
                <el-tag v-if="field.dictId" size="small" effect="plain" class="portal-vue-field-dict">{{ dictLabel(field) }}</el-tag>
              </template>
              <template #default="scope">
                <template v-if="viewMode === 'row' && scope.$index === editingKey">
                  <el-select v-if="field.dictId" v-model="scope.row[field.name]" clearable filterable placeholder="请选择枚举值">
                    <el-option v-for="item in dictItems(field.dictId)" :key="item.code" :label="item.code + ' / ' + item.name" :value="item.code"></el-option>
                  </el-select>
                  <el-input v-else v-model="scope.row[field.name]"></el-input>
                </template>
                <span v-else class="portal-vue-dim-cell">{{ displayValue(scope.row[field.name], field) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right"><template #default="scope">
              <template v-if="viewMode === 'row' && scope.$index === editingKey">
                <el-button v-if="canEdit('维表管理')" link type="primary" @click="saveRow">保存</el-button>
                <el-button link @click="cancelRow(scope.$index)">取消</el-button>
              </template>
              <template v-else>
                <el-button v-if="viewMode === 'row'" link type="primary" @click="editRow(scope.$index)">编辑</el-button>
                <el-button v-else link type="primary" @click="openRowDrawer(scope.$index)">编辑</el-button>
                <el-button v-if="canEdit('维表管理')" link type="danger" @click="removeRow(scope.$index)">删除</el-button>
              </template>
            </template></el-table-column>
          </el-table>
          <div class="portal-vue-dim-actions-bar">
            <span class="portal-vue-muted" style="font-size:12px">共 {{ draftRows.length }} 行{{ editingKey !== null ? ' · 正在编辑第 ' + (editingKey + 1) + ' 行' : '' }}</span>
            <div style="display:flex;gap:10px"><el-button @click="back">取消</el-button><el-button v-if="canEdit('维表管理')" type="primary" @click="save">保存数据</el-button></div>
          </div>
        </div>
        <el-empty v-if="!asset" description="未找到要维护的维表"></el-empty>
        <el-drawer v-model="rowDrawerVisible" :title="(rowDrawerIndex === null ? '新增行' : '编辑行 #' + (rowDrawerIndex + 1)) + ' · ' + (asset?.cnName || '')" size="560px" direction="rtl" class="portal-vue-edit-drawer" :close-on-click-modal="true">
          <div class="portal-vue-skill-drawer">
            <div v-for="field in editorFields" :key="field.name" class="portal-vue-alert-field">
              <label>{{ field.comment || field.name }}<el-tag v-if="field.dictId" size="small" effect="plain" style="margin-left:6px">{{ dictLabel(field) }}</el-tag></label>
              <el-select v-if="field.dictId" v-model="rowDraft[field.name]" clearable filterable placeholder="请选择枚举值">
                <el-option v-for="item in dictItems(field.dictId)" :key="item.code" :label="item.code + ' / ' + item.name" :value="item.code"></el-option>
              </el-select>
              <el-input v-else v-model="rowDraft[field.name]" :placeholder="'请输入' + (field.comment || field.name)"></el-input>
            </div>
          </div>
          <template #footer><el-button @click="rowDrawerVisible=false">取消</el-button><el-button v-if="canEdit('维表管理')" type="primary" @click="saveRowDrawer">保存</el-button></template>
        </el-drawer>
      </el-config-provider>
    `,
    data: () => ({ draftRows: [], gatewayFields: null, gatewayTotal: 0, gatewayLive: false, saving: false, viewMode: "row", editingKey: null, editBackup: null, rowDrawerVisible: false, rowDrawerIndex: null, rowDraft: {} }),
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
      displayValue(value, field) {
        if (value === undefined || value === null || value === "") return "—";
        if (field.dictId) {
          const item = this.dictItems(field.dictId).find(item => item.code === value);
          return item ? `${item.code} / ${item.name}` : value;
        }
        return value;
      },
      emptyRow() { const row = {}; this.editorFields.forEach(field => { row[field.name] = ""; }); return row; },
      addRow() {
        if (this.viewMode === "modal") { this.openRowDrawer(null); return; }
        this.editingKey = 0; this.editBackup = null; this.draftRows.unshift(this.emptyRow());
      },
      editRow(index) { if (index === this.editingKey) return; this.editingKey = index; this.editBackup = { ...this.draftRows[index] }; },
      saveRow() { this.editingKey = null; this.editBackup = null; },
      cancelRow(index) { if (this.editBackup) { this.draftRows[index] = this.editBackup; } this.editBackup = null; this.editingKey = null; },
      openRowDrawer(index) {
        this.rowDrawerIndex = index;
        this.rowDraft = index === null ? this.emptyRow() : { ...this.draftRows[index] };
        this.rowDrawerVisible = true;
      },
      saveRowDrawer() {
        if (this.rowDrawerIndex === null) this.draftRows.unshift({ ...this.rowDraft });
        else this.draftRows[this.rowDrawerIndex] = { ...this.rowDraft };
        this.rowDrawerVisible = false;
      },
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
  mount("#dimensionDataView", DimensionDataApp, "dimension-data");
})();
