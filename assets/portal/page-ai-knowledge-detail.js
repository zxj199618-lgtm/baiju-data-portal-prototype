/**
 * 页面：知识库详情（AI 中心 → AI 知识库 → 某一份知识库）
 * 独立整页，左右分栏的 Markdown 编辑器占满页面宽度；业务线知识库下还维护「表关联」。
 * 原型阶段数据在前端 window.PortalVue.bizStore（刷新即还原），确认交互后再接后端。
 */
(() => {
  "use strict";
  if (!window.PortalVue || !window.PortalVue.bizStore) return;
  const { bizStore, bizHelpers } = window.PortalVue;
  const { bridge, ep, confirmAction, mount, notify, permissionFieldsOf, refreshTick, state } = window.PortalVue;
  const md = () => window.PortalKnowledgeMd;
  const MAX_KNOWLEDGE = 20000;
  const RELATION_TYPES = ["1:1", "1:N", "N:1"];

  const assetOf = cnName => state.assets.find(asset => asset.cnName === cnName);
  const lineOfKb = kb => kb.type === "业务线" ? kb.target : (assetOf(kb.target)?.bizLine || "");
  const kbTitle = kb => kb.type === "业务线" ? `${kb.target}业务线知识库` : kb.target;

  (() => {
    if (document.getElementById("kb-detail-style")) return;
    const el = document.createElement("style");
    el.id = "kb-detail-style";
    /* 编辑区随窗口高度撑满：整页只留页头、元信息、页签和底部操作条 */
    el.textContent = `
      .kb-detail .portal-vue-md-split{min-height:calc(100vh - 430px)}
      .kb-detail .portal-vue-md-textarea{min-height:calc(100vh - 430px)}
      .kb-detail .portal-vue-knowledge-doc{min-height:calc(100vh - 430px)}
      .kb-detail .portal-vue-knowledge-doc.kb-view{min-height:0}
      .kb-detail-bottom{height:76px}
    `;
    document.head.appendChild(el);
  })();

  const KnowledgeDetailApp = {
    template: `
      <el-config-provider :locale="locale">
        <div class="kb-detail">
          <el-page-header class="portal-vue-form-header" title="返回 AI 知识库" :content="headerTitle" @back="back"></el-page-header>
          <div v-if="!current" style="padding:60px 20px"><el-empty description="知识库不存在或已删除"><el-button type="primary" @click="back">返回 AI 知识库</el-button></el-empty></div>
          <template v-else>
            <div class="portal-vue-dim-meta">
              <div><span>类型</span><strong>{{ current.type === '业务线' ? '业务线知识库' : '表知识库' }}</strong></div>
              <div><span>所属业务线</span><strong>{{ lineOf(current) || '未绑定' }}</strong></div>
              <div v-if="current.type === '表'"><span>数据表</span><strong>{{ current.target }}</strong></div>
              <div><span>最近编辑</span><strong>{{ current.updatedBy }} · {{ current.updatedAt }}</strong></div>
            </div>
            <el-tabs v-model="tab" class="ops-center-tabs op-full-line" style="margin-top:8px" :before-leave="beforeLeaveTab">
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
                    <span class="portal-vue-md-tip">{{ text.length }} / {{ MAX_KNOWLEDGE }} 字</span>
                  </div>
                  <div class="portal-vue-md-split">
                    <textarea ref="mdArea" v-model="text" class="portal-vue-md-textarea" spellcheck="false" placeholder="在这里填写知识库，支持 Markdown：# 标题、**加粗**、- 列表"></textarea>
                    <div class="portal-vue-knowledge-doc" v-html="renderedDraft"></div>
                  </div>
                  <div class="kb-detail-bottom"></div>
                  <div class="portal-vue-knowledge-floating"><el-button round @click="cancelEdit">取消</el-button><el-button type="primary" round @click="saveKnowledge">保存知识库</el-button></div>
                </div>
                <div v-else class="portal-vue-knowledge-doc kb-view" v-html="renderedKnowledge"></div>
              </el-tab-pane>
              <el-tab-pane v-if="current.type === '业务线'" :label="'表关联 ' + relations.length" name="relations">
                <div class="portal-vue-toolbar" style="padding:0 0 12px">
                  <div class="portal-vue-toolbar-left"><span class="portal-vue-muted">说明「{{ current.target }}」下两张表怎样关联（关系读作 左:右），灵犀智析取数时会据此做关联</span></div>
                  <el-button v-if="canEdit('AI 知识库')" type="primary" @click="openRelation()">添加关联</el-button>
                </div>
                <el-table :data="relations" class="portal-vue-table" border empty-text="暂无表关联">
                  <el-table-column label="左表" prop="left.table" min-width="160" show-overflow-tooltip></el-table-column>
                  <el-table-column label="左字段" min-width="140"><template #default="scope"><code class="portal-vue-code">{{ scope.row.left.field }}</code></template></el-table-column>
                  <el-table-column label="关系" prop="type" width="80" align="center"></el-table-column>
                  <el-table-column label="右表" prop="right.table" min-width="160" show-overflow-tooltip></el-table-column>
                  <el-table-column label="右字段" min-width="140"><template #default="scope"><code class="portal-vue-code">{{ scope.row.right.field }}</code></template></el-table-column>
                  <el-table-column label="备注" prop="note" min-width="200" show-overflow-tooltip></el-table-column>
                  <el-table-column v-if="canEdit('AI 知识库')" label="操作" width="120"><template #default="scope"><el-button link type="primary" @click="openRelation(scope.row)">编辑</el-button><el-button link type="danger" @click="removeRelation(scope.row)">删除</el-button></template></el-table-column>
                </el-table>
              </el-tab-pane>
            </el-tabs>
          </template>
        </div>

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
    data: () => ({ MAX_KNOWLEDGE, RELATION_TYPES, kbId: "", tab: "content", editing: false, text: "", relationVisible: false, relationForm: {} }),
    computed: {
      current() { refreshTick.value; return bizStore.kbs.find(kb => kb.id === this.kbId) || null; },
      headerTitle() { return this.current ? kbTitle(this.current) + " · 知识库详情" : "知识库详情"; },
      relations() { refreshTick.value; return this.current?.type === "业务线" ? bizStore.relations.filter(rel => rel.line === this.current.target) : []; },
      relationTables() { refreshTick.value; return this.current ? bizHelpers.tablesOfLine(this.current.target).map(asset => asset.cnName) : []; },
      renderedDraft() { return md().renderKnowledgeMarkdown(md().normalizeToMarkdown(this.text)); },
      renderedKnowledge() { return this.current ? md().renderKnowledgeMarkdown(this.current.markdown) : ""; },
      dirty() { return this.editing && this.current && this.text !== this.current.markdown; }
    },
    mounted() {
      this.pageHandler = event => { if (event.detail?.page === "知识库详情") this.load(); };
      window.addEventListener("portal:page-change", this.pageHandler);
      if (bridge.getPage() === "知识库详情") this.load();
    },
    beforeUnmount() { window.removeEventListener("portal:page-change", this.pageHandler); },
    methods: {
      lineOf: lineOfKb,
      load() {
        this.kbId = bridge.getKnowledgeDetailId?.() || "";
        this.tab = "content"; this.editing = false; this.text = "";
        // 从列表点「编辑」或新建进来时直接进入编辑
        if (bizStore.openEdit && bizStore.openEdit === this.kbId && this.current) this.startEdit();
        bizStore.openEdit = "";
      },
      async back() {
        if (this.dirty && !(await confirmAction("放弃修改", "知识库有未保存的修改，确认离开？", "放弃修改"))) return;
        this.editing = false;
        bridge.setPage("AI 知识库");
      },
      async beforeLeaveTab() {
        if (this.dirty) { ep.ElMessage.warning("知识库有未保存的修改，请先保存或取消"); return false; }
        return true;
      },
      startEdit() { this.text = this.current.markdown; this.editing = true; this.tab = "content"; },
      cancelEdit() { this.editing = false; this.text = ""; },
      saveKnowledge() {
        const raw = this.text.trim();
        if (!raw) return ep.ElMessage.warning("知识库内容不能为空");
        const markdown = md().normalizeToMarkdown(raw);
        if (markdown.length > MAX_KNOWLEDGE) return ep.ElMessage.warning(`知识库不能超过 ${MAX_KNOWLEDGE} 字（当前 ${markdown.length} 字）`);
        Object.assign(this.current, { markdown, updatedBy: bizHelpers.currentUserName(), updatedAt: bizHelpers.nowText() });
        this.editing = false; this.text = "";
        notify(`「${kbTitle(this.current)}」已保存${markdown !== raw ? "，已自动转换为 Markdown 格式" : ""}`);
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

  mount("#aiKnowledgeDetailView", KnowledgeDetailApp, "ai-knowledge-detail");
})();
