/**
 * 页面：drama-report
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    TOOL_META_TEMPLATE,
    bridge,
    canEditMenu,
    denyEdit,
    ep,
    mount,
    refreshTick,
    state
  } = window.PortalVue;


  /* 账户维度表（原型示意）：用于「短剧投放账户上报」校验账户是否存在 */
  const ACCOUNT_DIMENSION_SEED = ["20894512", "20894513", "20894514", "20894515", "20894516", "20894517", "20894518", "20894519", "20894520", "20894521"];

  /* ===== 业务工具箱 · 工具 B：短剧投放账户上报（校验 + 提交生成批次） ===== */

  const DramaReportApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          ${TOOL_META_TEMPLATE("短剧投放账户上报", "上报本期要投的短剧广告账户；校验通过后提交即生成批次，本批账户的消耗数据由系统自动拉取。", "业务工具箱")}
          <div style="padding:14px 20px 20px">
            <el-alert v-if="submitReceipt" type="success" :closable="false" show-icon :title="submitReceipt.title" :description="submitReceipt.body" style="margin-bottom:16px" />
            <div class="portal-vue-tool-section">
              <div class="portal-vue-tool-section-head">1 · 输入账户清单</div>
              <div class="form-field">
                <label>粘贴账户清单（支持逗号 / Tab / 空格分隔，可带表头「账户ID,媒体」）</label>
                <el-input v-model="rawText" type="textarea" :rows="7" :disabled="!canEdit('短剧投放账户上报')" placeholder="账户ID,媒体&#10;20894517,巨量&#10;20894518,广点通"></el-input>
              </div>
              <div class="portal-vue-csv-row">
                <el-upload action="#" :auto-upload="false" :show-file-list="false" accept=".csv,.txt" :on-change="handleFile">
                  <template #trigger><el-button v-if="canEdit('短剧投放账户上报')">⬆ 上传文件</el-button></template>
                </el-upload>
                <span class="portal-vue-muted">支持 .csv / .txt，单列账户 ID 或「账户ID + 媒体」两列</span>
                <el-button link type="primary" @click="loadSample">载入示例</el-button>
                <el-button link type="primary" :disabled="!rawText" @click="reset">清空</el-button>
              </div>
              <div v-if="columns.length > 1" class="portal-vue-form-row" style="margin-top:12px">
                <div class="form-field" style="width:240px">
                  <label>账户 ID 所在列</label>
                  <el-select v-model="idColumn" style="width:100%">
                    <el-option v-for="(label, index) in columns" :key="index" :label="label" :value="index"></el-option>
                  </el-select>
                </div>
                <div class="form-field" style="width:240px">
                  <label>媒体所在列</label>
                  <el-select v-model="mediaColumn" style="width:100%">
                    <el-option label="不指定（媒体记未知）" :value="-1"></el-option>
                    <el-option v-for="(label, index) in columns" :key="index" :label="label" :value="index"></el-option>
                  </el-select>
                </div>
              </div>
              <div class="portal-vue-tool-actions">
                <el-tooltip :disabled="canEdit('短剧投放账户上报')" content="需要「短剧投放账户上报」的编辑权限，请联系管理员开通" placement="top">
                  <span><el-button type="primary" :disabled="!canEdit('短剧投放账户上报') || !rawText.trim()" @click="validate">校验</el-button></span>
                </el-tooltip>
              </div>
            </div>

            <div v-if="report" class="portal-vue-tool-section">
              <div class="portal-vue-tool-section-head">2 · 校验结果</div>
              <div class="portal-vue-kpis">
                <div class="portal-vue-kpi"><span>总行数</span><strong>{{ report.total }}</strong></div>
                <div class="portal-vue-kpi"><span>可上报账户</span><strong>{{ report.valid }}</strong></div>
                <div class="portal-vue-kpi"><span>错误</span><strong>{{ report.errors.length }}</strong></div>
                <div class="portal-vue-kpi"><span>警告</span><strong>{{ report.warnings.length }}</strong></div>
                <div class="portal-vue-kpi"><span>对比上批次</span><strong>{{ diffText }}</strong></div>
              </div>
              <el-alert v-if="report.errors.length" type="error" :closable="false" show-icon :title="report.errors.length + ' 行必须修正后才能上报'" description="错误行不会被剔除：请修正后重新校验，避免漏报账户。警告行会保留并在批次里留痕，不影响提交。" style="margin-top:12px" />
              <el-table v-if="report.issues.length" :data="report.issues" class="portal-vue-table" border max-height="280" style="margin-top:12px">
                <el-table-column prop="line" label="行号" width="80"></el-table-column>
                <el-table-column prop="level" label="级别" width="90"><template #default="scope"><el-tag size="small" :type="scope.row.level === '错误' ? 'danger' : 'warning'" effect="light">{{ scope.row.level }}</el-tag></template></el-table-column>
                <el-table-column label="账户 ID" min-width="160"><template #default="scope"><code class="portal-vue-code">{{ scope.row.accountId || "—" }}</code></template></el-table-column>
                <el-table-column prop="reason" label="原因" min-width="240"></el-table-column>
              </el-table>
              <div class="portal-vue-section-line" style="margin-top:18px"><h3>与上一批次差异</h3></div>
              <p class="portal-vue-muted" style="margin:0">上一批次 {{ previousBatch ? previousBatch.id + "（" + previousBatch.accounts + " 个账户）" : "暂无" }}；本期新增 {{ diff.added.length }} 个、移除 {{ diff.removed.length }} 个。</p>
              <div class="portal-vue-diff-row">
                <span class="portal-vue-muted">新增：</span><template v-if="diff.added.length"><el-tag v-for="id in diff.added" :key="'add-' + id" size="small" type="success" effect="plain" class="portal-vue-diff-tag">{{ id }}</el-tag></template><span v-else class="portal-vue-muted">无</span>
              </div>
              <div class="portal-vue-diff-row">
                <span class="portal-vue-muted">移除：</span><template v-if="diff.removed.length"><el-tag v-for="id in diff.removed" :key="'del-' + id" size="small" type="danger" effect="plain" class="portal-vue-diff-tag">{{ id }}</el-tag></template><span v-else class="portal-vue-muted">无</span>
              </div>
              <div class="portal-vue-tool-actions">
                <el-tooltip :disabled="canEdit('短剧投放账户上报')" content="需要「短剧投放账户上报」的编辑权限，请联系管理员开通" placement="top">
                  <span><el-button type="primary" :disabled="!canEdit('短剧投放账户上报') || !report.valid || report.errors.length > 0" :loading="submitting" @click="submit">提交上报批次</el-button></span>
                </el-tooltip>
                <span class="portal-vue-muted">校验通过后提交即生成批次，本批账户的消耗数据由系统自动拉取；大数据侧在「消耗对比」里按批次带入账户核对。</span>
              </div>
            </div>

            <div class="portal-vue-tool-section">
              <div class="portal-vue-tool-section-head">历史批次</div>
              <el-table :data="batches" class="portal-vue-table" border empty-text="还没有上报批次">
                <el-table-column prop="id" label="批次号" width="160"></el-table-column>
                <el-table-column prop="submittedAt" label="上报时间" width="150"></el-table-column>
                <el-table-column prop="submitter" label="上报人" width="100"></el-table-column>
                <el-table-column prop="media" label="媒体" width="140"></el-table-column>
                <el-table-column prop="accounts" label="账户数" width="90" align="center"></el-table-column>
                <el-table-column prop="checked" label="校验" width="150"></el-table-column>
                <el-table-column label="操作" width="130" align="center">
                  <template #default="scope">
                    <el-button link type="primary" @click="gotoCompare">查看消耗对比</el-button>
                  </template>
                </el-table-column>
              </el-table>
              <p class="portal-vue-muted" style="margin:10px 0 0">批次提交后消耗数据由系统自动拉取，不支持撤回；如需修正请补报新批次。</p>
            </div>
          </div>
        </section>
      </el-config-provider>
    `,
    data: () => ({
      rawText: "",
      parsed: null,
      idColumn: 0,
      mediaColumn: -1,
      report: null,
      submitting: false,
      submitReceipt: null
    }),
    computed: {
      /* 桥接层对批次数组做的是原地 unshift，若直接把同一个数组引用交给 el-table，
         表格不会重渲染（新增批次看不见）；这里返回副本强制刷新。 */
      batches() { refreshTick.value; return [...state.reportBatches]; },
      previousBatch() { return this.batches[1] || null; },
      columns() {
        if (!this.parsed) return [];
        const header = this.parsed.header;
        return Array.from({ length: this.parsed.width }, (_, index) => (header && header[index]) ? `${header[index]}（第 ${index + 1} 列）` : `第 ${index + 1} 列`);
      },
      diff() {
        const previous = new Set((this.previousBatch && this.previousBatch.accountIds) || []);
        const current = new Set((this.report && this.report.values) || []);
        return {
          added: [...current].filter(id => !previous.has(id)),
          removed: [...previous].filter(id => !current.has(id))
        };
      },
      diffText() {
        if (!this.report) return "—";
        return `+${this.diff.added.length} / -${this.diff.removed.length}`;
      }
    },
    methods: {
      reset() { this.report = null; this.parsed = null; this.submitReceipt = null; this.idColumn = 0; this.mediaColumn = -1; },
      loadSample() {
        this.rawText = "账户ID,媒体\n20894517,巨量\n20894518,广点通\n20894519,巨量\n20894521,巨量\n20894599,巨量\n20894517,巨量";
        this.reset();
      },
      parse(raw) {
        const lines = String(raw || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const rows = lines.map(line => line.split(/[,\t;]+|\s{2,}/).map(cell => cell.trim()).filter(cell => cell !== ""));
        const width = rows.reduce((max, row) => Math.max(max, row.length), 1);
        const looksLikeHeader = rows.length > 1 && rows[0].some(cell => !/^\d{6,}$/.test(cell));
        const header = looksLikeHeader ? rows[0] : null;
        if (header) {
          const idIndex = header.findIndex(cell => /账户|id/i.test(cell));
          if (idIndex >= 0) this.idColumn = idIndex;
          if (this.mediaColumn < 0) {
            const mediaIndex = header.findIndex(cell => /媒体|平台/.test(cell));
            if (mediaIndex >= 0) this.mediaColumn = mediaIndex;
          }
        }
        return { header, rows: looksLikeHeader ? rows.slice(1) : rows, width };
      },
      handleFile(file) {
        const raw = (file && file.raw) || file;
        if (!raw || typeof FileReader === "undefined") return ep.ElMessage.warning("当前浏览器不支持文件读取");
        const reader = new FileReader();
        reader.onload = () => {
          this.rawText = String(reader.result || "");
          this.reset();
          this.parsed = this.parse(this.rawText);
          ep.ElMessage.success(`已读取 ${this.parsed.rows.length} 行，识别到 ${this.parsed.width} 列`);
        };
        reader.onerror = () => ep.ElMessage.warning("文件读取失败，请重试");
        reader.readAsText(raw);
      },
      validate() {
        const parsed = this.parse(this.rawText);
        this.parsed = parsed;
        const idIndex = Math.min(this.idColumn, parsed.width - 1);
        const mediaIndex = this.mediaColumn;
        const seen = new Set();
        const errors = [];
        const warnings = [];
        const issues = [];
        const values = [];
        const mediaOf = new Map();
        parsed.rows.forEach((row, rowIndex) => {
          const line = rowIndex + (parsed.header ? 2 : 1);
          const accountId = (row[idIndex] || "").trim();
          const media = mediaIndex >= 0 ? (row[mediaIndex] || "").trim() : "";
          if (!accountId) { errors.push(line); issues.push({ line, level: "错误", accountId, reason: "账户 ID 为空" }); return; }
          if (!/^\d{6,}$/.test(accountId)) { errors.push(line); issues.push({ line, level: "错误", accountId, reason: "账户 ID 必须是 6 位以上纯数字" }); return; }
          if (!ACCOUNT_DIMENSION_SEED.includes(accountId)) { warnings.push(line); issues.push({ line, level: "警告", accountId, reason: "账户维度表里查不到该账户，请确认是否已在媒体侧创建" }); }
          if (!media && mediaIndex >= 0) { warnings.push(line); issues.push({ line, level: "警告", accountId, reason: "媒体为空，按「未知媒体」上报" }); }
          if (media && !["巨量", "广点通"].includes(media)) { warnings.push(line); issues.push({ line, level: "警告", accountId, reason: `媒体「${media}」不在支持的取值里（巨量 / 广点通）` }); }
          if (seen.has(accountId)) { warnings.push(line); issues.push({ line, level: "警告", accountId, reason: "该账户在本批次里重复出现，已按一条处理" }); return; }
          seen.add(accountId);
          values.push(accountId);
          mediaOf.set(accountId, media || "未知");
        });
        const medias = [...new Set(values.map(id => mediaOf.get(id)))];
        this.report = {
          total: parsed.rows.length,
          valid: values.length,
          errors: errors.map(line => ({ line })),
          warnings: warnings.map(line => ({ line })),
          issues,
          values
        };
        this.submitting = false;
        if (!values.length) ep.ElMessage.warning("没有可上报的账户，请检查输入");
        else ep.ElMessage.success(`校验完成：${values.length} 个可上报账户、${errors.length} 个错误、${warnings.length} 个警告`);
        this.report.mediaText = medias.join(" / ");
      },
      submit() {
        if (!canEditMenu("短剧投放账户上报")) return denyEdit();
        if (!this.report || !this.report.values.length) return ep.ElMessage.warning("请先完成校验");
        if (this.report.errors.length) return ep.ElMessage.warning("还有错误行未修正，不能提交");
        this.submitting = true;
        const stamp = new Date();
        const pad = value => String(value).padStart(2, "0");
        const datePart = `${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}`;
        const id = `DR${datePart}${String(this.batches.length + 1).padStart(3, "0")}`;
        const batch = {
          id,
          submittedAt: `${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())} ${pad(stamp.getHours())}:${pad(stamp.getMinutes())}`,
          submitter: "曾祥竞",
          media: this.report.mediaText || "未知",
          accounts: this.report.values.length,
          checked: `通过（${this.report.warnings.length} 条警告）`,
          note: `本期上报 ${this.report.values.length} 个短剧投放账户，消耗数据由系统自动拉取`,
          accountIds: [...this.report.values]
        };
        bridge.addReportBatch(batch);
        this.submitReceipt = { title: `批次 ${id} 已提交`, body: `共 ${batch.accounts} 个账户（${batch.media}），系统已开始拉取本批账户的消耗数据；大数据侧可在「消耗对比」里带入该批账户核对差异。` };
        this.submitting = false;
        this.report = null;
        this.rawText = "";
        ep.ElMessage.success(`已提交批次 ${id}，本批账户的消耗数据由系统自动拉取`);
      },
      gotoCompare() { bridge.setPage("消耗对比"); }
    }
  };
  mount("#dramaReportView", DramaReportApp, "drama-report");
})();
