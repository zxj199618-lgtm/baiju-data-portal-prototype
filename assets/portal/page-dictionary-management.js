/**
 * 页面：dictionary-management
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    confirmAction,
    ep,
    mount,
    notify,
    paginate,
    refreshTick,
    state
  } = window.PortalVue;


  const DictionaryManagementApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <el-tabs v-model="status" class="portal-vue-status-tabs" @tab-change="page=1"><el-tab-pane label="启用中" name="启用"></el-tab-pane><el-tab-pane label="已停用" name="停用"></el-tab-pane></el-tabs>
          <div class="portal-vue-toolbar">
            <div class="portal-vue-toolbar-left"><el-input v-model="keyword" class="portal-vue-search" clearable placeholder="搜索字典名称、编码" @input="page=1"></el-input></div>
            <el-button v-if="canEdit('字典管理')" type="primary" @click="openForm(null)">新增字典</el-button>
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
            <el-table-column label="状态" width="86" align="center"><template #default="scope"><el-switch :disabled="!canEdit('字典管理')" :model-value="scope.row.status==='启用'" @change="value=>toggleStatus(scope.row,value)"></el-switch></template></el-table-column>
            <el-table-column label="操作" width="180" fixed="right"><template #default="scope"><div class="portal-vue-actions"><el-button v-if="canEdit('字典管理')" link type="primary" @click="openItems(scope.row)">维护枚举值</el-button><el-button v-if="canEdit('字典管理')" link type="primary" @click="openForm(scope.row)">编辑</el-button></div></template></el-table-column>
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
          <template #footer><el-button @click="formVisible=false">取消</el-button><el-button v-if="canEdit('字典管理')" type="primary" @click="saveForm">保存</el-button></template>
        </el-dialog>
        <el-drawer v-model="itemVisible" :title="current ? current.name + ' · 维护枚举值' : '维护枚举值'" size="680px" class="tag-enum-drawer" :close-on-click-modal="true">
          <div v-if="current" class="tag-enum-drawer-form">
            <p class="portal-vue-muted">枚举编码需唯一。表字段关联本字典后，维护数据时按编码转成中文。</p>
            <div class="tag-enum-list" style="margin-top:16px">
              <div v-for="(item,index) in draftItems" :key="index" class="portal-vue-dict-row">
                <span class="tag-enum-row-index">{{ index + 1 }}</span>
                <el-input v-model="item.code" placeholder="编码"></el-input>
                <el-input v-model="item.name" placeholder="中文名"></el-input>
                <el-button text type="danger" :disabled="draftItems.length===1" @click="removeItem(index)">×</el-button>
              </div>
            </div>
            <el-button class="tag-enum-add" @click="draftItems.push({code:'',name:'',sort:draftItems.length+1})">添加枚举值</el-button>
          </div>
          <template #footer><el-button @click="itemVisible=false">取消</el-button><el-button v-if="canEdit('字典管理')" type="primary" @click="saveItems">保存枚举值</el-button></template>
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
        else state.dictionaries.unshift({ dictId: `DICT${String(state.dictionaries.length + 1).padStart(3, "0")}`, code: this.form.code.trim(), name: this.form.name.trim(), desc: this.form.desc.trim(), owner: this.form.owner, status: "启用", updatedAt: "2026-08-28 16:40", items: [{ code: "", name: "", sort: 1 }] });
        this.formVisible = false; notify(this.editing ? "字典已保存" : "字典已新增");
      },
      openItems(dict) { this.current = dict; this.draftItems = dict.items.map(item => ({ ...item })); this.itemVisible = true; },
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
        const items = this.draftItems.filter(item => item.code.trim() && item.name.trim()).map((item, index) => ({ code: item.code.trim(), name: item.name.trim(), sort: index + 1 }));
        if (!items.length) return ep.ElMessage.warning("请至少保留 1 个有效枚举值");
        const codes = items.map(item => item.code);
        if (new Set(codes).size !== codes.length) return ep.ElMessage.warning("编码不能重复");
        this.current.items.splice(0, this.current.items.length, ...items);
        this.current.updatedAt = "2026-08-28 16:40";
        this.itemVisible = false; notify(`字典「${this.current.name}」枚举值已更新`);
      }
    }
  };
  mount("#dictionaryView", DictionaryManagementApp, "dictionary-management");
})();
