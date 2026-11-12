/**
 * 组件：BusinessLinePanel（表管理页内的「业务线」视图）
 * 依赖 core.js（window.PortalVue）。window.PortalKnowledgeMd 由 knowledge-md.js 提供，加载顺序在本文件之后，所以只在用到时才读取。
 * 数据都在 knowledgeData 里，所有保存走 knowledgeSync.saveBusinessLines()；没有编辑权限时整页只读。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const { ep, knowledgeData, knowledgeSync, loadGatewayFields, loginUser, notify, permissionFieldsOf, refreshTick, state } = window.PortalVue;

  const PUBLIC = "公共";
  const MAX_KNOWLEDGE = 20000;
  const MAX_LINES = 50;
  const MAX_RELATIONS = 200;
  const RELATION_TYPES = ["1:1", "1:N", "N:1"];
  const md = () => window.PortalKnowledgeMd;

  const BusinessLinePanel = {
    props: { visibleTables: { type: Array, default: null } },
    template: `
      <section class="portal-vue-panel portal-vue-bizline">
        <aside class="portal-vue-bizline-side">
          <div class="portal-vue-bizline-side-head"><strong>业务线</strong><el-button v-if="editable" size="small" type="primary" plain @click="openNameDialog('add')">新增业务线</el-button></div>
          <ul class="portal-vue-bizline-list">
            <li v-for="line in lines" :key="line.id || line.name" :class="{ active: line.name === selectedName }" class="portal-vue-bizline-item" @click="select(line)">
              <span class="portal-vue-bizline-name">{{ line.name }}</span>
              <el-tag size="small" effect="plain" round>{{ tablesOf(line).length }} 张表</el-tag>
            </li>
          </ul>
          <div v-if="editable && selected" class="portal-vue-bizline-side-actions">
            <template v-if="selected.name !== PUBLIC">
              <el-button size="small" link type="primary" @click="openNameDialog('rename')">改名</el-button>
              <el-button size="small" link type="primary" :disabled="!canMove(-1)" @click="moveLine(-1)">上移</el-button>
              <el-button size="small" link type="primary" :disabled="!canMove(1)" @click="moveLine(1)">下移</el-button>
              <el-button size="small" link type="danger" @click="removeLine">删除</el-button>
            </template>
            <span v-else class="portal-vue-muted">「公共」为内置业务线，置顶，不能改名或删除</span>
          </div>
        </aside>
        <div class="portal-vue-bizline-main">
          <el-empty v-if="!selected" description="暂无业务线"></el-empty>
          <template v-else>
            <h3 class="portal-vue-bizline-title">{{ selected.name }}<span v-if="!editable" class="portal-vue-muted portal-vue-bizline-readonly">只读</span></h3>
            <el-tabs v-model="sub" class="portal-vue-bizline-tabs">
              <el-tab-pane label="知识库" name="knowledge">
                <div class="portal-vue-knowledge-bar">
                  <span class="portal-vue-muted">{{ selected.knowledge && !editing ? "最近编辑：" + selected.knowledge.updatedBy + " · " + selected.knowledge.updatedAt : "" }}</span>
                  <el-button v-if="!editing && editable && selected.knowledge" type="primary" round class="portal-vue-knowledge-edit" @click="startEdit">编辑知识库</el-button>
                </div>
                <div v-if="editing" class="portal-vue-md-editor portal-vue-bizline-editor">
                  <div class="portal-vue-md-toolbar" @mousedown.prevent>
                    <el-button size="small" text @click="mdWrap('**', '**', '加粗文字')"><strong>B</strong>&nbsp;加粗</el-button>
                    <el-button size="small" text @click="mdLinePrefix('## ')">标题</el-button>
                    <el-button size="small" text @click="mdLinePrefix('- ')">无序列表</el-button>
                    <el-button size="small" text @click="mdLinePrefix('1. ')">有序列表</el-button>
                    <el-button size="small" text @click="mdLinePrefix('> ')">引用</el-button>
                    <span class="portal-vue-md-tip">左边编辑，右边预览；上限 ${MAX_KNOWLEDGE} 字</span>
                  </div>
                  <div class="portal-vue-md-split">
                    <textarea ref="mdArea" v-model="text" class="portal-vue-md-textarea" spellcheck="false" placeholder="在这里填写业务线知识库，支持 Markdown"></textarea>
                    <div class="portal-vue-knowledge-doc" v-html="renderedDraft"></div>
                  </div>
                  <div class="portal-vue-bizline-editor-actions"><el-button round @click="cancelEdit">取消</el-button><el-button type="primary" round :loading="saving" @click="saveKnowledge">保存知识库</el-button></div>
                </div>
                <template v-else>
                  <div v-if="selected.knowledge" class="portal-vue-knowledge-doc" v-html="renderedKnowledge"></div>
                  <el-empty v-else description="该业务线还没有知识库。写下业务口径与术语，灵犀智析回答该业务线的问题时会参考。"><el-button v-if="editable" type="primary" round @click="startEdit">新建知识库</el-button></el-empty>
                </template>
              </el-tab-pane>
              <el-tab-pane label="表关联" name="relations">
                <div class="portal-vue-bizline-bar"><span class="portal-vue-muted">说明两张表怎样关联（关系读作 左:右），灵犀智析取数时会据此做关联。共 {{ relations.length }} / ${MAX_RELATIONS} 条</span><el-button v-if="editable" type="primary" @click="openRelation()">添加关联</el-button></div>
                <el-table :data="relations" class="portal-vue-table" border empty-text="暂无表关联">
                  <el-table-column label="左表" prop="left.table" min-width="150" show-overflow-tooltip></el-table-column>
                  <el-table-column label="左字段" min-width="120"><template #default="scope"><code class="portal-vue-code">{{ scope.row.left.field }}</code></template></el-table-column>
                  <el-table-column label="关系" prop="type" width="80" align="center"></el-table-column>
                  <el-table-column label="右表" prop="right.table" min-width="150" show-overflow-tooltip></el-table-column>
                  <el-table-column label="右字段" min-width="120"><template #default="scope"><code class="portal-vue-code">{{ scope.row.right.field }}</code></template></el-table-column>
                  <el-table-column label="备注" prop="note" min-width="160" show-overflow-tooltip></el-table-column>
                  <el-table-column v-if="editable" label="操作" width="120"><template #default="scope"><el-button link type="primary" @click="openRelation(scope.row)">编辑</el-button><el-button link type="danger" @click="removeRelation(scope.row)">删除</el-button></template></el-table-column>
                </el-table>
              </el-tab-pane>
              <el-tab-pane label="包含的表" name="tables">
                <div class="portal-vue-bizline-bar">
                  <span class="portal-vue-muted">共 {{ selectedTables.length }} 张表</span>
                  <el-select v-if="editable" :model-value="''" class="portal-vue-bizline-move-in" filterable placeholder="移入数据表" @change="moveIn">
                    <el-option v-for="item in moveInOptions" :key="item.table" :label="item.table + '（' + (item.line || '未分组') + '）'" :value="item.table"></el-option>
                  </el-select>
                </div>
                <el-table :data="selectedTables" class="portal-vue-table" border empty-text="该业务线下还没有数据表">
                  <el-table-column label="表中文名" prop="table" min-width="200" show-overflow-tooltip></el-table-column>
                  <el-table-column label="表名" min-width="220" show-overflow-tooltip><template #default="scope"><code class="portal-vue-code">{{ scope.row.raw }}</code></template></el-table-column>
                  <el-table-column label="表负责人" prop="owner" width="140"></el-table-column>
                  <el-table-column v-if="editable" label="操作" width="90"><template #default="scope"><el-button link type="danger" @click="moveOut(scope.row.table)">移出</el-button></template></el-table-column>
                </el-table>
              </el-tab-pane>
            </el-tabs>
          </template>
        </div>

        <el-dialog v-model="nameVisible" :title="nameMode === 'add' ? '新增业务线' : '业务线改名'" width="420px" append-to-body>
          <el-form label-position="top" @submit.prevent><el-form-item label="业务线名称" required><el-input v-model="nameDraft" maxlength="30" placeholder="例如：AI 短剧" @keyup.enter="submitName"></el-input></el-form-item></el-form>
          <template #footer><el-button @click="nameVisible=false">取消</el-button><el-button type="primary" @click="submitName">确定</el-button></template>
        </el-dialog>

        <el-dialog v-model="relationVisible" :title="relationForm.id ? '编辑表关联' : '添加表关联'" width="640px" append-to-body>
          <el-form label-position="top" class="portal-vue-dialog-form">
            <div class="portal-vue-bizline-relation-grid">
              <el-form-item label="左表" required><el-select v-model="relationForm.leftTable" filterable placeholder="选择左表" @change="relationForm.leftField=''"><el-option v-for="name in tableChoices" :key="name" :label="name" :value="name"></el-option></el-select></el-form-item>
              <el-form-item label="左字段" required><el-select v-model="relationForm.leftField" filterable placeholder="选择左字段" class="portal-vue-bizline-left-field"><el-option v-for="name in fieldChoices(relationForm.leftTable)" :key="name" :label="name" :value="name"></el-option></el-select></el-form-item>
              <el-form-item label="关系（左:右）" required><el-select v-model="relationForm.type"><el-option v-for="item in RELATION_TYPES" :key="item" :label="item" :value="item"></el-option></el-select></el-form-item>
              <span></span>
              <el-form-item label="右表" required><el-select v-model="relationForm.rightTable" filterable placeholder="选择右表" @change="relationForm.rightField=''"><el-option v-for="name in tableChoices" :key="name" :label="name" :value="name"></el-option></el-select></el-form-item>
              <el-form-item label="右字段" required><el-select v-model="relationForm.rightField" filterable placeholder="选择右字段" class="portal-vue-bizline-right-field"><el-option v-for="name in fieldChoices(relationForm.rightTable)" :key="name" :label="name" :value="name"></el-option></el-select></el-form-item>
            </div>
            <el-form-item label="备注"><el-input v-model="relationForm.note" maxlength="200" placeholder="例如：一个用户可以有多笔订单"></el-input></el-form-item>
          </el-form>
          <template #footer><el-button @click="relationVisible=false">取消</el-button><el-button type="primary" @click="saveRelation">保存</el-button></template>
        </el-dialog>
      </section>
    `,
    data: () => ({ PUBLIC, RELATION_TYPES, selectedName: PUBLIC, sub: "knowledge", editing: false, text: "", saving: false, nameVisible: false, nameMode: "add", nameDraft: "", relationVisible: false, relationForm: {} }),
    computed: {
      editable() { refreshTick.value; return !!knowledgeData.canEdit && this.canEdit("表管理"); },
      lines() { refreshTick.value; return knowledgeData.businessLines; },
      selected() { return this.lines.find(line => line.name === this.selectedName) || this.lines[0] || null; },
      relations() { return this.selected?.relations || []; },
      tableChoices() {
        refreshTick.value;
        const assets = new Set(state.assets.map(item => item.cnName));
        const visible = this.visibleTables ? new Set(this.visibleTables) : null;
        return knowledgeData.knownTables.filter(name => assets.has(name) && (!visible || visible.has(name)));
      },
      selectedTables() {
        refreshTick.value;
        return this.tablesOf(this.selected).map(table => { const asset = state.assets.find(item => item.cnName === table); return { table, raw: asset?.table || "", owner: asset?.owner || "" }; });
      },
      moveInOptions() { refreshTick.value; return this.tableChoices.filter(name => knowledgeData.tableLines[name] !== this.selected?.name).map(table => ({ table, line: knowledgeData.tableLines[table] || "" })); },
      renderedDraft() { return md().renderKnowledgeMarkdown(md().normalizeToMarkdown(this.text)); },
      renderedKnowledge() { return this.selected?.knowledge ? md().renderKnowledgeMarkdown(this.selected.knowledge.markdown) : ""; }
    },
    mounted() { if (this.editable) loadGatewayFields(); },
    watch: { selectedName() { this.editing = false; this.text = ""; } },
    methods: {
      tablesOf(line) { refreshTick.value; return line ? Object.entries(knowledgeData.tableLines).filter(([, name]) => name === line.name).map(([table]) => table) : []; },
      select(line) { this.selectedName = line.name; },
      /** 提交后重新读取，拿到服务端分配的 id、最近编辑人与时间；返回是否保存成功 */
      async persist() {
        const ok = await knowledgeSync.saveBusinessLines();
        if (ok) await knowledgeSync.load();
        return ok;
      },
      /* ---- 业务线列表 ---- */
      openNameDialog(mode) {
        if (mode === "add" && this.lines.length >= MAX_LINES) return ep.ElMessage.warning(`业务线最多 ${MAX_LINES} 个（含「${PUBLIC}」）`);
        this.nameMode = mode;
        this.nameDraft = mode === "rename" ? this.selected.name : "";
        this.nameVisible = true;
      },
      async submitName() {
        const name = this.nameDraft.trim();
        if (!name) return ep.ElMessage.warning("请填写业务线名称");
        if (this.lines.some(line => line.name === name && line !== this.selected) || (this.nameMode === "add" && this.lines.some(line => line.name === name))) return ep.ElMessage.warning(`业务线「${name}」已存在`);
        if (name === PUBLIC) return ep.ElMessage.warning(`「${PUBLIC}」是内置业务线，名称不能使用`);
        if (this.nameMode === "add") {
          knowledgeData.businessLines.push({ name, order: knowledgeData.businessLines.length, knowledge: null, relations: [] });
        } else {
          const old = this.selected.name;
          if (old === name) { this.nameVisible = false; return; }
          // 表的归属按业务线名记录，改名时一起改，否则服务端会认为这些表指向不存在的业务线
          Object.keys(knowledgeData.tableLines).forEach(table => { if (knowledgeData.tableLines[table] === old) knowledgeData.tableLines[table] = name; });
          this.selected.name = name;
        }
        this.nameVisible = false;
        const mode = this.nameMode;
        this.selectedName = name;
        if (await this.persist()) notify(mode === "add" ? `业务线「${name}」已新增` : `业务线已改名为「${name}」`);
        else this.selectedName = PUBLIC;
      },
      canMove(step) {
        const index = this.lines.indexOf(this.selected);
        const target = index + step;
        return this.selected?.name !== PUBLIC && target >= 1 && target < this.lines.length;
      },
      async moveLine(step) {
        if (!this.canMove(step)) return;
        const list = knowledgeData.businessLines;
        const index = list.indexOf(this.selected);
        const [item] = list.splice(index, 1);
        list.splice(index + step, 0, item);
        list.forEach((line, order) => { line.order = order; });
        await this.persist();
      },
      async removeLine() {
        const line = this.selected;
        if (!line || line.name === PUBLIC) return;
        const tables = this.tablesOf(line);
        if (tables.length) return ep.ElMessage.warning(`业务线「${line.name}」下还有数据表，请先迁出：${tables.join("、")}`);
        if (!(await window.PortalVue.confirmAction("删除业务线", `确认删除业务线「${line.name}」？它的知识库和表关联会一并删除。`, "删除"))) return;
        knowledgeData.businessLines.splice(knowledgeData.businessLines.indexOf(line), 1);
        this.selectedName = PUBLIC;
        if (await this.persist()) notify(`业务线「${line.name}」已删除`);
      },
      /* ---- 知识库 ---- */
      startEdit() { this.text = this.selected.knowledge?.markdown || md().businessLineTemplate(this.selected.name); this.editing = true; },
      cancelEdit() { this.editing = false; this.text = ""; },
      async saveKnowledge() {
        if (this.saving) return;
        const raw = this.text.trim();
        if (!raw) return ep.ElMessage.warning("知识库内容不能为空");
        const markdown = md().normalizeToMarkdown(raw);
        if (markdown.length > MAX_KNOWLEDGE) return ep.ElMessage.warning(`知识库不能超过 ${MAX_KNOWLEDGE} 字（当前 ${markdown.length} 字）`);
        const name = this.selected.name;
        this.saving = true;
        this.selected.knowledge = { markdown, updatedBy: loginUser()?.name || "", updatedAt: md().knowledgeNow() };
        const ok = await this.persist();
        this.saving = false;
        if (!ok) return;
        this.editing = false;
        notify(`「${name}」知识库已保存${markdown !== raw ? "，已自动转换为 Markdown 格式" : ""}`);
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
      /* ---- 表关联 ---- */
      fieldChoices(table) {
        refreshTick.value;
        if (!table) return [];
        return permissionFieldsOf(table).map(field => field.name).filter(Boolean);
      },
      openRelation(row) {
        if (!row && this.relations.length >= MAX_RELATIONS) return ep.ElMessage.warning(`每个业务线的关联最多 ${MAX_RELATIONS} 条`);
        this.relationForm = row
          ? { id: row.id || "", leftTable: row.left.table, leftField: row.left.field, type: row.type, rightTable: row.right.table, rightField: row.right.field, note: row.note || "" }
          : { id: "", leftTable: "", leftField: "", type: "1:N", rightTable: "", rightField: "", note: "" };
        this.relationVisible = true;
      },
      async saveRelation() {
        const form = this.relationForm;
        if (![form.leftTable, form.leftField, form.rightTable, form.rightField].every(Boolean)) return ep.ElMessage.warning("请选择两端的表和字段");
        if (!RELATION_TYPES.includes(form.type)) return ep.ElMessage.warning("请选择关系类型");
        if (form.leftTable === form.rightTable && form.leftField === form.rightField) return ep.ElMessage.warning("两端不能是同一张表的同一个字段");
        const item = { left: { table: form.leftTable, field: form.leftField }, right: { table: form.rightTable, field: form.rightField }, type: form.type, note: form.note.trim() };
        if (form.id) {
          const index = this.relations.findIndex(rel => rel.id === form.id);
          if (index >= 0) this.relations.splice(index, 1, { ...item, id: form.id }); else return;
        } else {
          this.selected.relations.push(item);
        }
        this.relationVisible = false;
        if (await this.persist()) notify("表关联已保存");
      },
      async removeRelation(row) {
        if (!(await window.PortalVue.confirmAction("删除表关联", `确认删除 ${row.left.table}.${row.left.field} ${row.type} ${row.right.table}.${row.right.field}？`, "删除"))) return;
        const index = this.relations.indexOf(row);
        if (index < 0) return;
        this.relations.splice(index, 1);
        if (await this.persist()) notify("表关联已删除");
      },
      /* ---- 包含的表 ---- */
      async moveIn(table) {
        if (!table || !this.selected) return;
        knowledgeData.tableLines[table] = this.selected.name;
        if (await this.persist()) notify(`「${table}」已移入业务线「${this.selected.name}」`);
      },
      async moveOut(table) {
        // 服务端把 tableLines 当作覆盖：没写的表保持原归属，所以未分组要明确写成 ""
        knowledgeData.tableLines[table] = "";
        if (await this.persist()) notify(`「${table}」已移出，当前未分组`);
      }
    }
  };

  window.PortalVue.BusinessLinePanel = BusinessLinePanel;
})();
