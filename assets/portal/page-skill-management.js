/**
 * 页面：skill-management
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    analysisGatewayBase,
    bridge,
    ep,
    loginUser,
    mount,
    notify,
    refreshTick,
    state
  } = window.PortalVue;
  const { bizStore, bizHelpers } = window.PortalVue;

  const SkillManagementApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <div class="portal-vue-toolbar">
            <div class="portal-vue-toolbar-left"><el-input v-model="keyword" class="portal-vue-search" clearable placeholder="搜索 Skill 名称"></el-input><el-select v-model="lineFilter" class="portal-vue-filter" clearable placeholder="全部业务线"><el-option label="全部业务线" value=""></el-option><el-option v-for="line in allLines" :key="line" :label="line" :value="line"></el-option><el-option label="未绑定业务线" value="__none"></el-option></el-select></div>
            <el-button v-if="canEdit('Skill 配置')" type="primary" @click="openCreate">＋ 新增 Skill</el-button>
          </div>
          <el-table :data="filteredRows" class="portal-vue-table" border empty-text="暂无 Skill">
            <el-table-column label="Skill" min-width="280"><template #default="scope"><div><span class="portal-vue-name" style="cursor:pointer" @click="openDetail(scope.row)">{{ scope.row.name }}</span><div class="portal-vue-muted" style="margin-top:2px">{{ scope.row.desc }}</div></div></template></el-table-column>
            <el-table-column label="业务线" width="170"><template #default="scope"><el-tooltip v-if="lineOf(scope.row) === ALL" content="通用 Skill：所有业务线都可使用" placement="top"><el-tag size="small" effect="light">通用</el-tag></el-tooltip><el-tag v-else-if="lineOf(scope.row)" size="small" effect="plain">{{ lineOf(scope.row) }}</el-tag><el-tooltip v-else content="还没有绑定业务线，请进入详情「基本信息」设置" placement="top"><el-tag size="small" type="warning" effect="plain">未绑定</el-tag></el-tooltip></template></el-table-column>
            <el-table-column prop="version" label="当前版本" width="120"></el-table-column>
            <el-table-column label="历史版本" width="100" align="center"><template #default="scope"><el-tooltip content="含当前版本；最近 3 个版本不能删除，方便回滚" placement="top"><span>{{ versionCount(scope.row) }} 个</span></el-tooltip></template></el-table-column>
            <el-table-column label="状态" width="150"><template #default="scope"><div style="display:flex;align-items:center;gap:6px"><el-switch :disabled="!canEdit('Skill 配置')" v-model="scope.row.enabled" inline-prompt active-text="上线" inactive-text="下线" active-color="#16a34a" @change="toggleEnabled(scope.row)"></el-switch><el-tag v-if="scope.row.enabled!==false && skillStatus(scope.row)!=='已发布'" size="small" :type="skillStatus(scope.row)==='未发布' ? 'info' : 'warning'" effect="light">{{ skillStatus(scope.row) }}</el-tag></div></template></el-table-column>
            <el-table-column label="灰度用户" min-width="170"><template #default="scope"><div v-if="scope.row.grayUsers.length" style="display:flex;flex-wrap:wrap;gap:4px"><el-tag v-for="user in scope.row.grayUsers.slice(0,3)" :key="user" size="small" effect="plain">{{ user }}</el-tag><span v-if="scope.row.grayUsers.length>3" class="portal-vue-muted">+{{ scope.row.grayUsers.length-3 }}</span></div><span v-else class="portal-vue-muted">全量发布</span></template></el-table-column>
            <el-table-column label="调用次数" width="100" align="right"><template #default="scope">{{ scope.row.stats.calls }}</template></el-table-column>
            <el-table-column label="操作" width="88" fixed="right"><template #default="scope"><div class="portal-vue-actions"><el-button link type="primary" @click="openDetail(scope.row)">详情</el-button></div></template></el-table-column>
          </el-table>
          <div class="portal-vue-muted" style="margin-top:12px">配置请进入详情页；新版本在详情的「提示词」里保存为未发布，灰度或发布后才上线。</div>
        </section>
        <el-dialog v-model="createVisible" title="新增 Skill" width="480px" destroy-on-close :close-on-click-modal="true">
          <el-form class="portal-vue-dialog-form" label-position="top">
            <el-form-item label="Skill 名称" required><el-input v-model="createForm.name" placeholder="如：人群包效果分析 Skill"></el-input></el-form-item>
            <el-form-item label="所属业务线" required><el-select v-model="createForm.bizLine" placeholder="选择该 Skill 所属的业务线"><el-option label="通用" :value="ALL"></el-option><el-option v-for="line in enabledLines" :key="line" :label="line" :value="line"></el-option></el-select><div class="portal-vue-muted" style="margin-top:6px">只属于某个业务线就选该业务线；所有业务线通用的 Skill 选「全部」。业务线在「系统管理 → 业务线」维护</div></el-form-item>
          </el-form>
          <template #footer>
            <div style="display:flex;justify-content:flex-end;gap:10px"><el-button @click="createVisible=false">取消</el-button><el-button v-if="canEdit('Skill 配置')" type="primary" @click="saveCreate">新增 Skill</el-button></div>
          </template>
        </el-dialog>
      </el-config-provider>
    `,
    data: () => ({ keyword: "", lineFilter: "", createVisible: false, createForm: { name: "", bizLine: "" }, ALL: bizHelpers.SKILL_ALL }),
    computed: {
      skills() { refreshTick.value; return (state.skills || []).filter(item => item.id !== "numa-warehouse"); },
      allLines() { refreshTick.value; return bizStore.lines.map(line => line.name); },
      enabledLines() { refreshTick.value; return bizHelpers.activeLines(); },
      sortedSkills() { return [...this.skills].sort((a, b) => (Number(a.sort) || 999) - (Number(b.sort) || 999)); },
      filteredRows() { const keyword = this.keyword.trim().toLowerCase(); return this.sortedSkills.filter(item => (!this.lineFilter || (this.lineFilter === "__none" ? !this.lineOf(item) : [this.lineFilter, bizHelpers.SKILL_ALL].includes(this.lineOf(item)))) && (!keyword || `${item.name} ${item.title || ""} ${item.desc || ""}`.toLowerCase().includes(keyword))); },
      currentUser() { refreshTick.value; return loginUser() || state.users[0]; }
    },
    methods: {
      versionCount(row) { refreshTick.value; return (row.versions || []).length || 1; },
      lineOf(row) { refreshTick.value; return bizStore.skillLines[row.id] || ""; },
      openDetail(row) { bridge.setSkillDetailId(row.id); bridge.setPage("Skill 详情"); },
      openCreate() {
        this.createForm = { name: "", bizLine: "" };
        this.createVisible = true;
      },
      async saveCreate() {
        const name = String(this.createForm.name || "").trim();
        if (!name) return ep.ElMessage.warning("请输入 Skill 名称");
        if (!this.createForm.bizLine) return ep.ElMessage.warning("请选择所属业务线");
        if ((state.skills || []).some(item => item.name === name)) return ep.ElMessage.warning("Skill 名称已存在");
        const title = name;
        const version = "v1.0";
        const id = `skill-${Date.now().toString(36)}`;
        const now = new Date().toLocaleString("zh-CN", { hour12: false }).replaceAll("/", "-");
        const maxSort = (state.skills || []).reduce((max, item) => Math.max(max, Number(item.sort) || 0), 0);
        const skill = {
          id, name, source: id, local: true, version, grayUsers: [],
          icon: "✦", title, displayDesc: "", sort: maxSort + 10, scenarioKey: id,
          enabled: true, desc: "", scenarios: "", tables: [],
          clarification: { enabled: false, question: "", options: [] }, assetScope: "", responseContract: [],
          prompt: "",
          versions: [{ version, time: now, operator: this.currentUser?.name || "曾祥竞", note: "新建 Skill", current: true, status: "已发布", grayUsers: [] }],
          stats: { calls: 0, successRate: "—", avgLatency: "—", tokens: "—" }
        };
        state.skills.unshift(skill);
        bizStore.skillLines[id] = this.createForm.bizLine;
        try {
          await fetch(`${analysisGatewayBase}/v1/skills/${encodeURIComponent(id)}/config`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ icon: skill.icon, title: skill.title, displayDesc: skill.displayDesc, sort: skill.sort, enabled: skill.enabled, scenarioKey: skill.scenarioKey, tables: [] }) });
        } catch (error) { /* 网关未启动时仅保存在原型状态 */ }
        this.createVisible = false;
        this.openDetail(skill);
        notify("已创建，请在详情页补全配置");
      },
      async loadGatewaySkills() {
        try {
          const response = await fetch(`${analysisGatewayBase}/v1/skills`);
          if (!response.ok) return;
          const list = await response.json();
          if (Array.isArray(list) && list.length) {
            const locals=(state.skills||[]).filter(item=>item.local&&!list.some(entry=>entry.id===item.id));
            state.skills = [...list.map(entry => ({ ...entry, versions: entry.versions || [], stats: entry.stats || { calls: 0, successRate: "—", avgLatency: "—", tokens: "—" } })), ...locals];
          }
        } catch (error) { /* 网关未启动时保留内置注册表 */ }
      },
      async toggleEnabled(row) {
        const enabled = row.enabled !== false;
        try { await fetch(`${analysisGatewayBase}/v1/skills/${encodeURIComponent(row.id)}/config`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) }); } catch (error) { /* 网关未连接时保留原型状态 */ }
        notify(`「${row.name}」已${enabled ? "上线，灵犀智析恢复展示" : "下线，灵犀智析立即隐藏"}`);
      },
      skillStatus(row) {
        const current = (row.versions || []).find(item => item.current);
        if (!current) return row.grayUsers?.length ? "灰度中" : "已发布";
        return current.status || "已发布";
      }
    },
    mounted() {
      this.pageHandler = event => {
        if (event.detail?.page !== "Skill 配置") return;
        this.loadGatewaySkills();
        // 从「业务线」页点 Skill 数跳过来时，按该业务线筛选
        this.lineFilter = bizStore.focusSkillLine || "";
        bizStore.focusSkillLine = "";
      };
      window.addEventListener("portal:page-change", this.pageHandler);
      if (bridge.getPage() === "Skill 配置") this.loadGatewaySkills();
    },
    beforeUnmount() {
      window.removeEventListener("portal:page-change", this.pageHandler);
    }
  };
  mount("#skillManagementView", SkillManagementApp, "skill-management");
})();
