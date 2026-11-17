/**
 * 页面：业务线（系统管理 → 业务线）
 * 业务线是全局基础数据：表、AI 知识库（后续还有 Skill）都绑定到某个业务线。
 * 原型阶段数据放在前端 window.PortalVue.bizStore（刷新即还原），确认交互后再接后端。
 * 本文件同时提供 bizStore，page-asset-management / page-table-detail / page-ai-knowledge 共用。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const { ep, mount, notify, reactive, refreshTick, state } = window.PortalVue;

  /* ===== 共享数据（原型内存态）=====
     lines：业务线；kbs：知识库（type=业务线 时 target 是业务线名，type=表 时 target 是表中文名；表知识库所属业务线跟随表的业务线）；
     relations：业务线内的表关联（归在业务线知识库下维护） */
  const bizStore = reactive({
    lines: [
      { id: "BL01", name: "存量", desc: "存量用户运营：用户画像、生命周期、触达与召回。", enabled: true, updatedBy: "曾祥竞", updatedAt: "2026-11-10 10:20" },
      { id: "BL02", name: "权益", desc: "权益业务：银联权益、领券核销、广告投放与转化。", enabled: true, updatedBy: "曾祥竞", updatedAt: "2026-11-10 10:20" },
      { id: "BL03", name: "保险", desc: "保险业务：投保转化、保费与理赔相关数据。", enabled: true, updatedBy: "曾祥竞", updatedAt: "2026-11-12 16:05" },
      { id: "BL04", name: "号卡", desc: "号卡业务：RTA 请求、号卡订单与渠道投放。", enabled: true, updatedBy: "曾祥竞", updatedAt: "2026-11-12 16:05" }
    ],
    kbs: [
      { id: "KB01", type: "业务线", target: "权益", updatedBy: "曾祥竞", updatedAt: "2026-11-13 09:30",
        markdown: "# 权益业务线知识库\n\n## 业务概述\n权益业务通过广告投放引导用户领取银联权益，核心看「消耗、领取、核销」三段转化。\n\n## 常用术语\n- **领取率**：领取人数 / 曝光人数\n- **核销率**：核销人数 / 领取人数\n- **CPA**：消耗 / 核销人数\n\n## 回答规则\n- 未指定日期时，默认看最近 7 天。\n- 金额统一用元，保留两位小数。" },
      { id: "KB02", type: "业务线", target: "存量", updatedBy: "曾祥竞", updatedAt: "2026-11-13 09:45",
        markdown: "# 存量业务线知识库\n\n## 业务概述\n存量业务面向已注册用户，目标是提升活跃与复购，通过标签圈选人群后触达。\n\n## 常用术语\n- **活跃用户**：近 30 天有登录行为的用户\n- **沉默用户**：近 90 天无登录行为的用户\n\n## 回答规则\n- 用户量类问题默认按「去重用户数」统计。" },
      { id: "KB03", type: "表", target: "广告计划日报表", updatedBy: "曾祥竞", updatedAt: "2026-11-13 10:10",
        markdown: "# 广告计划日报表\n\n## 表说明\n按「日期 + 广告计划」粒度的投放日报，一个计划一天一行。\n\n## 指标口径\n- **消耗**：`cost`，单位元\n- **转化数**：`convert_cnt`，已按媒体回传去重\n\n## 注意事项\n- 当天数据 T+1 凌晨 2:30 后才完整。" }
    ],
    relations: [],
    /* Skill 绑定的业务线（按 Skill id；单选，值是业务线名；「全部」表示通用 Skill；未登记的视为「未绑定」） */
    skillLines: {
      "warehouse-analyst": "全部",
      "lineage-analyst": "全部",
      "asset-qa": "全部",
      "attribution-analyst": "全部",
      "equity-union-analyst": "权益",
      "report-writer": "全部",
      "general-analyst": "全部"
    }
  });

  const activeLines = () => bizStore.lines.filter(line => line.enabled).map(line => line.name);
  const nowText = () => window.PortalKnowledgeMd?.knowledgeNow?.() || "";
  const currentUserName = () => window.PortalVue.loginUser?.()?.name || "";

  /** 业务线下绑定的表（表管理里的「业务线」字段） */
  const tablesOfLine = name => state.assets.filter(asset => asset.bizLine === name);
  /** 业务线下的知识库：业务线知识库 + 属于该业务线的表知识库 */
  /** 绑定了该业务线的 Skill（原型里 numa-warehouse 是内部兜底 Skill，不在列表里展示，也不计数） */
  const SKILL_ALL = "全部";
  /** 绑定到该业务线的 Skill，含「全部」（通用）Skill */
  const skillsOfLine = name => (state.skills || []).filter(skill => skill.id !== "numa-warehouse" && [name, SKILL_ALL].includes(bizStore.skillLines[skill.id]));
  const kbsOfLine = name => bizStore.kbs.filter(kb => kb.type === "业务线" ? kb.target === name : (state.assets.find(asset => asset.cnName === kb.target)?.bizLine || "") === name);

  const BusinessLinesApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <div class="portal-vue-toolbar">
            <div class="portal-vue-toolbar-left">
              <el-input v-model="keyword" class="portal-vue-search" clearable placeholder="搜索业务线名称、说明"></el-input>
              <el-select v-model="statusFilter" class="portal-vue-filter" placeholder="全部状态"><el-option label="全部状态" value=""></el-option><el-option label="启用" value="启用"></el-option><el-option label="停用" value="停用"></el-option></el-select>
            </div>
            <el-button v-if="canEdit('业务线')" type="primary" @click="openForm(null)">新增业务线</el-button>
          </div>
          <div class="portal-vue-scope-hint"><span>业务线用于归类<strong>数据表、AI 知识库、Skill</strong></span><span class="portal-vue-muted">业务线不能删除，不再使用时请停用；停用后不能再被新的表和知识库选择，已绑定的保持不变</span></div>
          <el-table :data="rows" class="portal-vue-table" border empty-text="暂无业务线">
            <el-table-column label="业务线" width="160"><template #default="scope"><span class="portal-vue-name">{{ scope.row.name }}</span></template></el-table-column>
            <el-table-column prop="desc" label="说明" min-width="300" show-overflow-tooltip></el-table-column>
            <el-table-column label="绑定数据表" width="120" align="center"><template #default="scope">{{ tablesOf(scope.row).length }} 张</template></el-table-column>
            <el-table-column label="AI 知识库" width="120" align="center"><template #default="scope"><el-button link type="primary" :disabled="!kbsOf(scope.row).length" @click="goKnowledge(scope.row)">{{ kbsOf(scope.row).length }} 份</el-button></template></el-table-column>
            <el-table-column label="Skill（含通用）" width="130" align="center"><template #default="scope"><el-button link type="primary" :disabled="!skillsOf(scope.row).length" @click="goSkills(scope.row)">{{ skillsOf(scope.row).length }} 个</el-button></template></el-table-column>
            <el-table-column label="状态" width="90" align="center"><template #default="scope"><el-switch :disabled="!canEdit('业务线')" :model-value="scope.row.enabled" @change="value => toggle(scope.row, value)"></el-switch></template></el-table-column>
            <el-table-column label="最近修改" width="190"><template #default="scope"><div>{{ scope.row.updatedAt }}</div><small class="portal-vue-muted">{{ scope.row.updatedBy }}</small></template></el-table-column>
            <el-table-column label="操作" width="90" fixed="right"><template #default="scope"><el-button v-if="canEdit('业务线')" link type="primary" @click="openForm(scope.row)">编辑</el-button><span v-else class="portal-vue-muted">—</span></template></el-table-column>
          </el-table>
          <div class="portal-vue-pagination"><span>共 {{ rows.length }} 个业务线</span></div>
        </section>

        <el-dialog v-model="formVisible" :title="form.id ? '编辑业务线' : '新增业务线'" width="480px" append-to-body>
          <el-form label-position="top" class="portal-vue-dialog-form" @submit.prevent>
            <el-form-item label="业务线名称" required><el-input v-model="form.name" maxlength="20" show-word-limit placeholder="例如：存量、权益、保险"></el-input></el-form-item>
            <el-alert v-if="renameHint" type="warning" show-icon :closable="false" :title="renameHint" style="margin:-4px 0 14px"></el-alert>
            <el-form-item label="说明"><el-input v-model="form.desc" type="textarea" :rows="3" maxlength="100" show-word-limit placeholder="一句话说明这条业务线负责什么"></el-input></el-form-item>
            <el-form-item label="状态"><el-switch v-model="form.enabled" inline-prompt active-text="启用" inactive-text="停用"></el-switch></el-form-item>
          </el-form>
          <template #footer><el-button @click="formVisible=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template>
        </el-dialog>
      </el-config-provider>
    `,
    data: () => ({ keyword: "", statusFilter: "", formVisible: false, form: {}, editing: null }),
    computed: {
      rows() {
        refreshTick.value;
        const keyword = this.keyword.trim().toLowerCase();
        return bizStore.lines.filter(line => (!this.statusFilter || (line.enabled ? "启用" : "停用") === this.statusFilter) && (!keyword || `${line.name} ${line.desc}`.toLowerCase().includes(keyword)));
      },
      renameHint() {
        if (!this.editing || this.form.name?.trim() === this.editing.name) return "";
        const tables = tablesOfLine(this.editing.name).length;
        const kbs = kbsOfLine(this.editing.name).length;
        const skills = skillsOfLine(this.editing.name).length;
        return tables || kbs || skills ? `改名后，已绑定的 ${tables} 张数据表、${kbs} 份知识库、${skills} 个 Skill 会自动同步为新名称。` : "";
      }
    },
    mounted() { this.primaryHandler = event => { if (event.detail?.page === "业务线") this.openForm(null); }; window.addEventListener("portal:primary-action", this.primaryHandler); },
    beforeUnmount() { window.removeEventListener("portal:primary-action", this.primaryHandler); },
    methods: {
      tablesOf: line => tablesOfLine(line.name),
      kbsOf: line => kbsOfLine(line.name),
      skillsOf: line => skillsOfLine(line.name),
      goSkills(line) { window.PortalVue.bizStore.focusSkillLine = line.name; window.portalVueBridge.setPage("Skill 配置"); },
      goKnowledge(line) {
        const main = bizStore.kbs.find(kb => kb.type === "业务线" && kb.target === line.name);
        if (!main) return window.portalVueBridge.setPage("AI 知识库");
        bizStore.openEdit = "";
        window.portalVueBridge.setKnowledgeDetailId(main.id);
        window.portalVueBridge.setPage("知识库详情");
      },
      openForm(line) {
        this.editing = line;
        this.form = line ? { id: line.id, name: line.name, desc: line.desc, enabled: line.enabled } : { id: "", name: "", desc: "", enabled: true };
        this.formVisible = true;
      },
      save() {
        const name = this.form.name.trim();
        if (!name) return ep.ElMessage.warning("请填写业务线名称");
        if (bizStore.lines.some(line => line.name === name && line.id !== this.form.id)) return ep.ElMessage.warning(`业务线「${name}」已存在`);
        const meta = { desc: this.form.desc.trim(), enabled: !!this.form.enabled, updatedBy: currentUserName(), updatedAt: nowText() };
        if (!this.form.id) {
          bizStore.lines.push({ id: "BL" + String(bizStore.lines.length + 1).padStart(2, "0"), name, ...meta });
          notify(`业务线「${name}」已新增`);
        } else {
          const line = bizStore.lines.find(item => item.id === this.form.id);
          const old = line.name;
          if (old !== name) {
            // 表、知识库、表关联都是按业务线名绑定的，改名时一起改
            state.assets.forEach(asset => { if (asset.bizLine === old) asset.bizLine = name; });
            bizStore.kbs.forEach(kb => { if (kb.type === "业务线" && kb.target === old) kb.target = name; });
            bizStore.relations.forEach(rel => { if (rel.line === old) rel.line = name; });
            Object.keys(bizStore.skillLines).forEach(id => { if (bizStore.skillLines[id] === old) bizStore.skillLines[id] = name; });
          }
          Object.assign(line, { name }, meta);
          notify(`业务线「${name}」已保存`);
        }
        refreshTick.value += 1;
        this.formVisible = false;
      },
      async toggle(line, value) {
        if (!value && !(await window.PortalVue.confirmAction("停用业务线", `确认停用「${line.name}」？停用后新建表和知识库时不能再选它，已绑定的内容保持不变。`, "停用"))) return;
        line.enabled = value; line.updatedBy = currentUserName(); line.updatedAt = nowText();
        notify(`业务线「${line.name}」已${value ? "启用" : "停用"}`);
      }
    }
  };

  window.PortalVue.bizStore = bizStore;
  window.PortalVue.bizHelpers = { SKILL_ALL, activeLines, tablesOfLine, kbsOfLine, skillsOfLine, nowText, currentUserName };
  mount("#businessLineView", BusinessLinesApp, "business-lines");
})();
