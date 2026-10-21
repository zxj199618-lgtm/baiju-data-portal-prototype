/**
 * 页面：board-management
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    confirmAction,
    effectiveBoardNames,
    ep,
    loginUser,
    mount,
    notify,
    paginate,
    refreshTick,
    state
  } = window.PortalVue;


  function boardScopeLabel(user, total) {
    if (effectiveBoardNames(user).size >= state.boards.length) return "全部看板";
    return `${effectiveBoardNames(user).size} / ${total} 个看板`;
  }

  const BoardManagementApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <el-tabs v-model="status" class="portal-vue-status-tabs" @tab-change="resetPage"><el-tab-pane label="已上线" name="已上线"></el-tab-pane><el-tab-pane label="已下线" name="已下线"></el-tab-pane></el-tabs>
          <div class="portal-vue-toolbar">
            <div class="portal-vue-toolbar-left">
              <el-input v-model="keyword" class="portal-vue-search" clearable placeholder="搜索看板名称、Quick BI ID" @input="resetPage"></el-input>
              <el-select v-model="category" class="portal-vue-filter" placeholder="全部分类" @change="resetPage"><el-option label="全部分类" value="全部分类"></el-option><el-option v-for="item in visibleCategories" :key="item" :label="item" :value="item"></el-option></el-select>
              <el-select v-model="owner" class="portal-vue-filter" placeholder="全部负责人" @change="resetPage"><el-option label="全部负责人" value="全部负责人"></el-option><el-option v-for="item in owners" :key="item" :label="item" :value="item"></el-option></el-select>
            </div>
            <div><el-button v-if="canEdit('看板管理')" @click="categoryDialog=true">管理分类</el-button><el-button v-if="canEdit('看板管理')" type="primary" @click="openForm()">新增看板</el-button></div>
          </div>
          <div class="portal-vue-scope-hint"><span>可见范围：<strong>{{ scopeLabel }}</strong></span><span class="portal-vue-muted">{{ canEdit('看板管理') ? '可在范围内新增/编辑看板' : '当前菜单未配置「编辑」权限，仅可查看' }}</span></div>
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
                      <el-tag v-if="user.direct" size="small" type="warning" effect="plain" class="portal-vue-viewer-tag">直接授权</el-tag>
                    </div>
                  </el-scrollbar>
                </el-popover>
                <span v-else class="portal-vue-muted">暂无</span>
              </template>
            </el-table-column>
            <el-table-column prop="owner" label="负责人" width="100"></el-table-column>
            <el-table-column label="状态" width="86" align="center"><template #default="scope"><el-switch :disabled="!canEdit('看板管理')" :model-value="scope.row.status==='已上线'" @change="value=>toggleStatus(scope.row,value)"></el-switch></template></el-table-column>
            <el-table-column prop="updatedAt" label="更新时间" width="170"></el-table-column>
            <el-table-column label="操作" width="96" fixed="right"><template #default="scope"><el-button v-if="canEdit('看板管理')" link type="primary" @click="openForm(scope.row)">编辑</el-button></template></el-table-column>
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
            <el-form-item label="可查看用户"><el-select v-model="form.users" multiple filterable clearable collapse-tags collapse-tags-tooltip :max-collapse-tags="4" placeholder="选择可直接查看该看板的用户（可不选）"><el-option v-for="item in selectableUsers" :key="item.name" :label="item.name" :value="item.name"><span>{{ item.name }}</span><span class="portal-vue-muted" style="float:right;margin-left:18px">{{ item.dept || '未挂部门' }}</span></el-option></el-select><p class="portal-vue-muted" style="margin:6px 0 0">直接授权的用户无需加入权限组即可在「数据看板」看到该看板，与权限组授权取并集；停用用户不参与授权。</p></el-form-item>
          </el-form>
          <template #footer><el-button @click="formVisible=false">取消</el-button><el-button v-if="canEdit('看板管理')" type="primary" @click="saveBoard">保存</el-button></template>
        </el-dialog>

        <el-dialog v-model="categoryDialog" title="管理看板分类" width="520px">
          <div style="display:flex;gap:10px;margin-bottom:16px"><el-input v-model="newCategory" placeholder="输入新分类名称" @keyup.enter="addCategory"></el-input><el-button v-if="canEdit('看板管理')" type="primary" @click="addCategory">新增</el-button></div>
          <div v-for="item in categories" :key="item" style="display:flex;align-items:center;justify-content:space-between;min-height:44px;border-top:1px solid #eef1f5"><span>{{ item }}</span><el-button v-if="canEdit('看板管理')" link type="danger" @click="deleteCategory(item)">删除</el-button></div>
        </el-dialog>
      </el-config-provider>
    `,
    data: () => ({ status: "已上线", keyword: "", category: "全部分类", owner: "全部负责人", page: 1, pageSize: 10, formVisible: false, editingIndex: -1, categoryDialog: false, newCategory: "", form: {} }),
    computed: {
      categories() { refreshTick.value; return state.categories.filter(item => item !== "全部"); },
      scopeBoardNames() { refreshTick.value; return effectiveBoardNames(loginUser()); },
      scopeLabel() { refreshTick.value; return boardScopeLabel(loginUser(), state.boards.length); },
      visibleCategories() { const allowed = this.scopeBoardNames; return state.categories.filter(item => item !== "全部" && state.boards.some(board => board.category === item && allowed.has(board.name))); },
      owners() { const allowed = this.scopeBoardNames; return [...new Set(state.boards.filter(board => allowed.has(board.name)).map(board => board.owner))]; },
      userNames() { return state.users.map(user => user.name); },
      selectableUsers() { refreshTick.value; return state.users.filter(user => user.status !== "已停用"); },
      groupNames() { return state.groups.map(group => group.name); },
      filteredRows() { refreshTick.value; const keyword = this.keyword.trim().toLowerCase(); return state.boards.filter(board => this.scopeBoardNames.has(board.name) && board.status === this.status && (this.category === "全部分类" || board.category === this.category) && (this.owner === "全部负责人" || board.owner === this.owner) && (!keyword || `${board.name} ${board.quickBiId}`.toLowerCase().includes(keyword))); },
      pagedRows() { const result = paginate(this.filteredRows, this.page, this.pageSize); if (result.safePage !== this.page) this.page = result.safePage; return result.rows; },
      rangeText() { if (!this.filteredRows.length) return "0-0"; return `${(this.page-1)*this.pageSize+1}-${Math.min(this.page*this.pageSize,this.filteredRows.length)}`; }
    },
    mounted() { this.primaryHandler = event => { if (event.detail?.page === "看板管理") this.openForm(); }; window.addEventListener("portal:primary-action", this.primaryHandler); },
    beforeUnmount() { window.removeEventListener("portal:primary-action", this.primaryHandler); },
    methods: {
      resetPage() { this.page = 1; },
      boardViewers(board) {
        const directGroups = Array.isArray(board.groups) ? board.groups : [];
        const directUsers = Array.isArray(board.users) ? board.users : [];
        const visibleGroups = new Set(state.groups.filter(group => directGroups.includes(group.name)
          || group.boards.includes("全部看板")
          || group.boards.includes(board.name)
          || group.boards.includes(board.category)).map(group => group.name));
        // 权限组推导出的可见用户 + 看板「可查看用户」直接授权的用户，取并集
        const byGroup = state.users.filter(user => user.status !== "已停用" && visibleGroups.has(user.group));
        const seen = new Set(byGroup.map(user => user.name));
        const direct = state.users.filter(user => user.status !== "已停用" && directUsers.includes(user.name) && !seen.has(user.name));
        return [...byGroup.map(user => ({ ...user, direct: directUsers.includes(user.name) })), ...direct.map(user => ({ ...user, direct: true }))];
      },
      avatarText(name) { return String(name || "用").slice(0,1); },
      avatarStyle(name) { const colors = ["#1677ff","#13a8a8","#7c3aed","#d97706","#dc4c64","#35805b"]; const seed = [...String(name || "")].reduce((total,char)=>total+char.charCodeAt(0),0); return { background: colors[seed % colors.length], color: "#fff" }; },
      openForm(board = null) { this.editingIndex = board ? state.boards.indexOf(board) : -1; this.form = board ? { ...board, groups: [...board.groups], users: [...(board.users || [])] } : { name: "", quickBiId: `QB_${String(state.boards.length + 1).padStart(3,"0")}`, category: this.categories[0] || "", owner: "曾祥竞", desc: "", groups: ["门户管理员"], users: [], status: "已上线", updatedAt: "2026-07-15 10:00" }; this.formVisible = true; },
      saveBoard() {
        if (!this.form.name.trim() || !this.form.quickBiId.trim() || !this.form.category || !this.form.owner || !this.form.groups.length) return ep.ElMessage.warning("请补全看板必填信息");
        const payload = { ...this.form, name: this.form.name.trim(), quickBiId: this.form.quickBiId.trim(), users: [...(this.form.users || [])], updatedAt: "2026-07-15 10:00" };
        if (this.editingIndex < 0) state.boards.unshift(payload); else Object.assign(state.boards[this.editingIndex], payload);
        this.formVisible = false; notify(`看板「${payload.name}」已保存`);
      },
      async toggleStatus(board, enabled) { const next = enabled ? "已上线" : "已下线"; if (!await confirmAction(enabled ? "上线看板" : "下线看板", `确认${enabled ? "上线" : "下线"}「${board.name}」？`)) return; board.status = next; board.updatedAt = "2026-07-15 10:00"; notify(`看板已${enabled ? "上线" : "下线"}`); },
      addCategory() { const name = this.newCategory.trim(); if (!name) return ep.ElMessage.warning("请输入分类名称"); if (state.categories.includes(name)) return ep.ElMessage.warning("分类已存在"); state.categories.push(name); this.newCategory = ""; notify("分类已新增"); },
      async deleteCategory(name) { if (state.boards.some(board => board.category === name)) return ep.ElMessage.warning("该分类下仍有看板，不能删除"); if (!await confirmAction("删除分类", `确认删除「${name}」？`)) return; state.categories.splice(state.categories.indexOf(name),1); notify("分类已删除"); }
    }
  };
  mount("#boardManagementView", BoardManagementApp, "board-management");
})();
