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
    resolveSkillIcon,
    loginUser,
    mount,
    notify,
    refreshTick,
    state
  } = window.PortalVue;
  const { bizStore, bizHelpers } = window.PortalVue;

  (() => {
    if (document.getElementById("sk-sort-style")) return;
    const el = document.createElement("style");
    el.id = "sk-sort-style";
    el.textContent = `
      .sk-sort-list{list-style:none;margin:0;padding:0;border:1px solid var(--el-border-color-lighter,#ebeef5);border-radius:8px;max-height:56vh;overflow:auto}
      .sk-sort-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--el-border-color-extra-light,#f2f3f5);background:#fff;position:relative}
      .sk-sort-item:last-child{border-bottom:0}
      .sk-sort-item.dragging{opacity:.45}
      .sk-sort-item.drop-before::before,.sk-sort-item.drop-after::after{content:"";position:absolute;left:0;right:0;height:2px;background:var(--el-color-primary,#2563eb)}
      .sk-sort-item.drop-before::before{top:-1px}.sk-sort-item.drop-after::after{bottom:-1px}
      .sk-sort-handle{cursor:grab;color:#9aa1ad;display:inline-flex;padding:4px;border-radius:4px;flex:none}
      .sk-sort-handle:hover,.sk-sort-handle:focus-visible{color:var(--el-color-primary,#2563eb);background:#f0f4ff;outline:none}
      .sk-sort-no{width:22px;color:#9aa1ad;font-variant-numeric:tabular-nums;text-align:right;flex:none}
      .sk-sort-name{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.4}
      .sk-sort-name small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    `;
    document.head.appendChild(el);
  })();

  const SkillManagementApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <div class="portal-vue-toolbar">
            <div class="portal-vue-toolbar-left"><el-input v-model="keyword" class="portal-vue-search" clearable placeholder="搜索 Skill 名称"></el-input><el-select v-model="lineFilter" class="portal-vue-filter" clearable placeholder="全部业务线"><el-option label="全部业务线" value=""></el-option><el-option v-for="line in allLines" :key="line" :label="line" :value="line"></el-option><el-option label="未绑定业务线" value="__none"></el-option></el-select></div>
            <div class="portal-vue-actions" style="flex:none"><el-button v-if="canEdit('Skill 配置')" @click="openSort">调整排序</el-button><el-button v-if="canEdit('Skill 配置')" type="primary" @click="openCreate">＋ 新增 Skill</el-button></div>
          </div>
          <el-table :data="filteredRows" class="portal-vue-table" border empty-text="暂无 Skill">
            <el-table-column label="Skill" min-width="280"><template #default="scope"><div><span class="portal-vue-name" style="cursor:pointer" @click="openDetail(scope.row)">{{ scope.row.name }}</span><div class="portal-vue-muted" style="margin-top:2px">{{ scope.row.desc }}</div></div></template></el-table-column>
            <el-table-column label="工作台展示" min-width="280"><template #default="scope"><div v-if="scope.row.enabled!==false" style="display:flex;align-items:center;gap:8px"><span class="portal-vue-skill-cell-icon"><img v-if="isImageIcon(scope.row.icon)" :src="resolveIcon(scope.row.icon)" alt="" /><span v-else>{{ scope.row.icon }}</span></span><div><span style="font-size:13px">{{ scope.row.title }}</span><div class="portal-vue-muted" style="font-size:12px">{{ scope.row.displayDesc }}</div></div><el-tag size="small" effect="plain" style="margin-left:4px">排序 {{ scope.row.sort }}</el-tag></div><span v-else class="portal-vue-muted">已下线</span></template></el-table-column>
            <el-table-column label="业务线" width="170"><template #default="scope"><el-tooltip v-if="lineOf(scope.row) === ALL" content="通用 Skill：所有业务线都可使用" placement="top"><el-tag size="small" effect="light">全部（通用）</el-tag></el-tooltip><el-tag v-else-if="lineOf(scope.row)" size="small" effect="plain">{{ lineOf(scope.row) }}</el-tag><el-tooltip v-else content="还没有绑定业务线，请进入详情「基本信息」设置" placement="top"><el-tag size="small" type="warning" effect="plain">未绑定</el-tag></el-tooltip></template></el-table-column>
            <el-table-column prop="version" label="当前版本" width="120"></el-table-column>
            <el-table-column label="历史版本" width="100" align="center"><template #default="scope"><el-tooltip content="含当前版本；最近 3 个版本不能删除，方便回滚" placement="top"><span>{{ versionCount(scope.row) }} 个</span></el-tooltip></template></el-table-column>
            <el-table-column label="状态" width="150"><template #default="scope"><div style="display:flex;align-items:center;gap:6px"><el-switch :disabled="!canEdit('Skill 配置')" v-model="scope.row.enabled" inline-prompt active-text="上线" inactive-text="下线" active-color="#16a34a" @change="toggleEnabled(scope.row)"></el-switch><el-tag v-if="scope.row.enabled!==false && skillStatus(scope.row)!=='已发布'" size="small" :type="skillStatus(scope.row)==='未发布' ? 'info' : 'warning'" effect="light">{{ skillStatus(scope.row) }}</el-tag></div></template></el-table-column>
            <el-table-column label="灰度用户" min-width="170"><template #default="scope"><div v-if="scope.row.grayUsers.length" style="display:flex;flex-wrap:wrap;gap:4px"><el-tag v-for="user in scope.row.grayUsers.slice(0,3)" :key="user" size="small" effect="plain">{{ user }}</el-tag><span v-if="scope.row.grayUsers.length>3" class="portal-vue-muted">+{{ scope.row.grayUsers.length-3 }}</span></div><span v-else class="portal-vue-muted">全量发布</span></template></el-table-column>
            <el-table-column label="调用次数" width="100" align="right"><template #default="scope">{{ scope.row.stats.calls }}</template></el-table-column>
            <el-table-column label="操作" width="88" fixed="right"><template #default="scope"><div class="portal-vue-actions"><el-button link type="primary" @click="openDetail(scope.row)">详情</el-button></div></template></el-table-column>
          </el-table>
          <div class="portal-vue-muted" style="margin-top:12px">配置请进入详情页；新版本在详情的「提示词」里保存为未发布，灰度或发布后才上线。</div>
        </section>
        <el-dialog v-model="sortVisible" title="调整 Skill 排序" width="560px" destroy-on-close :close-on-click-modal="true">
          <div class="portal-vue-muted" style="margin:-4px 0 12px;line-height:1.7">拖动左侧手柄调整顺序（也可聚焦手柄后按 ↑ ↓）。越靠前，在灵犀智析工作台里排得越靠前；保存后列表同步按此顺序展示。</div>
          <ul class="sk-sort-list">
            <li v-for="(item, index) in sortList" :key="item.id" class="sk-sort-item" :class="{ dragging: dragId === item.id, 'drop-before': overId === item.id && overPos === 'before', 'drop-after': overId === item.id && overPos === 'after' }" @dragover="onSortOver($event, item)" @drop="onSortDrop($event, item)">
              <span class="sk-sort-handle" draggable="true" tabindex="0" role="button" title="拖动排序" aria-label="拖动排序" @dragstart="onSortStart($event, item)" @dragend="clearSortDrag" @keydown.up.prevent="nudge(index, -1)" @keydown.down.prevent="nudge(index, 1)">
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><g fill="currentColor"><circle cx="5.5" cy="3.5" r="1.3"/><circle cx="10.5" cy="3.5" r="1.3"/><circle cx="5.5" cy="8" r="1.3"/><circle cx="10.5" cy="8" r="1.3"/><circle cx="5.5" cy="12.5" r="1.3"/><circle cx="10.5" cy="12.5" r="1.3"/></g></svg>
              </span>
              <span class="sk-sort-no">{{ index + 1 }}</span>
              <span class="portal-vue-skill-cell-icon"><img v-if="isImageIcon(item.icon)" :src="resolveIcon(item.icon)" alt="" /><span v-else>{{ item.icon || "✦" }}</span></span>
              <span class="sk-sort-name"><strong>{{ item.title || item.name }}</strong><small class="portal-vue-muted">{{ item.name }}</small></span>
              <el-tag v-if="item.enabled === false" size="small" type="info" effect="plain">已下线</el-tag>
              <el-tag v-if="lineOf(item)" size="small" effect="plain">{{ lineOf(item) === ALL ? '全部（通用）' : lineOf(item) }}</el-tag>
            </li>
          </ul>
          <template #footer><el-button @click="sortVisible=false">取消</el-button><el-button type="primary" :disabled="!sortChanged" @click="saveSort">保存排序</el-button></template>
        </el-dialog>
        <el-dialog v-model="createVisible" title="新增 Skill" width="480px" destroy-on-close :close-on-click-modal="true">
          <el-form class="portal-vue-dialog-form" label-position="top">
            <el-form-item label="Skill 名称" required><el-input v-model="createForm.name" placeholder="如：人群包效果分析 Skill"></el-input></el-form-item>
            <el-form-item label="所属业务线" required><el-select v-model="createForm.bizLine" placeholder="选择该 Skill 所属的业务线"><el-option label="全部（通用 Skill）" :value="ALL"></el-option><el-option v-for="line in enabledLines" :key="line" :label="line" :value="line"></el-option></el-select><div class="portal-vue-muted" style="margin-top:6px">只属于某个业务线就选该业务线；所有业务线通用的 Skill 选「全部」。业务线在「系统管理 → 业务线」维护</div></el-form-item>
          </el-form>
          <template #footer>
            <div style="display:flex;justify-content:flex-end;gap:10px"><el-button @click="createVisible=false">取消</el-button><el-button v-if="canEdit('Skill 配置')" type="primary" @click="saveCreate">新增 Skill</el-button></div>
          </template>
        </el-dialog>
      </el-config-provider>
    `,
    data: () => ({ keyword: "", lineFilter: "", createVisible: false, createForm: { name: "", bizLine: "" }, ALL: bizHelpers.SKILL_ALL, sortVisible: false, sortList: [], sortOrigin: [], dragId: "", overId: "", overPos: "" }),
    computed: {
      skills() { refreshTick.value; return (state.skills || []).filter(item => item.id !== "numa-warehouse"); },
      allLines() { refreshTick.value; return bizStore.lines.map(line => line.name); },
      enabledLines() { refreshTick.value; return bizHelpers.activeLines(); },
      sortedSkills() { return [...this.skills].sort((a, b) => (Number(a.sort) || 999) - (Number(b.sort) || 999)); },
      sortChanged() { return this.sortList.some((item, index) => item.id !== this.sortOrigin[index]); },
      filteredRows() { const keyword = this.keyword.trim().toLowerCase(); return this.sortedSkills.filter(item => (!this.lineFilter || (this.lineFilter === "__none" ? !this.lineOf(item) : [this.lineFilter, bizHelpers.SKILL_ALL].includes(this.lineOf(item)))) && (!keyword || `${item.name} ${item.title || ""} ${item.desc || ""}`.toLowerCase().includes(keyword))); },
      currentUser() { refreshTick.value; return loginUser() || state.users[0]; }
    },
    methods: {
      versionCount(row) { refreshTick.value; return (row.versions || []).length || 1; },
      lineOf(row) { refreshTick.value; return bizStore.skillLines[row.id] || ""; },
      /* ---- 调整排序：弹窗里拖动，保存时按顺序写成 10、20、30…（留出间隔，方便以后插入）---- */
      openSort() { this.sortList = [...this.sortedSkills]; this.sortOrigin = this.sortList.map(item => item.id); this.clearSortDrag(); this.sortVisible = true; },
      clearSortDrag() { this.dragId = ""; this.overId = ""; this.overPos = ""; },
      onSortStart(event, item) {
        this.dragId = item.id;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", item.id);
        const row = event.currentTarget.closest("li");
        if (row && event.dataTransfer.setDragImage) event.dataTransfer.setDragImage(row, 16, 16);
      },
      onSortOver(event, item) {
        if (!this.dragId) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const rect = event.currentTarget.getBoundingClientRect();
        this.overPos = event.clientY >= rect.top + rect.height / 2 ? "after" : "before";
        this.overId = item.id;
      },
      onSortDrop(event, item) {
        if (!this.dragId) return;
        event.preventDefault();
        const from = this.dragId; const pos = this.overPos || "after";
        this.clearSortDrag();
        this.moveSort(from, item.id, pos);
      },
      moveSort(fromId, toId, pos) {
        if (fromId === toId) return;
        const moving = this.sortList.find(item => item.id === fromId);
        const rest = this.sortList.filter(item => item.id !== fromId);
        const at = rest.findIndex(item => item.id === toId);
        if (!moving || at < 0) return;
        rest.splice(pos === "before" ? at : at + 1, 0, moving);
        this.sortList = rest;
      },
      nudge(index, step) {
        const target = this.sortList[index + step];
        if (target) this.moveSort(this.sortList[index].id, target.id, step < 0 ? "before" : "after");
      },
      async saveSort() {
        const changed = [];
        this.sortList.forEach((item, index) => {
          const sort = (index + 1) * 10;
          if (Number(item.sort) !== sort) { item.sort = sort; changed.push(item); }
        });
        // 网关未启动时仅保存在原型状态
        await Promise.all(changed.map(item => fetch(`${analysisGatewayBase}/v1/skills/${encodeURIComponent(item.id)}/config`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sort: item.sort }) }).catch(() => null)));
        this.sortVisible = false;
        notify("Skill 排序已保存，灵犀智析工作台按此顺序展示");
      },
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
      isImageIcon(icon) { return isImageIconValue(icon); },
      resolveIcon(icon) { return resolveSkillIcon(icon); },
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
