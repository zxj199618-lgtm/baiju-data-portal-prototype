/**
 * 页面：知识库详情（AI 中心 → AI 知识库 → 某一份知识库）
 * 独立整页，左右分栏的 Markdown 编辑器占满页面宽度。
 * 原型阶段数据在前端 window.PortalVue.bizStore（刷新即还原），确认交互后再接后端。
 */
(() => {
  "use strict";
  if (!window.PortalVue || !window.PortalVue.bizStore) return;
  const { bizStore, bizHelpers } = window.PortalVue;
  const { bridge, ep, confirmAction, mount, notify, refreshTick, state } = window.PortalVue;
  const md = () => window.PortalKnowledgeMd;
  const MAX_KNOWLEDGE = 20000;

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
      .kb-layout{display:flex;gap:16px;align-items:flex-start}
      .kb-nav{width:240px;flex:none;border:1px solid var(--el-border-color-lighter,#ebeef5);border-radius:8px;padding:8px;background:#fff}
      .kb-nav-group{display:flex;align-items:center;justify-content:space-between;padding:8px 8px 4px;font-size:12px;color:#909399}
      .kb-nav-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-radius:6px;cursor:pointer;font-size:14px;color:#303133}
      .kb-nav-item:hover{background:#f5f7fa}
      .kb-nav-item.active{background:#ecf5ff;color:#409eff;font-weight:600}
      .kb-nav-item span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .kb-nav-empty{padding:6px 10px 10px;font-size:12px;color:#a8abb2;line-height:1.6}
      .kb-main{flex:1;min-width:0}
      .kb-tables{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 12px;padding:8px 12px;background:#f5f7fa;border-radius:6px}
      .kb-tables-label{font-size:13px;color:#606266;margin-right:4px}
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
              <div><span>业务线</span><strong>{{ current.target }}</strong></div>
              <div><span>表知识库</span><strong>{{ tableKbs.length }} 份</strong></div>
              <div><span>业务线知识库最近编辑</span><strong>{{ current.updatedBy }} · {{ current.updatedAt }}</strong></div>
            </div>
            <div style="margin-top:12px">
              <div>
                <div class="kb-layout">
                  <div class="kb-nav">
                    <div class="kb-nav-group"><span>业务线知识库</span></div>
                    <div class="kb-nav-item" :class="{active: selId === 'main'}" @click="select('main')"><span>{{ current.target }}业务线知识库</span></div>
                    <div class="kb-nav-group"><span>表知识库 {{ tableKbs.length }}</span><el-button v-if="canEdit('AI 知识库')" link type="primary" size="small" @click="openAddTable">+ 新增</el-button></div>
                    <div v-for="item in tableKbs" :key="item.id" class="kb-nav-item" :class="{active: selId === item.id}" :title="item.target" @click="select(item.id)"><span>{{ item.target }}</span></div>
                    <div v-if="!tableKbs.length" class="kb-nav-empty">还没有表知识库，写某张表的指标口径和使用注意事项</div>
                  </div>
                  <div class="kb-main">
                    <div class="portal-vue-knowledge-bar">
                      <span class="portal-vue-muted">{{ editing ? '左边编辑，右边预览；上限 ' + MAX_KNOWLEDGE + ' 字' : docTitle + ' · ' + doc.updatedBy + ' · ' + doc.updatedAt }}</span>
                      <span v-if="!editing && canEdit('AI 知识库')">
                        <el-button v-if="doc.type === '表'" round type="danger" plain @click="removeDoc">删除</el-button>
                        <el-button type="primary" round class="portal-vue-knowledge-edit" @click="startEdit">编辑知识库</el-button>
                      </span>
                    </div>
                    <div v-if="doc.type === '表'" class="kb-tables">
                      <span class="kb-tables-label">关联数据表</span>
                      <el-tag v-if="doc.type === '表'" size="small" type="info" effect="plain" title="表知识库自带的表，不能取消">{{ doc.target }}（本表）</el-tag>
                      <el-tag v-for="name in docTables" :key="name" size="small" effect="plain" :closable="canEdit('AI 知识库')" @close="unlinkTable(name)">{{ name }}</el-tag>
                      <el-button v-if="canEdit('AI 知识库') && !docTables.length" link type="primary" size="small" @click="openLink">+ 关联数据表</el-button><el-button v-if="canEdit('AI 知识库') && docTables.length" link type="primary" size="small" @click="openLink">更换</el-button>
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
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>

        <el-dialog v-model="linkVisible" title="关联数据表" width="520px" append-to-body>
          <el-form label-position="top" class="portal-vue-dialog-form" @submit.prevent>
            <el-form-item :label="'「' + docTitle + '」关联的数据表'">
              <el-select v-model="linkSelected" filterable clearable placeholder="选择要关联的数据表（暂时只能选一张）">
                <el-option-group label="本业务线的表"><el-option v-for="name in linkChoices.mine" :key="name" :label="name" :value="name"></el-option></el-option-group>
                <el-option-group v-if="linkChoices.other.length" label="其他业务线 / 未绑定的表"><el-option v-for="name in linkChoices.other" :key="name" :label="name" :value="name"></el-option></el-option-group>
              </el-select>
              <div class="portal-vue-muted" style="margin-top:6px;line-height:1.6">暂时只支持关联一张表；灵犀智析读到这份知识库时，会把它一并作为参考范围。</div>
            </el-form-item>
          </el-form>
          <template #footer><el-button @click="linkVisible=false">取消</el-button><el-button type="primary" @click="saveLink">保存</el-button></template>
        </el-dialog>

        <el-dialog v-model="addTableVisible" title="新增表知识库" width="480px" append-to-body>
          <el-form label-position="top" class="portal-vue-dialog-form" @submit.prevent>
            <el-form-item label="数据表" required>
              <el-select v-model="addTableName" filterable placeholder="选择该业务线下的数据表" no-data-text="该业务线下没有可新增的表">
                <el-option v-for="name in addableTables" :key="name" :label="name" :value="name"></el-option>
              </el-select>
              <div class="portal-vue-muted" style="margin-top:6px;line-height:1.6">只列出已绑定到「{{ current?.target }}」、且还没有知识库的表；表的业务线在「表管理 → 表详情」里设置。</div>
            </el-form-item>
          </el-form>
          <template #footer><el-button @click="addTableVisible=false">取消</el-button><el-button type="primary" @click="submitAddTable">创建并编写</el-button></template>
        </el-dialog>

      </el-config-provider>
    `,
    data: () => ({ MAX_KNOWLEDGE, kbId: "", tab: "content", editing: false, text: "", selId: "main", linkVisible: false, linkSelected: "", addTableVisible: false, addTableName: "" }),
    computed: {
      current() { refreshTick.value; return bizStore.kbs.find(kb => kb.id === this.kbId) || null; },
      headerTitle() { return this.current ? kbTitle(this.current) + " · 知识库详情" : "知识库详情"; },
      tableKbs() { refreshTick.value; return this.current ? bizStore.kbs.filter(kb => kb.type === "表" && lineOfKb(kb) === this.current.target) : []; },
      /** 当前在右侧查看/编辑的知识库：业务线知识库本身，或其下某份表知识库 */
      doc() { return this.selId === "main" ? this.current : (this.tableKbs.find(kb => kb.id === this.selId) || this.current); },
      docTitle() { return this.doc ? (this.doc.type === "业务线" ? kbTitle(this.doc) : "表知识库：" + this.doc.target) : ""; },
      docTables() { refreshTick.value; return this.doc ? (this.doc.tables || []).filter(name => name !== this.doc.target) : []; },
      linkChoices() {
        refreshTick.value;
        const line = this.current?.target;
        const names = state.assets.map(asset => ({ name: asset.cnName, line: asset.bizLine }));
        const skip = this.doc?.type === "表" ? this.doc.target : "";
        return { mine: names.filter(item => item.line === line && item.name !== skip).map(item => item.name), other: names.filter(item => item.line !== line && item.name !== skip).map(item => item.name) };
      },
      addableTables() { refreshTick.value; const done = new Set(bizStore.kbs.filter(kb => kb.type === "表").map(kb => kb.target)); return this.current ? bizHelpers.tablesOfLine(this.current.target).map(asset => asset.cnName).filter(name => !done.has(name)) : []; },
      renderedDraft() { return md().renderKnowledgeMarkdown(md().normalizeToMarkdown(this.text)); },
      renderedKnowledge() { return this.doc ? md().renderKnowledgeMarkdown(this.doc.markdown) : ""; },
      dirty() { return this.editing && this.doc && this.text !== this.doc.markdown; }
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
        this.tab = "content"; this.editing = false; this.text = ""; this.selId = "main";
        // 从列表点「编辑」或新建进来时直接进入编辑
        if (bizStore.openEdit && bizStore.openEdit === this.kbId && this.current) this.startEdit();
        bizStore.openEdit = "";
      },
      async back() {
        if (this.dirty && !(await confirmAction("放弃修改", "知识库有未保存的修改，确认离开？", "放弃修改"))) return;
        this.editing = false;
        bridge.setPage("AI 知识库");
      },
      async select(id) {
        if (id === this.selId) return;
        if (this.dirty && !(await confirmAction("放弃修改", "当前知识库有未保存的修改，确认切换？", "放弃修改"))) return;
        this.editing = false; this.text = ""; this.selId = id;
      },
      openAddTable() {
        if (this.dirty) return ep.ElMessage.warning("知识库有未保存的修改，请先保存或取消");
        this.addTableName = ""; this.addTableVisible = true;
      },
      submitAddTable() {
        if (!this.addTableName) return ep.ElMessage.warning("请选择数据表");
        const kb = { id: "KB" + String(Date.now()).slice(-6), type: "表", target: this.addTableName, markdown: md().knowledgeTemplate(this.addTableName), updatedBy: bizHelpers.currentUserName(), updatedAt: bizHelpers.nowText() };
        bizStore.kbs.push(kb);
        this.addTableVisible = false; this.selId = kb.id; this.editing = false;
        this.startEdit();
        notify(`已创建「${kb.target}」表知识库，写好内容后点「保存知识库」`);
      },
      openLink() {
        if (this.dirty) return ep.ElMessage.warning("知识库有未保存的修改，请先保存或取消");
        this.linkSelected = this.docTables[0] || ""; this.linkVisible = true;
      },
      saveLink() {
        this.doc.tables = this.linkSelected ? [this.linkSelected] : [];
        Object.assign(this.doc, { updatedBy: bizHelpers.currentUserName(), updatedAt: bizHelpers.nowText() });
        this.linkVisible = false;
        notify("关联数据表已保存");
      },
      unlinkTable(name) { this.doc.tables = (this.doc.tables || []).filter(item => item !== name); },
      async removeDoc() {
        const kb = this.doc;
        if (!kb || kb.type !== "表") return;
        if (!(await confirmAction("删除表知识库", `确认删除「${kb.target}」的表知识库？删除后灵犀智析将不再参考它。`, "删除"))) return;
        bizStore.kbs.splice(bizStore.kbs.indexOf(kb), 1);
        this.selId = "main"; this.editing = false;
        notify("表知识库已删除");
      },
      startEdit() { this.text = this.doc.markdown; this.editing = true; this.tab = "content"; },
      cancelEdit() { this.editing = false; this.text = ""; },
      saveKnowledge() {
        const raw = this.text.trim();
        if (!raw) return ep.ElMessage.warning("知识库内容不能为空");
        const markdown = md().normalizeToMarkdown(raw);
        if (markdown.length > MAX_KNOWLEDGE) return ep.ElMessage.warning(`知识库不能超过 ${MAX_KNOWLEDGE} 字（当前 ${markdown.length} 字）`);
        Object.assign(this.doc, { markdown, updatedBy: bizHelpers.currentUserName(), updatedAt: bizHelpers.nowText() });
        const saved = this.doc;
        this.editing = false; this.text = "";
        notify(`「${kbTitle(saved)}」已保存${markdown !== raw ? "，已自动转换为 Markdown 格式" : ""}`);
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
      }
    }
  };

  mount("#aiKnowledgeDetailView", KnowledgeDetailApp, "ai-knowledge-detail");
})();
