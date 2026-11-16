/**
 * 页面：AI 知识库（AI 中心 → AI 知识库）
 * 统一管理两类 Markdown 知识库：业务线知识库、数据表知识库；每份知识库都绑定业务线（表知识库跟随表的业务线）。
 * 查看 / 编辑在独立页面「知识库详情」里（page-ai-knowledge-detail.js），这里只做列表、筛选、新建、删除。
 * 原型阶段数据在前端 window.PortalVue.bizStore（刷新即还原），确认交互后再接后端。
 */
(() => {
  "use strict";
  if (!window.PortalVue || !window.PortalVue.bizStore) return;
  const { bizStore, bizHelpers } = window.PortalVue;
  const { bridge, ep, confirmAction, mount, notify, refreshTick, state } = window.PortalVue;
  const md = () => window.PortalKnowledgeMd;

  const assetOf = cnName => state.assets.find(asset => asset.cnName === cnName);
  const lineOfKb = kb => kb.type === "业务线" ? kb.target : (assetOf(kb.target)?.bizLine || "");
  const kbTitle = kb => kb.type === "业务线" ? `${kb.target}业务线知识库` : kb.target;
  /** 列表里的摘要：取第一段正文，去掉 Markdown 标记 */
  const summaryOf = kb => {
    const line = String(kb.markdown || "").split("\n").map(text => text.trim()).find(text => text && !/^#/.test(text)) || "";
    return line.replace(/[*`>#-]/g, "").trim().slice(0, 60);
  };

  const AiKnowledgeApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <el-tabs v-model="typeTab" class="portal-vue-status-tabs">
            <el-tab-pane :label="'全部 ' + counts.all" name=""></el-tab-pane>
            <el-tab-pane :label="'业务线知识库 ' + counts.line" name="业务线"></el-tab-pane>
            <el-tab-pane :label="'表知识库 ' + counts.table" name="表"></el-tab-pane>
          </el-tabs>
          <div class="portal-vue-toolbar">
            <div class="portal-vue-toolbar-left">
              <el-input v-model="keyword" class="portal-vue-search" clearable placeholder="搜索知识库名称、内容"></el-input>
              <el-select v-model="lineFilter" class="portal-vue-filter" clearable placeholder="全部业务线"><el-option label="全部业务线" value=""></el-option><el-option v-for="line in allLines" :key="line" :label="line" :value="line"></el-option></el-select>
            </div>
            <el-button v-if="canEdit('AI 知识库')" type="primary" @click="openCreate">新建知识库</el-button>
          </div>
          <div class="portal-vue-scope-hint"><span>灵犀智析回答问题时，会按业务线读取对应的<strong>业务线知识库</strong>和<strong>表知识库</strong></span><span class="portal-vue-muted">{{ canEdit('AI 知识库') ? '业务线在「系统管理 → 业务线」维护；表所属业务线在「表管理 → 表详情」设置' : '当前菜单未配置「编辑」权限，仅可查看' }}</span></div>
          <el-table :data="rows" class="portal-vue-table" border empty-text="暂无知识库">
            <el-table-column label="知识库" min-width="220" show-overflow-tooltip><template #default="scope"><span class="portal-vue-name">{{ title(scope.row) }}</span></template></el-table-column>
            <el-table-column label="类型" width="120"><template #default="scope"><el-tag size="small" :type="scope.row.type === '业务线' ? '' : 'info'" effect="light">{{ scope.row.type === '业务线' ? '业务线知识库' : '表知识库' }}</el-tag></template></el-table-column>
            <el-table-column label="业务线" width="110"><template #default="scope"><el-tag v-if="lineOf(scope.row)" size="small" effect="plain">{{ lineOf(scope.row) }}</el-tag><el-tooltip v-else content="该表还没有业务线，请到「表管理 → 表详情」设置" placement="top"><el-tag size="small" type="warning" effect="plain">未绑定</el-tag></el-tooltip></template></el-table-column>
            <el-table-column label="内容摘要" min-width="300" show-overflow-tooltip><template #default="scope"><span class="portal-vue-muted">{{ summary(scope.row) }}</span></template></el-table-column>
            <el-table-column label="表关联" width="90" align="center"><template #default="scope"><span v-if="scope.row.type === '业务线'">{{ relationsOf(scope.row.target).length }} 条</span><span v-else class="portal-vue-muted">—</span></template></el-table-column>
            <el-table-column label="最近编辑" width="190"><template #default="scope"><div>{{ scope.row.updatedAt }}</div><small class="portal-vue-muted">{{ scope.row.updatedBy }}</small></template></el-table-column>
            <el-table-column label="操作" width="150" fixed="right"><template #default="scope"><div class="portal-vue-actions"><el-button link type="primary" @click="open(scope.row, false)">查看</el-button><el-button v-if="canEdit('AI 知识库')" link type="primary" @click="open(scope.row, true)">编辑</el-button><el-button v-if="canEdit('AI 知识库')" link type="danger" @click="remove(scope.row)">删除</el-button></div></template></el-table-column>
          </el-table>
          <div class="portal-vue-pagination"><span>共 {{ rows.length }} 份知识库</span></div>
        </section>

        <el-dialog v-model="createVisible" title="新建知识库" width="520px" append-to-body>
          <el-form label-position="top" class="portal-vue-dialog-form" @submit.prevent>
            <el-form-item label="知识库类型" required>
              <el-radio-group v-model="createForm.type" @change="createForm.target = ''"><el-radio-button value="业务线">业务线知识库</el-radio-button><el-radio-button value="表">表知识库</el-radio-button></el-radio-group>
              <div class="portal-vue-muted" style="margin-top:6px;line-height:1.6">{{ createForm.type === '业务线' ? '写业务口径、常用术语、回答规则，并维护该业务线下的表关联。' : '写某张表的指标口径、字段含义和使用注意事项。' }}</div>
            </el-form-item>
            <el-form-item label="所属业务线" required><el-select v-model="createForm.line" placeholder="选择业务线" @change="createForm.target = ''"><el-option v-for="line in enabledLines" :key="line" :label="line" :value="line"></el-option></el-select></el-form-item>
            <el-form-item v-if="createForm.type === '表'" label="数据表" required>
              <el-select v-model="createForm.target" filterable :disabled="!createForm.line" :placeholder="createForm.line ? '选择该业务线下的数据表' : '请先选择业务线'" no-data-text="该业务线下没有可建知识库的表">
                <el-option v-for="table in createTables" :key="table" :label="table" :value="table"></el-option>
              </el-select>
              <div class="portal-vue-muted" style="margin-top:6px">只列出已绑定到该业务线、且还没有知识库的表；表的业务线在「表管理 → 表详情」里设置。</div>
            </el-form-item>
            <div v-else-if="createForm.line && lineHasKb(createForm.line)" class="portal-vue-muted" style="color:#e6a23c">「{{ createForm.line }}」已有业务线知识库，每个业务线只能有一份。</div>
          </el-form>
          <template #footer><el-button @click="createVisible=false">取消</el-button><el-button type="primary" @click="submitCreate">创建并编写</el-button></template>
        </el-dialog>

      </el-config-provider>
    `,
    data: () => ({ typeTab: "", keyword: "", lineFilter: "", createVisible: false, createForm: { type: "业务线", line: "", target: "" } }),
    computed: {
      allLines() { refreshTick.value; return bizStore.lines.map(line => line.name); },
      enabledLines() { refreshTick.value; return bizHelpers.activeLines(); },
      counts() { refreshTick.value; return { all: bizStore.kbs.length, line: bizStore.kbs.filter(kb => kb.type === "业务线").length, table: bizStore.kbs.filter(kb => kb.type === "表").length }; },
      rows() {
        refreshTick.value;
        const keyword = this.keyword.trim().toLowerCase();
        return bizStore.kbs.filter(kb => (!this.typeTab || kb.type === this.typeTab) && (!this.lineFilter || lineOfKb(kb) === this.lineFilter) && (!keyword || `${kbTitle(kb)} ${kb.markdown}`.toLowerCase().includes(keyword)));
      },
      /** 新建表知识库时可选的表：属于所选业务线、还没有知识库 */
      createTables() {
        refreshTick.value;
        const done = new Set(bizStore.kbs.filter(kb => kb.type === "表").map(kb => kb.target));
        return state.assets.filter(asset => asset.bizLine === this.createForm.line && !done.has(asset.cnName)).map(asset => asset.cnName);
      },
    },
    mounted() {
      this.primaryHandler = event => { if (event.detail?.page === "AI 知识库") this.openCreate(); };
      this.pageHandler = event => {
        if (event.detail?.page !== "AI 知识库") return;
        // 从「业务线」页点「N 份」跳过来时，自动按该业务线筛选
        this.lineFilter = bizStore.focusLine || "";
        bizStore.focusLine = "";
      };
      window.addEventListener("portal:primary-action", this.primaryHandler);
      window.addEventListener("portal:page-change", this.pageHandler);
    },
    beforeUnmount() { window.removeEventListener("portal:primary-action", this.primaryHandler); window.removeEventListener("portal:page-change", this.pageHandler); },
    methods: {
      title: kbTitle,
      lineOf: lineOfKb,
      summary: summaryOf,
      relationsOf(line) { refreshTick.value; return bizStore.relations.filter(rel => rel.line === line); },
      lineHasKb(line) { return bizStore.kbs.some(kb => kb.type === "业务线" && kb.target === line); },
      /* ---- 新建 ---- */
      openCreate() { this.createForm = { type: "业务线", line: this.lineFilter || "", target: "" }; this.createVisible = true; },
      submitCreate() {
        const form = this.createForm;
        if (!form.line) return ep.ElMessage.warning("请选择所属业务线");
        if (form.type === "业务线" && this.lineHasKb(form.line)) return ep.ElMessage.warning(`「${form.line}」已有业务线知识库，每个业务线只能有一份`);
        if (form.type === "表" && !form.target) return ep.ElMessage.warning("请选择数据表");
        const target = form.type === "业务线" ? form.line : form.target;
        const markdown = form.type === "业务线" ? md().businessLineTemplate(target) : md().knowledgeTemplate(target);
        const kb = { id: "KB" + String(Date.now()).slice(-6), type: form.type, target, markdown, updatedBy: bizHelpers.currentUserName(), updatedAt: bizHelpers.nowText() };
        bizStore.kbs.unshift(kb);
        this.createVisible = false;
        this.open(bizStore.kbs[0], true);
        notify(`已创建「${kbTitle(kb)}」，写好内容后点「保存知识库」`);
      },
      /* ---- 详情：独立页面（#/ai/knowledge/<id>），编辑器更宽 ---- */
      open(kb, edit) {
        bizStore.openEdit = edit ? kb.id : "";
        bridge.setKnowledgeDetailId(kb.id);
        bridge.setPage("知识库详情");
      },
      async remove(kb) {
        if (!(await confirmAction("删除知识库", `确认删除「${kbTitle(kb)}」？${kb.type === "业务线" ? "该业务线下的表关联不会删除。" : ""}删除后灵犀智析将不再参考它。`, "删除"))) return;
        bizStore.kbs.splice(bizStore.kbs.indexOf(kb), 1);
        notify("知识库已删除");
      }
    }
  };

  mount("#aiKnowledgeView", AiKnowledgeApp, "ai-knowledge");
})();
