/**
 * 页面：运营中心（仅管理员）
 * 用量与配额 / 审计日志 / 回答反馈 / 账号管理 / 默认模型。数据全部来自网关接口，服务端同样要求管理员权限。
 * 依赖 core.js（window.PortalVue）。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    analysisGatewayBase,
    confirmAction,
    ep,
    mount,
    orgSync,
    state
  } = window.PortalVue;

  /** 调网关：非 2xx 时抛出带服务端提示的错误，界面直接展示 */
  async function request(path, options = {}) {
    const response = await fetch(`${analysisGatewayBase}${path}`, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
    return data;
  }

  const AUDIT_TYPES = [
    { value: "", label: "全部类型" },
    { value: "analysis", label: "分析请求" },
    { value: "tool-call", label: "工具调用" },
    { value: "password-change", label: "修改密码" },
    { value: "org-change", label: "权限变更" },
    { value: "account-create", label: "新增账号" },
    { value: "account-status", label: "账号停用 / 启用" },
    { value: "account-reset-password", label: "重置密码" },
    { value: "default-model", label: "默认模型" }
  ];
  const typeLabel = type => (AUDIT_TYPES.find(item => item.value === type) || {}).label || type;
  const formatTime = iso => (iso ? new Date(iso).toLocaleString("zh-CN", { hour12: false }) : "—");
  const limitText = value => (value > 0 ? value.toLocaleString("zh-CN") : "不限");

  /** 一行审计记录的可读摘要 */
  function describeAudit(entry) {
    switch (entry.type) {
      case "analysis":
        return [entry.question, entry.model, `${entry.tokens ?? 0} tokens`, `${entry.latencyMs ?? 0}ms`, entry.toolMode && entry.toolMode !== "off" ? `工具 ${entry.toolCallCount} 次` : "", entry.error || ""].filter(Boolean).join(" · ");
      case "tool-call":
        return [entry.tool, entry.table || "", entry.ok ? "成功" : `被拒绝：${entry.error || "失败"}`].filter(Boolean).join(" · ");
      case "account-create": return `新增账号「${entry.account}」`;
      case "account-status": return `${entry.status === "disabled" ? "停用" : "启用"}账号「${entry.account}」`;
      case "account-reset-password": return `重置「${entry.account}」的密码`;
      case "password-change": return "修改了自己的密码";
      case "org-change": return `保存了权限组配置${entry.groups ? `（${entry.groups} 个组）` : ""}`;
      case "default-model": return entry.model ? `默认模型设为 ${entry.model}` : "清除了默认模型设置";
      default: return JSON.stringify(entry).slice(0, 120);
    }
  }

  const OpsCenterApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel" id="opsCenterPanel">
          <el-tabs v-model="tab" @tab-change="onTab">
            <el-tab-pane label="用量与配额" name="usage">
              <div class="portal-vue-toolbar">
                <div class="portal-vue-toolbar-left"><span class="portal-vue-muted">统计日期 {{ usage.date || '—' }}（按服务器日期）；0 表示不限</span></div>
                <div><el-button @click="loadUsage">刷新</el-button><el-button type="primary" @click="openQuota(null)">调整全员默认额度</el-button></div>
              </div>
              <el-alert v-if="usage.global && usage.global.limit > 0" :type="usage.global.tokens >= usage.global.limit ? 'error' : 'info'" :closable="false" show-icon style="margin-bottom:12px"
                :title="'全站今日 token：' + usage.global.tokens.toLocaleString('zh-CN') + ' / ' + usage.global.limit.toLocaleString('zh-CN') + '（达到上限后所有人都无法发起分析）'"></el-alert>
              <el-table :data="usage.users" class="portal-vue-table" border v-loading="loading.usage" empty-text="暂无数据" data-test="usage-table">
                <el-table-column prop="name" label="账号" min-width="140"></el-table-column>
                <el-table-column label="今日分析次数" min-width="170"><template #default="scope">{{ scope.row.requests }} / {{ limitText(scope.row.limits.requests) }}</template></el-table-column>
                <el-table-column label="今日 token" min-width="220"><template #default="scope">{{ scope.row.tokens.toLocaleString('zh-CN') }} / {{ limitText(scope.row.limits.tokens) }}</template></el-table-column>
                <el-table-column label="操作" width="140"><template #default="scope"><el-button link type="primary" @click="openQuota(scope.row)">调整额度</el-button></template></el-table-column>
              </el-table>
            </el-tab-pane>

            <el-tab-pane label="审计日志" name="audit">
              <div class="portal-vue-toolbar">
                <div class="portal-vue-toolbar-left">
                  <el-select v-model="auditFilter.type" style="width:150px" @change="loadAudit"><el-option v-for="item in auditTypes" :key="item.value" :label="item.label" :value="item.value"></el-option></el-select>
                  <el-input v-model="auditFilter.user" placeholder="账号" clearable style="width:140px" @keyup.enter="loadAudit" @clear="loadAudit"></el-input>
                  <el-select v-model="auditFilter.status" style="width:120px" @change="loadAudit"><el-option label="全部状态" value=""></el-option><el-option label="成功" value="ok"></el-option><el-option label="失败" value="error"></el-option></el-select>
                </div>
                <div><span class="portal-vue-muted" style="margin-right:12px">命中 {{ audit.matched }} 条，显示最近 {{ audit.items.length }} 条</span><el-button type="primary" @click="loadAudit">查询</el-button></div>
              </div>
              <el-table :data="audit.items" class="portal-vue-table" border v-loading="loading.audit" empty-text="暂无记录" data-test="audit-table">
                <el-table-column label="时间" width="170"><template #default="scope">{{ formatTime(scope.row.at) }}</template></el-table-column>
                <el-table-column label="类型" width="120"><template #default="scope">{{ typeLabel(scope.row.type) }}</template></el-table-column>
                <el-table-column label="账号" width="150"><template #default="scope">{{ scope.row.user }}<span v-if="scope.row.scope" class="portal-vue-muted">（访客）</span></template></el-table-column>
                <el-table-column label="摘要" min-width="360"><template #default="scope"><span>{{ describe(scope.row) }}</span></template></el-table-column>
                <el-table-column label="结果" width="90"><template #default="scope"><el-tag v-if="scope.row.status === 'error' || scope.row.ok === false" type="danger" effect="light">失败</el-tag><el-tag v-else-if="scope.row.status === 'ok' || scope.row.ok === true" type="success" effect="light">成功</el-tag></template></el-table-column>
              </el-table>
            </el-tab-pane>

            <el-tab-pane label="回答反馈" name="feedback">
              <div class="portal-vue-toolbar">
                <div class="portal-vue-toolbar-left">
                  <el-radio-group v-model="feedbackRating" @change="loadFeedback"><el-radio-button label="">全部</el-radio-button><el-radio-button label="down">👎 差评</el-radio-button><el-radio-button label="up">👍 好评</el-radio-button></el-radio-group>
                </div>
                <div><span class="portal-vue-muted" style="margin-right:12px">共 {{ feedback.summary.total }} 条：👍 {{ feedback.summary.up }} · 👎 {{ feedback.summary.down }}</span><el-button @click="loadFeedback">刷新</el-button></div>
              </div>
              <div class="portal-vue-ops-summary" v-if="feedback.summary.total">
                <div v-for="row in summaryRows" :key="row.kind + row.name" class="portal-vue-ops-chip"><strong>{{ row.kind }}</strong> {{ row.name }}：👍 {{ row.up }} · 👎 {{ row.down }}</div>
              </div>
              <el-table :data="feedback.items" class="portal-vue-table" border v-loading="loading.feedback" empty-text="还没有反馈" data-test="feedback-table">
                <el-table-column label="时间" width="170"><template #default="scope">{{ formatTime(scope.row.at) }}</template></el-table-column>
                <el-table-column label="评价" width="80" align="center"><template #default="scope">{{ scope.row.rating === 'up' ? '👍' : '👎' }}</template></el-table-column>
                <el-table-column prop="user" label="账号" width="120"></el-table-column>
                <el-table-column label="模型 / Skill" min-width="200"><template #default="scope">{{ scope.row.model }}<br /><span class="portal-vue-muted">{{ scope.row.skill }}</span></template></el-table-column>
                <el-table-column prop="question" label="问题" min-width="240"></el-table-column>
                <el-table-column prop="comment" label="原因" min-width="200"></el-table-column>
              </el-table>
            </el-tab-pane>

            <el-tab-pane label="账号管理" name="accounts">
              <div class="portal-vue-toolbar">
                <div class="portal-vue-toolbar-left"><span class="portal-vue-muted">{{ demoMode ? '演示环境：所有账号共用公开密码，不能重置或修改密码' : '停用后立即生效，已登录的人下一次操作就会被登出；账号不能删除（历史与审计按账号归属）' }}</span></div>
                <div><el-button @click="loadAccounts">刷新</el-button><el-button type="primary" @click="openCreate" data-test="create-account">新增账号</el-button></div>
              </div>
              <el-table :data="accounts" class="portal-vue-table" border v-loading="loading.accounts" empty-text="暂无账号" data-test="accounts-table">
                <el-table-column prop="name" label="账号" min-width="140"></el-table-column>
                <el-table-column label="权限组" min-width="180"><template #default="scope">
                  <el-select :model-value="scope.row.group" size="small" style="width:150px" @change="value => changeGroup(scope.row, value)">
                    <el-option label="未分配" value="未分配"></el-option><el-option v-for="name in groupNames" :key="name" :label="name" :value="name"></el-option>
                  </el-select></template></el-table-column>
                <el-table-column label="角色" width="100"><template #default="scope"><el-tag :type="scope.row.role === 'admin' ? 'warning' : 'info'" effect="light">{{ scope.row.role === 'admin' ? '管理员' : '成员' }}</el-tag></template></el-table-column>
                <el-table-column label="状态" width="100"><template #default="scope"><el-tag :type="scope.row.status === 'active' ? 'success' : 'danger'" effect="light">{{ scope.row.status === 'active' ? '启用' : '已停用' }}</el-tag></template></el-table-column>
                <el-table-column label="创建时间" width="170"><template #default="scope">{{ scope.row.createdAt ? formatTime(scope.row.createdAt) : '内置账号' }}</template></el-table-column>
                <el-table-column label="操作" width="220" fixed="right"><template #default="scope"><div class="portal-vue-actions">
                  <el-button link :type="scope.row.status === 'active' ? 'danger' : 'primary'" @click="toggleStatus(scope.row)">{{ scope.row.status === 'active' ? '停用' : '启用' }}</el-button>
                  <el-button link type="primary" :disabled="demoMode" @click="resetPassword(scope.row)">重置密码</el-button>
                </div></template></el-table-column>
              </el-table>
            </el-tab-pane>

            <el-tab-pane label="默认模型" name="model">
              <el-form label-position="top" style="max-width:520px">
                <el-form-item label="当前生效的默认模型"><code class="portal-vue-code" data-test="effective-default">{{ models.default || '—' }}</code><span v-if="models.defaultConfigured && models.defaultConfigured !== models.default" class="portal-vue-muted" style="margin-left:12px">（已配置的 {{ models.defaultConfigured }} 当前不可用，已自动退回）</span></el-form-item>
                <el-form-item label="设为默认（新会话默认选中；用户仍可在输入框切换）">
                  <el-select v-model="modelChoice" filterable placeholder="选择一个已启用的模型" style="width:100%"><el-option v-for="id in models.models" :key="id" :label="id" :value="id"></el-option></el-select>
                </el-form-item>
                <el-form-item><el-button type="primary" :disabled="!modelChoice" @click="saveDefaultModel(modelChoice)" data-test="save-default-model">保存</el-button><el-button :disabled="!models.defaultConfigured" @click="saveDefaultModel('')">清除设置</el-button></el-form-item>
              </el-form>
            </el-tab-pane>
          </el-tabs>
        </section>

        <el-dialog v-model="quotaDialog.visible" :title="quotaDialog.name ? '调整 ' + quotaDialog.name + ' 的额度' : '调整全员默认额度'" width="460px">
          <el-form label-position="top">
            <el-form-item label="每日分析次数（0 = 不限）"><el-input-number v-model="quotaDialog.requests" :min="0" :step="10" style="width:100%"></el-input-number></el-form-item>
            <el-form-item label="每日 token（0 = 不限）"><el-input-number v-model="quotaDialog.tokens" :min="0" :step="100000" style="width:100%"></el-input-number></el-form-item>
          </el-form>
          <template #footer>
            <el-button v-if="quotaDialog.name" @click="clearQuota">恢复默认</el-button>
            <el-button @click="quotaDialog.visible = false">取消</el-button>
            <el-button type="primary" @click="saveQuota">保存</el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="createDialog.visible" title="新增账号" width="460px">
          <el-form label-position="top">
            <el-form-item label="账号名（1–20 个字符，不含空格和 ~ / \\ , 引号）" required><el-input v-model="createDialog.name" placeholder="例如：王小明" data-test="new-account-name"></el-input></el-form-item>
            <el-form-item label="权限组（可稍后再设）"><el-select v-model="createDialog.group" clearable placeholder="未分配" style="width:100%"><el-option v-for="name in groupNames" :key="name" :label="name" :value="name"></el-option></el-select></el-form-item>
          </el-form>
          <template #footer><el-button @click="createDialog.visible = false">取消</el-button><el-button type="primary" :loading="createDialog.saving" @click="createAccount" data-test="confirm-create">创建</el-button></template>
        </el-dialog>

        <el-dialog v-model="secretDialog.visible" :title="secretDialog.title" width="460px">
          <p>{{ secretDialog.message }}</p>
          <p v-if="secretDialog.password"><code class="portal-vue-code" data-test="initial-password" style="font-size:16px">{{ secretDialog.password }}</code></p>
          <p v-if="secretDialog.password" class="portal-vue-muted">这个密码只显示这一次，关闭后无法再查看；请当面或通过安全渠道告诉对方，并建议对方登录后立即修改。</p>
          <template #footer><el-button v-if="secretDialog.password" @click="copySecret">复制密码</el-button><el-button type="primary" @click="secretDialog.visible = false">我已记下</el-button></template>
        </el-dialog>
      </el-config-provider>
    `,
    data: () => ({
      tab: "usage",
      loading: { usage: false, audit: false, feedback: false, accounts: false },
      usage: { date: "", global: null, users: [] },
      quotaDialog: { visible: false, name: "", requests: 0, tokens: 0 },
      auditTypes: AUDIT_TYPES,
      auditFilter: { type: "", user: "", status: "" },
      audit: { items: [], matched: 0, counts: {} },
      feedbackRating: "",
      feedback: { summary: { total: 0, up: 0, down: 0, byModel: {}, bySkill: {} }, items: [] },
      accounts: [],
      demoMode: false,
      createDialog: { visible: false, name: "", group: "", saving: false },
      secretDialog: { visible: false, title: "", message: "", password: "" },
      models: { models: [], default: "", defaultConfigured: "" },
      modelChoice: ""
    }),
    computed: {
      groupNames() { return (state.groups || []).map(group => group.name); },
      summaryRows() {
        const { byModel, bySkill } = this.feedback.summary;
        return [
          ...Object.entries(byModel).map(([name, value]) => ({ kind: "模型", name, ...value })),
          ...Object.entries(bySkill).map(([name, value]) => ({ kind: "Skill", name, ...value }))
        ];
      }
    },
    methods: {
      formatTime, typeLabel, limitText, describe: describeAudit,
      onTab(name) {
        if (name === "usage") this.loadUsage();
        if (name === "audit") this.loadAudit();
        if (name === "feedback") this.loadFeedback();
        if (name === "accounts") this.loadAccounts();
        if (name === "model") this.loadModels();
      },
      async guarded(flag, task) {
        this.loading[flag] = true;
        try { await task(); } catch (error) { ep.ElMessage.warning(error.message); } finally { this.loading[flag] = false; }
      },
      loadUsage() { return this.guarded("usage", async () => { this.usage = await request("/v1/usage/all"); }); },
      openQuota(row) {
        this.quotaDialog = row
          ? { visible: true, name: row.name, requests: row.limits.requests, tokens: row.limits.tokens }
          : { visible: true, name: "", requests: (this.usage.users[0] || { limits: { requests: 0 } }).limits.requests, tokens: (this.usage.users[0] || { limits: { tokens: 0 } }).limits.tokens };
      },
      async saveQuota() {
        const { name, requests, tokens } = this.quotaDialog;
        try {
          await request("/v1/quota", { method: "PUT", body: JSON.stringify(name ? { perUser: { [name]: { requests, tokens } } } : { requests, tokens }) });
          this.quotaDialog.visible = false;
          ep.ElMessage.success(name ? `已调整 ${name} 的额度` : "已调整全员默认额度");
          await this.loadUsage();
        } catch (error) { ep.ElMessage.warning(error.message); }
      },
      async clearQuota() {
        try {
          await request("/v1/quota", { method: "PUT", body: JSON.stringify({ perUser: { [this.quotaDialog.name]: null } }) });
          this.quotaDialog.visible = false;
          ep.ElMessage.success("已恢复为默认额度");
          await this.loadUsage();
        } catch (error) { ep.ElMessage.warning(error.message); }
      },
      loadAudit() {
        const params = new URLSearchParams({ limit: "100" });
        Object.entries(this.auditFilter).forEach(([key, value]) => { if (value) params.set(key, value); });
        return this.guarded("audit", async () => { this.audit = await request(`/v1/audit?${params}`); });
      },
      loadFeedback() {
        return this.guarded("feedback", async () => { this.feedback = await request(`/v1/feedback?limit=100${this.feedbackRating ? `&rating=${this.feedbackRating}` : ""}`); });
      },
      loadAccounts() {
        return this.guarded("accounts", async () => {
          const data = await request("/v1/accounts");
          this.accounts = data.accounts;
          this.demoMode = data.demoMode;
        });
      },
      openCreate() { this.createDialog = { visible: true, name: "", group: "", saving: false }; },
      showSecret(title, message, password) { this.secretDialog = { visible: true, title, message, password }; },
      async createAccount() {
        const { name, group } = this.createDialog;
        this.createDialog.saving = true;
        try {
          // 服务端需要先有完整的权限组配置，才能把新账号分配到界面里的组
          if (group) await orgSync.push(true);
          const result = await request("/v1/accounts", { method: "POST", body: JSON.stringify({ name, group }) });
          this.createDialog.visible = false;
          if (result.warning) ep.ElMessage.warning(result.warning);
          this.showSecret("账号已创建", result.password ? `账号「${result.account.name}」的初始密码：` : `账号「${result.account.name}」已创建，使用演示环境共用的密码登录。`, result.password);
          await this.loadAccounts();
        } catch (error) { ep.ElMessage.warning(error.message); } finally { this.createDialog.saving = false; }
      },
      async toggleStatus(row) {
        const disable = row.status === "active";
        if (!await confirmAction(disable ? "停用账号" : "启用账号", disable ? `确认停用「${row.name}」？该账号会立即无法使用，已登录的会话也会失效。` : `确认重新启用「${row.name}」？`)) return;
        try {
          await request(`/v1/accounts/${encodeURIComponent(row.name)}`, { method: "PATCH", body: JSON.stringify({ status: disable ? "disabled" : "active" }) });
          ep.ElMessage.success(disable ? "已停用" : "已启用");
          await this.loadAccounts();
        } catch (error) { ep.ElMessage.warning(error.message); }
      },
      async resetPassword(row) {
        if (!await confirmAction("重置密码", `确认重置「${row.name}」的密码？旧密码会立即失效。`)) return;
        try {
          const result = await request(`/v1/accounts/${encodeURIComponent(row.name)}/reset-password`, { method: "POST" });
          this.showSecret("密码已重置", `账号「${row.name}」的新密码：`, result.password);
        } catch (error) { ep.ElMessage.warning(error.message); }
      },
      async changeGroup(row, group) {
        try {
          await orgSync.push(true);
          await request("/v1/org", { method: "PUT", body: JSON.stringify({ userGroups: { [row.name]: group } }) });
          const user = (state.users || []).find(item => item.name === row.name);
          if (user) user.group = group;
          ep.ElMessage.success(`${row.name} 已分配到「${group}」`);
        } catch (error) { ep.ElMessage.warning(error.message); }
        await this.loadAccounts();
      },
      async copySecret() {
        try { await navigator.clipboard.writeText(this.secretDialog.password); ep.ElMessage.success("已复制"); } catch (error) { ep.ElMessage.warning("复制失败，请手动选择复制"); }
      },
      loadModels() {
        return this.guarded("accounts", async () => {
          this.models = await request("/v1/models");
          this.modelChoice = this.models.defaultConfigured || this.models.default;
        });
      },
      async saveDefaultModel(model) {
        try {
          await request("/v1/default-model", { method: "PUT", body: JSON.stringify({ model }) });
          ep.ElMessage.success(model ? `默认模型已设为 ${model}` : "已清除默认模型设置");
          await this.loadModels();
        } catch (error) { ep.ElMessage.warning(error.message); }
      }
    },
    // 只有切到这个页面才加载（非管理员的浏览器不应该在启动时去请求管理接口）
    mounted() {
      this.pageHandler = event => { if (event.detail?.page === "运营中心") this.onTab(this.tab); };
      window.addEventListener("portal:page-change", this.pageHandler);
    },
    beforeUnmount() { window.removeEventListener("portal:page-change", this.pageHandler); }
  };
  mount("#opsCenterView", OpsCenterApp, "ops-center");
})();
