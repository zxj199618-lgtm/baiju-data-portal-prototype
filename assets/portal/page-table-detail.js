/**
 * 页面：table-detail
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    bridge,
    enabledDictItems,
    ep,
    loginUser,
    mount,
    notify,
    reactive,
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

  /* ===== 表知识库：每张表一份 Markdown 文本，灵犀智析回答本表问题时整篇读取。
     第一版只提供一个 Markdown 输入框，角色、指标口径、特殊规则都写在正文里。
     当前仅「广告计划日报表」有示例内容，其余表显示空态。 ===== */
  const knowledgeNow = () => new Date().toLocaleString("zh-CN", { hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(/\//g, "-");
  /* 轻量 Markdown 渲染（预览与保存后的内容一致）：标题、加粗、斜体、行内代码、链接（仅 http/https）、引用、分隔线、代码块、有序/无序列表、段落。
     先转义再套标签，不执行 HTML */
  const escapeHtml = text => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const renderInlineMd = text => {
    const codes = [];
    let html = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => { codes.push(`<code>${code}</code>`); return `\u0000${codes.length - 1}\u0000`; });
    html = html
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => `<a href="${url}" target="_blank" rel="noopener">${label}</a>`)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\s][^*]*)\*(?!\*)/g, "$1<em>$2</em>");
    return html.replace(/\u0000(\d+)\u0000/g, (_, index) => codes[Number(index)]);
  };
  const renderKnowledgeMarkdown = markdown => {
    const html = [];
    let list = null;
    let quote = [];
    let fence = null;
    const closeList = () => { if (list) { html.push(`</${list}>`); list = null; } };
    const openList = type => { if (list !== type) { closeList(); html.push(`<${type}>`); list = type; } };
    const flushQuote = () => { if (quote.length) { html.push(`<blockquote>${quote.map(renderInlineMd).join("<br>")}</blockquote>`); quote = []; } };
    String(markdown || "").replace(/\r\n?/g, "\n").split("\n").forEach(line => {
      if (fence !== null) {
        if (/^\s*```/.test(line)) { html.push(`<pre><code>${escapeHtml(fence.join("\n"))}</code></pre>`); fence = null; }
        else fence.push(line);
        return;
      }
      if (/^\s*```/.test(line)) { closeList(); flushQuote(); fence = []; return; }
      const t = line.trim();
      const quoteLine = t.match(/^>\s?(.*)$/);
      if (quoteLine) { closeList(); quote.push(quoteLine[1]); return; }
      flushQuote();
      const heading = t.match(/^(#{1,6})\s+(.*)$/);
      const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
      const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
      if (heading) { closeList(); const level = Math.min(heading[1].length + 1, 5); html.push(`<h${level}>${renderInlineMd(heading[2])}</h${level}>`); }
      else if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { closeList(); html.push("<hr>"); }
      else if (bullet) { openList("ul"); html.push(`<li>${renderInlineMd(bullet[1])}</li>`); }
      else if (ordered) { openList("ol"); html.push(`<li>${renderInlineMd(ordered[1])}</li>`); }
      else if (!t) { /* 空行不结束列表，避免有序列表编号从 1 重新开始 */ }
      else { closeList(); html.push(`<p>${renderInlineMd(t)}</p>`); }
    });
    if (fence !== null) html.push(`<pre><code>${escapeHtml(fence.join("\n"))}</code></pre>`);
    closeList();
    flushQuote();
    return html.join("");
  };

  /* 把随手填写的文本规范成 Markdown：项目符号统一为 "- "，编号统一为 "1. "，
     【标题】/ 一、标题 / 单独一行的「标题：」或短标题（其后紧跟列表）转为二级标题，「键：值」转为列表项，标题前补空行；代码块内容保持原样 */
  const normalizeToMarkdown = raw => {
    const lines = String(raw || "").replace(/\r\n?/g, "\n").split("\n").map(line => line.trim() === "" ? "" : line);
    const trimmed = lines.map(line => line.trim());
    const isListLike = t => !/^https?:/i.test(t) && /^(?:[•·●○▪■◆]\s*|[*+-]\s+|\d+[.、)）]\s*|[^：:\s]{1,20}[：:]\s*\S)/.test(t);
    const nextContent = index => { for (let i = index + 1; i < trimmed.length; i++) if (trimmed[i]) return trimmed[i]; return ""; };
    const out = [];
    let fenced = false;
    lines.forEach((original, index) => {
      if (/^\s*```/.test(original)) { fenced = !fenced; out.push(original.trimEnd()); return; }
      if (fenced) { out.push(original); return; }
      const t = trimmed[index];
      let m;
      if (!t) { out.push(""); return; }
      if (/^#{1,6}\s/.test(t) || /^>/.test(t) || /^(-{3,}|\*{3,}|_{3,})$/.test(t)) { out.push(t); return; }
      if ((m = t.match(/^(?:[•·●○▪■◆]\s*|[*+-]\s+)(.*)$/))) { out.push(`- ${m[1]}`); return; }
      if ((m = t.match(/^(\d+)(?:\.\s+|[、)）]\s*)(.*)$/))) { out.push(`${m[1]}. ${m[2]}`); return; }
      if ((m = t.match(/^[一二三四五六七八九十]+[、.）)]\s*(.+)$/))) { out.push(`## ${m[1]}`); return; }
      if ((m = t.match(/^【(.+?)】\s*(.*)$/))) { out.push(`## ${m[1]}`); if (m[2]) out.push(m[2]); return; }
      if (/^[^：:]{1,12}[：:]$/.test(t) && !/^https?:/i.test(t)) { out.push(`## ${t.slice(0, -1)}`); return; }
      if (/^[^：:。，,.；;！!？?*_`>\[]{1,15}$/.test(t) && isListLike(nextContent(index)) && !isListLike(t)) { out.push(`## ${t}`); return; }
      if (/^[^：:\s]{1,20}[：:]\s*\S/.test(t) && !/^https?:/i.test(t)) { out.push(`- ${t}`); return; }
      out.push(t);
    });
    const result = [];
    let inFence = false;
    out.forEach(line => {
      if (/^\s*```/.test(line)) { inFence = !inFence; result.push(line); return; }
      if (!inFence && /^#{1,6}\s/.test(line) && result.length && result[result.length - 1] !== "") result.push("");
      result.push(line);
    });
    return result.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  };
  const knowledgeTemplate = name => `# ${name}

## 表说明
- 用途：
- 粒度：
- 主键：
- 数据时效：
- 数据范围：

## 角色
- 投放组长：
- 优化师：
- 数据分析师：
- 只读访客：

## 指标口径
### 指标名称
- 计算公式：
- 依赖字段：
- 默认口径：
- 投放组长口径（如有差异）：

## 特殊规则
1. 
`;
  const tableKnowledgeStore = reactive({
    "dm_ad_plan_daily_media_account_product_performance_detail": {
      updatedBy: "曾祥竞",
      updatedAt: "2026-10-09 18:20",
      markdown: `# 广告计划日报表

## 表说明
- 用途：媒体 × 账户 × 计划 × 产品粒度的日投放绩效明细，是对外投放日报、灵犀智析投放类问题的主要数据源。
- 粒度：一行 = 一天 × 一个媒体来源 × 一个计划。stat_date + media_source + plan_id 唯一（已用样例核对，无重复）。
- 主键：stat_date + media_source + plan_id
- 数据时效：stat_date 为媒体侧自然日（北京时间）。每日 02:30 同步前一日数据，当日数据不完整，不能作为「当日」结论。
- 数据范围：巨量、广点通、快手、OPPO、VIVO 五个媒体来源，仅包含同步成功的广告账户。

## 角色
- 投放组长：可看组内所有账户，组内合计按各优化师负责账户求和。
- 优化师：只看本人负责的账户与计划。
- 数据分析师：可看全部账户，CPA 使用 T+7 回溯归因口径。
- 只读访客：只能看媒体维度的汇总，不能下钻到计划与账户。

## 指标口径
### 消耗
- 计算公式：SUM(cost)，单位元，展示保留两位小数。
- 依赖字段：cost
- 默认口径：直接汇总 cost 字段。
- 投放组长口径：组内合计 = 组内各优化师负责账户的 cost 之和，不另行重算。
- 优化师口径：只汇总 account_id 属于本人负责账户的 cost。
- 只读访客口径：只展示媒体维度的汇总消耗。

### 点击率 CTR
- 计算公式：SUM(click_cnt) ÷ SUM(show_cnt)
- 依赖字段：click_cnt、show_cnt
- 默认口径：分子分母分别汇总后相除。禁止对计划级 CTR 直接求平均。

### 激活成本 CPA
- 计算公式：SUM(cost) ÷ SUM(activate_cnt)
- 依赖字段：cost、activate_cnt
- 默认口径：与字段 cpa 的单行口径一致。汇总时必须用分子分母重算，不能对 cpa 字段求和或取平均。
- 投放组长口径：组内 SUM(cost) ÷ 组内 SUM(activate_cnt)，不取优化师 CPA 的算术平均。
- 优化师口径：只统计本人计划，按当日归因数据计算，不回补后续归因。
- 数据分析师口径：使用 T+7 回溯归因口径（以 dwd_campaign_conversion_daily 为准），与日报 CPA 不同，对比时需注明。
- 只读访客口径：只展示媒体维度的 CPA，不展示计划明细。

### 注册成本
- 计算公式：SUM(cost) ÷ SUM(register_cnt)
- 依赖字段：cost、register_cnt
- 默认口径：分子分母分别汇总后相除。register_cnt 为 0 时结果置空，不显示为 0。

### ROI
- 计算公式：SUM(收入) ÷ SUM(cost)
- 依赖字段：roi（预计算）、cost
- 默认口径：roi 字段是单行预计算值，跨行不能加总或平均。汇总 ROI 需按收入重算，收入来源待数据团队确认。
- 投放组长口径：按组内 SUM(收入) ÷ SUM(cost) 重算，不使用 roi 字段的均值。
- 数据分析师口径：按 SUM(收入) ÷ SUM(cost) 重算，收入口径需与订单明细对齐后再对外使用。

## 特殊规则
1. 归因回补：激活、注册、订单数按归因口径统计，历史日期可能随归因窗口回补而变化。回答时需注明查询时间。
2. 比率禁止直接加总：CTR、CPA、ROI 等比率指标，跨日、跨计划汇总时先分别求分子与分母的和，再相除。
3. 按 plan_id 聚合：plan_name 可能改名，也存在同名计划。分组与去重一律按 plan_id。
4. 媒体来源枚举：media_source 仅取 巨量、广点通、快手、OPPO、VIVO。
5. 数据时效：T-1 的 02:30 之后可查询。查询当天数据时，回答需标注「数据不完整」。
6. 角色口径：回答中必须注明所用口径（如「投放组长口径」），不能混用不同角色的口径。
`
    }
  });

  const TableDetailApp = {
    template: `
      <el-config-provider :locale="locale">
        <div>
          <el-page-header class="portal-vue-form-header" title="返回表管理" :content="headerTitle" @back="back"></el-page-header>
          <div v-if="!detail" style="padding:60px 20px"><el-empty description="请先从「表管理」选择一张表进入详情" /></div>
          <template v-else>
            <div class="portal-vue-dim-meta">
              <div><span>表编号</span><code class="portal-vue-code">{{ detail.assetId }}</code></div>
              <div><span>对外表名</span><code class="portal-vue-code">{{ detail.externalName }}</code></div>
              <div><span>数据源</span><strong>{{ detail.source }}</strong></div>
              <div><span>业务线</span><strong>{{ detail.bizLine || "—" }}</strong></div>
              <div><span>库名</span><code class="portal-vue-code">{{ detail.database }}</code></div>
              <div><span>最近同步</span><strong>{{ detail.lastSuccessSync || "—" }}</strong></div>
              <div><span>字段数量</span><strong>{{ detail.fields.length }}</strong></div>
              <div><span>近30日调用</span><strong>{{ callCount.toLocaleString() }}</strong></div>
            </div>
            <el-tabs v-model="tab" class="ops-center-tabs op-full-line" style="margin-top:8px" @tab-change="onTabChange">
              <el-tab-pane label="基本配置" name="basic">
                <div class="portal-vue-toolbar" style="padding:0 0 14px">
                  <div class="portal-vue-toolbar-left"><span class="portal-vue-muted">{{ editingBasic ? "编辑中：调整后点击底部「保存配置」生效" : "当前为只读展示，点击右上角「编辑」后可修改" }}</span></div>
                  <div class="portal-vue-actions"><el-button v-if="(!editingBasic) && canEdit('表管理')" type="primary" plain @click="editingBasic=true">✎ 编辑</el-button><el-button v-if="editingBasic && canEdit('表管理')" @click="cancelBasic">取消编辑</el-button></div>
                </div>
                <el-form v-if="editingBasic" label-position="top" class="portal-vue-dialog-form" style="max-width:760px">
                  <el-form-item label="表负责人" required>
                    <el-select v-model="detailDraft.owner" filterable placeholder="请选择表负责人">
                      <el-option v-for="user in activeUsers" :key="user.name" :label="user.name" :value="user.name">
                        <div class="portal-vue-asset-owner-option"><span>{{ user.name }}</span><small>{{ user.dept }} · {{ user.role }}</small></div>
                      </el-option>
                    </el-select>
                  </el-form-item>
                  <el-form-item label="表描述"><el-input v-model="detailDraft.desc" type="textarea" :rows="3" placeholder="请输入表描述"></el-input></el-form-item>
                  <div class="portal-vue-section-line"><h3>标签表设置</h3><el-checkbox v-model="detailDraft.tagTable">设为标签表</el-checkbox><p class="portal-vue-muted">勾选后该表会出现在「标签管理」</p></div>
                  <div class="portal-vue-section-line"><h3>维表设置</h3><el-checkbox v-model="detailDraft.dimension">设为维表</el-checkbox><p class="portal-vue-muted">勾选后该表会出现在「维表管理」，可在线维护行数据。</p></div>
                  <div v-if="detailDraft.tagTable" class="portal-vue-section-line"><h3>人群包导出字段配置</h3><el-checkbox-group v-model="detailDraft.exportFields" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px"><el-checkbox v-for="field in detail.fields" :key="field.name" :value="field.name">{{ field.name }} / {{ field.comment || field.type }}</el-checkbox></el-checkbox-group></div>
                </el-form>
                <el-form v-else label-position="top" class="portal-vue-dialog-form portal-vue-readonly-form" style="max-width:760px">
                  <el-form-item label="表负责人"><span>{{ detailDraft.owner || "—" }}</span></el-form-item>
                  <el-form-item label="表描述"><span style="white-space:pre-wrap">{{ detailDraft.desc || "—" }}</span></el-form-item>
                  <div class="portal-vue-section-line"><h3>标签表设置</h3><el-checkbox :model-value="detailDraft.tagTable" disabled>设为标签表</el-checkbox><p class="portal-vue-muted">勾选后该表会出现在「标签管理」</p></div>
                  <div class="portal-vue-section-line"><h3>维表设置</h3><el-checkbox :model-value="detailDraft.dimension" disabled>设为维表</el-checkbox><p class="portal-vue-muted">勾选后该表会出现在「维表管理」，可在线维护行数据。</p></div>
                  <div v-if="detailDraft.exportFields.length" class="portal-vue-section-line"><h3>人群包导出字段配置</h3><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px"><el-checkbox v-for="field in detail.fields" :key="field.name" :model-value="detailDraft.exportFields.includes(field.name)" disabled>{{ field.name }} / {{ field.comment || field.type }}</el-checkbox></div></div>
                </el-form>
              </el-tab-pane>
              <el-tab-pane label="字段配置" name="fields">
                <div class="portal-vue-toolbar" style="padding:0 0 14px">
                  <div class="portal-vue-toolbar-left"><span class="portal-vue-muted">字段来自 StarRocks 同步，关联字典与备注可直接修改，改动后点击行内「保存」生效</span></div>
                </div>
                <el-table :data="detailDraft.fields" class="portal-vue-table" border empty-text="暂无字段">
                  <el-table-column prop="name" label="字段名称" width="180"></el-table-column>
                  <el-table-column prop="type" label="字段类型" width="120"></el-table-column>
                  <el-table-column prop="comment" label="字段中文名" width="150"></el-table-column>
                  <el-table-column label="关联字典" min-width="260"><template #default="scope"><el-select v-model="scope.row.dictId" clearable filterable placeholder="不关联"><el-option v-for="dict in enabledDicts" :key="dict.dictId" :label="dict.name" :value="dict.dictId">{{ dict.name }} / {{ dict.code }} · {{ dictItems(dict).length }} 个枚举值</el-option></el-select></template></el-table-column>
                  <el-table-column label="字段备注" min-width="220"><template #default="scope"><el-input v-model="scope.row.remark" placeholder="填写备注"></el-input></template></el-table-column>
                  <el-table-column label="操作" width="110" align="center"><template #default="scope"><template v-if="fieldDirty(scope.row)"><el-button v-if="canEdit('表管理')" link @click="revertField(scope.row)">取消</el-button><el-button v-if="canEdit('表管理')" link type="primary" @click="confirmField(scope.row)">保存</el-button></template></template></el-table-column>
                </el-table>
              </el-tab-pane>
              <el-tab-pane label="知识库" name="knowledge">
                <div class="portal-vue-knowledge-bar">
                  <span class="portal-vue-muted">{{ knowledge && !knowledgeEditing ? "最近编辑：" + knowledge.updatedBy + " · " + knowledge.updatedAt : "" }}</span>
                  <el-button v-if="!knowledgeEditing && canEdit('表管理')" type="primary" round class="portal-vue-knowledge-edit" @click="startKnowledgeEdit">编辑知识库</el-button>
                  
                </div>
                <div v-if="knowledgeEditing" class="portal-vue-md-editor">
            <div class="portal-vue-md-toolbar" @mousedown.prevent>
              <el-button size="small" text @click="mdWrap('**', '**', '加粗文字')"><strong>B</strong>&nbsp;加粗</el-button>
              <el-button size="small" text @click="mdLinePrefix('## ')">标题</el-button>
              <el-button size="small" text @click="mdLinePrefix('- ')">无序列表</el-button>
              <el-button size="small" text @click="mdLinePrefix('1. ')">有序列表</el-button>
              <el-button size="small" text @click="mdLinePrefix('> ')">引用</el-button>
              <el-button size="small" text @click="mdInlineCode">行内代码</el-button>
              <el-button size="small" text @click="mdCodeBlock">代码块</el-button>
              <el-button size="small" text @click="mdWrap('\\n---\\n', '', '')">分隔线</el-button>
              <span class="portal-vue-md-tip">左边编辑，右边预览；保存时自动转换为 Markdown 格式</span>
            </div>
            <div class="portal-vue-md-split">
              <textarea ref="mdArea" v-model="knowledgeText" class="portal-vue-md-textarea" spellcheck="false" placeholder="在这里填写本表的知识库，支持 Markdown：# 标题、**加粗**、- 列表"></textarea>
              <div class="portal-vue-knowledge-doc" v-html="renderedDraft"></div>
            </div>
            <div class="portal-vue-knowledge-floating"><el-button round @click="cancelKnowledgeEdit">取消</el-button><el-button type="primary" round @click="saveKnowledge">保存知识库</el-button></div>
          </div>
          <template v-else>
                  <div v-if="knowledge" class="portal-vue-knowledge-doc" v-html="renderedKnowledge"></div>
                  <el-empty v-else description="该表还没有知识库。灵犀智析只能依据字段注释回答，指标口径可能不准确。"><el-button v-if="canEdit('表管理')" type="primary" round @click="startKnowledgeEdit">新建知识库</el-button></el-empty>
                </template>
              </el-tab-pane>
              <el-tab-pane label="血缘查询" name="lineage">
                <div class="portal-vue-lineage-bar">
                  <el-checkbox v-model="isPro" @change="runQuery">增强模式 (is_pro)</el-checkbox>
                  <div class="portal-vue-lineage-field"><span>血缘层级 (is_for)</span><el-input-number v-model="isFor" :min="1" :max="10" size="small" @change="runQuery"></el-input-number></div>
                  <div class="portal-vue-lineage-field"><span>排序模式 (order_by)</span><el-select v-model="orderBy" size="small" style="width:220px" @change="runQuery"><el-option label="first — 最早血缘层级" value="first"></el-option><el-option label="last — 最晚血缘层级" value="last"></el-option></el-select></div>
                  <el-button type="primary" :loading="lineageLoading" @click="runQuery">查询</el-button>
                </div>
                <div v-if="lineageLoading" class="portal-vue-lineage-loading">
                  <div class="portal-vue-lineage-loading-head">
                    <span class="portal-vue-lineage-spinner"><i></i><i></i><i></i></span>
                    <div><div class="portal-vue-lineage-loading-text">正在查询血缘关系，请稍候…</div><div class="portal-vue-lineage-loading-sub">正在扫描 QuickBI 报表 · API 外部数据配置 · DataX 同步任务</div></div>
                  </div>
                  <el-skeleton :rows="6" animated />
                </div>
                <template v-else-if="queried">
                  <el-tabs v-model="cat" class="portal-vue-inner-tabs">
                    <el-tab-pane :label="'QuickBI 报表（' + result.qb.length + '）'" name="qb">
                      <el-table :data="result.qb" class="portal-vue-table" border empty-text="该表无 QuickBI 报表下游">
                        <el-table-column label="sqltable" min-width="220"><template #default="scope"><code class="portal-vue-code">{{ scope.row.sqltable }}</code></template></el-table-column>
                        <el-table-column label="数据集名称" min-width="200"><template #default="scope"><span class="portal-vue-name">{{ scope.row.datasetName }}</span></template></el-table-column>
                        <el-table-column label="数据集id" width="300"><template #default="scope"><code class="portal-vue-code">{{ scope.row.datasetId }}</code></template></el-table-column>
                        <el-table-column label="报表名称" min-width="200"><template #default="scope"><span class="portal-vue-name">{{ scope.row.reportName }}</span></template></el-table-column>
                        <el-table-column label="报表id" width="300"><template #default="scope"><code class="portal-vue-code">{{ scope.row.reportId }}</code></template></el-table-column>
                        <el-table-column label="最后修改人" width="120"><template #default="scope"><span>{{ scope.row.modifier }}</span></template></el-table-column>
                      </el-table>
                    </el-tab-pane>
                    <el-tab-pane :label="'API 外部数据配置（' + result.api.length + '）'" name="api">
                      <el-table :data="result.api" class="portal-vue-table" border empty-text="该表无 API 配置下游">
                        <el-table-column label="代数" width="100"><template #default="scope"><span>{{ scope.row.level }}</span></template></el-table-column>
                        <el-table-column label="table_name" min-width="240"><template #default="scope"><code class="portal-vue-code">{{ scope.row.tableName }}</code></template></el-table-column>
                        <el-table-column label="task_name" min-width="220"><template #default="scope"><span class="portal-vue-name">{{ scope.row.taskName }}</span></template></el-table-column>
                        <el-table-column label="type" width="180"><template #default="scope"><span>{{ scope.row.type }}</span></template></el-table-column>
                      </el-table>
                    </el-tab-pane>
                    <el-tab-pane :label="'DataX 同步任务（' + result.dx.length + '）'" name="dx">
                      <el-table :data="result.dx" class="portal-vue-table" border empty-text="该表无 DataX 同步下游">
                        <el-table-column label="任务名称" min-width="240"><template #default="scope"><span class="portal-vue-name">{{ scope.row.name }}</span></template></el-table-column>
                        <el-table-column prop="target" label="同步目标" width="220"></el-table-column>
                        <el-table-column prop="freq" label="调度频率" width="130"></el-table-column>
                        <el-table-column prop="last" label="最近运行" width="160"></el-table-column>
                        <el-table-column label="状态" width="90" align="center"><template #default="scope"><el-tag type="success" effect="light">{{ scope.row.status }}</el-tag></template></el-table-column>
                        <el-table-column prop="owner" label="负责人" width="100"></el-table-column>
                      </el-table>
                    </el-tab-pane>
                  </el-tabs>
                </template>
                <el-empty v-else description="查询当前表的下游使用情况，或切换示例表查看其他表的血缘" />
              </el-tab-pane>
            </el-tabs>
            <div v-if="editingBasic" class="api-create-footer">
              <el-button v-if="canEdit('表管理')" @click="cancelBasic">取消</el-button>
              <el-button v-if="canEdit('表管理')" type="primary" @click="saveBasic">保存配置</el-button>
            </div>
          </template>
        </div>
      </el-config-provider>
    `,
    data: () => ({
      tab: "basic",
      knowledgeEditing: false,
      knowledgeText: "",
      editingBasic: false,
      detail: null,
      detailDraft: {},
      cat: "qb",
      lineageTable: "",
      queried: false,
      lineageLoading: false,
      lineageTimer: null,
      isPro: false,
      isFor: 5,
      orderBy: "first",
      result: null,
      lineageMap: {
        "dm_ad_plan_daily_media_account_product_performance_detail": {
          qb: [
            { sqltable: "dm_ad_plan_daily_media_account_product_performance_detail", datasetName: "广告计划日报_媒体账户_产品绩效_明细", datasetId: "7a21f3c4-9b45-4d1e-8f02-3c9a5e6b7d81", reportName: "存量经营分析（江总）", reportId: "3f9b1c2d-4a5e-4f6b-9c7d-8e1a2b3c4d5e6", modifier: "谭嘉颖" },
            { sqltable: "dm_ad_plan_daily_media_account_product_performance_detail", datasetName: "广告账户日消耗_财务对账_明细", datasetId: "b84d2e91-6c03-4a7f-9e15-2d8c6f4a1b93", reportName: "信息流广告账户流水（财务对账用）", reportId: "e5c7a1f2-8b34-4d9e-a6c2-5f1b7d9e3a48", modifier: "曾祥竞" }
          ],
          api: [
            { level: "1代", tableName: "dm_ad_plan_daily_media_account_product_performance_detail", taskName: "广告计划日报查询服务", type: "外部接口数据配置" },
            { level: "1代", tableName: "dm_ad_plan_daily_media_account_product_performance_detail", taskName: "投放日报同步（外部）", type: "外部接口数据配置" }
          ],
          dx: [
            { name: "dws 广告计划日汇总 → 门户资产库", target: "StarRocks · prod_callup", freq: "每日 02:30", last: "2026-09-07 02:32", status: "成功", owner: "黄佩贤" },
            { name: "广告计划 → QuickBI 数据源", target: "MySQL · quickbi_ds", freq: "每日 06:00", last: "2026-09-07 06:03", status: "成功", owner: "谭嘉颖" }
          ],
          proQb: [{ sqltable: "dm_ad_plan_daily_media_account_product_performance_detail", datasetName: "CPA大盘消耗_周汇总", datasetId: "c19f4b27-3d68-4e5a-b812-9a0c3e7f6d25", reportName: "CPA 大盘消耗周看板", reportId: "91ad3e5c-7f20-4b48-9d61-2c8e5a0f4b73", modifier: "曾祥竞" }],
          proApi: [{ level: "2代", tableName: "dm_ad_plan_daily_media_account_product_performance_detail", taskName: "信息流消耗对账接口", type: "外部接口数据配置" }],
          proDx: [{ name: "日报热表同步 → 分析网关", target: "ClickHouse · gateway_hot", freq: "每 30 分钟", last: "2026-09-07 09:30", status: "成功", owner: "曾祥竞" }]
        },
        "dwd_user_profile_tag": {
          qb: [{ sqltable: "dwd_user_profile_tag", datasetName: "用户画像标签_宽表明细", datasetId: "f42a8c1d-5e93-4b07-a3d6-8c1f9e2b5a74", reportName: "存量客户画像看板", reportId: "2b7d9e40-1c58-4f3a-b6e9-7d2a8c5f1036", modifier: "黄佩贤" }],
          api: [{ level: "1代", tableName: "dwd_user_profile_tag", taskName: "用户画像标签查询服务", type: "外部接口数据配置" }],
          dx: [{ name: "标签宽表每日同步", target: "StarRocks · prod_callup", freq: "每日 03:10", last: "2026-09-07 03:13", status: "成功", owner: "黄佩贤" }],
          proQb: [], proApi: [], proDx: []
        },
        "ads_rta_request_hour": {
          qb: [],
          api: [{ level: "1代", tableName: "ads_rta_request_hour", taskName: "RTA 小时监控对外接口", type: "外部接口数据配置" }],
          dx: [{ name: "rta 小时粒度同步", target: "MySQL · rta_ops", freq: "每 10 分钟", last: "2026-09-07 09:40", status: "成功", owner: "林金维" }],
          proQb: [], proApi: [], proDx: []
        }
      }
    }),
    computed: {
      knowledge() { if (!this.detail) return null; return tableKnowledgeStore[this.detail.table] || null; },
      renderedDraft() { return renderKnowledgeMarkdown(normalizeToMarkdown(this.knowledgeText)); },
      renderedKnowledge() { return this.knowledge ? renderKnowledgeMarkdown(this.knowledge.markdown) : ""; },
      headerTitle() { return this.detail ? (this.detail.cnName || this.detail.table) + " · 表详情" : "表详情"; },
      activeUsers() { return state.users.filter(user => user.status !== "已停用"); },
      enabledDicts() { refreshTick.value; return state.dictionaries.filter(item => item.status === "启用"); },
      dictItems() { return dict => enabledDictItems(dict); },
      callCount() {
        if (!this.detail) return 0;
        return state.apis.filter(api => Array.isArray(api.assets) && api.assets.length ? api.assets.some(item => item.database === this.detail.database && item.table === this.detail.table) : api.database === this.detail.database && api.assetTable === this.detail.table).reduce((sum, api) => sum + Number(api.callCount30d || api.callCount || 0), 0);
      },
      total() { return this.result ? this.result.qb.length + this.result.api.length + this.result.dx.length : 0; }
    },
    methods: {
      startKnowledgeEdit() { this.knowledgeText = this.knowledge?.markdown || knowledgeTemplate(this.detail.cnName || this.detail.table); this.knowledgeEditing = true; },
      cancelKnowledgeEdit() { this.knowledgeEditing = false; this.knowledgeText = ""; },
      saveKnowledge() {
        const raw = this.knowledgeText.trim();
        if (!raw) return ep.ElMessage.warning("知识库内容不能为空");
        const markdown = normalizeToMarkdown(raw);
        tableKnowledgeStore[this.detail.table] = { markdown, updatedBy: loginUser()?.name || "", updatedAt: knowledgeNow() };
        this.knowledgeEditing = false;
        notify(`「${this.detail.cnName || this.detail.table}」知识库已保存${markdown !== raw ? "，已自动转换为 Markdown 格式" : ""}`);
      },
      mdWrap(prefix, suffix, placeholder) {
        const el = this.$refs.mdArea; if (!el) return;
        const { selectionStart: start, selectionEnd: end } = el;
        const text = this.knowledgeText;
        const selected = text.slice(start, end) || placeholder;
        this.knowledgeText = text.slice(0, start) + prefix + selected + suffix + text.slice(end);
        this.$nextTick(() => { el.focus(); el.setSelectionRange(start + prefix.length, start + prefix.length + selected.length); });
      },
      mdInlineCode() { this.mdWrap(String.fromCharCode(96), String.fromCharCode(96), "代码"); },
      mdCodeBlock() { const fence = String.fromCharCode(96).repeat(3); this.mdWrap("\n" + fence + "\n", "\n" + fence + "\n", "代码内容"); },
      mdLinePrefix(prefix) {
        const el = this.$refs.mdArea; if (!el) return;
        const text = this.knowledgeText;
        const lineStart = text.lastIndexOf("\n", el.selectionStart - 1) + 1;
        let lineEnd = text.indexOf("\n", el.selectionEnd); if (lineEnd < 0) lineEnd = text.length;
        const block = text.slice(lineStart, lineEnd).split("\n").map(line => prefix + line.replace(/^(#{1,6}\s|[-*]\s|\d+\.\s|>\s)/, "")).join("\n");
        this.knowledgeText = text.slice(0, lineStart) + block + text.slice(lineEnd);
        this.$nextTick(() => { el.focus(); el.setSelectionRange(lineStart, lineStart + block.length); });
      },
      back() { bridge.setPage("表管理"); },
      loadDetail() {
        const asset = bridge.getTableDetailAsset();
        if (!asset) return;
        this.detail = asset;
        this.rebuildDraft();
        this.lineageTable = asset.table;
        clearTimeout(this.lineageTimer);
        this.lineageLoading = false;
        this.queried = false;
        this.result = null;
        this.isPro = false;
        this.isFor = 5;
        this.orderBy = "first";
        this.tab = "basic";
        this.cat = "qb";
        this.editingBasic = false;
        this.knowledgeEditing = false;
      },
      rebuildDraft() {
        const tag = state.tables.find(table => table.name === this.detail.table);
        this.detailDraft = { owner: this.detail.owner || "", desc: this.detail.desc || "", tagTable: !!tag, dimension: !!this.detail.dimension, exportFields: [...(tag?.exportFields || [])], fields: this.detail.fields.map(field => ({ ...field, dictId: field.dictId || "" })) };
      },
      saveBasic() {
        if (!this.detailDraft.owner) return ep.ElMessage.warning("请选择表负责人");
        this.detail.owner = this.detailDraft.owner;
        this.detail.desc = this.detailDraft.desc.trim();
        this.detail.dimension = !!this.detailDraft.dimension;
        if (this.detail.dimension && !Array.isArray(this.detail.rows)) this.detail.rows = [];
        const tagIndex = state.tables.findIndex(table => table.name === this.detail.table);
        if (this.detailDraft.tagTable && tagIndex < 0) state.tables.push({ name: this.detail.table, cn: this.detail.cnName || this.detail.table, exportFields: [...this.detailDraft.exportFields], fields: this.detail.fields.map(field => ({ name: field.name, cn: field.comment || field.name, type: this.semanticType(field.type), cov: 80, def: "", calc: "", freq: "", enumv: "" })) });
        else if (this.detailDraft.tagTable && tagIndex >= 0) state.tables[tagIndex].exportFields = [...this.detailDraft.exportFields];
        else if (!this.detailDraft.tagTable && tagIndex >= 0) state.tables.splice(tagIndex, 1);
        this.editingBasic = false;
        notify("基本配置已保存");
      },
      fieldDirty(row) {
        const origin = this.detail.fields.find(field => field.name === row.name);
        if (!origin) return false;
        return (origin.dictId || "") !== (row.dictId || "") || (origin.remark || "") !== (row.remark || "");
      },
      confirmField(row) {
        const origin = this.detail.fields.find(field => field.name === row.name);
        if (origin) Object.assign(origin, { dictId: row.dictId || "", remark: row.remark || "" });
        notify(`字段「${row.name}」配置已保存`);
      },
      revertField(row) {
        const origin = this.detail.fields.find(field => field.name === row.name);
        if (origin) Object.assign(row, { dictId: origin.dictId || "", remark: origin.remark || "" });
      },
      cancelBasic() { this.rebuildDraft(); this.editingBasic = false; },
      cancelEdit() { if (this.tab === "basic") this.cancelBasic(); },
      onTabChange(name) {
        if (name === "lineage" && !this.result && !this.lineageLoading) this.runQuery();
        if (this.editingBasic && name !== this.tab) ep.ElMessage.warning("当前有未保存的编辑，请先保存或取消");
      },
      dictName(dictId) { const dict = this.enabledDicts.find(item => item.dictId === dictId); return dict ? dict.name : ""; },
      semanticType(type) { const value = String(type || "").toUpperCase(); if (/DATE|TIME/.test(value)) return "日期"; if (/BOOL/.test(value)) return "布尔"; if (/ARRAY/.test(value)) return "数组"; if (/INT|DECIMAL|DOUBLE|FLOAT|BIGINT|NUMERIC/.test(value)) return "数值"; return "文本"; },
      runQuery() {
        if (this.lineageLoading) return;
        this.lineageLoading = true;
        this.queried = false;
        clearTimeout(this.lineageTimer);
        this.lineageTimer = setTimeout(() => {
          const key = this.lineageTable.trim();
          const base = this.lineageMap[key] || { qb: [], api: [], dx: [], proQb: [], proApi: [], proDx: [] };
          const pick = (list, pro) => {
            const rows = this.isPro ? [...(list || []), ...(pro || [])] : [...(list || [])];
            return this.orderBy === "last" ? rows.reverse() : rows;
          };
          this.result = {
            key,
            qb: pick(base.qb, base.proQb),
            api: pick(base.api, base.proApi),
            dx: pick(base.dx, base.proDx)
          };
          this.queried = true;
          this.lineageLoading = false;
          this.cat = "qb";
        }, 900);
      }
    },
    mounted() { injectStyle("ops-center-tabs-style", ".ops-center-tabs > .el-tabs__header { display:flex; justify-content:center; } .ops-center-tabs > .el-tabs__header .el-tabs__nav-wrap { width:auto; flex:none; } .ops-center-tabs > .el-tabs__header .el-tabs__nav { float:none; display:inline-flex; } .ops-center-tabs > .el-tabs__header .el-tabs__nav-wrap::after { left:0; right:0; } .op-full-line > .el-tabs__header { width:100%; } .op-full-line > .el-tabs__header .el-tabs__nav-wrap { width:100% !important; flex:auto !important; } .op-full-line > .el-tabs__header .el-tabs__nav-wrap::after { display:none; } .op-full-line > .el-tabs__header .el-tabs__nav-scroll { width:100%; position:relative; display:flex; justify-content:center; text-align:center; } .op-full-line > .el-tabs__header .el-tabs__nav-scroll::after { content:''; position:absolute; left:0; right:0; bottom:0; height:2px; background-color:var(--el-border-color-light); }"); this.pageHandler = event => { if (event.detail?.page === "表详情") this.loadDetail(); }; window.addEventListener("portal:page-change", this.pageHandler); if (bridge.getPage() === "表详情") this.loadDetail(); },
    beforeUnmount() { clearTimeout(this.lineageTimer); window.removeEventListener("portal:page-change", this.pageHandler); }
  };
  mount("#tableDetailView", TableDetailApp, "table-detail");
})();
