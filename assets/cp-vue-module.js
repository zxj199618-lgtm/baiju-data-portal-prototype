(function () {
  "use strict";

  if (!window.Vue || !window.ElementPlus || !window.cpVueBridge) return;

  const { createApp, reactive, nextTick } = window.Vue;
  const bridge = window.cpVueBridge;
  const ep = window.ElementPlus;
  const clone = value => JSON.parse(JSON.stringify(value));

  const state = reactive({
    packages: bridge.packages,
    targets: bridge.targets,
    tables: bridge.tables
  });

  const opMap = {
    "数值": [["gt", "大于"], ["lt", "小于"], ["eq", "等于"], ["gte", "大于等于"], ["lte", "小于等于"], ["between", "区间"], ["notnull", "有值"], ["isnull", "无值"]],
    "文本": [["eq", "等于"], ["ne", "不等于"], ["notnull", "有值"], ["isnull", "无值"]],
    "日期": [["relative", "相对时间"], ["absolute", "绝对时间"], ["notnull", "有值"], ["isnull", "无值"]],
    "数组": [["contains", "包含"], ["notcontains", "不包含"], ["notnull", "有值"], ["isnull", "无值"]],
    "布尔": [["true", "是"], ["false", "否"], ["notnull", "有值"], ["isnull", "无值"]]
  };
  const noValueOps = new Set(["notnull", "isnull", "true", "false"]);
  const outputFields = [
    { value: "oaid", label: "OAID" },
    { value: "oaid_hash", label: "OAID 哈希值" },
    { value: "phone", label: "手机号" },
    { value: "phone_hash", label: "手机号哈希值" }
  ];
  const dmpDataTypes = ["IDFA_MD5", "IMEI_MD5", "MOBILE_HASH_SHA256", "OAID_MD5"];
  const outputFieldLabels = Object.fromEntries(outputFields.map(field => [field.value, field.label]));
  const requirementCategoryDefaults = [
    { name: "权益", code: "EQUITY" },
    { name: "存量", code: "RETAIN" },
    { name: "号卡", code: "HAOKA" },
    { name: "保险", code: "INSURANCE" },
    { name: "达人", code: "CREATOR" }
  ];
  const requirementCategoryCodePattern = /^[A-Z][A-Z0-9_]{0,29}$/;
  const normalizeRequirementCategory = (category, index = 0) => {
    const name = typeof category === "string" ? category : category?.name;
    const code = (typeof category === "object" && category?.code) || requirementCategoryDefaults.find(item => item.name === name)?.code || `CUSTOM_${index + 1}`;
    return { name, code: String(code).trim().toUpperCase() };
  };
  const outputFieldLabel = value => outputFieldLabels[value] || value || "—";
  const isMultiValueType = type => type === "文本" || type === "数组";

  function firstTableName() {
    return state.tables[0] ? state.tables[0].name : "";
  }

  function getTable(tableName) {
    return state.tables.find(table => table.name === tableName) || state.tables[0] || { fields: [] };
  }

  function createCondition(tableName) {
    const field = getTable(tableName).fields[0] || { name: "", type: "文本" };
    const op = (opMap[field.type] || opMap["文本"])[0][0];
    return { field: field.name, op, value: isMultiValueType(field.type) ? [] : "", value1: null, value2: null, range: [] };
  }

  function normalizeCondition(condition, tableName) {
    const field = getTable(tableName).fields.find(item => item.name === condition.field) || { type: "文本" };
    const multiple = isMultiValueType(field.type);
    const value = multiple
      ? (Array.isArray(condition.value) ? condition.value : (condition.value === "" || condition.value == null ? [] : [condition.value]))
      : (Array.isArray(condition.value) ? (condition.value[0] ?? "") : condition.value);
    return { ...condition, value };
  }

  function createForm(pkg) {
    const table = pkg && pkg.mode === "ui" && pkg.table ? pkg.table : firstTableName();
    const conditions = pkg && Array.isArray(pkg.conditions) && pkg.conditions.length
      ? clone(pkg.conditions).map(condition => normalizeCondition(condition, table))
      : [createCondition(table)];
    return {
      name: pkg ? pkg.name || "" : "",
      category: pkg ? pkg.category || "定向包" : "",
      requirementCategory: pkg ? pkg.requirementCategory || "存量" : "",
      desc: pkg ? pkg.desc || "" : "",
      owner: pkg ? pkg.owner || "" : "",
      mode: pkg ? pkg.mode || "ui" : "ui",
      table,
      relation: pkg ? pkg.relation || "AND" : "AND",
      conditions,
      sql: pkg ? pkg.sql || "" : "",
      outputField: pkg && pkg.mode !== "sql" ? ((pkg.fields || [])[0] || "") : "",
      encrypt: pkg && pkg.mode !== "sql" ? (pkg.encrypt || "不加密") : "不加密",
      format: pkg ? pkg.format || "txt" : "txt",
      dmpDataType: pkg && pkg.format === "dmp" ? pkg.dmpDataType || "" : "",
      freq: pkg ? pkg.freq || "每日推送" : "每日推送",
      dailyTime: pkg ? pkg.dailyTime || "03:00" : "03:00",
      hourlyMinute: pkg ? Number(pkg.hourlyMinute ?? 0) : 0,
      channel: pkg ? pkg.channel || "" : "",
      estimatedCover: pkg ? Number(pkg.cover || 0) : 0
    };
  }

  const AUDIENCE_LIMIT = 20000000;
  const validationDelay = (duration) => new Promise(resolve => window.setTimeout(resolve, duration));

  function findTopLevelSqlKeyword(sql, keyword, startAt = 0) {
    const source = String(sql || "");
    const expected = String(keyword || "").toLowerCase();
    let depth = 0;
    let quote = "";
    for (let index = startAt; index < source.length; index += 1) {
      const char = source[index];
      if (quote) {
        if (char === quote) {
          if (source[index + 1] === quote) index += 1;
          else quote = "";
        }
        continue;
      }
      if (char === "'" || char === '"' || char === "`") { quote = char; continue; }
      if (char === "(") { depth += 1; continue; }
      if (char === ")") { depth = Math.max(0, depth - 1); continue; }
      if (depth !== 0 || source.slice(index, index + expected.length).toLowerCase() !== expected) continue;
      const before = source[index - 1] || " ";
      const after = source[index + expected.length] || " ";
      if (!/[a-z0-9_$]/i.test(before) && !/[a-z0-9_$]/i.test(after)) return index;
    }
    return -1;
  }

  function splitTopLevelSqlColumns(source) {
    const columns = [];
    let start = 0;
    let depth = 0;
    let quote = "";
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (quote) {
        if (char === quote) {
          if (source[index + 1] === quote) index += 1;
          else quote = "";
        }
        continue;
      }
      if (char === "'" || char === '"' || char === "`") { quote = char; continue; }
      if (char === "(") { depth += 1; continue; }
      if (char === ")") { depth = Math.max(0, depth - 1); continue; }
      if (char === "," && depth === 0) {
        columns.push(source.slice(start, index).trim());
        start = index + 1;
      }
    }
    columns.push(source.slice(start).trim());
    return columns.filter(Boolean);
  }

  function validateSqlStatement(sql) {
    const source = String(sql || "").trim();
    if (!source) return { error: "SQL 格式校验失败：请填写 SELECT 查询语句。" };
    if (/;\s*\S/.test(source)) return { error: "SQL 格式校验失败：仅支持执行一条 SELECT 查询语句。" };
    const normalized = source.replace(/;\s*$/, "");
    if (/\b(?:insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i.test(normalized)) return { error: "SQL 格式校验失败：仅支持只读 SELECT 查询。" };
    let depth = 0;
    let quote = "";
    for (let index = 0; index < normalized.length; index += 1) {
      const char = normalized[index];
      if (quote) {
        if (char === quote) {
          if (normalized[index + 1] === quote) index += 1;
          else quote = "";
        }
        continue;
      }
      if (char === "'" || char === '"' || char === "`") { quote = char; continue; }
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      if (depth < 0) return { error: "SQL 格式校验失败：括号未正确闭合。" };
    }
    if (quote || depth !== 0) return { error: "SQL 格式校验失败：引号或括号未正确闭合。" };
    const selectIndex = findTopLevelSqlKeyword(normalized, "select");
    const fromIndex = selectIndex < 0 ? -1 : findTopLevelSqlKeyword(normalized, "from", selectIndex + 6);
    if (selectIndex < 0 || fromIndex < 0 || fromIndex <= selectIndex + 6) return { error: "SQL 格式校验失败：请使用 SELECT ... FROM ... 查询。" };
    return { source: normalized, selectIndex, fromIndex };
  }

  function inspectSqlColumns(sql) {
    const statement = validateSqlStatement(sql);
    if (statement.error) return statement;
    const selectClause = statement.source.slice(statement.selectIndex + 6, statement.fromIndex).replace(/^\s*distinct\s+/i, "").trim();
    const columns = splitTopLevelSqlColumns(selectClause);
    if (columns.length !== 1 || columns[0] === "*") return { error: `SQL 结果列校验失败：仅支持查询 1 列标识字段，当前检测到 ${columns[0] === "*" ? "多列" : columns.length + " 列"}。` };
    return { ...statement, columns };
  }

  function inspectSqlDatabases(sql) {
    const statement = validateSqlStatement(sql);
    if (statement.error) return statement;
    const references = [];
    const matcher = /\b(?:from|join)\s+((?:`[^`]+`|[a-z_][\w$]*)(?:\s*\.\s*(?:`[^`]+`|[a-z_][\w$]*)){0,2})/gi;
    let match;
    while ((match = matcher.exec(statement.source))) {
      const parts = match[1].replace(/`/g, "").split(".").map(part => part.trim()).filter(Boolean);
      if (parts.length > 1) references.push(parts[parts.length - 2]);
    }
    const databases = [...new Set(references)];
    if (databases.length > 1) return { error: `SQL 数据库校验失败：检测到跨库查询（${databases.join("、")}），请调整为同一库查询。` };
    return { ...statement, database: databases[0] || "当前库" };
  }

  function parseAudienceHint(sql) {
    const match = String(sql || "").match(/(?:estimated_count|audience_count|mock_count|预估人数)\s*[:=]\s*(\d+(?:\.\d+)?)\s*(万|w|m)?/i);
    if (!match) return 0;
    const value = Number(match[1]);
    if (!Number.isFinite(value)) return 0;
    const unit = String(match[2] || "").toLowerCase();
    return unit === "万" || unit === "w" ? Math.round(value * 10000) : unit === "m" ? Math.round(value * 1000000) : Math.round(value);
  }

  const template = `
    <el-config-provider :locale="locale">
      <div class="manager-view hidden" id="cpListView" v-cloak>
        <section class="panel cp-vue-list-panel">
          <el-tabs v-model="status" class="cp-vue-status-tabs" @tab-click="resetPage">
            <el-tab-pane label="启用中" name="启用"></el-tab-pane>
            <el-tab-pane label="已停用" name="停用"></el-tab-pane>
          </el-tabs>

          <div class="cp-vue-toolbar">
            <div class="cp-vue-toolbar-left">
              <el-input v-model="filters.keyword" class="cp-vue-search" clearable placeholder="搜索人群包名称" @input="resetPage"></el-input>
              <el-select v-model="filters.owner" class="cp-vue-filter" clearable placeholder="全部需求来源" @change="resetPage">
                <el-option v-for="owner in owners" :key="owner" :label="owner" :value="owner"></el-option>
              </el-select>
              <el-select v-model="filters.category" class="cp-vue-filter" clearable placeholder="全部分类" @change="resetPage">
                <el-option label="定向包" value="定向包"></el-option>
                <el-option label="排除包" value="排除包"></el-option>
              </el-select>
              <el-select v-model="filters.mode" class="cp-vue-filter" clearable placeholder="全部圈选方式" @change="resetPage">
                <el-option label="标签圈选" value="ui"></el-option>
                <el-option label="SQL 模式" value="sql"></el-option>
              </el-select>
              <el-select v-model="filters.table" class="cp-vue-table-filter" clearable placeholder="全部圈选表" @change="resetPage">
                <el-option v-for="table in filterTables" :key="table.name" :label="table.cn" :value="table.name"></el-option>
              </el-select>
              <el-select v-model="filters.delivery" class="cp-vue-filter" clearable placeholder="全部交付方式" @change="resetPage">
                <el-option v-for="delivery in deliveryOptions" :key="delivery" :label="delivery" :value="delivery"></el-option>
              </el-select>
            </div>
            <div class="cp-vue-toolbar-actions">
              <el-button plain @click="categoryManagerVisible=true">管理需求分类</el-button>
              <el-button type="primary" @click="createPackage">新建人群包</el-button>
            </div>
          </div>

          <div class="cp-vue-table-wrap">
            <el-table :data="pagedPackages" class="cp-vue-table" row-key="id" empty-text="暂无人群包" border>
              <el-table-column label="人群包名称" prop="name" width="178" fixed="left" show-overflow-tooltip>
                <template #default="scope"><span class="cp-vue-name">{{ scope.row.name }}</span></template>
              </el-table-column>
              <el-table-column label="人群包 ID" width="218" show-overflow-tooltip>
                <template #default="scope"><el-tooltip :content="scope.row.id" placement="top"><code class="cp-vue-audience-id">{{ scope.row.id }}</code></el-tooltip></template>
              </el-table-column>
              <el-table-column label="人群包分类" prop="category" width="96"></el-table-column>
              <el-table-column label="需求分类" prop="requirementCategory" width="106">
                <template #default="scope">{{ scope.row.requirementCategory || '—' }}</template>
              </el-table-column>
              <el-table-column label="需求来源" prop="owner" width="96">
                <template #default="scope">{{ scope.row.owner || '—' }}</template>
              </el-table-column>
              <el-table-column label="人群包说明" prop="desc" width="230" show-overflow-tooltip>
                <template #default="scope">{{ scope.row.desc || '—' }}</template>
              </el-table-column>
              <el-table-column label="状态" width="76" align="center">
                <template #default="scope">
                  <el-switch
                    v-model="scope.row.status"
                    active-value="启用"
                    inactive-value="停用"
                    :before-change="() => confirmStatusChange(scope.row)"
                    @change="value => applyStatusChange(scope.row, value)"
                  ></el-switch>
                </template>
              </el-table-column>
              <el-table-column label="圈选方式" width="98">
                <template #default="scope">{{ scope.row.mode === 'sql' ? 'SQL 模式' : '标签圈选' }}</template>
              </el-table-column>
              <el-table-column label="圈选表" width="170" show-overflow-tooltip>
                <template #default="scope">{{ tableText(scope.row) }}</template>
              </el-table-column>
              <el-table-column label="预估人数 / 覆盖率" width="150">
                <template #default="scope">{{ coverageText(scope.row) }}</template>
              </el-table-column>
              <el-table-column label="输出字段" width="112">
                <template #default="scope">{{ outputText(scope.row) }}</template>
              </el-table-column>
              <el-table-column label="加密方式" width="96">
                <template #default="scope">{{ encryptText(scope.row) }}</template>
              </el-table-column>
              <el-table-column label="交付方式" width="138" show-overflow-tooltip>
                <template #default="scope">{{ deliveryText(scope.row) }}</template>
              </el-table-column>
              <el-table-column label="推送频次" width="108">
                <template #default="scope">{{ frequencyText(scope.row) }}</template>
              </el-table-column>
              <el-table-column label="调度时间" width="138">
                <template #default="scope">{{ scheduleText(scope.row) }}</template>
              </el-table-column>
              <el-table-column label="运行次数" width="88" align="center">
                <template #default="scope">{{ runStats(scope.row).run }} 次</template>
              </el-table-column>
              <el-table-column label="使用次数" width="88" align="center">
                <template #default="scope">{{ runStats(scope.row).used }} 次</template>
              </el-table-column>
              <el-table-column label="上次运行" prop="last" width="176" show-overflow-tooltip></el-table-column>
              <el-table-column label="计算状态" width="180">
                <template #default="scope">
                  <el-tag :type="calcStatus(scope.row).st === '成功' ? 'success' : 'danger'" effect="light">{{ calcStatus(scope.row).st === '成功' ? '计算成功' : '计算失败' }}</el-tag>
                  <p v-if="calcStatus(scope.row).reason" class="cp-vue-status-reason">{{ calcStatus(scope.row).reason }}</p>
                </template>
              </el-table-column>
              <el-table-column label="推送状态" width="190">
                <template #default="scope">
                  <el-tag :type="pushStatus(scope.row).type" effect="light">{{ pushStatus(scope.row).label }}</el-tag>
                  <p v-if="pushStatus(scope.row).reason" class="cp-vue-status-reason">{{ pushStatus(scope.row).reason }}</p>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="260" fixed="right">
                <template #default="scope">
                  <div class="cp-vue-actions">
                    <el-button link type="primary" @click="editPackage(scope.row)">编辑</el-button>
                    <el-button link type="primary" @click="openHistory(scope.row)">运行历史</el-button>
                    <el-button link type="primary" :disabled="scope.row.status !== '启用'" @click="deliver(scope.row, 'run')">立即运行</el-button>
                    <el-button link type="primary" :disabled="scope.row.status !== '启用'" @click="deliver(scope.row, 'export')">导出</el-button>
                  </div>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <div class="cp-vue-pagination">
            <span>共 {{ filteredPackages.length }} 个人群包</span>
            <div style="display:flex;align-items:center;gap:16px">
              <span class="cp-vue-summary">累计运行 {{ aggregateStats.run }} 次 / 已使用 {{ aggregateStats.used }} 次</span>
              <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10, 20, 50]" :total="filteredPackages.length" layout="sizes, prev, pager, next"></el-pagination>
            </div>
          </div>
        </section>

        <el-drawer v-model="runDrawer" :title="runPackage ? '运行历史 · ' + runPackage.name : '运行历史'" size="540px" destroy-on-close :close-on-click-modal="true">
          <div class="cp-vue-run-summary">
            <div><span>累计运行次数</span><strong>{{ runStats(runPackage).run }} 次</strong></div>
            <div><span>使用次数</span><strong>{{ runStats(runPackage).used }} 次</strong></div>
          </div>
          <div v-for="run in pagedRuns" :key="run.cbid" class="cp-vue-run-item">
            <div class="cp-vue-run-top">
              <el-tag :type="run.st === '成功' ? 'success' : 'danger'" effect="light">{{ run.st === '成功' ? '计算成功' : '计算失败' }}</el-tag>
              <el-tag :type="stringPushType(run)" effect="light">{{ stringPushLabel(run) }}</el-tag>
              <strong>生成时间：{{ run.t }}　·　运行时长：{{ formatRunDuration(run.durationSeconds) }}</strong>
            </div>
            <div class="cp-vue-run-meta">覆盖量：{{ runCoverageText(run) }}<span v-if="run.st === '失败' && run.calcReason" class="cp-vue-run-error">　·　计算失败原因：{{ run.calcReason }}</span><span v-if="run.pushSt === '推送失败' && run.pushReason" class="cp-vue-run-error">　·　推送失败原因：{{ run.pushReason }}</span></div>
            <div class="cp-vue-run-id">
              <span>回调标识：</span><code>{{ run.cbid }}</code>
              <el-tag :type="run.used ? 'primary' : 'info'" effect="plain">{{ run.used ? '已使用' : '未使用' }}</el-tag>
              <el-tooltip :content="run.rule" placement="top" popper-class="cp-vue-rule-tooltip">
                <button type="button" class="cp-vue-rule-trigger" aria-label="查看运行规则"><span class="cp-rule-icon"><span class="cp-rule-glyph"></span></span></button>
              </el-tooltip>
            </div>
          </div>
          <div class="cp-vue-run-pagination">
            <el-pagination v-model:current-page="runPage" :page-size="runPageSize" :total="runRows.length" layout="total, prev, pager, next, jumper"></el-pagination>
          </div>
        </el-drawer>

        <el-dialog v-model="categoryManagerVisible" class="cp-vue-category-dialog" title="需求分类管理" width="520px" :close-on-click-modal="false">
          <p class="cp-vue-validation-intro">新增、重命名或删除人群包的需求分类。对外英文名将写入人群包 ID；删除前需确保没有人群包正在使用该分类。</p>
          <div class="cp-vue-category-add-row">
            <el-input v-model="categoryDraft" maxlength="20" placeholder="输入新分类名称" @keyup.enter="addRequirementCategory"></el-input>
            <el-input v-model="categoryCodeDraft" maxlength="30" placeholder="对外英文名，如 EQUITY" @keyup.enter="addRequirementCategory"></el-input>
            <el-button type="primary" @click="addRequirementCategory">新增</el-button>
          </div>
          <el-scrollbar max-height="360px" class="cp-vue-category-list">
            <div v-for="category in managedRequirementCategories" :key="category.code" class="cp-vue-category-row">
              <template v-if="editingCategory === category.name">
                <div class="cp-vue-category-edit-fields">
                  <el-input v-model="editingCategoryDraft" maxlength="20" placeholder="分类名称" @keyup.enter="saveRequirementCategory(category)"></el-input>
                  <el-input v-model="editingCategoryCodeDraft" maxlength="30" placeholder="对外英文名" @keyup.enter="saveRequirementCategory(category)"></el-input>
                </div>
                <div class="cp-vue-category-row-actions">
                  <el-button link type="primary" @click="saveRequirementCategory(category)">保存</el-button>
                  <el-button link @click="cancelRequirementCategoryEdit">取消</el-button>
                </div>
              </template>
              <template v-else>
                <div class="cp-vue-category-row-name">
                  <span>{{ category.name }}</span>
                  <small>对外英文名：{{ category.code }} · {{ categoryUsageCount(category) ? categoryUsageCount(category) + ' 个人群包' : '未使用' }}</small>
                </div>
                <div class="cp-vue-category-row-actions">
                  <el-button link type="primary" @click="editRequirementCategory(category)">编辑</el-button>
                  <el-tooltip v-if="categoryUsageCount(category)" :content="'已有 ' + categoryUsageCount(category) + ' 个人群包使用，不能删除'" placement="top">
                    <span class="cp-vue-disabled-category-action"><el-button link type="danger" disabled>删除</el-button></span>
                  </el-tooltip>
                  <el-button v-else link type="danger" @click="deleteRequirementCategory(category)">删除</el-button>
                </div>
              </template>
            </div>
          </el-scrollbar>
          <template #footer><el-button @click="categoryManagerVisible=false">关闭</el-button></template>
        </el-dialog>
      </div>

      <div class="manager-view hidden" id="cpCreateView" v-cloak>
        <div class="cp-vue-form-page">
          <el-page-header class="portal-vue-form-header" title="返回人群包管理" :content="editingIndex === null ? '新建人群包' : '编辑人群包'" @back="cancelForm"></el-page-header>
          <el-form ref="formRef" :model="form" :rules="formRules" label-position="left" label-width="160px" class="cp-vue-form cp-vue-horizontal-form">
            <section class="cp-vue-section">
              <div class="cp-vue-section-title">1 · 基本信息</div>
              <el-form-item label="人群包名称" prop="name" required>
                <el-input v-model="form.name" maxlength="50" show-word-limit placeholder="例如：权益核心付费用户"></el-input>
              </el-form-item>
              <el-form-item label="人群包分类" prop="category" required>
                <el-radio-group v-model="form.category" class="cp-vue-category">
                  <el-radio-button value="定向包">定向包</el-radio-button>
                  <el-radio-button value="排除包">排除包</el-radio-button>
                </el-radio-group>
              </el-form-item>
              <el-form-item label="需求分类" prop="requirementCategory" required>
                <div class="cp-vue-requirement-category-field">
                  <el-select v-model="form.requirementCategory" filterable clearable placeholder="选择需求分类">
                    <el-option v-for="category in managedRequirementCategories" :key="category.code" :label="category.name" :value="category.name"></el-option>
                  </el-select>
                </div>
              </el-form-item>
              <el-form-item label="人群包说明">
                <el-input v-model="form.desc" type="textarea" maxlength="200" show-word-limit placeholder="说明人群用途或适用场景"></el-input>
              </el-form-item>
              <el-form-item label="需求来源">
                <el-select v-model="form.owner" filterable clearable placeholder="搜索用户作为需求来源">
                  <el-option v-for="user in users" :key="user.name" :label="user.name" :value="user.name">
                    <div class="cp-vue-owner-option"><span>{{ user.name }}</span><small>{{ user.dept }} · {{ user.role }}</small></div>
                  </el-option>
                </el-select>
              </el-form-item>
            </section>

            <section class="cp-vue-section">
              <div class="cp-vue-section-title">2 · 圈选规则</div>
              <el-form-item label="圈选方式">
                <el-radio-group v-model="form.mode" class="cp-vue-mode" @change="changeMode">
                  <el-radio-button value="ui">标签圈选</el-radio-button>
                  <el-radio-button value="sql">SQL 模式</el-radio-button>
                </el-radio-group>
              </el-form-item>

              <template v-if="form.mode === 'ui'">
                <el-form-item label="选择圈选表" required>
                  <el-select v-model="form.table" placeholder="请选择圈选表" @change="changeTable">
                    <el-option v-for="table in tables" :key="table.name" :label="table.cn + '（' + table.name + '）'" :value="table.name"></el-option>
                  </el-select>
                </el-form-item>
                <el-form-item label="圈选条件" class="cp-vue-wide-form-item cp-vue-rule-form-item">
                  <div class="cp-vue-rule-builder">
                    <button type="button" class="cp-vue-relation" aria-label="切换条件关系" @click="toggleRelation"><span>{{ form.relation === 'AND' ? '且' : '或' }}</span></button>
                    <div class="cp-vue-condition-list">
                      <div v-for="(condition, index) in form.conditions" :key="index" class="cp-vue-condition-row">
                        <el-select v-model="condition.field" @change="changeConditionField(condition)">
                          <el-option v-for="field in currentFields" :key="field.name" :label="field.cn + '（' + field.type + '）'" :value="field.name"></el-option>
                        </el-select>
                        <el-select v-model="condition.op" @change="changeConditionOp(condition)">
                          <el-option v-for="op in conditionOps(condition)" :key="op[0]" :label="op[1]" :value="op[0]"></el-option>
                        </el-select>

                        <span v-if="isNoValueCondition(condition)" class="cp-vue-empty-value" aria-hidden="true"></span>
                        <div v-else-if="condition.op === 'between'" class="cp-vue-value-range">
                          <span>在</span><el-input-number v-model="condition.value1" :controls="false" placeholder="最小值"></el-input-number><span>和</span><el-input-number v-model="condition.value2" :controls="false" placeholder="最大值"></el-input-number><span>之间（含边界）</span>
                        </div>
                        <div v-else-if="condition.op === 'relative'" class="cp-vue-relative">
                          <span>最近</span><el-input-number v-model="condition.value1" :min="1" :step="1" controls-position="right"></el-input-number><span>天以内</span><span>含今天</span>
                        </div>
                        <div v-else-if="condition.op === 'absolute'" class="cp-vue-absolute-range"><span>在</span><el-date-picker v-model="condition.range" type="datetimerange" range-separator="到" start-placeholder="开始日期" end-placeholder="结束日期" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm" :default-time="defaultTimes"></el-date-picker><span>之间</span></div>
                        <el-select v-else-if="isMultiValueCondition(condition)" v-model="condition.value" class="cp-vue-multi-value" multiple filterable allow-create default-first-option placeholder="选择或输入值，可多选">
                          <el-option v-for="value in conditionField(condition).values || []" :key="value" :label="value" :value="value"></el-option>
                        </el-select>
                        <el-input-number v-else-if="conditionField(condition).type === '数值'" v-model="condition.value" :controls="false" placeholder="请输入数值"></el-input-number>
                        <el-input v-else v-model="condition.value" placeholder="请输入条件值"></el-input>

                        <el-button v-if="form.conditions.length > 1" class="cp-vue-remove-condition" link type="danger" title="删除条件" @click="removeCondition(index)">×</el-button>
                        <span v-else></span>
                      </div>
                      <el-button class="cp-vue-add-condition" link type="primary" @click="addCondition">+ 添加条件</el-button>
                    </div>
                  </div>
                </el-form-item>
              </template>

              <template v-else>
                <el-form-item label="SQL 规则" class="cp-vue-wide-form-item cp-vue-sql-form-item">
                  <div class="cp-vue-sql-stack">
                    <div class="cp-vue-sql-note">结果集必须返回一个标识列。支持多表 join / 聚合；分区、日期范围与加密方式由 SQL 自行处理，平台在校验时自动识别结果标识。</div>
                    <div class="cp-vue-sql-editor">
                      <div class="cp-vue-sql-toolbar"><el-button text type="primary" @click="formatSql">格式化 SQL</el-button></div>
                      <pre ref="sqlHighlight" class="cp-vue-sql-highlight" aria-hidden="true"><code v-html="highlightedSql"></code></pre>
                      <textarea ref="sqlInput" v-model="form.sql" class="cp-vue-sql-input" spellcheck="false" placeholder="SELECT DISTINCT phone_hash&#10;FROM dwd_equity_shop_order_f_d&#10;WHERE dt = :max_pt AND pay_status = 'SUCCESS'" @input="syncSqlScroll" @scroll="syncSqlScroll" @blur="formatSql" @paste="formatSqlAfterPaste" @keydown.tab.prevent="insertSqlTab"></textarea>
                    </div>
                  </div>
                </el-form-item>
              </template>

            </section>

            <section class="cp-vue-section">
              <div class="cp-vue-section-title">3 · 输出字段与格式</div>
              <template v-if="form.mode === 'ui'">
                <el-form-item label="输出字段" required>
                  <el-select v-model="form.outputField" placeholder="请选择输出字段">
                    <el-option v-for="field in outputFields" :key="field.value" :label="field.label" :value="field.value"></el-option>
                  </el-select>
                </el-form-item>
                <el-form-item label="加密方式" required>
                  <el-radio-group v-model="form.encrypt" class="cp-vue-radio-grid">
                    <el-radio value="不加密">不加密</el-radio><el-radio value="MD5">MD5</el-radio><el-radio value="SHA256">SHA256</el-radio>
                  </el-radio-group>
                </el-form-item>
              </template>
              <el-form-item label="文件格式" required>
                <el-radio-group v-model="form.format" class="cp-vue-radio-grid">
                  <el-radio value="txt">txt（适合广点通）</el-radio><el-radio value="dmp">dmp（适合头条）</el-radio>
                </el-radio-group>
              </el-form-item>
              <el-form-item v-if="form.format === 'dmp'" label="DMP 数据类型" prop="dmpDataType" required :rules="[{ required: true, message: '请选择 DMP 数据类型', trigger: 'change' }]">
                <el-select v-model="form.dmpDataType" placeholder="请选择 DMP 数据类型" clearable>
                  <el-option v-for="dataType in dmpDataTypes" :key="dataType" :label="dataType" :value="dataType"></el-option>
                </el-select>
              </el-form-item>
            </section>

            <section class="cp-vue-section">
              <div class="cp-vue-section-title">4 · 交付方式</div>
              <div class="cp-vue-delivery-grid">
                <el-form-item label="推送频次" required>
                  <el-radio-group v-model="form.freq" class="cp-vue-radio-grid cp-vue-frequency-options" @change="changeFrequency">
                    <el-radio value="每日推送">每日推送</el-radio><el-radio value="每小时推送">每小时推送</el-radio><el-radio value="手动下载">不推送（手动下载）</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item v-if="form.freq !== '手动下载'" label="调度时间" required>
                  <div v-if="form.freq === '每日推送'" class="cp-vue-schedule-line"><span>每天</span><el-time-picker v-model="form.dailyTime" format="HH:mm" value-format="HH:mm" placeholder="选择时间"></el-time-picker><span>推送</span></div>
                  <div v-else class="cp-vue-schedule-line"><span>每小时第</span><el-input-number v-model="form.hourlyMinute" :min="0" :max="59" :step="1" controls-position="right"></el-input-number><span>分钟推送</span></div>
                </el-form-item>
                <el-form-item v-if="form.freq !== '手动下载'" label="推送渠道" required>
                  <el-select v-model="form.channel" placeholder="请选择启用中的推送渠道">
                    <el-option v-for="target in activeTargets" :key="target.name" :label="target.name" :value="target.name"></el-option>
                  </el-select>
                </el-form-item>
              </div>
            </section>

            <div class="cp-vue-footer">
              <el-button @click="cancelForm">取消</el-button>
              <el-button type="primary" :loading="saving" @click="saveForm">校验并保存</el-button>
            </div>
          </el-form>
        </div>
      </div>

      <el-dialog v-model="validationVisible" class="cp-vue-validation-dialog" :title="validationTitle" width="560px" :close-on-click-modal="!validating" :close-on-press-escape="!validating" :show-close="!validating">
        <p class="cp-vue-validation-intro">保存前将依次校验人群规则与预估数据量。校验完成后，请确认结果再保存人群包。</p>
        <div class="cp-vue-validation-list">
          <div v-for="item in validationSteps" :key="item.key" class="cp-vue-validation-step" :class="item.state">
            <span class="cp-vue-validation-icon">{{ validationIcon(item.state) }}</span>
            <div class="cp-vue-validation-copy"><strong>{{ item.label }}</strong><span>{{ item.detail }}</span></div>
            <span class="cp-vue-validation-state">{{ validationStateText(item.state) }}</span>
          </div>
        </div>
        <el-alert v-if="validationError" class="cp-vue-validation-error" type="error" :closable="false" show-icon :title="validationError"></el-alert>
        <el-alert v-else-if="validationComplete" class="cp-vue-validation-success" type="success" :closable="false" show-icon title="全部校验通过。确认保存后，人群包才会创建。"></el-alert>
        <template #footer>
          <el-button :disabled="validating" @click="returnToForm">{{ validationError ? '返回修改' : '取消' }}</el-button>
          <el-button v-if="validationComplete" type="primary" @click="confirmSave">确认保存</el-button>
        </template>
      </el-dialog>
    </el-config-provider>
  `;

  const app = createApp({
    template,
    data() {
      return {
        locale: window.ElementPlusLocaleZhCn,
        status: "启用",
        filters: { keyword: "", owner: "", category: "", mode: "", table: "", delivery: "" },
        page: 1,
        pageSize: 10,
        runDrawer: false,
        runPackage: null,
        runPage: 1,
        runPageSize: 8,
        editingIndex: null,
        form: createForm(null),
        managedRequirementCategories: [...new Map([...requirementCategoryDefaults, ...state.packages.map(item => ({ name:item.requirementCategory, code:item.requirementCategoryCode })).filter(item => item.name)].map((item, index) => {
          const normalized = normalizeRequirementCategory(item, index);
          return [normalized.name, normalized];
        })).values()],
        categoryManagerVisible: false,
        categoryDraft: "",
        categoryCodeDraft: "",
        editingCategory: "",
        editingCategoryDraft: "",
        editingCategoryCodeDraft: "",
        formRules: {
          name: [{ required: true, message: "请输入人群包名称", trigger: "blur" }],
          category: [{ required: true, message: "请选择人群包分类", trigger: "change" }],
          requirementCategory: [{ required: true, message: "请选择或输入需求分类", trigger: "change" }]
        },
        outputFields,
        dmpDataTypes,
        saving: false,
        validating: false,
        validationVisible: false,
        validationError: "",
        validationSteps: [],
        pendingValidation: null,
        defaultTimes: [new Date(2000, 0, 1, 0, 0, 0), new Date(2000, 0, 1, 0, 0, 0)]
      };
    },
    computed: {
      packages() { return state.packages; },
      tables() { return state.tables; },
      users() { return bridge.users(); },
      owners() { return [...new Set(this.packages.map(item => item.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN")); },
      filterTables() {
        const names = new Set(this.packages.filter(item => item.mode !== "sql" && item.table).map(item => item.table));
        return this.tables.filter(table => names.has(table.name));
      },
      deliveryOptions() {
        return [...new Set([...state.targets.map(item => item.name), "手动下载"])];
      },
      activeTargets() { return state.targets.filter(target => (target.status || "启用") === "启用"); },
      filteredPackages() {
        const keyword = this.filters.keyword.trim();
        return this.packages.filter(item => item.status === this.status
          && (!keyword || item.name.includes(keyword))
          && (!this.filters.owner || item.owner === this.filters.owner)
          && (!this.filters.category || (item.category || "定向包") === this.filters.category)
          && (!this.filters.mode || item.mode === this.filters.mode)
          && (!this.filters.table || item.table === this.filters.table)
          && (!this.filters.delivery || this.deliveryText(item) === this.filters.delivery));
      },
      pagedPackages() {
        const maxPage = Math.max(1, Math.ceil(this.filteredPackages.length / this.pageSize));
        if (this.page > maxPage) this.page = maxPage;
        const start = (this.page - 1) * this.pageSize;
        return this.filteredPackages.slice(start, start + this.pageSize);
      },
      aggregateStats() {
        return this.filteredPackages.reduce((total, item) => {
          const stats = this.runStats(item);
          total.run += stats.run;
          total.used += stats.used;
          return total;
        }, { run: 0, used: 0 });
      },
      runRows() { return this.runPackage ? bridge.buildRuns(this.runPackage) : []; },
      pagedRuns() {
        const start = (this.runPage - 1) * this.runPageSize;
        return this.runRows.slice(start, start + this.runPageSize);
      },
      currentFields() { return getTable(this.form.table).fields || []; },
      highlightedSql() { return bridge.highlightSqlSyntax(this.form.sql || "") + ((this.form.sql || "").endsWith("\n") ? " " : ""); },
      validationComplete() { return !this.validating && !this.validationError && this.validationSteps.length > 0 && this.validationSteps.every(item => item.state === "success"); },
      validationTitle() { return this.validationError ? "校验未通过" : this.validationComplete ? "校验通过" : "正在校验人群包"; }
    },
    methods: {
      refreshList() {
        this.$forceUpdate();
        this.page = Math.max(1, Math.min(this.page, Math.ceil(this.filteredPackages.length / this.pageSize) || 1));
      },
      resetPage() { this.page = 1; },
      categoryUsageCount(category) {
        return this.packages.filter(item => item.requirementCategory === category.name).length;
      },
      requirementCategoryCode(name) {
        return this.managedRequirementCategories.find(category => category.name === name)?.code || "GENERAL";
      },
      clearRequirementCategoryValidation() {
        nextTick(() => this.$refs.formRef?.clearValidate("requirementCategory"));
      },
      addRequirementCategory() {
        const name = this.categoryDraft.trim();
        const code = this.categoryCodeDraft.trim().toUpperCase();
        if (!name) return ep.ElMessage.warning("请输入分类名称");
        if (!code) return ep.ElMessage.warning("请输入对外英文名");
        if (!requirementCategoryCodePattern.test(code)) return ep.ElMessage.warning("对外英文名仅支持大写字母、数字和下划线，且需以字母开头");
        if (this.managedRequirementCategories.some(category => category.name === name)) return ep.ElMessage.warning("该需求分类已存在");
        if (this.managedRequirementCategories.some(category => category.code === code)) return ep.ElMessage.warning("该对外英文名已存在");
        this.managedRequirementCategories.push({ name, code });
        this.form.requirementCategory = name;
        this.categoryDraft = "";
        this.categoryCodeDraft = "";
        this.clearRequirementCategoryValidation();
        ep.ElMessage.success(`需求分类「${name}」已新增`);
      },
      editRequirementCategory(category) {
        this.editingCategory = category.name;
        this.editingCategoryDraft = category.name;
        this.editingCategoryCodeDraft = category.code;
      },
      cancelRequirementCategoryEdit() {
        this.editingCategory = "";
        this.editingCategoryDraft = "";
        this.editingCategoryCodeDraft = "";
      },
      saveRequirementCategory(category) {
        const name = this.editingCategoryDraft.trim();
        const code = this.editingCategoryCodeDraft.trim().toUpperCase();
        if (!name) return ep.ElMessage.warning("分类名称不能为空");
        if (!code) return ep.ElMessage.warning("请输入对外英文名");
        if (!requirementCategoryCodePattern.test(code)) return ep.ElMessage.warning("对外英文名仅支持大写字母、数字和下划线，且需以字母开头");
        if (name !== category.name && this.managedRequirementCategories.some(item => item.name === name)) return ep.ElMessage.warning("该需求分类已存在");
        if (code !== category.code && this.managedRequirementCategories.some(item => item.code === code)) return ep.ElMessage.warning("该对外英文名已存在");
        const index = this.managedRequirementCategories.indexOf(category);
        if (index < 0) return;
        this.managedRequirementCategories.splice(index, 1, { name, code });
        this.packages.forEach(item => {
          if (item.requirementCategory === category.name) {
            item.requirementCategory = name;
            item.requirementCategoryCode = code;
          }
        });
        if (this.form.requirementCategory === category.name) this.form.requirementCategory = name;
        this.cancelRequirementCategoryEdit();
        this.clearRequirementCategoryValidation();
        ep.ElMessage.success(`需求分类已更新为「${name}」`);
      },
      deleteRequirementCategory(category) {
        const usage = this.categoryUsageCount(category);
        if (usage) return ep.ElMessage.warning(`该分类已被 ${usage} 个人群包使用，请先调整分类后再删除`);
        ep.ElMessageBox.confirm(`确认删除需求分类「${category.name}」？`, "删除分类", {
          type: "warning",
          confirmButtonText: "确认删除",
          cancelButtonText: "取消",
          autofocus: false
        }).then(() => {
          const index = this.managedRequirementCategories.indexOf(category);
          if (index >= 0) this.managedRequirementCategories.splice(index, 1);
          if (this.form.requirementCategory === category.name) this.form.requirementCategory = "";
          if (this.editingCategory === category.name) this.cancelRequirementCategoryEdit();
          ep.ElMessage.success(`需求分类「${category.name}」已删除`);
        }).catch(() => {});
      },
      tableText(item) { return item.mode === "sql" ? "—" : bridge.tableCn(item.table); },
      coverageText(item) { return item.mode === "sql" ? bridge.wan(item.cover) : `${bridge.wan(item.cover)}（${item.cov}%）`; },
      outputText(item) { return item.mode === "sql" ? "—" : outputFieldLabel((item.fields || [])[0] || bridge.packageOutputField(item)); },
      encryptText(item) { return item.mode === "sql" ? "—" : (item.encrypt || "—"); },
      deliveryText(item) { return item.freq === "手动下载" ? "手动下载" : (item.channel || "未配置渠道"); },
      frequencyText(item) { return bridge.packageFreq(item); },
      scheduleText(item) { return bridge.packageSchedule(item); },
      runStats(item) {
        if (!item) return { run: 0, used: 0 };
        const runs = bridge.buildRuns(item);
        return { run: runs.length, used: runs.filter(run => run.used).length };
      },
      formatWan(value) { return bridge.wan(value); },
      formatRunDuration(value) { return bridge.formatRunDuration(value); },
      latestRun(item) { const runs = bridge.buildRuns(item); return runs[0] || {}; },
      stringPushLabel(run) { return run.pushSt || (this.runPackage?.freq === "手动下载" ? "未推送（手动下载）" : "待推送"); },
      stringPushType(run) { const label = this.stringPushLabel(run); return label === "推送成功" ? "success" : (label === "推送失败" ? "danger" : "info"); },
      calcStatus(item) {
        const run = this.latestRun(item);
        return { st: run.st === "失败" ? "失败" : "成功", reason: run.calcReason || "" };
      },
      pushStatus(item) {
        const run = this.latestRun(item);
        const label = run.pushSt || (item.freq === "手动下载" ? "未推送（手动下载）" : "待推送");
        const type = label === "推送成功" ? "success" : (label === "推送失败" ? "danger" : "info");
        return { label, type, reason: run.pushReason || "" };
      },
      runCoverageText(run) {
        if (run.st !== "成功") return "—";
        const amount = this.formatWan(run.cnt);
        if (this.runPackage?.mode === "sql") return amount;
        const baseCover = Number(this.runPackage?.cover) || 0;
        const rate = baseCover ? (Number(this.runPackage?.cov) || 0) * run.cnt / baseCover : 0;
        return `${amount}（${rate.toFixed(1)}%）`;
      },
      validationIcon(state) { return state === "success" ? "✓" : state === "error" ? "!" : ""; },
      validationStateText(state) { return state === "checking" ? "校验中" : state === "success" ? "已通过" : state === "error" ? "未通过" : "待校验"; },
      resetValidation() {
        this.validating = false;
        this.validationVisible = false;
        this.validationError = "";
        this.validationSteps = [];
        this.pendingValidation = null;
      },
      buildValidationSteps() {
        return this.form.mode === "sql"
          ? [
              { key: "sql-format", label: "SQL 格式校验", detail: "检查 SELECT 查询、括号与只读限制", state: "waiting" },
              { key: "sql-columns", label: "结果列校验", detail: "检查查询结果是否仅返回 1 个标识列", state: "waiting" },
              { key: "sql-database", label: "单库查询校验", detail: "检查所有查询表是否来自同一个库", state: "waiting" },
              { key: "audience-count", label: "数据条数校验", detail: "预估人群数据量，不得超过 2,000 万条", state: "waiting" }
            ]
          : [
              { key: "rule", label: "圈选规则校验", detail: "检查圈选表与条件是否可执行", state: "waiting" },
              { key: "audience-count", label: "数据条数校验", detail: "预估人群数据量，不得超过 2,000 万条", state: "waiting" }
            ];
      },
      setValidationStep(key, state, detail) {
        const step = this.validationSteps.find(item => item.key === key);
        if (!step) return;
        step.state = state;
        if (detail) step.detail = detail;
      },
      estimatedAudienceCount() {
        const savedCount = Number(this.form.estimatedCover) || 0;
        if (savedCount) return savedCount;
        if (this.form.mode === "sql") return parseAudienceHint(this.form.sql) || 824000;
        return this.form.relation === "OR" && this.form.conditions.length >= 2 ? 21680000 : 432000;
      },
      validateSaveFields() {
        if (this.form.mode === "ui" && !this.form.outputField) return "请选择输出字段";
        if (this.form.format === "dmp" && !this.form.dmpDataType) return "请选择 DMP 数据类型";
        if (this.form.freq === "每日推送" && !this.form.dailyTime) return "请选择每日推送时间";
        if (this.form.freq === "每小时推送" && (!Number.isInteger(Number(this.form.hourlyMinute)) || Number(this.form.hourlyMinute) < 0 || Number(this.form.hourlyMinute) > 59)) return "每小时推送分钟请输入 0–59 的整数";
        if (this.form.freq !== "手动下载" && !this.form.channel) return "请选择推送渠道";
        return "";
      },
      validationResult(key) {
        if (key === "rule") {
          const error = this.validateConditions();
          return error ? { error: `圈选规则校验失败：${error}` } : { detail: `已识别 ${this.form.conditions.length} 条圈选条件，可执行。` };
        }
        if (key === "sql-format") {
          const parsed = validateSqlStatement(this.form.sql);
          if (parsed.error) return parsed;
          const detected = bridge.detectSqlOutputConfig(this.form.sql);
          return detected.error ? { error: `SQL 格式校验失败：${detected.error}` } : { detail: "SELECT 查询语句格式正确，允许执行。", detected };
        }
        if (key === "sql-columns") {
          const inspected = inspectSqlColumns(this.form.sql);
          return inspected.error ? inspected : { detail: "结果集仅返回 1 个标识列。" };
        }
        if (key === "sql-database") {
          const inspected = inspectSqlDatabases(this.form.sql);
          return inspected.error ? inspected : { detail: `所有查询表均来自${inspected.database}。` };
        }
        const cover = this.estimatedAudienceCount();
        if (cover > AUDIENCE_LIMIT) return { error: `数据条数校验失败：预估 ${bridge.wan(cover)}，超过 2,000 万条上限，不能创建人群包。` };
        return { detail: `预估 ${bridge.wan(cover)}，未超过 2,000 万条上限。`, cover };
      },
      async runSaveValidation() {
        this.validationSteps = this.buildValidationSteps();
        this.validationError = "";
        this.pendingValidation = null;
        this.validationVisible = true;
        this.validating = true;
        let detected = null;
        let cover = 0;
        for (const step of this.validationSteps) {
          this.setValidationStep(step.key, "checking", "正在校验，请稍候…");
          await validationDelay(900);
          const result = this.validationResult(step.key);
          if (result.error) {
            this.setValidationStep(step.key, "error", result.error);
            this.validationError = result.error;
            this.validating = false;
            return null;
          }
          if (result.detected) detected = result.detected;
          if (result.cover) cover = result.cover;
          this.setValidationStep(step.key, "success", result.detail);
        }
        this.validating = false;
        this.form.estimatedCover = cover || this.estimatedAudienceCount();
        this.pendingValidation = { detected: detected || bridge.detectSqlOutputConfig(this.form.sql), cover: this.form.estimatedCover };
        return this.pendingValidation;
      },
      returnToForm() {
        this.validationVisible = false;
        this.pendingValidation = null;
      },
      createPackage() {
        bridge.setEditingIndex(null);
        bridge.setPage("新建人群包");
      },
      editPackage(item) {
        const index = this.packages.indexOf(item);
        bridge.setEditingIndex(index);
        bridge.setPage("新建人群包");
      },
      confirmStatusChange(item) {
        const next = item.status === "启用" ? "停用" : "启用";
        const impact = next === "停用"
          ? "关闭后将停止该人群包的定时运行和自动推送。"
          : "开启后将恢复该人群包的定时运行和自动推送。";
        return ep.ElMessageBox.confirm(`${impact}确认${next}人群包「${item.name}」？`, "二次确认", {
          type: "warning",
          confirmButtonText: `确认${next === "停用" ? "关闭" : "开启"}`,
          cancelButtonText: "取消",
          autofocus: false
        })
          .then(() => true)
          .catch(() => false);
      },
      applyStatusChange(item, status) {
        ep.ElMessage.success(`「${item.name}」已${status === "启用" ? "开启" : "关闭"}`);
      },
      openHistory(item) {
        this.runPackage = item;
        this.runPage = 1;
        this.runDrawer = true;
      },
      deliver(item, kind) {
        if (item.status !== "启用") return ep.ElMessage.warning("停用的人群包不支持该操作");
        const action = kind === "export" ? "导出" : "立即运行";
        const finish = () => ep.ElMessage.success(kind === "export" ? `「${item.name}」已生成下载` : `「${item.name}」已触发运行，推送至 ${item.channel || "OSS"}`);
        if (item.encrypt !== "不加密") return finish();
        ep.ElMessageBox.confirm(`「${item.name}」使用明文标识，${action}将记录操作人、人群包和时间。`, "明文标识 · 二次确认", { type: "warning", confirmButtonText: "确认继续", cancelButtonText: "取消" }).then(finish).catch(() => {});
      },
      openForm(index) {
        this.editingIndex = Number.isInteger(index) ? index : null;
        const item = this.editingIndex === null ? null : this.packages[this.editingIndex];
        this.form = createForm(item);
        if (this.form.freq !== "手动下载" && !this.form.channel && this.activeTargets[0]) this.form.channel = this.activeTargets[0].name;
        this.resetValidation();
        nextTick(() => {
          if (this.$refs.formRef) this.$refs.formRef.clearValidate();
          const content = document.querySelector(".main-content");
          if (content) content.scrollTop = 0;
          this.syncSqlScroll();
        });
      },
      cancelForm() {
        bridge.setEditingIndex(null);
        bridge.setPage("人群包管理");
      },
      changeMode() {
        this.resetValidation();
        if (this.form.mode === "ui" && !this.form.conditions.length) this.form.conditions = [createCondition(this.form.table)];
        nextTick(() => this.syncSqlScroll());
      },
      changeTable() {
        this.form.conditions = [createCondition(this.form.table)];
        this.resetValidation();
      },
      toggleRelation() { this.form.relation = this.form.relation === "AND" ? "OR" : "AND"; },
      conditionField(condition) {
        return this.currentFields.find(field => field.name === condition.field) || this.currentFields[0] || { name: "", cn: "字段", type: "文本", values: [] };
      },
      conditionOps(condition) { return opMap[this.conditionField(condition).type] || opMap["文本"]; },
      changeConditionField(condition) {
        const field = this.conditionField(condition);
        condition.op = (opMap[field.type] || opMap["文本"])[0][0];
        condition.value = isMultiValueType(field.type) ? [] : "";
        condition.value1 = null;
        condition.value2 = null;
        condition.range = [];
      },
      changeConditionOp(condition) {
        const field = this.conditionField(condition);
        condition.value = isMultiValueType(field.type) ? [] : "";
        condition.value1 = condition.op === "relative" ? 7 : null;
        condition.value2 = null;
        condition.range = [];
      },
      isNoValueCondition(condition) { return noValueOps.has(condition.op); },
      isMultiValueCondition(condition) { return isMultiValueType(this.conditionField(condition).type); },
      addCondition() { this.form.conditions.push(createCondition(this.form.table)); },
      removeCondition(index) { if (this.form.conditions.length > 1) this.form.conditions.splice(index, 1); },
      formatSql() {
        this.form.sql = bridge.formatSqlText(this.form.sql);
        nextTick(() => this.syncSqlScroll());
      },
      formatSqlAfterPaste() { window.setTimeout(() => this.formatSql(), 0); },
      syncSqlScroll() {
        const input = this.$refs.sqlInput;
        const highlight = this.$refs.sqlHighlight;
        if (!input || !highlight) return;
        highlight.scrollTop = input.scrollTop;
        highlight.scrollLeft = input.scrollLeft;
      },
      insertSqlTab() {
        const input = this.$refs.sqlInput;
        if (!input) return;
        const start = input.selectionStart;
        const end = input.selectionEnd;
        this.form.sql = this.form.sql.slice(0, start) + "  " + this.form.sql.slice(end);
        nextTick(() => { input.selectionStart = input.selectionEnd = start + 2; this.syncSqlScroll(); });
      },
      validateConditions() {
        if (!this.form.table) return "请选择圈选表";
        if (!this.form.conditions.length) return "请至少添加一个圈选条件";
        for (const condition of this.form.conditions) {
          if (!condition.field || !condition.op) return "请补全圈选条件";
          if (noValueOps.has(condition.op)) continue;
          if (condition.op === "between") {
            if (condition.value1 === null || condition.value2 === null) return "请填写数值区间";
            if (Number(condition.value1) > Number(condition.value2)) return "区间下限不能大于上限";
          } else if (condition.op === "relative") {
            if (!Number.isInteger(Number(condition.value1)) || Number(condition.value1) <= 0) return "相对天数请输入大于 0 的整数";
          } else if (condition.op === "absolute") {
            if (!Array.isArray(condition.range) || condition.range.length !== 2) return "请选择开始和结束日期";
            if (condition.range[0] > condition.range[1]) return "开始日期不能晚于结束日期";
          } else if (Array.isArray(condition.value)) {
            if (!condition.value.length) return "请选择条件值";
          } else if (condition.value === "" || condition.value === null || typeof condition.value === "undefined") {
            return "请输入条件值";
          }
        }
        return "";
      },
      formatCondition(condition) {
        const field = this.conditionField(condition);
        const op = this.conditionOps(condition).find(item => item[0] === condition.op);
        const opLabel = op ? op[1] : condition.op;
        if (noValueOps.has(condition.op)) return `${field.cn}${opLabel}`;
        if (condition.op === "between") return `${field.cn}在 ${condition.value1} 和 ${condition.value2} 之间（含边界）`;
        if (condition.op === "relative") return `${field.cn}最近 ${condition.value1} 天以内（含今天）`;
        if (condition.op === "absolute") return `${field.cn}在 ${(condition.range || [])[0]} 到 ${(condition.range || [])[1]} 之间`;
        const value = Array.isArray(condition.value) ? condition.value.join("、") : condition.value;
        return `${field.cn}${opLabel}${value}`;
      },
      summarizeRule() {
        if (this.form.mode === "sql") return `SQL：${this.form.sql.trim()}`;
        const relationText = this.form.relation === "AND" ? "满足以上所有条件" : "满足以上任一条件";
        return `标签圈选：${this.form.conditions.map(condition => this.formatCondition(condition)).join("；")}。条件关系：${relationText}。`;
      },
      changeFrequency() {
        if (this.form.freq !== "手动下载" && !this.form.channel && this.activeTargets[0]) this.form.channel = this.activeTargets[0].name;
      },
      async saveForm() {
        if (this.saving || this.validating) return;
        try {
          await this.$refs.formRef.validate();
        } catch (_) {
          return;
        }
        const fieldError = this.validateSaveFields();
        if (fieldError) return ep.ElMessage.warning(fieldError);
        if (this.form.mode === "sql") this.formatSql();
        await this.runSaveValidation();
      },
      confirmSave() {
        const validation = this.pendingValidation;
        if (!validation || !this.validationComplete || this.saving) return;

        this.saving = true;
        const editing = this.editingIndex === null ? null : this.packages[this.editingIndex];
        const cover = validation.cover || this.form.estimatedCover || (editing ? editing.cover : 120000);
        const payload = {
          id: editing ? editing.id : bridge.nextAudId(this.form.category, this.requirementCategoryCode(this.form.requirementCategory)),
          name: this.form.name.trim(),
          category: this.form.category,
          requirementCategory: this.form.requirementCategory.trim(),
          requirementCategoryCode: editing ? editing.requirementCategoryCode : this.requirementCategoryCode(this.form.requirementCategory),
          desc: this.form.desc.trim(),
          owner: this.form.owner,
          mode: this.form.mode,
          table: this.form.mode === "sql" ? "" : this.form.table,
          cover,
          cov: this.form.mode === "sql" ? null : (cover / 12000000 * 100).toFixed(1),
          fields: [this.form.mode === "sql" ? validation.detected.field : this.form.outputField],
          encrypt: this.form.mode === "sql" ? validation.detected.encrypt : this.form.encrypt,
          format: this.form.format,
          dmpDataType: this.form.format === "dmp" ? this.form.dmpDataType : "",
          freq: this.form.freq,
          dailyTime: this.form.dailyTime,
          hourlyMinute: Number(this.form.hourlyMinute),
          channel: this.form.freq === "手动下载" ? "" : this.form.channel,
          status: editing ? editing.status : "启用",
          last: editing ? editing.last : "尚未运行",
          rule: this.summarizeRule(),
          sql: this.form.mode === "sql" ? this.form.sql.trim() : "",
          relation: this.form.relation,
          conditions: this.form.mode === "ui" ? clone(this.form.conditions) : []
        };
        if (editing) this.packages.splice(this.editingIndex, 1, payload);
        else this.packages.unshift(payload);
        this.saving = false;
        this.validationVisible = false;
        this.pendingValidation = null;
        this.status = "启用";
        this.page = 1;
        bridge.setEditingIndex(null);
        ep.ElMessage.success(`人群包「${payload.name}」已${editing ? "更新" : "保存"}`);
        bridge.setPage("人群包管理");
      }
    }
  });

  app.use(window.ElementPlus);
  const vm = app.mount("#cpVueModule");
  document.getElementById("cpVueModule").dataset.vuePowered = "true";
  window.cpVueModuleApi = {
    refreshList: () => vm.refreshList(),
    openForm: index => vm.openForm(index)
  };
})();
