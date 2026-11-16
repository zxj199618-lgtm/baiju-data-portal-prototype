/**
 * 页面：AI 知识库（AI 中心 → AI 知识库）
 * 统一管理两类 Markdown 知识库：业务线知识库、数据表知识库；每份知识库都绑定业务线（表知识库跟随表的业务线）。
 * 业务线知识库下还维护「表关联」（说明两张表怎么 JOIN，灵犀智析取数时参考）。
 * 原型阶段数据在前端 window.PortalVue.bizStore（刷新即还原），确认交互后再接后端。
 */
(() => {
  "use strict";
  if (!window.PortalVue || !window.PortalVue.bizStore) return;
  const { bizStore, bizHelpers } = window.PortalVue;
  const { ep, confirmAction, mount, notify, permissionFieldsOf, refreshTick, state } = window.PortalVue;
  const md = () => window.PortalKnowledgeMd;
  const MAX_KNOWLEDGE = 20000;
  const RELATION_TYPES = ["1:1", "1:N", "N:1"];

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

        <el-drawer v-model="drawerVisible" :title="current ? title(current) : ''" size="1020px" destroy-on-close :close-on-click-modal="true" :before-close="beforeClose">
          <template v-if="current">
            <div class="portal-vue-detail-grid" style="margin-bottom:14px">
              <div class="portal-vue-detail-item"><span>类型</span><strong>{{ current.type === '业务线' ? '业务线知识库' : '表知识库' }}</strong></div>
              <div class="portal-vue-detail-item"><span>所属业务线</span><strong>{{ lineOf(current) || '未绑定' }}</strong></div>
              <div class="portal-vue-detail-item"><span>最近编辑</span><strong>{{ current.updatedBy }} · {{ current.updatedAt }}</strong></div>
            </div>
            <el-tabs v-model="drawerTab" class="ops-center-tabs op-full-line">
              <el-tab-pane label="知识库内容" name="content">
                <div class="portal-vue-knowledge-bar">
                  <span class="portal-vue-muted">{{ editing ? '左边编辑，右边预览；上限 ' + MAX_KNOWLEDGE + ' 字' : '' }}</span>
                  <el-button v-if="!editing && canEdit('AI 知识库')" type="primary" round class="portal-vue-knowledge-edit" @click="startEdit">编辑知识库</el-button>
                </div>
                <div v-if="editing" class="portal-vue-md-editor">
                  <div class="portal-vue-md-toolbar" @mousedown.prevent>
                    <el-button size="small" text @click="mdWrap('**', '**', '加粗文字')"><strong>B</strong>&nbsp;加粗</el-button>
                    <el-button size="small" text @click="mdLinePrefix('## ')">标题</el-button>
                    <el-button size="small" text @click="mdLinePrefix('- ')">无序列表</el-button>
                    <el-button size="small" text @click="mdLinePrefix('1. ')">有序列表</el-button>
                    <el-button size="small" text @click="mdLinePrefix('> ')">引用</el-button>
                  </div>
                  <div class="portal-vue-md-split">
                    <textarea ref="mdArea" v-model="text" class="portal-vue-md-textarea" spellcheck="false" placeholder="在这里填写知识库，支持 Markdown：# 标题、**加粗**、- 列表"></textarea>
                    <div class="portal-vue-knowledge-doc" v-html="renderedDraft"></div>
                  </div>
                  <div class="portal-vue-knowledge-floating"><el-button round @click="cancelEdit">取消</el-button><el-button type="primary" round @click="saveKnowledge">保存知识库</el-button></div>
                </div>
                <div v-else class="portal-vue-knowledge-doc" v-html="renderedKnowledge"></div>
              </el-tab-pane>
              <el-tab-pane v-if="current.type === '业务线'" :label="'表关联 ' + relationsOf(current.target).length" name="relations">
                <div class="portal-vue-toolbar" style="padding:0 0 12px">
                  <div class="portal-vue-toolbar-left"><span class="portal-vue-muted">说明「{{ current.target }}」下两张表怎样关联（关系读作 左:右），灵犀智析取数时会据此做关联</span></div>
                  <el-button v-if="canEdit('AI 知识库')" type="primary" @click="openRelation()">添加关联</el-button>
                </div>
                <el-table :data="relationsOf(current.target)" class="portal-vue-table" border empty-text="暂无表关联">
                  <el-table-column label="左表" prop="left.table" min-width="140" show-overflow-tooltip></el-table-column>
                  <el-table-column label="左字段" min-width="120"><template #default="scope"><code class="portal-vue-code">{{ scope.row.left.field }}</code></template></el-table-column>
                  <el-table-column label="关系" prop="type" width="70" align="center"></el-table-column>
                  <el-table-column label="右表" prop="right.table" min-width="140" show-overflow-tooltip></el-table-column>
                  <el-table-column label="右字段" min-width="120"><template #default="scope"><code class="portal-vue-code">{{ scope.row.right.field }}</code></template></el-table-column>
                  <el-table-column label="备注" prop="note" min-width="150" show-overflow-tooltip></el-table-column>
                  <el-table-column v-if="canEdit('AI 知识库')" label="操作" width="110"><template #default="scope"><el-button link type="primary" @click="openRelation(scope.row)">编辑</el-button><el-button link type="danger" @click="removeRelation(scope.row)">删除</el-button></template></el-table-column>
                </el-table>
              </el-tab-pane>
            </el-tabs>
          </template>
        </el-drawer>

        <el-dialog v-model="relationVisible" :title="relationForm.id ? '编辑表关联' : '添加表关联'" width="640px" append-to-body>
          <el-form label-position="top" class="portal-vue-dialog-form">
            <div class="portal-vue-bizline-relation-grid">
              <el-form-item label="左表" required><el-select v-model="relationForm.leftTable" filterable placeholder="选择左表" @change="relationForm.leftField=''"><el-option v-for="name in relationTables" :key="name" :label="name" :value="name"></el-option></el-select></el-form-item>
              <el-form-item label="左字段" required><el-select v-model="relationForm.leftField" filterable placeholder="选择左字段"><el-option v-for="name in fieldChoices(relationForm.leftTable)" :key="name" :label="name" :value="name"></el-option></el-select></el-form-item>
              <el-form-item label="关系（左:右）" required><el-select v-model="relationForm.type"><el-option v-for="item in RELATION_TYPES" :key="item" :label="item" :value="item"></el-option></el-select></el-form-item>
              <span></span>
              <el-form-item label="右表" required><el-select v-model="relationForm.rightTable" filterable placeholder="选择右表" @change="relationForm.rightField=''"><el-option v-for="name in relationTables" :key="name" :label="name" :value="name"></el-option></el-select></el-form-item>
              <el-form-item label="右字段" required><el-select v-model="relationForm.rightField" filterable placeholder="选择右字段"><el-option v-for="name in fieldChoices(relationForm.rightTable)" :key="name" :label="name" :value="name"></el-option></el-select></el-form-item>
            </div>
            <el-form-item label="备注"><el-input v-model="relationForm.note" maxlength="200" placeholder="例如：一个用户可以有多笔订单"></el-input></el-form-item>
            <div class="portal-vue-muted">两端只能选已绑定到「{{ current?.target }}」业务线的表。</div>
          </el-form>
          <template #footer><el-button @click="relationVisible=false">取消</el-button><el-button type="primary" @click="saveRelation">保存</el-button></template>
        </el-dialog>
      </el-config-provider>
    `,
    data: () => ({ MAX_KNOWLEDGE, RELATION_TYPES, typeTab: "", keyword: "", lineFilter: "", createVisible: false, createForm: { type: "业务线", line: "", target: "" }, drawerVisible: false, current: null, drawerTab: "content", editing: false, text: "", relationVisible: false, relationForm: {} }),
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
      relationTables() { refreshTick.value; return bizHelpers.tablesOfLine(this.current?.target).map(asset => asset.cnName); },
      renderedDraft() { return md().renderKnowledgeMarkdown(md().normalizeToMarkdown(this.text)); },
      renderedKnowledge() { return this.current ? md().renderKnowledgeMarkdown(this.current.markdown) : ""; }
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
      /* ---- 详情 / 编辑 ---- */
      open(kb, edit) {
        this.current = kb; this.drawerTab = "content"; this.drawerVisible = true;
        this.editing = false; this.text = "";
        if (edit) this.startEdit();
      },
      startEdit() { this.text = this.current.markdown; this.editing = true; },
      cancelEdit() { this.editing = false; this.text = ""; },
      async beforeClose(done) {
        if (this.editing && this.text !== this.current.markdown && !(await confirmAction("放弃修改", "知识库有未保存的修改，确认关闭？", "放弃修改"))) return;
        this.editing = false; done();
      },
      saveKnowledge() {
        const raw = this.text.trim();
        if (!raw) return ep.ElMessage.warning("知识库内容不能为空");
        const markdown = md().normalizeToMarkdown(raw);
        if (markdown.length > MAX_KNOWLEDGE) return ep.ElMessage.warning(`知识库不能超过 ${MAX_KNOWLEDGE} 字（当前 ${markdown.length} 字）`);
        Object.assign(this.current, { markdown, updatedBy: bizHelpers.currentUserName(), updatedAt: bizHelpers.nowText() });
        this.editing = false; this.text = "";
        notify(`「${kbTitle(this.current)}」已保存${markdown !== raw ? "，已自动转换为 Markdown 格式" : ""}`);
      },
      async remove(kb) {
        if (!(await confirmAction("删除知识库", `确认删除「${kbTitle(kb)}」？${kb.type === "业务线" ? "该业务线下的表关联不会删除。" : ""}删除后灵犀智析将不再参考它。`, "删除"))) return;
        bizStore.kbs.splice(bizStore.kbs.indexOf(kb), 1);
        notify("知识库已删除");
      },
      mdWrap(prefix, suffix, placeholder) {
        const el = this.$refs.mdArea; if (!el) return;
        const { selectionStart: start, selectionEnd: end } = el;
        const selected = this.text.slice(start, end) || placeholder;
        this.text = this.text.slice(0, start) + prefix + selected + suffix + this.text.slice(end);
        this.$nextTick(() => { el.focus(); el.setSelectionRange(start + prefix.length, start + prefix.length + selected.length); });
      },
      mdLinePrefix(prefix) {
        const el = this.$refs.mdArea; if (!el) return;
        const text = this.text;
        const lineStart = text.lastIndexOf("\n", el.selectionStart - 1) + 1;
        let lineEnd = text.indexOf("\n", el.selectionEnd); if (lineEnd < 0) lineEnd = text.length;
        const block = text.slice(lineStart, lineEnd).split("\n").map(line => prefix + line.replace(/^(#{1,6}\s|[-*]\s|\d+\.\s|>\s)/, "")).join("\n");
        this.text = text.slice(0, lineStart) + block + text.slice(lineEnd);
        this.$nextTick(() => { el.focus(); el.setSelectionRange(lineStart, lineStart + block.length); });
      },
      /* ---- 表关联（业务线知识库下）---- */
      fieldChoices(table) { refreshTick.value; return table ? permissionFieldsOf(table).map(field => field.name).filter(Boolean) : []; },
      openRelation(row) {
        this.relationForm = row
          ? { id: row.id, leftTable: row.left.table, leftField: row.left.field, type: row.type, rightTable: row.right.table, rightField: row.right.field, note: row.note || "" }
          : { id: "", leftTable: "", leftField: "", type: "1:N", rightTable: "", rightField: "", note: "" };
        this.relationVisible = true;
      },
      saveRelation() {
        const form = this.relationForm;
        if (![form.leftTable, form.leftField, form.rightTable, form.rightField].every(Boolean)) return ep.ElMessage.warning("请选择两端的表和字段");
        if (form.leftTable === form.rightTable && form.leftField === form.rightField) return ep.ElMessage.warning("两端不能是同一张表的同一个字段");
        const item = { line: this.current.target, left: { table: form.leftTable, field: form.leftField }, right: { table: form.rightTable, field: form.rightField }, type: form.type, note: form.note.trim() };
        if (form.id) Object.assign(bizStore.relations.find(rel => rel.id === form.id), item);
        else bizStore.relations.push({ ...item, id: "R" + Date.now() });
        this.relationVisible = false;
        notify("表关联已保存");
      },
      async removeRelation(row) {
        if (!(await confirmAction("删除表关联", `确认删除 ${row.left.table}.${row.left.field} ${row.type} ${row.right.table}.${row.right.field}？`, "删除"))) return;
        bizStore.relations.splice(bizStore.relations.indexOf(row), 1);
        notify("表关联已删除");
      }
    }
  };

  mount("#aiKnowledgeView", AiKnowledgeApp, "ai-knowledge");
})();
