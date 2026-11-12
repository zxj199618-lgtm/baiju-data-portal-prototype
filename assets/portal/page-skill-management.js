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
    isImageIconValue,
    loginUser,
    mount,
    notify,
    refreshTick,
    state
  } = window.PortalVue;

  const SkillManagementApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <div class="portal-vue-toolbar">
            <div class="portal-vue-toolbar-left"><el-input v-model="keyword" class="portal-vue-search" clearable placeholder="搜索 Skill 名称"></el-input></div>
            <el-button v-if="canEdit('Skill 配置')" type="primary" @click="openCreate">＋ 新增 Skill</el-button>
          </div>
          <el-table :data="filteredRows" class="portal-vue-table" border empty-text="暂无 Skill">
            <el-table-column label="Skill" min-width="280"><template #default="scope"><div><span class="portal-vue-name" style="cursor:pointer" @click="openDetail(scope.row)">{{ scope.row.name }}</span><div class="portal-vue-muted" style="margin-top:2px">{{ scope.row.desc }}</div></div></template></el-table-column>
            <el-table-column label="工作台展示" min-width="280"><template #default="scope"><div v-if="scope.row.enabled!==false" style="display:flex;align-items:center;gap:8px"><span class="portal-vue-skill-cell-icon"><img v-if="isImageIcon(scope.row.icon)" :src="scope.row.icon" alt="" /><span v-else>{{ scope.row.icon }}</span></span><div><span style="font-size:13px">{{ scope.row.title }}</span><div class="portal-vue-muted" style="font-size:12px">{{ scope.row.displayDesc }}</div></div><el-tag size="small" effect="plain" style="margin-left:4px">排序 {{ scope.row.sort }}</el-tag></div><span v-else class="portal-vue-muted">已下线</span></template></el-table-column>
            <el-table-column prop="version" label="当前版本" width="120"></el-table-column>
            <el-table-column label="状态" width="150"><template #default="scope"><div style="display:flex;align-items:center;gap:6px"><el-switch :disabled="!canEdit('Skill 配置')" v-model="scope.row.enabled" inline-prompt active-text="上线" inactive-text="下线" active-color="#16a34a" @change="toggleEnabled(scope.row)"></el-switch><el-tag v-if="scope.row.enabled!==false && skillStatus(scope.row)!=='已发布'" size="small" :type="skillStatus(scope.row)==='未发布' ? 'info' : 'warning'" effect="light">{{ skillStatus(scope.row) }}</el-tag></div></template></el-table-column>
            <el-table-column label="灰度用户" min-width="170"><template #default="scope"><div v-if="scope.row.grayUsers.length" style="display:flex;flex-wrap:wrap;gap:4px"><el-tag v-for="user in scope.row.grayUsers.slice(0,3)" :key="user" size="small" effect="plain">{{ user }}</el-tag><span v-if="scope.row.grayUsers.length>3" class="portal-vue-muted">+{{ scope.row.grayUsers.length-3 }}</span></div><span v-else class="portal-vue-muted">全量发布</span></template></el-table-column>
            <el-table-column label="调用次数" width="100" align="right"><template #default="scope">{{ scope.row.stats.calls }}</template></el-table-column>
            <el-table-column label="操作" width="88" fixed="right"><template #default="scope"><div class="portal-vue-actions"><el-button link type="primary" @click="openDetail(scope.row)">详情</el-button></div></template></el-table-column>
          </el-table>
          <div class="portal-vue-muted" style="margin-top:12px">配置请进入详情页；新版本先存为未发布，在详情的「版本管理」里灰度或发版。</div>
        </section>
        <el-dialog v-model="createVisible" title="新增 Skill" width="480px" destroy-on-close :close-on-click-modal="true">
          <el-form class="portal-vue-dialog-form" label-position="top">
            <el-form-item label="Skill 名称" required><el-input v-model="createForm.name" placeholder="如：人群包效果分析 Skill"></el-input></el-form-item>
          </el-form>
          <template #footer>
            <div style="display:flex;justify-content:flex-end;gap:10px"><el-button @click="createVisible=false">取消</el-button><el-button v-if="canEdit('Skill 配置')" type="primary" @click="saveCreate">新增 Skill</el-button></div>
          </template>
        </el-dialog>
      </el-config-provider>
    `,
    data: () => ({ keyword: "", createVisible: false, createForm: { name: "" } }),
    computed: {
      skills() { refreshTick.value; return (state.skills || []).filter(item => item.id !== "numa-warehouse"); },
      filteredRows() { const keyword = this.keyword.trim().toLowerCase(); return this.skills.filter(item => !keyword || `${item.name} ${item.title || ""} ${item.desc || ""}`.toLowerCase().includes(keyword)); },
      currentUser() { refreshTick.value; return loginUser() || state.users[0]; }
    },
    methods: {
      openDetail(row) { bridge.setSkillDetailId(row.id); bridge.setPage("Skill 详情"); },
      openCreate() {
        this.createForm = { name: "" };
        this.createVisible = true;
      },
      async saveCreate() {
        const name = String(this.createForm.name || "").trim();
        if (!name) return ep.ElMessage.warning("请输入 Skill 名称");
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
      isImageIcon(icon) { return isImageIconValue(icon); },
      skillStatus(row) {
        const current = (row.versions || []).find(item => item.current);
        if (!current) return row.grayUsers?.length ? "灰度中" : "已发布";
        return current.status || "已发布";
      }
    },
    mounted() {
      this.pageHandler = event => { if (event.detail?.page === "Skill 配置") this.loadGatewaySkills(); };
      window.addEventListener("portal:page-change", this.pageHandler);
      if (bridge.getPage() === "Skill 配置") this.loadGatewaySkills();
    },
    beforeUnmount() {
      window.removeEventListener("portal:page-change", this.pageHandler);
    }
  };
  mount("#skillManagementView", SkillManagementApp, "skill-management");
})();
