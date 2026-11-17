/**
 * 页面：AI 知识库（AI 中心 → AI 知识库）
 * 以业务线为单位管理 AI 知识库：每个业务线一份业务线知识库，其下再挂表知识库（后续还可扩展其他类型）。
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

  const tableKbsOf = line => bizStore.kbs.filter(kb => kb.type === "表" && lineOfKb(kb) === line);

  const AiKnowledgeApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <div class="portal-vue-toolbar">
            <div class="portal-vue-toolbar-left">
              <el-input v-model="keyword" class="portal-vue-search" clearable placeholder="搜索业务线、知识库内容"></el-input>
            </div>
            <el-button v-if="canEdit('AI 知识库')" type="primary" @click="openCreate">新建业务线知识库</el-button>
          </div>
          <div class="portal-vue-scope-hint"><span>灵犀智析回答问题时，会按业务线读取<strong>业务线知识库</strong>，以及其下的<strong>表知识库</strong></span><span class="portal-vue-muted">{{ canEdit('AI 知识库') ? '业务线在「系统管理 → 业务线」维护；表所属业务线在「表管理 → 表详情」设置' : '当前菜单未配置「编辑」权限，仅可查看' }}</span></div>
          <el-table :data="rows" class="portal-vue-table" border empty-text="暂无知识库">
            <el-table-column label="业务线知识库" min-width="200" show-overflow-tooltip><template #default="scope"><el-button link type="primary" class="portal-vue-name" @click="open(scope.row, false)">{{ title(scope.row) }}</el-button></template></el-table-column>
            <el-table-column label="业务线" width="100"><template #default="scope"><el-tag size="small" effect="plain">{{ scope.row.target }}</el-tag></template></el-table-column>
            <el-table-column label="内容摘要" min-width="280" show-overflow-tooltip><template #default="scope"><span class="portal-vue-muted">{{ summary(scope.row) }}</span></template></el-table-column>
            <el-table-column label="关联数据表" width="100" align="center"><template #default="scope">{{ (scope.row.tables || []).length }} 张</template></el-table-column>
            <el-table-column label="表知识库" width="100" align="center"><template #default="scope">{{ tableKbs(scope.row).length }} 份</template></el-table-column>
            <el-table-column label="表关联" width="90" align="center"><template #default="scope">{{ relationsOf(scope.row.target).length }} 条</template></el-table-column>
            <el-table-column label="最近编辑" width="190"><template #default="scope"><div>{{ scope.row.updatedAt }}</div><small class="portal-vue-muted">{{ scope.row.updatedBy }}</small></template></el-table-column>
            <el-table-column label="操作" width="150" fixed="right"><template #default="scope"><div class="portal-vue-actions"><el-button link type="primary" @click="open(scope.row, false)">查看</el-button><el-button v-if="canEdit('AI 知识库')" link type="primary" @click="open(scope.row, true)">编辑</el-button><el-button v-if="canEdit('AI 知识库')" link type="danger" @click="remove(scope.row)">删除</el-button></div></template></el-table-column>
          </el-table>
          <div class="portal-vue-pagination"><span>共 {{ rows.length }} 个业务线知识库</span></div>
        </section>

        <el-dialog v-model="createVisible" title="新建业务线知识库" width="480px" append-to-body>
          <el-form label-position="top" class="portal-vue-dialog-form" @submit.prevent>
            <el-form-item label="所属业务线" required>
              <el-select v-model="createLine" placeholder="选择业务线" no-data-text="所有业务线都已建好知识库"><el-option v-for="line in creatableLines" :key="line" :label="line" :value="line"></el-option></el-select>
              <div class="portal-vue-muted" style="margin-top:6px;line-height:1.6">每个业务线只有一份业务线知识库，写业务口径、常用术语、回答规则；表知识库和表关联在它的详情页里维护。</div>
            </el-form-item>
          </el-form>
          <template #footer><el-button @click="createVisible=false">取消</el-button><el-button type="primary" @click="submitCreate">创建并编写</el-button></template>
        </el-dialog>
      </el-config-provider>
    `,
    data: () => ({ keyword: "", createVisible: false, createLine: "" }),
    computed: {
      creatableLines() { refreshTick.value; return bizHelpers.activeLines().filter(line => !this.lineHasKb(line)); },
      rows() {
        refreshTick.value;
        const keyword = this.keyword.trim().toLowerCase();
        return bizStore.kbs.filter(kb => kb.type === "业务线" && (!keyword || `${kbTitle(kb)} ${kb.markdown}`.toLowerCase().includes(keyword)));
      }
    },
    methods: {
      title: kbTitle,
      summary: summaryOf,
      tableKbs(kb) { refreshTick.value; return tableKbsOf(kb.target); },
      relationsOf(line) { refreshTick.value; return bizStore.relations.filter(rel => rel.line === line); },
      lineHasKb(line) { return bizStore.kbs.some(kb => kb.type === "业务线" && kb.target === line); },
      /* ---- 新建 ---- */
      openCreate() { this.createLine = ""; this.createVisible = true; },
      submitCreate() {
        if (!this.createLine) return ep.ElMessage.warning("请选择所属业务线");
        const kb = { id: "KB" + String(Date.now()).slice(-6), type: "业务线", target: this.createLine, markdown: md().businessLineTemplate(this.createLine), updatedBy: bizHelpers.currentUserName(), updatedAt: bizHelpers.nowText() };
        bizStore.kbs.unshift(kb);
        this.createVisible = false;
        this.open(bizStore.kbs[0], true);
        notify(`已创建「${kbTitle(kb)}」，写好内容后点「保存知识库」`);
      },
      /* ---- 详情：独立页面（#/ai/knowledge/<id>），业务线知识库和它下面的表知识库都在里面 ---- */
      open(kb, edit) {
        bizStore.openEdit = edit ? kb.id : "";
        bridge.setKnowledgeDetailId(kb.id);
        bridge.setPage("知识库详情");
      },
      async remove(kb) {
        const tables = tableKbsOf(kb.target);
        if (!(await confirmAction("删除业务线知识库", `确认删除「${kbTitle(kb)}」？${tables.length ? `它下面的 ${tables.length} 份表知识库会一并删除，` : ""}业务线下的表关联不会删除。删除后灵犀智析将不再参考。`, "删除"))) return;
        bizStore.kbs = bizStore.kbs.filter(item => item !== kb && !tables.includes(item));
        notify("知识库已删除");
      }
    }
  };

  mount("#aiKnowledgeView", AiKnowledgeApp, "ai-knowledge");
})();
