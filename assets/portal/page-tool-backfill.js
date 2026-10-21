/**
 * 页面：tool-backfill
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    OPS_TOOL_OPTIONS,
    TOOL_META_TEMPLATE,
    canEditMenu,
    denyEdit,
    ep,
    mount,
    paginate
  } = window.PortalVue;


  const ToolBackfillApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          ${TOOL_META_TEMPLATE("补数据", "数据来源：生产环境 bytedance_ad 库；补数据接口为异步执行，返回成功仅代表任务已提交。")}
          <div style="padding:14px 20px 20px">
            <div class="portal-vue-toolbar" style="margin-bottom:14px">
              <div class="portal-vue-toolbar-left">
                <el-select v-model="bfEnv" style="width:110px"><el-option v-for="item in envOptions" :key="item" :label="item" :value="item"></el-option></el-select>
                <el-select v-model="bfPlatform" style="width:190px"><el-option v-for="item in platforms" :key="item" :label="item" :value="item"></el-option></el-select>
                <el-select v-model="bfApi" style="width:200px"><el-option v-for="item in apiOptions" :key="item" :label="item" :value="item"></el-option></el-select>
              </div>
            </div>
            <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;margin-bottom:16px;background:#fafafa">
              <span class="portal-vue-muted">请求地址：</span><code class="portal-vue-code">{{ apiPath }}</code>
              <span class="portal-vue-muted">（GET · 原型示意，不真实调用）</span>
            </div>
            <el-form label-position="top" class="portal-vue-dialog-form">
              <el-form-item label="广告主 ID（账户）" required>
                <el-input v-model="accounts" type="textarea" :rows="3" placeholder="多个账户用逗号分隔，例如：123456,789012"></el-input>
                <div class="portal-vue-csv-row">
                  <el-upload action="#" :auto-upload="false" :show-file-list="false" accept=".csv" :on-change="handleCsvUpload">
                    <template #trigger><el-button v-if="canEdit('补数据')">⬆ 上传</el-button></template>
                  </el-upload>
                  <span class="portal-vue-muted">上传账户 CSV（单列账户 ID，最多 1000 个）自动解析合并</span>
                  <el-button link type="primary" @click="downloadCsvTemplate">⬇ 下载模板</el-button>
                </div>
              </el-form-item>
              <el-form-item label="时间范围类型" required>
                <el-select v-model="rangeType" style="width:300px" @change="onRangeTypeChange">
                  <el-option label="昨天" value="昨天"></el-option>
                  <el-option label="过去N小时" value="过去N小时"></el-option>
                  <el-option label="过去N天" value="过去N天"></el-option>
                  <el-option label="当月" value="当月"></el-option>
                  <el-option label="上月" value="上月"></el-option>
                  <el-option label="过去N月" value="过去N月"></el-option>
                  <el-option label="过去N周" value="过去N周"></el-option>
                  <el-option label="过去第N天" value="过去第N天"></el-option>
                  <el-option label="自定义日期" value="自定义日期"></el-option>
                </el-select>
                <div v-if="rangeType === '过去N小时'" class="portal-vue-compare-dates"><span class="portal-vue-muted">过去</span><el-input-number v-model="rangeN" :min="1" :max="720" size="small"></el-input-number><span class="portal-vue-muted">小时</span></div>
                <div v-if="rangeType === '过去N天'" class="portal-vue-compare-dates"><span class="portal-vue-muted">过去</span><el-input-number v-model="rangeN" :min="1" :max="365" size="small"></el-input-number><span class="portal-vue-muted">天</span></div>
                <div v-if="rangeType === '过去N月'" class="portal-vue-compare-dates"><span class="portal-vue-muted">过去</span><el-input-number v-model="rangeN" :min="1" :max="12" size="small"></el-input-number><span class="portal-vue-muted">月</span></div>
                <div v-if="rangeType === '过去N周'" class="portal-vue-compare-dates"><span class="portal-vue-muted">过去</span><el-input-number v-model="rangeN" :min="1" :max="52" size="small"></el-input-number><span class="portal-vue-muted">周</span></div>
                <div v-if="rangeType === '过去第N天'" class="portal-vue-compare-dates"><span class="portal-vue-muted">过去第</span><el-input-number v-model="rangeN" :min="1" :max="365" size="small"></el-input-number><span class="portal-vue-muted">天</span></div>
                <el-date-picker v-if="rangeType === '自定义日期'" v-model="customRange" type="daterange" value-format="YYYY-MM-DD" unlink-panels start-placeholder="开始日期" end-placeholder="结束日期" style="width:320px;margin-top:10px"></el-date-picker>
                <p class="portal-vue-muted portal-vue-span-text" style="margin-top:6px">补数窗口：{{ spanText }}</p>
              </el-form-item>
              <el-form-item label="管理员账户 ID">
                <el-input v-model="adminId" placeholder="可选，逗号分隔"></el-input>
              </el-form-item>
              <el-form-item label="应用 ID" required>
                <el-select v-model="appIdList" multiple filterable placeholder="请选择应用（可多选）" style="width:420px"><el-option v-for="item in appOptions" :key="item" :label="item" :value="item"></el-option></el-select>
              </el-form-item>
            </el-form>
            <div style="display:flex;gap:10px;align-items:center;margin-bottom:6px">
              <el-tooltip :disabled="canEdit('补数据')" content="需要「补数据」的编辑权限，请联系管理员开通" placement="top">
                <span><el-button type="primary" :disabled="!canEdit('补数据')" :loading="backfillSubmitting" @click="submitBackfill">🚀 重跑</el-button></span>
              </el-tooltip>
              <el-button plain @click="logDialogVisible=true" :disabled="backfillSubmitting">📋 执行日志</el-button>
            </div>
            <el-progress v-if="backfillSubmitting || backfillProgress > 0" :percentage="backfillProgress" :status="backfillProgress >= 100 ? 'success' : ''" style="max-width:480px;margin-bottom:6px" />
            <p class="portal-vue-muted" style="margin:0 0 6px">补数据任务将分配固定开发者执行，与生产环境隔离互不影响。</p>
            <template v-if="recent.length">
              <div class="portal-vue-section-line" style="margin-top:22px"><h3>📊 本次执行结果</h3></div>
              <el-alert type="success" :closable="false" show-icon title="任务已提交" description="接口为异步执行，提交成功仅代表任务已排队，后台完成后自动入库；状态以「执行日志」为准。" style="margin-bottom:12px" />
              <el-table :data="recent" class="portal-vue-table" border>
                <el-table-column prop="id" label="任务ID" width="150"><template #default="scope"><code class="portal-vue-code">{{ scope.row.id }}</code></template></el-table-column>
                <el-table-column label="任务名称" min-width="220"><template #default="scope">{{ scope.row.name }}</template></el-table-column>
                <el-table-column prop="span" label="时间范围" width="170"></el-table-column>
                <el-table-column prop="startedAt" label="开始时间" width="150"></el-table-column>
                <el-table-column label="状态" width="100"><template #default="scope"><el-tag :type="scope.row.status === '成功' ? 'success' : 'warning'" effect="light">{{ scope.row.status }}</el-tag></template></el-table-column>
              </el-table>
            </template>
          </div>

          <el-dialog v-model="logDialogVisible" title="补数据 · 执行日志" width="min(1200px, 94vw)" :close-on-click-modal="true">
            <p class="portal-vue-muted" style="margin:0 0 12px">数据来源：{{ bfEnv }} 环境 · api_task_execution_log 表 · 默认查当天，按开始时间倒序 · 最多返回 500 条</p>
            <div class="portal-vue-toolbar">
              <div class="portal-vue-toolbar-left">
                <el-date-picker v-model="logRange" type="daterange" value-format="YYYY-MM-DD" unlink-panels start-placeholder="开始日期" end-placeholder="结束日期" style="width:250px"></el-date-picker>
                <el-select v-model="logApi" style="width:160px"><el-option label="全部接口" value="全部"></el-option><el-option v-for="item in apiOptions" :key="item" :label="item" :value="item"></el-option></el-select>
                <el-select v-model="logStatus" style="width:120px"><el-option v-for="item in statusOptions" :key="item" :label="item" :value="item"></el-option></el-select>
                <el-input v-model="logKeyword" class="portal-vue-search" clearable placeholder="任务名称（模糊）"></el-input>
                <el-input v-model="logTrace" class="portal-vue-search" clearable placeholder="traceId 搜索" style="width:200px"></el-input>
              </div>
              <el-button type="primary" @click="logPage=1">🔍 查询</el-button>
            </div>
            <el-table :data="pagedLogs" class="portal-vue-table" border :max-height="480" style="margin-top:14px" empty-text="暂无执行日志">
              <el-table-column prop="id" label="任务ID" width="152" fixed="left"><template #default="scope"><code class="portal-vue-code">{{ scope.row.id }}</code></template></el-table-column>
              <el-table-column label="任务名称" min-width="230" show-overflow-tooltip><template #default="scope">{{ scope.row.name }}</template></el-table-column>
              <el-table-column prop="platform" label="平台" width="120"></el-table-column>
              <el-table-column prop="api" label="接口" width="150"></el-table-column>
              <el-table-column prop="env" label="环境" width="88"></el-table-column>
              <el-table-column prop="accounts" label="账户数" width="86" align="center"></el-table-column>
              <el-table-column prop="submitAt" label="提交时间" width="150"></el-table-column>
              <el-table-column prop="startedAt" label="开始时间" width="150"></el-table-column>
              <el-table-column prop="cost" label="耗时" width="88" align="center"></el-table-column>
              <el-table-column label="状态" width="96" align="center"><template #default="scope"><el-tag :type="statusType(scope.row.status)" effect="light">{{ scope.row.status }}</el-tag></template></el-table-column>
              <el-table-column prop="submitter" label="提交人" width="90"></el-table-column>
              <el-table-column label="操作" width="90" fixed="right"><template #default="scope"><el-button link type="primary" @click="logDetail=scope.row; logDetailVisible=true">详情</el-button></template></el-table-column>
            </el-table>
            <div class="portal-vue-pagination"><span>共 {{ filteredLogs.length }} 条，当前 {{ logRangeText }}</span><el-pagination v-model:current-page="logPage" v-model:page-size="logPageSize" :page-sizes="[10,20,50]" :total="filteredLogs.length" layout="sizes, prev, pager, next"></el-pagination></div>
          </el-dialog>
          <el-drawer v-model="logDetailVisible" :title="logDetail ? '任务详情 · ' + logDetail.id : '任务详情'" size="520px" :close-on-click-modal="true">
            <template v-if="logDetail">
              <div class="portal-vue-detail-grid">
                <div class="portal-vue-detail-item"><span>任务ID</span><strong><code class="portal-vue-code">{{ logDetail.id }}</code></strong></div>
                <div class="portal-vue-detail-item"><span>任务名称</span><strong>{{ logDetail.name }}</strong></div>
                <div class="portal-vue-detail-item"><span>平台</span><strong>{{ logDetail.platform }}</strong></div>
                <div class="portal-vue-detail-item"><span>接口</span><strong>{{ logDetail.api }}</strong></div>
                <div class="portal-vue-detail-item"><span>环境</span><strong>{{ logDetail.env }}</strong></div>
                <div class="portal-vue-detail-item"><span>时间范围</span><strong>{{ logDetail.span }}</strong></div>
                <div class="portal-vue-detail-item"><span>账户数</span><strong>{{ logDetail.accounts }}</strong></div>
                <div class="portal-vue-detail-item"><span>提交人</span><strong>{{ logDetail.submitter }}</strong></div>
                <div class="portal-vue-detail-item"><span>提交 / 开始</span><strong>{{ logDetail.submitAt }} / {{ logDetail.startedAt }}</strong></div>
                <div class="portal-vue-detail-item"><span>耗时</span><strong>{{ logDetail.cost }}</strong></div>
                <div class="portal-vue-detail-item"><span>状态</span><strong><el-tag :type="statusType(logDetail.status)" effect="light">{{ logDetail.status }}</el-tag></strong></div>
                <div class="portal-vue-detail-item"><span>traceId</span><strong><code class="portal-vue-code">{{ logDetail.trace }}</code></strong></div>
              </div>
              <div class="portal-vue-section-line"><h3>请求参数</h3></div>
              <pre style="white-space:pre-wrap;background:#f6f7f9;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;font-size:13px;line-height:1.7;color:#475467;margin:0">{{ logDetail.paramText }}</pre>
              <el-alert v-if="logDetail.reason" type="error" :closable="false" show-icon :title="logDetail.reason" style="margin-top:12px" />
            </template>
          </el-drawer>
        </section>
      </el-config-provider>
    `,
    data: () => {
      const pad = value => String(value).padStart(2, "0");
      const day = value => `2026-09-${pad(value)}`;
      const mkLog = (dayValue, seq, api, status, accounts, submitTime, cost, trace, extra = {}) => ({ id: `TR2026${seq}`, day: day(dayValue), name: `${api} · 按账户重跑`, platform: "头条 / 字节跳动", api, env: "生产", accounts, span: extra.span || "当天", submitAt: `${day(dayValue)} ${submitTime}`, startedAt: extra.startedAt || `${day(dayValue)} ${submitTime}`, cost, status, submitter: extra.submitter || "曾祥竞", trace, reason: extra.reason || "", paramText: `广告主 ID：${extra.accountText || "123456, 789012"}\n管理员账户 ID：${extra.adminId || "—"}\n应用 ID：${extra.appId || "主应用（直投）"}\n时间范围：${extra.span || "当天"}` });
      const trace = seed => `tcb-${seed}4f8d2a9c1e7b0a3f`;
      const seedLogs = [
        mkLog(7, "078", "二级计划分时消耗", "成功", 5, "09:18:42", "14.2s", trace("a71f")),
        mkLog(7, "077", "账户分时消耗", "成功", 3, "09:10:06", "12.8s", trace("9c02")),
        mkLog(7, "076", "创意分时消耗", "成功", 2, "09:02:31", "9.6s", trace("f3e8")),
        mkLog(7, "075", "账户分时消耗", "成功", 8, "08:55:18", "16.4s", trace("b58a")),
        mkLog(7, "074", "二级计划分时消耗", "失败", 4, "08:47:55", "27.3s", trace("d21c"), { reason: "上游接口 500：时间窗内无数据，请重试或联系媒体侧确认调度是否正常。", span: "近 7 天" }),
        mkLog(7, "073", "账户分时消耗", "成功", 6, "08:40:12", "13.1s", trace("77be")),
        mkLog(7, "072", "创意分时消耗", "成功", 3, "08:33:47", "10.2s", trace("e5a0")),
        mkLog(7, "071", "账户分时消耗", "执行中", 5, "08:26:19", "—", trace("1de4"), { startedAt: `${day(7)} 08:26:19`, cost: "—" }),
        mkLog(6, "070", "二级计划分时消耗", "成功", 7, "22:41:33", "15.8s", trace("ab5f")),
        mkLog(6, "069", "账户分时消耗", "成功", 4, "22:30:27", "11.9s", trace("c7d9")),
        mkLog(6, "068", "创意分时消耗", "成功", 2, "22:24:08", "8.7s", trace("90e2")),
        mkLog(6, "067", "账户分时消耗", "成功", 9, "22:15:51", "17.6s", trace("44b1")),
        mkLog(6, "066", "账户分时消耗", "排队中", 3, "22:06:14", "—", trace("8f7a"), { startedAt: "—", span: "近 3 天" })
      ];
      return {
        platforms: OPS_TOOL_OPTIONS.platforms,
        bfPlatform: OPS_TOOL_OPTIONS.platforms[0],
        bfApi: "账户分时消耗",
        bfEnv: "生产",
        envOptions: OPS_TOOL_OPTIONS.envOptions,
        apiOptions: OPS_TOOL_OPTIONS.apiOptions,
        apiPaths: OPS_TOOL_OPTIONS.apiPaths,
        accounts: "20894512, 20894513",
        rangeType: "过去N小时",
        rangeN: 24,
        customRange: null,
        adminId: "",
        appIdList: [],
        appOptions: OPS_TOOL_OPTIONS.appOptions,
        recent: [],
        backfillSubmitting: false,
        backfillProgress: 0,
        backfillTimer: null,
        seq: 10079,
        logRange: [day(7), day(7)],
        logApi: "全部",
        logStatus: "全部",
        logKeyword: "",
        logTrace: "",
        statusOptions: ["全部", "排队中", "执行中", "成功", "失败"],
        logPage: 1,
        logPageSize: 10,
        logDetailVisible: false,
        logDetail: null,
        logDialogVisible: false,
        logs: seedLogs
      };
    },
    computed: {
      apiPath() { return this.apiPaths[this.bfApi] || ""; },
      spanText() {
        if (this.rangeType === "自定义日期") return this.customRange && this.customRange[0] ? `${this.customRange[0]} ~ ${this.customRange[1]}` : "自定义日期";
        if (this.rangeType === "过去第N天") return `过去第${this.rangeN || 1}天`;
        const unit = { "过去N小时": "小时", "过去N天": "天", "过去N月": "月", "过去N周": "周" }[this.rangeType];
        if (unit) return `过去${this.rangeN || 1}${unit}`;
        return this.rangeType;
      },
      filteredLogs() {
        const from = this.logRange && this.logRange[0];
        const to = this.logRange && this.logRange[1];
        const keyword = this.logKeyword.trim().toLowerCase();
        return this.logs.filter(row => (!from || row.day >= from) && (!to || row.day <= to) && (this.logApi === "全部" || row.api === this.logApi) && (this.logStatus === "全部" || row.status === this.logStatus) && (!keyword || row.name.toLowerCase().includes(keyword)) && (!this.logTrace.trim() || row.trace.includes(this.logTrace.trim())));
      },
      pagedLogs() { const result = paginate(this.filteredLogs, this.logPage, this.logPageSize); if (result.safePage !== this.logPage) this.logPage = result.safePage; return result.rows; },
      logRangeText() { if (!this.filteredLogs.length) return "0-0"; return `${(this.logPage - 1) * this.logPageSize + 1}-${Math.min(this.logPage * this.logPageSize, this.filteredLogs.length)}`; }
    },
    methods: {
      statusType(status) { if (status === "成功") return "success"; if (status === "失败") return "danger"; if (status === "执行中") return "warning"; return "info"; },
      onRangeTypeChange(value) {
        const defaults = { "过去N小时": 24, "过去N天": 7, "过去N月": 1, "过去N周": 1, "过去第N天": 1 };
        if (value in defaults) this.rangeN = defaults[value];
      },
      downloadCsvTemplate() {
        const blob = new Blob(["account_id\n20894512\n20894513\n"], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "广告主ID模板.csv";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      },
      handleCsvUpload(file) {
        const raw = (file && file.raw) || file;
        if (!raw || typeof FileReader === "undefined") return ep.ElMessage.warning("当前浏览器不支持文件读取");
        const reader = new FileReader();
        reader.onload = () => {
          const ids = [...new Set(String(reader.result || "").split(/\r?\n/).map(line => line.trim()).filter(line => /^\d+$/.test(line)))];
          if (!ids.length) return ep.ElMessage.warning("CSV 中未解析到账户 ID（需要单列纯数字 ID）");
          const existing = this.accounts.split(/[,，\s]+/).map(item => item.trim()).filter(Boolean);
          const merged = [...new Set([...existing, ...ids])].slice(0, 1000);
          this.accounts = merged.join(",");
          ep.ElMessage.success(`已从 CSV 解析 ${ids.length} 个账户 ID，合并后共 ${merged.length} 个（最多 1000 个）`);
        };
        reader.onerror = () => ep.ElMessage.warning("CSV 读取失败，请重试");
        reader.readAsText(raw);
      },
      submitBackfill() {
        if (!canEditMenu("补数据")) return denyEdit();
        const list = this.accounts.split(/[,，\s]+/).map(item => item.trim()).filter(Boolean);
        if (!list.length) return ep.ElMessage.warning("「广告主 ID（账户）」不能为空");
        if (!this.appIdList.length) return ep.ElMessage.warning("请选择「应用 ID」（可多选，至少选择 1 个）");
        if (this.rangeType === "自定义日期" && (!this.customRange || !this.customRange[0])) return ep.ElMessage.warning("请选择自定义日期范围");
        if (["过去N小时", "过去N天", "过去N月", "过去N周", "过去第N天"].includes(this.rangeType) && !(this.rangeN >= 1)) return ep.ElMessage.warning("请填写 N 的取值");
        if (this.backfillSubmitting) return;
        this.backfillSubmitting = true;
        this.backfillProgress = 0;
        clearInterval(this.backfillTimer);
        this.backfillTimer = setInterval(() => {
          if (this.backfillProgress < 92) this.backfillProgress = Math.min(92, this.backfillProgress + Math.floor(6 + Math.random() * 10));
        }, 220);
        const now = new Date();
        const pad = value => String(value).padStart(2, "0");
        const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        const id = `TR${day.replace(/-/g, "")}${String(this.seq++).padStart(4, "0")}`;
        const row = { id, day, name: `${this.bfApi} · 按账户重跑`, platform: this.bfPlatform, api: this.bfApi, env: this.bfEnv, accounts: list.length, span: this.spanText, submitAt: `${day} ${time}`, startedAt: "—", cost: "—", status: "执行中", submitter: "曾祥竞", trace: `tcb-${Array.from({ length: 12 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`, reason: "", paramText: `广告主 ID：${list.join(", ")}\n管理员账户 ID：${this.adminId.trim() || "—"}\n应用 ID：${this.appIdList.join("、")}\n时间范围：${this.spanText}` };
        this.logs.unshift(row);
        this.recent.unshift({ id: row.id, name: row.name, span: row.span, startedAt: `${day} ${time}`, status: "执行中" });
        this.logPage = 1;
        ep.ElMessage.success(`已提交 ${list.length} 个账户的补数任务（${this.bfApi}），实际入库在后台完成`);
        setTimeout(() => {
          clearInterval(this.backfillTimer);
          this.backfillProgress = 100;
          row.status = "成功";
          row.cost = "18.4s";
          if (this.recent[0] && this.recent[0].id === row.id) this.recent[0].status = "成功";
          ep.ElMessage.success(`任务 ${row.id} 执行成功`);
          setTimeout(() => { this.backfillSubmitting = false; }, 600);
        }, 2600);
      }
    }
  };
  mount("#toolBackfillView", ToolBackfillApp, "tool-backfill");
})();
