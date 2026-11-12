/**
 * 页面：skill-detail
 * 依赖 core.js（window.PortalVue）。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    analysisGatewayBase,
    bridge,
    ep,
    gatewayTableNames,
    isImageIconValue,
    loginUser,
    mount,
    notify,
    refreshTick,
    state
  } = window.PortalVue;

  function injectStyle(id, css) {
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
  }

  function joinKeywords(list) {
    return (list || []).join("、");
  }

  function splitKeywords(text) {
    return String(text || "").split(/[、,，]/).map(item => item.trim()).filter(Boolean);
  }

  const SkillDetailApp = {
    template: `
      <el-config-provider :locale="locale">
        <div>
          <el-page-header class="portal-vue-form-header" title="返回 Skill 管理" :content="headerTitle" @back="back"></el-page-header>
          <div v-if="!skill" style="padding:60px 20px"><el-empty description="请先从「Skill 配置」选择一个 Skill 进入详情" /></div>
          <template v-else>
            <el-tabs v-model="tab" class="ops-center-tabs op-full-line" style="margin-top:8px" :before-leave="beforeLeave">
              <el-tab-pane label="基本信息" name="basic">
                <el-form class="portal-vue-dialog-form" label-position="top" style="max-width:760px">
                  <el-form-item label="Skill 名称" required><el-input v-model="draft.name" :disabled="!editable" placeholder="如：人群包效果分析 Skill"></el-input></el-form-item>
                  <el-form-item label="工作台展示标题" required><el-input v-model="draft.title" :disabled="!editable" placeholder="如：数据查询与指标解答"></el-input></el-form-item>
                  <el-form-item label="图标">
                    <div class="portal-vue-skill-icon-upload" :class="{ 'is-disabled': !editable }" @click="editable && openIconPicker()">
                      <span class="portal-vue-skill-icon-preview"><img v-if="isImageIcon(draft.icon)" :src="draft.icon" alt="图标" /><span v-else>{{ draft.icon || "✦" }}</span></span>
                      <span class="portal-vue-skill-icon-tips"><strong>{{ editable ? "点击上传图标" : "当前图标" }}</strong><small>支持 png / jpg / gif / svg，不超过 300KB</small></span>
                    </div>
                    <input ref="iconInput" type="file" accept="image/*" style="display:none" @change="onIconUpload"></input>
                  </el-form-item>
                  <el-form-item label="描述"><el-input v-model="draft.desc" type="textarea" :rows="2" resize="none" :disabled="!editable" placeholder="列表里展示的一句话说明"></el-input></el-form-item>
                  <el-form-item label="工作台展示描述"><el-input v-model="draft.displayDesc" :disabled="!editable" placeholder="如：趋势、分布与异常"></el-input></el-form-item>
                  <el-form-item label="排序（越小越靠前）"><el-input-number v-model="draft.sort" :min="1" :max="999" :disabled="!editable"></el-input-number></el-form-item>
                  <el-form-item label="上线状态"><el-switch :disabled="!editable" v-model="draft.enabled" inline-prompt active-text="上线" inactive-text="下线" active-color="#16a34a"></el-switch><span class="portal-vue-muted" style="margin-left:10px;font-size:12px">保存后先存为「未发布」，到「版本管理」灰度或发版</span></el-form-item>
                </el-form>
              </el-tab-pane>
              <el-tab-pane label="提示词" name="prompt">
                <el-form v-if="isRouter" class="portal-vue-dialog-form" label-position="top">
                  <el-form-item label="自动路由规则">
                    <div class="portal-vue-route-editor">
                      <p class="portal-vue-muted" style="margin:0 0 10px;font-size:12px">问题命中某条规则的关键词时，转交给对应技能；命中最多者优先，都未命中则使用兜底技能。只会选择对当前用户可用（已上线、在灰度范围内）的技能。</p>
                      <div v-for="(route,index) in draft.routes" :key="index" class="portal-vue-route-row">
                        <el-select v-model="route.skillId" placeholder="选择技能" style="width:200px" :disabled="!editable"><el-option v-for="item in routeOptions" :key="item.id" :label="item.name" :value="item.id"></el-option></el-select>
                        <el-input v-model="route.keywords" :disabled="!editable" placeholder="命中关键词，用顿号分隔，如 血缘、上游、下游"></el-input>
                        <el-button v-if="editable" link type="danger" @click="draft.routes.splice(index,1)">删除</el-button>
                      </div>
                      <el-button v-if="editable" @click="draft.routes.push({skillId:'',keywords:''})">＋ 新增规则</el-button>
                    </div>
                  </el-form-item>
                  <el-form-item label="兜底技能（未命中关键词时使用）"><el-select v-model="draft.fallbackSkillId" placeholder="选择兜底技能" style="width:260px" :disabled="!editable"><el-option v-for="item in routeOptions" :key="item.id" :label="item.name" :value="item.id"></el-option></el-select></el-form-item>
                </el-form>
                <el-form v-else class="portal-vue-dialog-form" label-position="top">
                  <el-form-item label="提示词"><el-input v-model="draft.prompt" type="textarea" resize="none" class="portal-vue-skill-prompt-input" :disabled="!editable" placeholder="该 Skill 的分析指令"></el-input></el-form-item>
                </el-form>
              </el-tab-pane>
              <el-tab-pane label="引用的表" name="tables">
                <el-form class="portal-vue-dialog-form" label-position="top" style="max-width:760px">
                  <el-form-item label="引用的表">
                    <el-select v-model="tableDraft" multiple filterable clearable :disabled="!editable" placeholder="从已有数据表中选择" style="width:100%">
                      <el-option v-for="name in tableOptions" :key="name" :label="name" :value="name">
                        <span>{{ name }}</span>
                        <el-tag v-if="isInvalidTable(name)" size="small" type="danger" style="margin-left:8px">失效</el-tag>
                      </el-option>
                    </el-select>
                    <p class="portal-vue-muted" style="margin:8px 0 0;font-size:12px">{{ tableDraft.length ? "已失效的表请先移除再保存。保存后分析默认范围即时生效，不会生成新版本。" : "不预置默认表。未选择时，分析不会预置默认表。" }}</p>
                  </el-form-item>
                </el-form>
                <div v-if="editable" class="portal-vue-actions" style="padding:8px 0 16px"><el-button type="primary" @click="saveTables">保存引用的表</el-button></div>
              </el-tab-pane>
              <el-tab-pane label="版本管理" name="versions">
                <p class="portal-vue-muted" style="padding:24px 0">新版本保存后先为「未发布」，可在此灰度、发版、查看快照或回滚。</p>
              </el-tab-pane>
            </el-tabs>
            <div v-if="(tab==='basic' || tab==='prompt') && editable" class="portal-vue-skill-detail-footer">
              <el-form class="portal-vue-dialog-form" label-position="top" style="flex:1;min-width:0;display:flex;gap:16px;flex-wrap:wrap;margin:0">
                <el-form-item label="版本号" required style="width:160px;margin-bottom:0"><el-input v-model="draft.version" placeholder="如：v1.4"></el-input></el-form-item>
                <el-form-item label="版本内容说明" style="flex:1;min-width:220px;margin-bottom:0"><el-input v-model="draft.versionNote" placeholder="如：新增自动澄清、修复口径问题（可空）"></el-input></el-form-item>
              </el-form>
              <div class="portal-vue-actions" style="flex:none"><el-button @click="cancelDraft">取消</el-button><el-button type="primary" @click="saveVersion">保存</el-button></div>
            </div>
          </template>
        </div>
      </el-config-provider>
    `,
    setup() {
      return { locale: ep.zhCn };
    },
    data() {
      return { skillId: "", tab: "basic", draft: this.blankDraft(), tableDraft: [] };
    },
    computed: {
      skill() { refreshTick.value; return (state.skills || []).find(item => item.id === this.skillId) || null; },
      headerTitle() { return this.skill?.name || "Skill 详情"; },
      editable() { return this.canEdit('Skill 配置'); },
      isRouter() { return this.skill?.kind === "router"; },
      routeOptions() {
        refreshTick.value;
        return (state.skills || []).filter(item => item.kind !== "router" && item.id !== "numa-warehouse").map(item => ({ id: item.id, name: item.title || item.name }));
      },
      currentUser() { refreshTick.value; return loginUser() || state.users[0]; },
      knownTables() {
        refreshTick.value;
        const names = (state.assets || []).map(item => item.cnName).filter(Boolean);
        const gateway = gatewayTableNames?.() || [];
        (gateway || []).forEach(name => { if (name && !names.includes(name)) names.push(name); });
        return names;
      },
      tableOptions() {
        const names = [...this.knownTables];
        (this.tableDraft || []).forEach(name => { if (name && !names.includes(name)) names.push(name); });
        return names;
      },
      dirty() {
        if (!this.skill) return false;
        return JSON.stringify(this.currentSnapshot()) !== JSON.stringify(this.draftSnapshot(this.draft))
          || String(this.draft.versionNote || "") !== ""
          || String(this.draft.version || "") !== this.nextVersion();
      }
    },
    methods: {
      blankDraft() {
        return { name: "", icon: "✦", title: "", desc: "", displayDesc: "", sort: 50, enabled: true, prompt: "", routes: [], fallbackSkillId: "", versionNote: "", version: "v1.1" };
      },
      isImageIcon(icon) { return isImageIconValue(icon); },
      openIconPicker() { this.$refs.iconInput?.click(); },
      onIconUpload(event) { this.applyIcon(event, this.draft); },
      applyIcon(event, target) {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        if (!/^image\/(png|jpe?g|gif|svg\+xml|webp)$/i.test(file.type)) return ep.ElMessage.warning("请选择图片文件");
        if (file.size > 300 * 1024) return ep.ElMessage.warning("图片不能超过 300KB");
        const reader = new FileReader();
        reader.onload = () => { target.icon = String(reader.result || "").slice(0, 200000); ep.ElMessage.success("图标已上传，保存后生效"); };
        reader.readAsDataURL(file);
      },
      nextVersion() {
        const current = String(this.skill?.version || "v1.0");
        const match = current.match(/^v(\d+)\.(\d+)/);
        return match ? `v${match[1]}.${Number(match[2]) + 1}` : "v1.1";
      },
      currentSnapshot() {
        const skill = this.skill;
        if (!skill) return this.draftSnapshot(this.blankDraft());
        return this.draftSnapshot({
          name: skill.name || "",
          icon: skill.icon || "✦",
          title: skill.title || "",
          desc: skill.desc || "",
          displayDesc: skill.displayDesc || "",
          sort: skill.sort || 50,
          enabled: skill.enabled !== false,
          prompt: skill.prompt || "",
          routes: (skill.routes || []).map(route => ({ skillId: route.skillId, keywords: joinKeywords(route.keywords) })),
          fallbackSkillId: skill.fallbackSkillId || ""
        });
      },
      draftSnapshot(draft) {
        return {
          name: String(draft.name || "").trim(),
          icon: draft.icon || "✦",
          title: String(draft.title || "").trim(),
          desc: String(draft.desc || "").trim(),
          displayDesc: String(draft.displayDesc || "").trim(),
          sort: Number(draft.sort) || 50,
          enabled: draft.enabled !== false,
          prompt: draft.prompt || "",
          routes: (draft.routes || []).map(route => ({ skillId: route.skillId || "", keywords: String(route.keywords || "").trim() })),
          fallbackSkillId: draft.fallbackSkillId || ""
        };
      },
      parsedRoutes() {
        return (this.draft.routes || []).map(route => ({ skillId: route.skillId, keywords: splitKeywords(route.keywords) })).filter(route => route.skillId);
      },
      isInvalidTable(name) { return !!name && !this.knownTables.includes(name); },
      async refreshSkillFromGateway() {
        if (!this.skillId) return;
        try {
          const response = await fetch(`${analysisGatewayBase}/v1/skills`);
          if (!response.ok) return;
          const list = await response.json();
          const remote = Array.isArray(list) ? list.find(item => item.id === this.skillId) : null;
          if (!remote) return;
          const skill = (state.skills || []).find(item => item.id === this.skillId);
          if (!skill) return;
          ["icon", "title", "desc", "displayDesc", "sort", "enabled", "prompt", "fallbackSkillId", "name"].forEach(key => {
            if (remote[key] !== undefined) skill[key] = remote[key];
          });
          if (Array.isArray(remote.routes)) skill.routes = remote.routes;
          if (Array.isArray(remote.tables)) skill.tables = remote.tables;
        } catch (error) { /* 网关未连接时保留原型状态 */ }
      },
      async loadSkill() {
        this.skillId = bridge.getSkillDetailId?.() || "";
        await this.refreshSkillFromGateway();
        const skill = (state.skills || []).find(item => item.id === this.skillId) || null;
        if (!skill) {
          this.draft = this.blankDraft();
          this.tableDraft = [];
          this.tab = "basic";
          return;
        }
        this.tableDraft = [...(skill.tables || [])];
        this.draft = {
          name: skill.name || "",
          icon: skill.icon || "✦",
          title: skill.title || "",
          desc: skill.desc || "",
          displayDesc: skill.displayDesc || "",
          sort: skill.sort || 50,
          enabled: skill.enabled !== false,
          prompt: skill.prompt || "",
          routes: (skill.routes || []).map(route => ({ skillId: route.skillId, keywords: joinKeywords(route.keywords) })),
          fallbackSkillId: skill.fallbackSkillId || "",
          versionNote: "",
          version: this.nextVersion()
        };
      },
      cancelDraft() { this.loadSkill(); },
      async confirmLeave() {
        if (!this.dirty || !this.editable) return true;
        try {
          await ep.ElMessageBox.confirm("有未保存的修改，确定离开？", "未保存的修改", { type: "warning", confirmButtonText: "离开", cancelButtonText: "取消" });
          return true;
        } catch (error) {
          return false;
        }
      },
      async beforeLeave(newName, oldName) {
        const editing = oldName === "basic" || oldName === "prompt";
        const leaving = newName === "tables" || newName === "versions";
        if (editing && leaving && !(await this.confirmLeave())) return false;
        return true;
      },
      async back() {
        if (!(await this.confirmLeave())) return;
        bridge.setPage("Skill 配置");
      },
      async saveVersion() {
        const form = this.draft;
        const skill = this.skill;
        if (!skill) return;
        const name = String(form.name || "").trim();
        const title = String(form.title || "").trim();
        if (!name) return ep.ElMessage.warning("请输入 Skill 名称");
        if (!title) return ep.ElMessage.warning("请输入工作台展示标题");
        if ((state.skills || []).some(item => item.id !== skill.id && item.name === name)) return ep.ElMessage.warning("Skill 名称已存在");
        const note = String(form.versionNote || "").trim() || "更新配置";
        const routing = skill.kind === "router";
        const routes = routing ? this.parsedRoutes() : undefined;
        const snapshot = {
          icon: form.icon || "✦",
          title,
          desc: String(form.desc || "").trim(),
          displayDesc: String(form.displayDesc || "").trim(),
          sort: form.sort,
          enabled: form.enabled,
          prompt: form.prompt,
          ...(routing ? { routes, fallbackSkillId: form.fallbackSkillId } : {})
        };
        Object.assign(skill, snapshot, { name });
        const version = String(form.version || "").trim() || this.nextVersion();
        skill.versions = (skill.versions || []).map(item => ({ ...item, current: false }));
        skill.versions.unshift({
          version,
          time: new Date().toLocaleString("zh-CN", { hour12: false }).replaceAll("/", "-"),
          operator: this.currentUser?.name || "曾祥竞",
          note,
          current: true,
          status: "未发布",
          grayUsers: [],
          snapshot
        });
        skill.version = version;
        try {
          await fetch(`${analysisGatewayBase}/v1/skills/${encodeURIComponent(skill.id)}/config`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              icon: snapshot.icon,
              title: snapshot.title,
              desc: snapshot.desc,
              displayDesc: snapshot.displayDesc,
              sort: snapshot.sort,
              enabled: snapshot.enabled,
              prompt: snapshot.prompt,
              ...(routing ? { routes, fallbackSkillId: snapshot.fallbackSkillId } : {}),
              latestVersion: { version, note, status: "未发布", grayUsers: [] }
            })
          });
        } catch (error) { /* 网关未连接时保留原型状态 */ }
        notify(`「${skill.name}」已保存为 ${version}（未发布，可到「版本管理」灰度 / 发版）`);
        this.loadSkill();
      },
      async saveTables() {
        const skill = this.skill;
        if (!skill) return;
        if ((this.tableDraft || []).some(name => this.isInvalidTable(name))) return ep.ElMessage.warning("请先移除已失效的表");
        skill.tables = [...(this.tableDraft || [])];
        try {
          const response = await fetch(`${analysisGatewayBase}/v1/skills/${encodeURIComponent(skill.id)}/config`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tables: skill.tables })
          });
          if (!response.ok) throw new Error(String(response.status));
          notify("引用的表已更新，分析默认范围即时生效");
        } catch (error) {
          ep.ElMessage.warning("引用的表已在本页更新，但没有写到服务端");
        }
      }
    },
    mounted() {
      injectStyle("portal-vue-skill-detail-style", [
        ".portal-vue-skill-prompt-input textarea { min-height: calc(100vh - 280px); }",
        ".portal-vue-skill-detail-footer { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; padding:16px 0 8px; border-top:1px solid #e9edf4; margin-top:12px; }",
        ".portal-vue-skill-icon-upload.is-disabled { cursor:default; opacity:0.85; }"
      ].join(""));
      this.pageHandler = event => { if (event.detail?.page === "Skill 详情") this.loadSkill(); };
      window.addEventListener("portal:page-change", this.pageHandler);
      if (bridge.getPage() === "Skill 详情") this.loadSkill();
    },
    beforeUnmount() {
      window.removeEventListener("portal:page-change", this.pageHandler);
    }
  };

  mount("#skillDetailView", SkillDetailApp, "skill-detail");
})();
