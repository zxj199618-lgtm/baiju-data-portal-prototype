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
    resolveSkillIcon,
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
                      <span class="portal-vue-skill-icon-preview"><img v-if="isImageIcon(draft.icon)" :src="resolveIcon(draft.icon)" alt="图标" /><span v-else>{{ draft.icon || "✦" }}</span></span>
                      <span class="portal-vue-skill-icon-tips"><strong>{{ editable ? "点击上传图标" : "当前图标" }}</strong><small>支持 png / jpg / gif / svg，不超过 300KB</small></span>
                    </div>
                    <input ref="iconInput" type="file" accept="image/*" style="display:none" @change="onIconUpload"></input>
                  </el-form-item>
                  <el-form-item label="描述"><el-input v-model="draft.desc" type="textarea" :rows="2" resize="none" :disabled="!editable" placeholder="列表里展示的一句话说明"></el-input></el-form-item>
                  <el-form-item label="工作台展示描述"><el-input v-model="draft.displayDesc" :disabled="!editable" placeholder="如：趋势、分布与异常"></el-input></el-form-item>
                  <el-form-item label="排序（越小越靠前）"><el-input-number v-model="draft.sort" :min="1" :max="999" :disabled="!editable"></el-input-number></el-form-item>
                  <el-form-item label="上线状态"><el-switch :disabled="!editable" v-model="draft.enabled" inline-prompt active-text="上线" inactive-text="下线" active-color="#16a34a"></el-switch><span class="portal-vue-muted" style="margin-left:10px;font-size:12px">提示词需在「提示词」页签发布版本后才会更新</span></el-form-item>
                </el-form>
              </el-tab-pane>
              <el-tab-pane label="提示词" name="prompt">
                <div class="sk-pv">
                  <aside class="sk-pv-list">
                    <el-button v-if="editable" type="primary" class="sk-pv-new" @click="startNew">＋ 新增版本</el-button>
                    <div v-for="item in versions" :key="item.version" class="sk-pv-item" :class="{ active: selected === item.version && mode !== 'new' }" @click="selectVersion(item)">
                      <div class="sk-pv-item-head"><strong>{{ item.version }}</strong><el-tag size="small" effect="light" :type="statusType(item)">{{ statusLabel(item) }}</el-tag></div>
                      <p>{{ item.note || "—" }}</p>
                      <small>{{ item.time }} · {{ item.operator }}</small>
                    </div>
                    <div v-if="mode === 'new'" class="sk-pv-item active"><div class="sk-pv-item-head"><strong>{{ form.version || "新版本" }}</strong><el-tag size="small" effect="light" type="info">编辑中</el-tag></div><p>新增版本，保存后生成</p></div>
                    <p v-if="!versions.length && mode !== 'new'" class="portal-vue-muted" style="font-size:12px">暂无版本，点击「新增版本」输入提示词</p>
                  </aside>
                  <section class="sk-pv-main">
                    <template v-if="mode === 'view' && viewItem">
                      <div class="sk-pv-bar">
                        <div class="sk-pv-title"><strong>{{ viewItem.version }}</strong><el-tag size="small" effect="light" :type="statusType(viewItem)">{{ statusLabel(viewItem) }}</el-tag><span class="portal-vue-muted">{{ viewItem.time }} · 操作人 {{ viewItem.operator }}</span></div>
                        <div class="sk-pv-actions" v-if="editable">
                          <el-button size="small" @click="startEdit(viewItem)">{{ viewItem.current || viewItem.status === '已发布' ? '基于此版本修改' : '修改' }}</el-button>
                          <el-button v-if="canGray(viewItem)" size="small" @click="openGrayDraft(viewItem)">{{ viewItem.status === '灰度中' ? '调整灰度' : '灰度' }}</el-button>
                          <el-button v-if="!viewItem.current" size="small" type="primary" @click="publishVersion(viewItem)">{{ viewItem.status === '已发布' ? '回滚到此版本' : '发布' }}</el-button>
                        </div>
                      </div>
                      <p v-if="viewItem.note" class="portal-vue-muted" style="margin:0 0 8px;font-size:12px">版本说明：{{ viewItem.note }}</p>
                      <div v-if="viewItem.grayUsers?.length" class="sk-pv-gray"><span class="portal-vue-muted">灰度用户：</span><el-tag v-for="user in viewItem.grayUsers" :key="user" size="small" effect="plain">{{ user }}</el-tag></div>
                      <template v-if="isRouter">
                        <div class="portal-vue-alert-field"><label>自动路由规则</label><div v-if="(viewSnap.routes || []).length"><p v-for="(route,index) in viewSnap.routes" :key="index" style="margin:0 0 6px">{{ routeSkillName(route.skillId) }}：{{ (route.keywords || []).join("、") || "（无关键词）" }}</p></div><span v-else class="portal-vue-muted">（无规则）</span></div>
                        <div class="portal-vue-alert-field"><label>兜底技能</label><span>{{ routeSkillName(viewSnap.fallbackSkillId) || "—" }}</span></div>
                      </template>
                      <div v-else class="portal-vue-alert-field"><label>提示词</label><pre class="sk-pv-pre">{{ viewSnap.prompt || "（该版本未保存提示词）" }}</pre></div>
                      <div class="portal-vue-alert-field"><label>引用的表</label><span>{{ (viewSnap.tables || []).join("、") || "—" }}</span></div>
                    </template>
                    <template v-else-if="mode === 'edit' || mode === 'new'">
                      <div class="sk-pv-bar"><div class="sk-pv-title"><strong>{{ mode === 'new' ? '新增版本' : '修改 ' + selected }}</strong><span class="portal-vue-muted">保存后为「未发布」，发布后才上线，也可先灰度</span></div></div>
                      <el-form v-if="isRouter" label-position="top" class="portal-vue-dialog-form">
                        <el-form-item label="自动路由规则">
                          <div class="portal-vue-route-editor">
                            <div v-for="(route,index) in form.routes" :key="index" class="portal-vue-route-row">
                              <el-select v-model="route.skillId" placeholder="选择技能" style="width:200px"><el-option v-for="item in routeOptions" :key="item.id" :label="item.name" :value="item.id"></el-option></el-select>
                              <el-input v-model="route.keywords" placeholder="命中关键词，用顿号分隔，如 血缘、上游、下游"></el-input>
                              <el-button link type="danger" @click="form.routes.splice(index,1)">删除</el-button>
                            </div>
                            <el-button @click="form.routes.push({skillId:'',keywords:''})">＋ 新增规则</el-button>
                          </div>
                        </el-form-item>
                        <el-form-item label="兜底技能（未命中关键词时使用）"><el-select v-model="form.fallbackSkillId" placeholder="选择兜底技能" style="width:260px"><el-option v-for="item in routeOptions" :key="item.id" :label="item.name" :value="item.id"></el-option></el-select></el-form-item>
                      </el-form>
                      <el-form v-else label-position="top" class="portal-vue-dialog-form">
                        <el-form-item label="提示词"><el-input v-model="form.prompt" type="textarea" resize="none" class="sk-pv-textarea" placeholder="该 Skill 的分析指令" @input="autoAddTablesFrom"></el-input></el-form-item>
                      </el-form>
                      <el-form label-position="top" class="portal-vue-dialog-form">
                        <el-form-item label="引用的表（提示词里写到的表会自动识别加入，与提示词一起保存为版本）">
                          <el-select v-model="form.tables" multiple filterable clearable placeholder="从已有数据表中选择" style="width:100%">
                            <el-option v-for="name in tableOptions" :key="name" :label="name" :value="name"><span>{{ name }}</span><el-tag v-if="isInvalidTable(name)" size="small" type="danger" style="margin-left:8px">失效</el-tag></el-option>
                          </el-select>
                          <p class="portal-vue-muted" style="margin:8px 0 0;font-size:12px">{{ form.tables.length ? "已失效的表请先移除再保存。" : "不预置默认表。提示词里没有提到任何数据表时，分析不会预置默认表。" }}</p>
                        </el-form-item>
                      </el-form>
                      <div class="sk-pv-foot">
                        <el-form label-position="top" class="portal-vue-dialog-form" style="flex:1;min-width:0;display:flex;gap:16px;flex-wrap:wrap;margin:0">
                          <el-form-item label="版本号" required style="width:160px;margin-bottom:0"><el-input v-model="form.version" placeholder="如：v1.4"></el-input></el-form-item>
                          <el-form-item label="版本内容说明" style="flex:1;min-width:220px;margin-bottom:0"><el-input v-model="form.note" placeholder="如：新增自动澄清、修复口径问题（可空）"></el-input></el-form-item>
                        </el-form>
                        <div class="portal-vue-actions" style="flex:none"><el-button @click="cancelEdit">取消</el-button><el-button type="primary" @click="saveVersion">保存</el-button></div>
                      </div>
                    </template>
                    <el-empty v-else description="选择左侧版本查看提示词" />
                  </section>
                </div>
              </el-tab-pane>
            </el-tabs>
            <div v-if="tab==='basic' && editable" class="portal-vue-skill-detail-footer">
              <span class="portal-vue-muted" style="font-size:12px">基本信息保存后直接生效；提示词的修改在「提示词」里按版本发布。</span>
              <div class="portal-vue-actions" style="flex:none"><el-button @click="loadSkill">取消</el-button><el-button type="primary" @click="saveBasic">保存</el-button></div>
            </div>
            <el-dialog v-model="grayDialogVisible" :title="'灰度测试 - ' + (grayVersion?.version || '')" width="520px">
              <div class="portal-vue-skill-drawer">
                <el-alert type="info" :closable="false" title="选择灰度测试用户，仅这些用户可见该版本；验证没问题后再点「发版」全量发布。" :show-icon="true"></el-alert>
                <el-select v-model="grayDraft" multiple filterable collapse-tags collapse-tags-tooltip placeholder="选择灰度用户" style="width:100%;margin-top:12px">
                  <el-option v-for="user in activeUsers" :key="user.name" :label="user.name" :value="user.name"><span>{{ user.name }}</span><span class="portal-vue-muted" style="float:right;font-size:12px">{{ user.dept }}</span></el-option>
                </el-select>
              </div>
              <template #footer><el-button @click="grayDialogVisible=false">取消</el-button><el-button v-if="editable" type="primary" @click="saveGrayDraft">确定灰度</el-button></template>
            </el-dialog>
          </template>
        </div>
      </el-config-provider>
    `,
    setup() {
      return { locale: ep.zhCn };
    },
    data() {
      return { skillId: "", tab: "basic", draft: this.blankDraft(), selected: "", mode: "view", form: this.blankForm(), grayDialogVisible: false, grayVersion: null, grayDraft: [] };
    },
    computed: {
      skill() { refreshTick.value; return (state.skills || []).find(item => item.id === this.skillId) || null; },
      headerTitle() { return this.skill?.name || "Skill 详情"; },
      editable() { return this.canEdit('Skill 配置'); },
      isRouter() { return this.skill?.kind === "router"; },
      versions() { refreshTick.value; return this.skill?.versions || []; },
      viewItem() { return this.versions.find(item => item.version === this.selected) || null; },
      viewSnap() {
        const item = this.viewItem;
        if (!item) return {};
        const snap = item.snapshot || {};
        // 当前线上版本没有保存快照时，用线上生效的配置兜底
        if (item.current && snap.prompt === undefined) return { ...snap, prompt: this.skill?.prompt || "", tables: snap.tables || this.skill?.tables || [], routes: snap.routes || this.skill?.routes, fallbackSkillId: snap.fallbackSkillId ?? this.skill?.fallbackSkillId };
        return snap;
      },
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
        (this.form.tables || []).forEach(name => { if (name && !names.includes(name)) names.push(name); });
        return names;
      },
      activeUsers() { refreshTick.value; return (state.users || []).filter(user => user.status !== "已停用"); },
      basicDirty() {
        if (!this.skill) return false;
        return JSON.stringify(this.basicSnapshot(this.draft)) !== JSON.stringify(this.basicSnapshot(this.skill));
      },
      dirty() { return this.basicDirty || this.mode === "edit" || this.mode === "new"; }
    },
    methods: {
      blankDraft() { return { name: "", icon: "✦", title: "", desc: "", displayDesc: "", sort: 50, enabled: true }; },
      blankForm() { return { version: "", note: "", prompt: "", tables: [], routes: [], fallbackSkillId: "" }; },
      basicSnapshot(source) {
        return { name: String(source.name || "").trim(), icon: source.icon || "✦", title: String(source.title || "").trim(), desc: String(source.desc || "").trim(), displayDesc: String(source.displayDesc || "").trim(), sort: Number(source.sort) || 50, enabled: source.enabled !== false };
      },
      isImageIcon(icon) { return isImageIconValue(icon); },
      resolveIcon(icon) { return resolveSkillIcon(icon); },
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
      /* 版本号自动往下加：取现有最大的 vX.Y，次版本号 +1 */
      nextVersion() {
        let best = null;
        [...this.versions.map(item => item.version), this.skill?.version].forEach(text => {
          const match = String(text || "").match(/^v(\d+)\.(\d+)/);
          if (!match) return;
          const pair = [Number(match[1]), Number(match[2])];
          if (!best || pair[0] > best[0] || (pair[0] === best[0] && pair[1] > best[1])) best = pair;
        });
        return best ? `v${best[0]}.${best[1] + 1}` : "v1.0";
      },
      statusLabel(item) {
        if (item.current) return "线上";
        const status = item.status || "已发布";
        return status === "已发布" ? "历史" : status;
      },
      statusType(item) {
        if (item.current) return "success";
        const status = item.status || "已发布";
        return status === "灰度中" ? "warning" : "info";
      },
      canGray(item) { return !item.current && (item.status === "未发布" || item.status === "灰度中"); },
      isInvalidTable(name) { return !!name && !this.knownTables.includes(name); },
      parsedRoutes(list) {
        return (list || []).map(route => ({ skillId: route.skillId, keywords: splitKeywords(route.keywords) })).filter(route => route.skillId);
      },
      async refreshSkillFromGateway() {
        if (!this.skillId) return;
        try {
          const response = await fetch(`${analysisGatewayBase}/v1/skills`);
          if (!response.ok) return;
          const list = await response.json();
          const remote = Array.isArray(list) ? list.find(item => item.id === this.skillId) : null;
          if (!remote) return;
          // 直接打开详情页时本地列表可能还没有这个 Skill（如规范包 Skill），按网关数据补上，否则「引用的表」会空着
          if (!(state.skills || []).some(item => item.id === this.skillId)) {
            state.skills = [...(state.skills || []), { ...remote, versions: remote.versions || [], stats: remote.stats || { calls: 0, successRate: "—", avgLatency: "—", tokens: "—" } }];
          }
          const skill = (state.skills || []).find(item => item.id === this.skillId);
          if (!skill) return;
          ["icon", "title", "desc", "displayDesc", "sort", "enabled", "prompt", "fallbackSkillId", "name"].forEach(key => {
            if (remote[key] !== undefined) skill[key] = remote[key];
          });
          if (Array.isArray(remote.routes)) skill.routes = remote.routes;
          if (Array.isArray(remote.tables)) skill.tables = remote.tables;
          if (Array.isArray(remote.versions) && remote.versions.length) skill.versions = remote.versions;
        } catch (error) { /* 网关未连接时保留原型状态 */ }
      },
      async loadSkill() {
        this.skillId = bridge.getSkillDetailId?.() || "";
        await this.refreshSkillFromGateway();
        const skill = this.skill;
        this.mode = "view";
        this.form = this.blankForm();
        if (!skill) { this.draft = this.blankDraft(); this.selected = ""; this.tab = "basic"; return; }
        this.draft = { ...this.blankDraft(), ...this.basicSnapshot(skill) };
        /* 没有版本记录的 Skill（规范包等）：把线上配置当作初始版本，才能看到提示词与引用的表 */
        if (!(skill.versions || []).length) {
          skill.versions = [{ version: skill.version || "v1.0", time: "—", operator: "—", note: "初始版本", current: true, status: "已发布", grayUsers: [], snapshot: { prompt: skill.prompt || "", tables: [...(skill.tables || [])], ...(skill.kind === "router" ? { routes: skill.routes || [], fallbackSkillId: skill.fallbackSkillId || "" } : {}) } }];
        }
        const list = skill.versions || [];
        if (!list.some(item => item.version === this.selected)) this.selected = (list.find(item => item.current) || list[0])?.version || "";
      },
      cancelDraft() { this.loadSkill(); },
      async confirmLeave() {
        if (!this.dirty || !this.editable) return true;
        try {
          await ep.ElMessageBox.confirm("有未保存的修改，确定离开？", "未保存的修改", { type: "warning", confirmButtonText: "离开", cancelButtonText: "取消" });
          return true;
        } catch (error) { return false; }
      },
      async beforeLeave() { return this.confirmLeave().then(ok => { if (ok) { this.mode = "view"; this.form = this.blankForm(); if (this.skill) this.draft = { ...this.blankDraft(), ...this.basicSnapshot(this.skill) }; } return ok; }); },
      async back() {
        if (!(await this.confirmLeave())) return;
        bridge.setPage("Skill 配置");
      },
      async selectVersion(item) {
        if (this.mode !== "view" && !(await this.confirmLeave())) return;
        this.mode = "view";
        this.selected = item.version;
      },
      formFrom(item) {
        const snap = (item && (item.current && item.snapshot?.prompt === undefined ? { ...item.snapshot, prompt: this.skill.prompt, tables: this.skill.tables, routes: this.skill.routes, fallbackSkillId: this.skill.fallbackSkillId } : item.snapshot)) || {};
        return {
          prompt: snap.prompt || "",
          tables: [...(snap.tables || [])],
          routes: (snap.routes || []).map(route => ({ skillId: route.skillId, keywords: joinKeywords(route.keywords) })),
          fallbackSkillId: snap.fallbackSkillId || ""
        };
      },
      /* 新增版本：以线上版本（没有则最新版本）为底稿，版本号自动往下加 */
      startNew() {
        const base = this.versions.find(item => item.current) || this.versions[0];
        this.form = { ...this.formFrom(base), version: this.nextVersion(), note: "" };
        this.mode = "new";
      },
      startEdit(item) {
        /* 线上版本和历史版本不能原地改：基于它新增一个版本 */
        if (item.current || item.status === "已发布") {
          this.form = { ...this.formFrom(item), version: this.nextVersion(), note: "" };
          this.mode = "new";
          return;
        }
        this.form = { ...this.formFrom(item), version: item.version, note: item.note || "" };
        this.selected = item.version;
        this.mode = "edit";
      },
      cancelEdit() { this.mode = "view"; this.form = this.blankForm(); },
      /* 提示词里写到的已知数据表名自动加入引用的表（只增不减，删除仍可手动） */
      autoAddTablesFrom(text) {
        const found = this.knownTables.filter(name => name && String(text || "").includes(name) && !(this.form.tables || []).includes(name));
        if (found.length) this.form.tables = [...(this.form.tables || []), ...found];
      },
      /* 把版本列表与线上生效的提示词同步给网关 */
      async persist(extra = {}) {
        const skill = this.skill;
        if (!skill) return;
        try {
          await fetch(`${analysisGatewayBase}/v1/skills/${encodeURIComponent(skill.id)}/config`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: skill.prompt,
              tables: skill.tables || [],
              ...(skill.kind === "router" ? { routes: skill.routes || [], fallbackSkillId: skill.fallbackSkillId } : {}),
              versions: skill.versions || [],
              currentVersion: skill.version,
              ...extra
            })
          });
        } catch (error) { /* 网关未连接时保留原型状态 */ }
      },
      async saveBasic() {
        const skill = this.skill;
        if (!skill) return;
        const snap = this.basicSnapshot(this.draft);
        if (!snap.name) return ep.ElMessage.warning("请输入 Skill 名称");
        if (!snap.title) return ep.ElMessage.warning("请输入工作台展示标题");
        if ((state.skills || []).some(item => item.id !== skill.id && item.name === snap.name)) return ep.ElMessage.warning("Skill 名称已存在");
        Object.assign(skill, snap);
        await this.persist({ icon: snap.icon, title: snap.title, desc: snap.desc, displayDesc: snap.displayDesc, sort: snap.sort, enabled: snap.enabled });
        notify(`「${skill.name}」基本信息已保存`);
        this.loadSkill();
      },
      async saveVersion() {
        const skill = this.skill;
        const form = this.form;
        if (!skill) return;
        const version = String(form.version || "").trim();
        if (!version) return ep.ElMessage.warning("请输入版本号");
        const editing = this.mode === "edit" ? this.selected : "";
        if (this.versions.some(item => item.version === version && item.version !== editing)) return ep.ElMessage.warning("版本号已存在");
        if (!this.isRouter && !String(form.prompt || "").trim()) return ep.ElMessage.warning("请输入提示词");
        if ((form.tables || []).some(name => this.isInvalidTable(name))) return ep.ElMessage.warning("请先移除已失效的表");
        const snapshot = {
          prompt: form.prompt,
          tables: [...(form.tables || [])],
          ...(this.isRouter ? { routes: this.parsedRoutes(form.routes), fallbackSkillId: form.fallbackSkillId } : {})
        };
        const time = new Date().toLocaleString("zh-CN", { hour12: false }).replaceAll("/", "-");
        const operator = this.currentUser?.name || "曾祥竞";
        const note = String(form.note || "").trim();
        if (editing) {
          const item = this.versions.find(entry => entry.version === editing);
          Object.assign(item, { version, note, time, operator, snapshot: { ...(item.snapshot || {}), ...snapshot } });
        } else {
          skill.versions = [{ version, time, operator, note, current: false, status: "未发布", grayUsers: [], snapshot }, ...this.versions];
        }
        await this.persist();
        this.selected = version;
        this.mode = "view";
        this.form = this.blankForm();
        notify(`「${skill.name}」已保存为 ${version}（未发布）：发布后才会上线，也可先灰度测试`);
      },
      routeSkillName(id) {
        if (!id) return "";
        const item = this.routeOptions.find(entry => entry.id === id) || (state.skills || []).find(entry => entry.id === id);
        return item?.name || id;
      },
      openGrayDraft(item) { this.grayVersion = item; this.grayDraft = [...(item.grayUsers || [])]; this.grayDialogVisible = true; },
      async saveGrayDraft() {
        if (!this.grayVersion) return;
        if (!this.grayDraft.length) return ep.ElMessage.warning("请选择灰度用户");
        this.grayVersion.grayUsers = [...this.grayDraft];
        this.grayVersion.status = "灰度中";
        this.grayDialogVisible = false;
        await this.persist();
        notify(`「${this.skill?.name}」${this.grayVersion.version} 已灰度给 ${this.grayDraft.length} 位用户测试`);
      },
      async publishVersion(item) {
        const skill = this.skill;
        if (!skill) return;
        const rollback = item.status === "已发布";
        try { await ep.ElMessageBox.confirm(`确认将「${skill.name}」${item.version} ${rollback ? "回滚为线上版本" : "发布为正式版本（全量可见）"}？`, rollback ? "回滚确认" : "发版确认", { type: "warning", confirmButtonText: rollback ? "回滚" : "发布", cancelButtonText: "取消" }); } catch (error) { return; }
        const snap = this.formFrom(item);
        skill.versions.forEach(version => { version.current = version === item; });
        item.status = "已发布";
        item.grayUsers = [];
        skill.prompt = snap.prompt;
        skill.tables = snap.tables;
        if (this.isRouter) { skill.routes = this.parsedRoutes(snap.routes); skill.fallbackSkillId = snap.fallbackSkillId; }
        skill.version = item.version;
        await this.persist();
        notify(`「${skill.name}」${item.version} 已${rollback ? "回滚上线" : "正式发布"}`);
      }
    },
    mounted() {
      injectStyle("portal-vue-skill-detail-style", [
        ".sk-pv { display:grid; grid-template-columns:260px minmax(0,1fr); gap:20px; align-items:start; }",
        ".sk-pv-list { display:grid; gap:8px; max-height:calc(100vh - 260px); overflow:auto; }",
        ".sk-pv-new { width:100%; }",
        ".sk-pv-item { padding:10px 12px; border:1px solid #e9edf4; border-radius:10px; background:#fff; cursor:pointer; }",
        ".sk-pv-item:hover { border-color:#b8d0ff; }",
        ".sk-pv-item.active { border-color:#0066ff; background:#f3f7ff; }",
        ".sk-pv-item-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }",
        ".sk-pv-item p { margin:4px 0 2px; font-size:12px; color:#5a5f6c; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }",
        ".sk-pv-item small { color:#98a2b3; font-size:11px; }",
        ".sk-pv-bar { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:10px; }",
        ".sk-pv-title { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }",
        ".sk-pv-title strong { font-size:16px; }",
        ".sk-pv-actions { display:flex; gap:8px; }",
        ".sk-pv-gray { display:flex; flex-wrap:wrap; gap:4px; align-items:center; margin-bottom:8px; }",
        ".sk-pv-pre { white-space:pre-wrap; word-break:break-word; margin:0; padding:12px 14px; border:1px solid #e9edf4; border-radius:8px; background:#fafcff; min-height:240px; max-height:calc(100vh - 380px); overflow:auto; font:13px/1.7 inherit; }",
        ".sk-pv-textarea textarea { min-height:calc(100vh - 460px); }",
        ".sk-pv-foot { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; padding-top:14px; border-top:1px solid #e9edf4; }",
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
