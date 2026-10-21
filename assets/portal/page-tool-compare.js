/**
 * 页面：tool-compare
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
    paginate,
    refreshTick,
    state
  } = window.PortalVue;


  const ToolCompareApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          ${TOOL_META_TEMPLATE("消耗对比", "以账户分时表 (hour_data) 为基准，与二级计划分时表 (ad_hour_data) 或创意分时表 (new_creative_hour_data_v2) 两两对比。")}
          <div style="padding:14px 20px 20px">
            <div v-if="reportBatchList.length" class="portal-vue-batch-panel">
              <div class="portal-vue-batch-head">
                <div><strong>最近上报批次</strong><span class="portal-vue-muted">业务侧上报的账户批次，消耗数据由系统自动拉取</span></div>
                <el-tag size="small" effect="plain">{{ reportBatchList.length }} 个批次</el-tag>
              </div>
              <el-table :data="reportBatchList" class="portal-vue-table" border>
                <el-table-column prop="id" label="批次号" width="160"><template #default="scope"><code class="portal-vue-code">{{ scope.row.id }}</code></template></el-table-column>
                <el-table-column prop="submitter" label="上报人" width="100"></el-table-column>
                <el-table-column prop="submittedAt" label="上报时间" width="150"></el-table-column>
                <el-table-column label="账户数" width="90" align="center"><template #default="scope">{{ scope.row.accounts }}</template></el-table-column>
                <el-table-column prop="note" label="说明" min-width="220" show-overflow-tooltip></el-table-column>
                <el-table-column label="操作" width="110" align="center">
                  <template #default="scope">
                    <el-button link type="primary" @click="bringBatch(scope.row)">带入账户</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </div>
            <el-alert type="info" :closable="false" show-icon title="各表调度频率不同，短时间内单一两个小时数据对不齐属于正常现象" description="账户分时表每 5 / 20 / 30 分钟更新（分高、中、低三个频次间隔）；二级计划分时表每 10 / 60 / 120 分钟更新；创意分时表每小时更新一次。" style="margin-bottom:16px" />
            <el-form label-position="top" class="portal-vue-dialog-form portal-vue-compare-form">
              <el-form-item label="环境">
                <el-select v-model="cmpEnv" style="width:200px"><el-option v-for="item in envOptions" :key="item" :label="item" :value="item"></el-option></el-select>
              </el-form-item>
              <el-form-item label="对比模式">
                <el-select v-model="cmpMode" style="width:340px"><el-option label="账户分时 vs 二级计划分时" value="二级计划分时"></el-option><el-option label="账户分时 vs 创意分时" value="创意分时"></el-option></el-select>
              </el-form-item>
              <el-form-item label="时间范围">
                <el-radio-group v-model="cmpDateType">
                  <el-radio-button label="指定日期"></el-radio-button>
                  <el-radio-button label="指定小时"></el-radio-button>
                  <el-radio-button label="指定小时范围"></el-radio-button>
                </el-radio-group>
                <div class="portal-vue-compare-dates">
                  <el-date-picker v-model="cmpDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width:220px"></el-date-picker>
                  <template v-if="cmpDateType === '指定小时'"><span class="portal-vue-muted">小时</span><el-select v-model="cmpHour" style="width:110px"><el-option v-for="h in hours" :key="h" :label="pad(h)" :value="h"></el-option></el-select></template>
                  <template v-if="cmpDateType === '指定小时范围'"><span class="portal-vue-muted">从</span><el-select v-model="cmpHourStart" style="width:110px"><el-option v-for="h in hours" :key="h" :label="pad(h)" :value="h"></el-option></el-select><span class="portal-vue-muted">到</span><el-select v-model="cmpHourEnd" style="width:110px"><el-option v-for="h in hours" :key="h" :label="pad(h)" :value="h"></el-option></el-select></template>
                </div>
              </el-form-item>
              <el-form-item label="广告账户 ID（可选）">
                <el-input v-model="cmpAccount" placeholder="多个账户用逗号分隔，如：12345,67890" style="max-width:480px"></el-input>
              </el-form-item>
              <el-form-item label="差异阈值（元）">
                <el-input-number v-model="cmpThreshold" :precision="2" :step="0.5" :min="0" style="width:200px"></el-input-number>
              </el-form-item>
            </el-form>
            <div style="display:flex;gap:12px;align-items:center;margin-bottom:14px">
              <el-button type="primary" @click="runCompare">🔍 查询对比</el-button>
              <el-tooltip :disabled="canEdit('消耗对比')" content="需要「消耗对比」的编辑权限，请联系管理员开通" placement="top">
                <span><el-button plain :disabled="!canEdit('消耗对比') || !compareMeta" @click="exportCompare">⬇ 导出差异账户 CSV</el-button></span>
              </el-tooltip>
            </div>
            <template v-if="compareMeta">
              <h3 class="portal-vue-compare-title">汇总</h3>
              <div class="portal-vue-kpis" style="margin-top:0">
                <div class="portal-vue-kpi"><span>账户总数</span><strong>{{ compareMeta.accounts.toLocaleString() }}</strong></div>
                <div class="portal-vue-kpi"><span>有差异账户</span><strong>{{ diffAccounts.length.toLocaleString() }}</strong></div>
                <div class="portal-vue-kpi"><span>账户分时总消耗</span><strong>{{ fmtMoney(totalA) }}</strong></div>
                <div class="portal-vue-kpi"><span>{{ cmpMode }}总消耗</span><strong>{{ fmtMoney(totalB) }}</strong></div>
              </div>
              <h3 class="portal-vue-compare-title" style="margin-top:20px">差异账户（{{ diffAccounts.length }}个）</h3>
              <p class="portal-vue-compare-note">仅展示差异绝对值&gt;{{ compareMeta.threshold.toFixed(2) }}元的账户，按差异绝对值降序排列</p>
              <el-table :data="diffAccounts" class="portal-vue-table" border empty-text="无差异账户">
                <el-table-column label="广告账户ID" min-width="200"><template #default="scope"><code class="portal-vue-code">{{ scope.row.accId }}</code></template></el-table-column>
                <el-table-column label="账户分时消耗" min-width="150" align="right"><template #default="scope">{{ fmt2(scope.row.a) }}</template></el-table-column>
                <el-table-column :label="cmpMode + '消耗'" min-width="150" align="right"><template #default="scope">{{ fmt2(scope.row.b) }}</template></el-table-column>
                <el-table-column :label="'差异(' + cmpMode + '-账户)'" min-width="170" align="right"><template #default="scope">{{ fmt2(scope.row.diff) }}</template></el-table-column>
                <el-table-column :label="'差异%(' + cmpMode + ')'" min-width="150" align="right"><template #default="scope">{{ fmt2(scope.row.rate) }}%</template></el-table-column>
              </el-table>
              <div class="portal-vue-compare-ids"><span class="portal-vue-muted">差异账户ID（可直接复制）：</span><code class="portal-vue-code">{{ diffIdsText }}</code><el-button link type="primary" @click="copyDiffIds">复制</el-button></div>
            </template>
            <p v-else class="portal-vue-muted">选择对比模式和时间范围后点击「查询对比」。</p>
          </div>
        </section>
      </el-config-provider>
    `,
    data: () => {
      const pad = value => String(value).padStart(2, "0");
      const day = value => `2026-09-${pad(value)}`;
      return {
        envOptions: OPS_TOOL_OPTIONS.envOptions,
        cmpMode: "二级计划分时",
        cmpEnv: "生产",
        cmpDateType: "指定日期",
        cmpDate: day(6),
        cmpHour: 18,
        cmpHourStart: 10,
        cmpHourEnd: 12,
        hours: Array.from({ length: 24 }, (_, index) => index),
        cmpAccount: "",
        broughtBatchId: "",
        cmpThreshold: 1,
        onlyDiff: false,
        compareMeta: null,
        compareRows: [],
        cmpPage: 1,
        cmpPageSize: 10
      };
    },
    computed: {
      compareTable() { return this.cmpMode === "二级计划分时" ? "ad_hour_data" : "new_creative_hour_data_v2"; },
      reportBatchList() { refreshTick.value; return [...state.reportBatches].slice(0, 5); },
      cmpAccountIds() { return this.cmpAccount.split(/[,，\s]+/).map(item => item.trim()).filter(Boolean); },
      cmpSpanText() {
        const pad = value => String(value).padStart(2, "0");
        if (this.cmpDateType === "指定日期") return `${this.cmpDate} 全天`;
        if (this.cmpDateType === "指定小时") return `${this.cmpDate} ${pad(this.cmpHour)}:00`;
        return `${this.cmpDate} ${pad(this.cmpHourStart)}:00 ~ ${pad(this.cmpHourEnd)}:00`;
      },
      filteredCompare() { return this.onlyDiff ? this.compareRows.filter(row => row.status === "差异") : this.compareRows; },
      pagedCompare() { const result = paginate(this.filteredCompare, this.cmpPage, this.cmpPageSize); if (result.safePage !== this.cmpPage) this.cmpPage = result.safePage; return result.rows; },
      cmpRangeText() { if (!this.filteredCompare.length) return "0-0"; return `${(this.cmpPage - 1) * this.cmpPageSize + 1}-${Math.min(this.cmpPage * this.cmpPageSize, this.filteredCompare.length)}`; },
      diffAccounts() {
        const threshold = this.compareMeta ? Number(this.compareMeta.threshold || 0) : 0;
        const grouped = new Map();
        this.compareRows.forEach(row => {
          const item = grouped.get(row.accId) || { accId: row.accId, a: 0, b: 0 };
          item.a += Number(row.a || 0);
          item.b += Number(row.b || 0);
          grouped.set(row.accId, item);
        });
        return [...grouped.values()].map(item => {
          const a = +item.a.toFixed(2);
          const b = +item.b.toFixed(2);
          const diff = +(b - a).toFixed(2);
          return { accId: item.accId, a, b, diff, rate: a ? +((diff / a) * 100).toFixed(2) : 0 };
        }).filter(item => Math.abs(item.diff) > threshold).sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
      },
      totalA() { return +this.compareRows.reduce((sum, row) => sum + Number(row.a || 0), 0).toFixed(2); },
      totalB() { return +this.compareRows.reduce((sum, row) => sum + Number(row.b || 0), 0).toFixed(2); },
      diffIdsText() { return this.diffAccounts.map(item => item.accId).join(" "); }
    },
    methods: {
      pad(value) { return String(value).padStart(2, "0"); },
      bringBatch(batch) {
        const ids = batch.accountIds || [];
        this.cmpAccount = ids.join(", ");
        this.broughtBatchId = batch.id;
        ep.ElMessage.success(`已带入批次 ${batch.id} 的 ${ids.length} 个账户，点「查询对比」查看差异`);
      },
      fmt2(value) { return Number(value || 0).toFixed(2); },
      fmtMoney(value) { return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
      copyDiffIds() {
        const text = this.diffIdsText;
        if (!text) return ep.ElMessage.warning("暂无差异账户ID可复制");
        const done = () => ep.ElMessage.success(`已复制 ${this.diffAccounts.length} 个差异账户ID`);
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(() => ep.ElMessage.warning("复制失败，请手动选择复制"));
        else {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand("copy"); done(); } catch (e) { ep.ElMessage.warning("复制失败，请手动选择复制"); }
          document.body.removeChild(ta);
        }
      },
      exportCompare() {
        if (!canEditMenu("消耗对比")) return denyEdit();
        const rows = this.diffAccounts;
        if (!rows.length) return ep.ElMessage.warning("暂无可导出的差异账户");
        const csv = ["广告账户ID,账户分时消耗," + this.cmpMode + "消耗,差异,差异%"].concat(rows.map(row => [row.accId, row.a, row.b, row.diff, row.rate].join(","))).join("\n");
        const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `消耗差异账户_${this.cmpDate}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        ep.ElMessage.success(`已导出 ${rows.length} 个差异账户`);
      },
      runCompare() {
        const accs = [
          { name: "权益-信息流主账户", id: "20894512" }, { name: "巨量-权益账户B", id: "20894513" },
          { name: "存量-巨量账户C", id: "20894514" }, { name: "号卡-巨量账户D", id: "20894515" },
          { name: "达人-巨量账户E", id: "20894516" }, { name: "保险-巨量账户F", id: "20894517" },
          { name: "权益-广点通账户G", id: "20894518" }, { name: "存量-信息流账户H", id: "20894519" },
          { name: "创新-巨量账户I", id: "20894520" }, { name: "CPA-巨量账户J", id: "20894521" }
        ];
        const times = this.cmpDateType === "指定日期" ? ["全天"] : this.cmpDateType === "指定小时" ? [String(this.cmpHour)] : Array.from({ length: this.cmpHourEnd - this.cmpHourStart + 1 }, (_, index) => String(this.cmpHourStart + index));
        const threshold = Number(this.cmpThreshold || 0);
        const rows = [];
        times.forEach((hour, timeIndex) => {
          accs.forEach((acc, accIndex) => {
            const base = +(240 + ((accIndex * 37 + timeIndex * 13) % 260)).toFixed(2);
            let compared;
            if ((accIndex + timeIndex) % 5 === 0) {
              const sign = (accIndex * 7 + timeIndex * 3) % 5 === 0 ? -1 : 1;
              compared = +(base * (1 + sign * (0.06 + ((accIndex + timeIndex) % 4) * 0.04))).toFixed(2);
            } else {
              compared = +((accIndex + timeIndex) % 3 === 0 ? base + 0.3 : base).toFixed(2);
            }
            const diff = +(base - compared).toFixed(2);
            const status = Math.abs(diff) > threshold ? "差异" : "一致";
            rows.push({ time: this.cmpDateType === "指定日期" ? `${this.cmpDate} 全天` : `${this.cmpDate} ${String(hour).padStart(2, "0")}:00`, acc: acc.name, accId: acc.id, a: base, b: compared, diff, rate: Math.abs(diff) / base * 100, status, matched: this.cmpAccountIds.length ? this.cmpAccountIds.some(id => acc.id.includes(id)) : true });
          });
        });
        const shown = this.cmpAccountIds.length ? rows.filter(row => row.matched) : rows;
        this.compareRows = shown;
        this.compareMeta = { mode: this.cmpMode, table: this.compareTable, env: this.cmpEnv, span: this.cmpSpanText, total: shown.length, diff: shown.filter(row => row.status === "差异").length, accounts: new Set(shown.map(row => row.accId)).size, threshold };
        this.cmpPage = 1;
        ep.ElMessage.success(`已生成对比结果：${this.compareMeta.diff} 条差异记录（阈值 ≥ ${threshold} 元）`);
      }
    }
  };
  mount("#toolCompareView", ToolCompareApp, "tool-compare");
})();
