/**
 * 页面：analysis-workbench
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    MODEL_REASONING_CHOICES,
    analysisGatewayBase,
    confirmAction,
    enabledDictItems,
    ep,
    isImageIconValue,
    mount,
    notify,
    refreshTick,
    skillRegistrySeed,
    state
  } = window.PortalVue;


  // 工作台场景卡片由「Skill 配置」驱动：icon/标题/描述/排序均来自 skill 注册表
  const skillScenarioFallback = [
    { id: "general-analyst", kind: "router", scenarioKey: "general", icon: "✦", title: "通用分析", displayDesc: "自动选择最合适的分析技能", sort: 5 },
    { id: "single", icon: "assets/skill-single-table.svg", title: "单表分析", displayDesc: "趋势、分布与异常", sort: 10 }
  ];

  let analysisSeq = 100;
  function createAnalysisSession(seed) {
    return {
      id: seed?.id || `AN${Date.now()}${analysisSeq += 1}`,
      title: seed?.title || "新的分析",
      channel: seed?.channel || "工作台对话",
      scenario: seed?.scenario || "单表分析",
      status: seed?.status || "进行中",
      time: seed?.time || new Date().toLocaleString("zh-CN", { hour12: false }).replaceAll("/", "-"),
      messages: seed?.messages ? seed.messages.map(msg => ({ ...msg, lines: [...msg.lines], refs: msg.refs ? [...msg.refs] : undefined })) : [],
      suggested: seed?.suggested || false
    };
  }

  const analysisSessionsSeed = [
    createAnalysisSession({
      id: "AN20260831001", title: "近 7 天媒体消耗趋势", channel: "飞书机器人", scenario: "单表分析", status: "已完成", time: "2026-08-31 10:24", suggested: true,
      messages: [
        { role: "user", lines: ["近 7 天各媒体消耗趋势如何？CPA 有没有异常波动？"] },
        { role: "assistant", lines: ["近 7 天总消耗 286.4 万元，环比上涨 12.3%。", "巨量渠道 CPA 上升 18%，主要来自「小说推文」计划组，建议关注。"], refs: ["广告计划日报表"] }
      ]
    }),
    createAnalysisSession({
      id: "AN20260830002", title: "渠道归因相关表与口径", channel: "工作台对话", scenario: "数据资产问答", status: "已完成", time: "2026-08-30 16:51", suggested: true,
      messages: [
        { role: "user", lines: ["有哪些表可以看渠道归因？口径是什么？"] },
        { role: "assistant", lines: ["找到 2 张相关表：「渠道归因明细」（负责人 李雨航）和「广告计划日报表」中 activate_cnt 字段（按归因口径统计）。"], refs: ["渠道归因明细", "广告计划日报表"] }
      ]
    }),
    createAnalysisSession({
      id: "AN20260830001", title: "CPA 环比上涨归因", channel: "飞书机器人", scenario: "归因分析", status: "已完成", time: "2026-08-30 09:12", suggested: true,
      messages: [
        { role: "user", lines: ["本周 CPA 环比上涨的原因是什么？"] },
        { role: "assistant", lines: ["按媒体拆解：巨量贡献 78% 的涨幅；按产品拆解：「网赚-02」产品新上 3 条计划拉高整体成本。"], refs: ["广告计划日报表"] }
      ]
    }),
    createAnalysisSession({
      id: "AN20260829003", title: "tag_value 字段下游影响", channel: "工作台对话", scenario: "数据血缘分析", status: "已完成", time: "2026-08-29 15:40", suggested: true,
      messages: [
        { role: "user", lines: ["如果修改 tag_value 字段长度，会影响哪些下游？"] },
        { role: "assistant", lines: ["下游影响 2 张表：「用户画像标签明细表」API 服务接口、「用户生命周期日报」ETL 任务。建议同步负责人调整。"], refs: ["dwd_user_profile_tag"] }
      ]
    })
  ];

  let analysisReportSeq = 0;
  function createAnalysisReport(seed) {
    return {
      id: seed.id || `RPT${Date.now()}${analysisReportSeq += 1}`,
      title: seed.title,
      scenario: seed.scenario,
      channel: seed.channel || "工作台对话",
      time: seed.time,
      tables: seed.tables || [],
      summary: seed.summary || "",
      model: seed.model || "",
      messages: seed.messages ? seed.messages.map(msg => ({ ...msg, lines: msg.lines ? [...msg.lines] : undefined, refs: msg.refs ? [...msg.refs] : undefined })) : [],
      markdown: seed.markdown || "",
      starred: seed.starred || false
    };
  }

  const analysisReportsSeed = [
    createAnalysisReport({
      id: "RPT20260831001", title: "近 7 天媒体消耗趋势报告", scenario: "单表分析", channel: "飞书机器人", time: "2026-08-31 10:24", tables: ["广告计划日报表"], starred: true,
      summary: "近 7 天总消耗 286.4 万元，环比上涨 12.3%；巨量渠道 CPA 上升 18%，建议关注「小说推文」计划组。",
      messages: [
        { role: "user", lines: ["近 7 天各媒体消耗趋势如何？CPA 有没有异常波动？"] },
        { role: "assistant", lines: ["近 7 天总消耗 286.4 万元，环比上涨 12.3%。", "巨量渠道 CPA 上升 18%，主要来自「小说推文」计划组，建议关注。"], refs: ["广告计划日报表"] }
      ]
    }),
    createAnalysisReport({
      id: "RPT20260830002", title: "CPA 环比上涨归因报告", scenario: "归因分析", channel: "飞书机器人", time: "2026-08-30 09:12", tables: ["广告计划日报表"],
      summary: "按媒体拆解：巨量贡献 78% 的涨幅；按产品拆解：「网赚-02」新上 3 条计划拉高整体成本。",
      messages: [
        { role: "user", lines: ["本周 CPA 环比上涨的原因是什么？"] },
        { role: "assistant", lines: ["按媒体拆解：巨量贡献 78% 的涨幅；按产品拆解：「网赚-02」产品新上 3 条计划拉高整体成本。"], refs: ["广告计划日报表"] }
      ]
    }),
    createAnalysisReport({
      id: "RPT20260829003", title: "tag_value 字段血缘影响报告", scenario: "数据血缘分析", channel: "工作台对话", time: "2026-08-29 15:40", tables: ["用户画像标签明细表"],
      summary: "下游影响 2 张表：「用户画像标签明细表」API 服务、「用户生命周期日报」ETL 任务。",
      messages: [
        { role: "user", lines: ["如果修改 tag_value 字段长度，会影响哪些下游？"] },
        { role: "assistant", lines: ["下游影响 2 张表：「用户画像标签明细表」API 服务接口、「用户生命周期日报」ETL 任务。建议同步负责人调整。"], refs: ["用户画像标签明细表"] }
      ]
    }),
    createAnalysisReport({
      id: "RPT20260828004", title: "渠道归因资产盘点报告", scenario: "数据资产问答", channel: "工作台对话", time: "2026-08-28 11:05", tables: ["渠道归因明细"],
      summary: "渠道归因相关表 2 张，推荐「渠道归因明细」做渠道效果分析，口径见 activate_cnt 字段注释。",
      messages: [
        { role: "user", lines: ["有哪些表可以看渠道归因？"] },
        { role: "assistant", lines: ["找到 2 张相关表：「渠道归因明细」（负责人 李雨航）和「广告计划日报表」中 activate_cnt 字段（按归因口径统计）。"], refs: ["渠道归因明细", "广告计划日报表"] }
      ]
    })
  ];

  const AnalysisWorkbenchApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <div class="portal-vue-ai-layout">
            <aside class="portal-vue-ai-side">
              <button type="button" class="portal-vue-ai-asset-btn" :class="{ active: assetView }" @click="assetView = true">
                <span class="portal-vue-ai-asset-btn-icon">📊</span>
                <span class="portal-vue-ai-asset-btn-text">分析资产</span>
                <el-tag size="small" round effect="plain">{{ reports.length }} 份报告</el-tag>
              </button>
              <el-scrollbar class="portal-vue-ai-session-scroll">
                <div class="portal-vue-ai-sessions">
                  <el-button class="portal-vue-ai-new" type="primary" plain @click="newSession">＋ 新的分析</el-button>
                  <p class="portal-vue-ai-group-label">会话记录 <span>含飞书机器人</span></p>
                  <template v-if="ongoingSessions.length">
                    <article v-for="session in ongoingSessions" :key="session.id" class="portal-vue-ai-session" :class="{ active: session.id === activeId && !assetView }" @click="openSessionFromList(session.id)">
                      <div class="portal-vue-ai-session-top"><strong>{{ session.title }}</strong><time>{{ shortTime(session.time) }}</time></div>
                      <div class="portal-vue-ai-session-meta"><el-tag size="small" :type="session.channel === '飞书机器人' ? 'success' : 'primary'" :effect="session.channel === '飞书机器人' ? 'plain' : 'light'">{{ session.channel }}</el-tag><span>{{ session.scenario }}</span><span class="portal-vue-ai-session-status running">{{ session.status }}</span></div>
                    </article>
                  </template>
                  <article v-for="session in historySessions" :key="session.id" class="portal-vue-ai-session" :class="{ active: session.id === activeId && !assetView }" @click="openSessionFromList(session.id)">
                    <div class="portal-vue-ai-session-top"><strong>{{ session.title }}</strong><time>{{ shortTime(session.time) }}</time></div>
                    <div class="portal-vue-ai-session-meta"><el-tag size="small" :type="session.channel === '飞书机器人' ? 'success' : 'primary'" :effect="session.channel === '飞书机器人' ? 'plain' : 'light'">{{ session.channel }}</el-tag><span>{{ session.scenario }}</span></div>
                  </article>
                  <p v-if="!sessions.length" class="portal-vue-muted">暂无会话</p>
                </div>
              </el-scrollbar>
            </aside>
            <section class="portal-vue-ai-main">
              <div v-if="assetView" class="portal-vue-ai-assets-page">
                <div class="portal-vue-ai-assets-head">
                  <div><h3>分析资产</h3><span class="portal-vue-muted">共 {{ reports.length }} 份分析报告，点击查看详情，右上角可复制链接分享给同事</span></div>
                  <el-button @click="assetView=false">← 返回对话</el-button>
                </div>
                <div class="portal-vue-ai-assets-grid">
                  <article v-for="report in reports" :key="report.id" class="portal-vue-ai-asset-card" @click="openReport(report)">
                    <div class="portal-vue-ai-asset-card-head">
                      <strong>{{ report.title }}</strong>
                      <time>{{ (report.time || "").slice(5, 16) }}</time>
                    </div>
                    <div class="portal-vue-ai-asset-card-tags">
                      <el-tag size="small" :type="report.channel === '飞书机器人' ? 'success' : 'primary'" :effect="report.channel === '飞书机器人' ? 'plain' : 'light'">{{ report.channel }}</el-tag>
                      <el-tag size="small" effect="plain">{{ report.scenario }}</el-tag>
                      <el-tag v-if="report.model" size="small" effect="plain">{{ report.model }}</el-tag>
                    </div>
                    <p class="portal-vue-ai-asset-card-summary">{{ report.summary || (report.markdown || "").slice(0, 80) || "（无摘要）" }}</p>
                    <div v-if="report.tables.length" class="portal-vue-ai-refs"><el-tag v-for="table in report.tables.slice(0, 3)" :key="table" size="small" effect="plain">{{ table }}</el-tag></div>
                  </article>
                  <el-empty v-if="!reports.length" description="暂无分析报告，发起一次分析后自动归档到这里"></el-empty>
                </div>
              </div>
              <div v-else class="portal-vue-ai-skillbar">
                <div class="portal-vue-ai-skillbar-head">
                  <span class="portal-vue-ai-skillbar-label">分析技能</span>
                  <span class="portal-vue-ai-skillbar-hint">{{ scenarioHint }}</span>
                </div>
                <div class="portal-vue-ai-scenarios">
                  <button v-for="scene in scenarios" :key="scene.key" type="button" class="portal-vue-ai-scenario" :class="{ active: scenario === scene.key, 'is-auto': scene.kind === 'router' }" :title="scene.desc" :aria-pressed="scenario === scene.key" @click="setScenario(scene.key)">
                    <span class="portal-vue-ai-scene-icon"><img v-if="isImageIcon(scene.icon)" :src="scene.icon" alt="" /><span v-else>{{ scene.icon }}</span></span>
                    <span class="portal-vue-ai-scene-text"><strong>{{ scene.name }}</strong><small>{{ scene.desc }}</small></span>
                    <span v-if="scene.kind === 'router'" class="portal-vue-ai-scene-badge">自动</span>
                    <span class="portal-vue-ai-scene-check" aria-hidden="true">✓</span>
                  </button>
                </div>
              </div>
              <div v-if="!assetView" class="portal-vue-ai-chat" ref="chatBox">
                <div v-if="!activeSession.messages.length" class="portal-vue-ai-welcome">
                  <h3>{{ scenarioName }}</h3>
                  <p class="portal-vue-muted">输入问题开始分析，可在输入框用 @ 引用你有权限的数据表；也可以直接在飞书机器人提问，记录同步到这里。</p>
                  <div class="portal-vue-ai-suggests">
                    <el-button v-for="text in starterSuggests" :key="text" size="small" round data-test="ai-starter" @click="input = text">{{ text }}</el-button>
                  </div>
                </div>
                <div v-for="(msg, index) in activeSession.messages" :key="index" v-show="!isEmptyMsg(msg)" class="portal-vue-ai-message" :class="[msg.role, { 'is-ask': !!msg.ask }]">
                  <span v-if="msg.role === 'assistant'" class="portal-vue-ai-avatar">灵</span>
                  <div v-if="msg.ask" class="portal-vue-ai-ask" :class="'is-' + msg.ask.status">
                    <div class="portal-vue-ai-ask-head">
                      <span class="portal-vue-ai-ask-badge">需要你确认</span>
                      <strong>{{ msg.ask.title || "先补充几个信息，我再继续分析" }}</strong>
                      <span class="portal-vue-ai-ask-state">{{ askStatusText(msg.ask) }}</span>
                    </div>
                    <p v-if="msg.ask.intro" class="portal-vue-ai-ask-intro">{{ msg.ask.intro }}</p>
                    <template v-if="msg.ask.status === 'pending'">
                      <div v-for="(q, qi) in msg.ask.questions" :key="q.key" class="portal-vue-ai-ask-q">
                        <p class="portal-vue-ai-ask-title"><span class="portal-vue-ai-ask-no">{{ qi + 1 }}</span>{{ q.question }}<em :class="{ 'is-multi': q.multiple }">{{ q.multiple ? "可多选" + (askPicked(msg.ask, q).length ? " · 已选 " + askPicked(msg.ask, q).length : "") : "单选" }}</em></p>
                        <p v-if="q.hint" class="portal-vue-muted portal-vue-ai-ask-hint">{{ q.hint }}</p>
                        <div class="portal-vue-ai-ask-options">
                          <button v-for="opt in q.options" :key="opt.label" type="button" class="portal-vue-ai-ask-option" :class="{ 'is-picked': askPicked(msg.ask, q).includes(opt.label) }" @click="toggleAsk(msg.ask, q, opt)">
                            <span class="portal-vue-ai-ask-mark" :class="{ 'is-multi': q.multiple }"></span>
                            <span class="portal-vue-ai-ask-text"><b>{{ opt.label }}</b><small v-if="opt.desc">{{ opt.desc }}</small></span>
                          </button>
                        </div>
                        <el-input v-if="q.allowCustom !== false" v-model="msg.ask.draft[q.key].custom" size="small" clearable class="portal-vue-ai-ask-custom" placeholder="都不合适？在这里自定义输入" @input="onAskCustom(msg.ask, q)"></el-input>
                      </div>
                      <div class="portal-vue-ai-ask-foot">
                        <span class="portal-vue-muted">已回答 {{ askAnsweredCount(msg.ask) }} / {{ msg.ask.questions.length }}，未回答的我会按常规口径处理</span>
                        <div>
                          <el-button size="small" text :disabled="thinking" @click="submitAsk(msg, true)">跳过，直接分析</el-button>
                          <el-button size="small" type="primary" :disabled="thinking || !askAnsweredCount(msg.ask)" @click="submitAsk(msg)">提交并继续分析</el-button>
                        </div>
                      </div>
                    </template>
                    <div v-else class="portal-vue-ai-ask-result">
                      <p v-if="!(msg.ask.result || []).length" class="portal-vue-muted">已跳过补充，按现有信息直接分析。</p>
                      <div v-for="item in msg.ask.result || []" :key="item.key" class="portal-vue-ai-ask-result-row">
                        <span>{{ item.question }}</span><strong>{{ item.answer.join("、") }}</strong>
                      </div>
                    </div>
                  </div>
                  <div v-else class="portal-vue-ai-bubble" :class="{ 'portal-vue-ai-report': msg.html, 'portal-vue-ai-bubble-streaming': msg.streaming }">
                    <div v-if="msg.reasoning" class="portal-vue-ai-think" :class="{ 'is-open': msg.thinkOpen }">
                      <button type="button" class="portal-vue-ai-think-head" @click="msg.thinkOpen = !msg.thinkOpen">
                        <span class="portal-vue-ai-think-icon">🤔</span>
                        <strong>{{ msg.streaming && !msg.html ? "思考中…" : "思考过程" }}</strong>
                        <span class="portal-vue-muted">{{ msg.reasoning.length }} 字</span>
                        <span class="portal-vue-ai-think-arrow">{{ msg.thinkOpen ? "收起 ▴" : "展开 ▾" }}</span>
                      </button>
                      <div v-show="msg.thinkOpen" class="portal-vue-ai-think-body" :class="{ 'is-live': msg.streaming && !msg.html }">{{ msg.reasoning }}</div>
                    </div>
                    <template v-if="msg.reportId"><div v-if="msg.plan && msg.plan.source && msg.plan.source !== 'manual' && !msg.streaming" class="portal-vue-ai-plan" data-test="ai-plan"><span class="portal-vue-ai-plan-label">本次</span><span class="portal-vue-ai-plan-chip">{{ msg.plan.skillName || '通用分析' }} · {{ msg.plan.output === 'report' ? '报告' : '回答' }}</span><span class="portal-vue-ai-plan-reason">{{ planReasonText(msg.plan) }}</span><el-dropdown trigger="click" @command="command => changePlan(msg, command)"><button type="button" class="portal-vue-ai-plan-change" data-test="plan-change">换一个</button><template #dropdown><el-dropdown-menu><el-dropdown-item v-for="alt in (msg.plan.alternatives || [])" :key="alt.id" :command="'skill:' + alt.id">改用「{{ alt.name }}」重新回答</el-dropdown-item><el-dropdown-item v-if="msg.plan.output !== 'report'" command="output:report" :divided="!!(msg.plan.alternatives || []).length" data-test="plan-to-report">改为生成报告</el-dropdown-item><el-dropdown-item v-else command="output:answer" :divided="!!(msg.plan.alternatives || []).length">改为简短回答</el-dropdown-item></el-dropdown-menu></template></el-dropdown></div><div v-if="msg.resolved && msg.resolved.length" class="portal-vue-ai-scope" data-test="ai-scope"><span class="portal-vue-ai-scope-label">口径</span><span v-for="item in msg.resolved" :key="item.term" class="portal-vue-ai-scope-chip" :title="item.kind + (item.carried ? '（沿用上文）' : '')">{{ item.term }} → {{ item.means }}{{ item.carried ? '（沿用）' : '' }}</span></div><p v-if="msg.leadMsg" class="portal-vue-ai-report-lead">{{ msg.leadMsg }}</p><div class="portal-vue-ai-report-card">
  <div class="portal-vue-ai-report-card-head"><span class="portal-vue-ai-report-card-file">📄</span><strong class="portal-vue-ai-report-card-title">{{ reportTitleOf(msg.reportId) }}</strong><button type="button" class="portal-vue-ai-report-open-btn" @click.stop="openReportById(msg.reportId)">打开展示所有 ›</button></div>
  <div v-if="reportMarkdownOf(msg.reportId)" class="portal-vue-ai-report-preview"><div class="portal-vue-ai-report-body" v-html="reportMarkdownHtmlOf(msg.reportId)"></div></div>
</div><p v-if="msg.trailMsg" class="portal-vue-ai-report-trail">{{ msg.trailMsg }}</p><p v-if="msg.meta" class="portal-vue-ai-report-meta">{{ msg.meta }}</p><div v-if="msg.requestId && !msg.streaming" class="portal-vue-ai-feedback"><button type="button" :class="{ on: msg.feedback === 'up' }" title="有帮助" @click="rateMessage(msg, 'up')">👍</button><button type="button" :class="{ on: msg.feedback === 'down' }" title="没帮助" @click="rateMessage(msg, 'down')">👎</button></div><div v-if="showSuggestions(msg)" class="portal-vue-ai-followups" data-test="ai-followups"><span class="portal-vue-ai-followups-label">你还可以问</span><button v-for="text in msg.suggestions" :key="text" type="button" class="portal-vue-ai-followup" data-test="ai-followup" @click="askFollowUp(text)">{{ text }}</button></div></template>
                    <template v-else-if="msg.html"><div v-if="msg.plan && msg.plan.source && msg.plan.source !== 'manual' && !msg.streaming" class="portal-vue-ai-plan" data-test="ai-plan"><span class="portal-vue-ai-plan-label">本次</span><span class="portal-vue-ai-plan-chip">{{ msg.plan.skillName || '通用分析' }} · {{ msg.plan.output === 'report' ? '报告' : '回答' }}</span><span class="portal-vue-ai-plan-reason">{{ planReasonText(msg.plan) }}</span><el-dropdown trigger="click" @command="command => changePlan(msg, command)"><button type="button" class="portal-vue-ai-plan-change" data-test="plan-change">换一个</button><template #dropdown><el-dropdown-menu><el-dropdown-item v-for="alt in (msg.plan.alternatives || [])" :key="alt.id" :command="'skill:' + alt.id">改用「{{ alt.name }}」重新回答</el-dropdown-item><el-dropdown-item v-if="msg.plan.output !== 'report'" command="output:report" :divided="!!(msg.plan.alternatives || []).length" data-test="plan-to-report">改为生成报告</el-dropdown-item><el-dropdown-item v-else command="output:answer" :divided="!!(msg.plan.alternatives || []).length">改为简短回答</el-dropdown-item></el-dropdown-menu></template></el-dropdown></div><div v-if="msg.resolved && msg.resolved.length" class="portal-vue-ai-scope" data-test="ai-scope"><span class="portal-vue-ai-scope-label">口径</span><span v-for="item in msg.resolved" :key="item.term" class="portal-vue-ai-scope-chip" :title="item.kind + (item.carried ? '（沿用上文）' : '')">{{ item.term }} → {{ item.means }}{{ item.carried ? '（沿用）' : '' }}</span></div><div class="portal-vue-ai-report-body" v-html="msg.html"></div><p v-if="msg.meta" class="portal-vue-ai-report-meta">{{ msg.meta }}</p><div v-if="msg.requestId && !msg.streaming" class="portal-vue-ai-feedback"><button type="button" :class="{ on: msg.feedback === 'up' }" title="有帮助" @click="rateMessage(msg, 'up')">👍</button><button type="button" :class="{ on: msg.feedback === 'down' }" title="没帮助" @click="rateMessage(msg, 'down')">👎</button><el-dropdown trigger="click" @command="templateId => requestReport(msg, templateId)"><button type="button" class="portal-vue-ai-make-report" data-test="make-report" title="把这段对话里已核实的数据整理成报告">📝 整理成报告</button><template #dropdown><el-dropdown-menu><el-dropdown-item v-for="template in reportTemplates" :key="template.id" :command="template.id" :data-test="'report-template-' + template.id">{{ template.name }}<span class="portal-vue-ai-make-report-desc">{{ template.when }}</span></el-dropdown-item></el-dropdown-menu></template></el-dropdown></div><div v-if="showSuggestions(msg)" class="portal-vue-ai-followups" data-test="ai-followups"><span class="portal-vue-ai-followups-label">你还可以问</span><button v-for="text in msg.suggestions" :key="text" type="button" class="portal-vue-ai-followup" data-test="ai-followup" @click="askFollowUp(text)">{{ text }}</button></div></template>
                    <template v-else><p v-for="(line, li) in msg.lines" :key="li">{{ line }}</p><div v-if="msg.confirms" class="portal-vue-ai-confirms"><el-tag v-for="item in msg.confirms" :key="item" size="small" type="info" effect="plain">{{ item }}</el-tag></div><div v-if="msg.refs" class="portal-vue-ai-refs"><el-tag v-for="ref in msg.refs" :key="ref" size="small" effect="plain">{{ ref }}</el-tag></div></template>
                  </div>
                </div>
                <div v-if="thinking" class="portal-vue-ai-message assistant"><span class="portal-vue-ai-avatar">灵</span><div class="portal-vue-ai-bubble portal-vue-ai-thinking"><p class="portal-vue-muted">正在基于你有权限的数据表进行分析<i></i><i></i><i></i></p></div></div>
              </div>
              <div v-if="!assetView" class="portal-vue-ai-input">
                <div v-if="mentionOpen" class="portal-vue-ai-mention">
                  <div class="portal-vue-ai-mention-head"><span>引用数据表</span><span class="portal-vue-muted">仅限你有权限的 {{ myTables.length }} 张表</span></div>
                  <div class="portal-vue-ai-mention-list">
                    <button v-for="table in mentionTables" :key="table" type="button" @click="insertMention(table)">{{ table }}</button>
                    <p v-if="!mentionTables.length" class="portal-vue-muted">没有匹配的数据表，或当前权限组未配置数据表权限。</p>
                  </div>
                </div>
                <div class="portal-vue-ai-composer">
                  <el-input v-model="input" type="textarea" :rows="2" resize="none" placeholder="输入分析问题，@ 可引用数据表；回车发送" @keydown.enter.native="onEnter" @input="onInput"></el-input>
                  <div class="portal-vue-ai-composer-bar">
                    <el-cascader v-model="activeTablePath" size="small" clearable filterable class="portal-vue-ai-chip-table-cascader" :options="tableCascadeOptions" :show-all-levels="false" placeholder="选择数据表" popper-class="portal-vue-ai-select-popper" @change="changeTablePath"></el-cascader>
                    <el-select v-model="model" size="small" filterable class="portal-vue-ai-chip-model-select" :loading="modelsLoading" :disabled="!models.length" placeholder="请选择" popper-class="portal-vue-ai-select-popper" @change="applyMaxModelSettings">
                      <el-option v-for="item in models" :key="item" :label="item" :value="item"></el-option>
                    </el-select>
                    <el-select v-if="reasoningSupported" v-model="reasoning" size="small" class="portal-vue-ai-chip-reasoning-select" placeholder="思考深度" popper-class="portal-vue-ai-select-popper" @change="changeReasoning">
                      <el-option v-for="item in reasoningChoices" :key="item.value" :label="item.label" :value="item.value"></el-option>
                    </el-select>
                    <span v-if="contextWindowLabel" class="portal-vue-ai-composer-limit">窗口 {{ contextWindowLabel }}</span>
                    <el-button type="primary" size="small" class="portal-vue-ai-composer-send" :disabled="!input.trim() || thinking" @click="sendMessage">发送</el-button>
                  </div>
                </div>
              </div>
              </div>

          <el-dialog v-model="reportDialog" width="1100px" top="4vh" :close-on-click-modal="true" class="portal-vue-ai-report-dialog">
<template #header>
              <div style="width:100%">
                <div class="portal-vue-ai-report-dialog-head">
                  <strong>{{ activeReport()?.title || "分析报告" }}</strong>
                  <div class="portal-vue-ai-report-dialog-actions">
                    <el-button size="small" :loading="activeReport()?._sharing" @click="shareReport(activeReport())">{{ activeReport()?._shared ? "已复制链接" : "复制分享链接" }}</el-button>
                    <el-button v-if="activeReport()?.sourceId && findSession(activeReport().sourceId)" size="small" @click="jumpToSource(activeReport())">打开来源会话</el-button>
                  </div>
                </div>
                <div v-if="activeReport()?._shareUrl" class="portal-vue-ai-share-line">
                  <span class="portal-vue-muted">分享链接</span>
                  <el-input :model-value="activeReport()._shareUrl" readonly size="small" class="portal-vue-ai-share-input" @click="selectShareInput">
                    <template #append><el-button @click.stop="copyShareUrl(activeReport())">复制</el-button></template>
                  </el-input>
                </div>
              </div>
            </template>
            <div v-if="activeReport()" class="portal-vue-ai-report-dialog-body">
              <div class="portal-vue-ai-refs" style="margin-bottom:10px">
                <el-tag size="small" :type="activeReport().channel === '飞书机器人' ? 'success' : 'primary'" :effect="activeReport().channel === '飞书机器人' ? 'plain' : 'light'">{{ activeReport().channel }}</el-tag>
                <el-tag size="small" effect="plain">{{ activeReport().scenario }}</el-tag>
                <el-tag v-for="table in activeReport().tables" :key="table" size="small" effect="plain">{{ table }}</el-tag>
                <time style="margin-left:auto;font-size:12px;color:#a5aebd">{{ activeReport().time }}</time>
              </div>
              <p v-if="activeReport().summary" class="portal-vue-ai-report-summary"><span>结论摘要</span>{{ activeReport().summary }}</p>
              <div class="portal-vue-ai-report-dialog-content">
                <div v-if="activeReport().markdown" class="portal-vue-ai-report-body portal-vue-ai-report-dialog-markdown" v-html="reportMarkdownHtml(activeReport())"></div>
                <div v-if="!activeReport().markdown && activeReport().messages.length" v-for="(msg, index) in activeReport().messages" :key="index" class="portal-vue-ai-message" :class="msg.role">
                  <div class="portal-vue-ai-bubble" :class="{ 'portal-vue-ai-report': msg.html }">
                    <template v-if="msg.html"><div class="portal-vue-ai-report-body" v-html="msg.html"></div></template>
                    <template v-else><p v-for="(line, li) in msg.lines" :key="li">{{ line }}</p><div v-if="msg.confirms" class="portal-vue-ai-confirms"><el-tag v-for="item in msg.confirms" :key="item" size="small" type="info" effect="plain">{{ item }}</el-tag></div><div v-if="msg.refs" class="portal-vue-ai-refs"><el-tag v-for="ref in msg.refs" :key="ref" size="small" effect="plain">{{ ref }}</el-tag></div></template>
                  </div>
                </div>
                <p v-if="!activeReport().markdown && !activeReport().messages.length" class="portal-vue-muted">{{ activeReport().summary || "（无内容）" }}</p>
              </div>
            </div>
          </el-dialog>
            </section>
          </div>
        </section>
      </el-config-provider>
    `,
    data:()=>({
      reportTemplates: [],
      scenario: "general",
      input: "",
      thinking: false,
      mentionOpen: false,
      mentionKeyword: "",
      activeTable: "",
      activeTablePath: [],
      models: [],
      modelsLoading: false,
      model: "",
      sessions: analysisSessionsSeed.map(session => createAnalysisSession(session)),
      gatewayTables: [],
      reasoning: "high",
      /** 用户上次手动选的思考档位（跨模型、跨刷新记住）；模型不支持时自动落到该模型默认档 */
      reasoningPref: "",
      maxTokens: 1000000,
      defaultModel: "",
      modelLimits: {},
      modelCaps: {},
      historyTimer: null,
      historyLastAt: 0,
      reports: analysisReportsSeed.map(report => createAnalysisReport(report)),
      assetView: false,
      reportDialog: false,
      activeReportId: "",
      activeId: analysisSessionsSeed[0]?.id || "",
      suggests: ["近 7 天各媒体消耗趋势如何？", "本周消耗环比上涨的原因是什么？", "有哪些表可以看渠道归因？"]
    }),
    computed:{
      scenarios(){refreshTick.value;return this.skillScenarios;},
      /* 首屏推荐问题：只推平台能回答的；有权益表权限的用户先看到权益场景的问法 */
      starterSuggests(){
        const equity=this.myTables.includes("权益-账号维度消耗统计表")?["任哥近 7 天的消耗和自营 ROI 怎么样？","近 7 天各部门的消耗对比","近 7 天自营签约率为什么下滑？"]:[];
        return [...equity,...this.suggests].slice(0,5);
      },
      skillScenarios(){
        const source = state.skills?.length ? state.skills : skillScenarioFallback;
        // 输出类 Skill（报告生成）不是用来选的分析技能：由「整理成报告」按钮或「出个周报」这类说法按需调用
        return source.filter(item=>item.id!=="numa-warehouse"&&item.kind!=="output"&&item.enabled!==false&&item.status!=="已停用").sort((a,b)=>(a.sort||99)-(b.sort||99)).map(item=>({...item,key:item.scenarioKey||item.id,icon:item.icon||"✦",name:item.title||item.name,desc:item.displayDesc||item.desc||""}));
      },
      activeSkill(){return this.skillScenarios.find(item=>item.key===this.scenario);},
      scenarioHint(){return this.activeSkill?.kind==="router"?"自动根据问题内容与你可用的技能选择，也可以手动切换":`当前使用「${this.scenarioName}」，可随时切换，或选「通用分析」让系统自动选择`;},
      scenarioName(){return this.activeSkill?.name||"单表分析";},
      activeSession(){return this.sessions.find(item => item.id === this.activeId) || this.sessions[0] || { messages: [] };},
      currentUser(){refreshTick.value;return state.users.find(user=>user.name==="曾祥竞")||state.users[0];},
      myTables(){refreshTick.value;return this.gatewayTables.length?this.gatewayTables:this.fallbackTables;},
      fallbackTables(){
        const group=state.groups.find(item=>item.name===this.currentUser?.group);
        if(!group)return[];
        if(group.tables?.includes("全部数据表"))return state.assets.map(table=>table.cnName);
        return group.tables||[];
      },
      mentionTables(){
        const keyword=this.mentionKeyword.trim().toLowerCase();
        return this.myTables.filter(table=>!keyword||table.toLowerCase().includes(keyword));
      },
      bizLineMeta(){
        const meta={};
        state.assets.forEach(table=>{if(table.bizLine)meta[table.cnName]=table.bizLine;});
        return meta;
      },
      tableGroups(){
        const groups=[];
        const lines=[...new Set(this.myTables.map(table=>this.bizLineMeta[table]).filter(Boolean))];
        for(const line of lines){
          const tables=this.myTables.filter(table=>this.bizLineMeta[table]===line);
          if(tables.length)groups.push({name:line,tables});
        }
        const rest=this.myTables.filter(table=>!this.bizLineMeta[table]);
        if(rest.length)groups.push({name:"其他",tables:rest});
        return groups;
      },
      tableCascadeOptions(){return this.tableGroups.map(group=>({value:group.name,label:group.name,children:group.tables.map(table=>({value:table,label:table}))}));},
      businessLineOptions(){return this.clarifyQuestions.find(item=>item.key==="businessLine")?.options||["存量","权益","保险","短剧","其他"];},
      clarifyQuestions(){
        const config=this.activeSkill?.clarification;
        if(!config?.enabled)return [];
        if(Array.isArray(config.questions)&&config.questions.length)return config.questions;
        return config.question?[{key:"businessLine",label:"业务线",question:config.question,options:config.options||[]}]:[];
      },
      currentContextLimit(){return this.modelLimits[this.model]||1000000;},
      /** 当前模型的思考档位：空数组 = 该模型不支持思考，输入框里不出现「深度」这一项 */
      reasoningChoices(){
        const cap=this.modelCaps[this.model];
        const levels=(cap&&cap.reasoning&&cap.reasoning.levels)||[];
        return MODEL_REASONING_CHOICES.filter(item=>levels.includes(item.value));
      },
      reasoningSupported(){return this.reasoningChoices.length>0;},
      /** 上下文只读展示：模型窗口多大说清楚，但不给用户摆 token 滑杆 */
      contextWindowLabel(){const limit=Number(this.currentContextLimit)||0;return limit?this.formatContextLimit(limit):"";},
      ongoingSessions(){return this.sessions.filter(item=>item.status==="进行中");},
      historySessions(){return this.sessions.filter(item=>item.status!=="进行中");},
      archivedReports(){refreshTick.value;return this.reports;},
      assetTree(){
        const groups={};
        this.reports.forEach(report=>{
          (groups[report.scenario]=groups[report.scenario]||[]).push(report);
        });
        return Object.entries(groups).map(([scenario,list])=>({
          id:`folder-${scenario}`,label:scenario,type:"scenario",count:list.length,
          children:list.map(report=>({id:report.id,label:report.title,type:"report",reportId:report.id}))
        }));
      }
    },
    mounted(){
      this.pageHandler=event=>{if(event.detail?.page==="灵犀智析"){this.loadGatewaySkills();this.loadMyTables();this.loadModels();this.$nextTick(()=>this.$refs.chatBox?.scrollTo({top:this.$refs.chatBox.scrollHeight}));}};
      window.addEventListener("portal:page-change",this.pageHandler);
      this.loadModels();
      this.loadGatewaySkills();
      this.loadHistory();
    },
    beforeUnmount(){window.removeEventListener("portal:page-change",this.pageHandler);},
    methods:{
      async loadGatewaySkills(){
        try{
          const response=await fetch(`${analysisGatewayBase}/v1/skills`);
          if(!response.ok)return;
          const list=await response.json();
          if(Array.isArray(list)&&list.length){
            const remotes=list.map(entry=>{
              const builtin=skillRegistrySeed.find(item=>item.id===entry.id);
              return builtin?{...entry,name:builtin.name,version:builtin.version,icon:builtin.icon,title:builtin.title,displayDesc:builtin.displayDesc,sort:builtin.sort,scenarioKey:builtin.scenarioKey,desc:builtin.desc,clarification:entry.clarification||builtin.clarification,assetScope:entry.assetScope||builtin.assetScope,responseContract:entry.responseContract||builtin.responseContract,versions:entry.versions||builtin.versions,stats:entry.stats||builtin.stats}:{...entry,versions:entry.versions||[],stats:entry.stats||{calls:0,successRate:"—",avgLatency:"—",tokens:"—"}};
            });
            // 门户手动新增的 Skill 不在网关注册表里，刷新时保留，避免刚建完就消失
            const locals=(state.skills||[]).filter(item=>item.local&&!remotes.some(entry=>entry.id===item.id));
            state.skills=[...remotes,...locals];
          }
        }catch(error){/* 网关未启动时保留内置注册表 */}
      },
      async loadHistory(){
        try{
          const response=await fetch(`${analysisGatewayBase}/v1/history`);
          if(!response.ok)return;
          const data=await response.json();
          const sessions=Array.isArray(data.sessions)?data.sessions:[];
          const reports=Array.isArray(data.reports)?data.reports:[];
          if(sessions.length){
            this.sessions=sessions.map(s=>createAnalysisSession({
              ...s,
              messages:(s.messages||[]).map(m=>({...m,lines:Array.isArray(m.lines)?[...m.lines]:[],refs:m.refs?[...m.refs]:undefined,streaming:false}))
            }));
            this.sessions.forEach(s=>{if(s.status==="进行中")s.status="已完成";});
            this.activeId=this.sessions[0]?.id||this.activeId;
          }
          if(reports.length){
            this.reports=reports.map(r=>createAnalysisReport({
              ...r,
              messages:(r.messages||[]).map(m=>({...m,lines:Array.isArray(m.lines)?[...m.lines]:undefined,refs:m.refs?[...m.refs]:undefined}))
            }));
          }
          if(!sessions.length&&!reports.length){
            // 首次运行：把内置演示记录一次性写入网关，所有访客看到一致的历史
            this.persistHistory();
          }
        }catch(error){/* 网关未启动时保留本地种子 */}
      },
      historyBody(){
        return JSON.stringify({sessions:this.sessions.map(s=>({...s,messages:s.messages.map(m=>({...m,streaming:false}))})),reports:this.reports});
      },
      /* 保存历史：默认防抖 600ms；immediate=true（回答完成时）立即保存。
         每次调用都会取消上一次的定时器，所以页面在定时器触发前被关闭 / 刷新就会丢数据——
         这里在 pagehide 时把还没发出的那一次用 keepalive 补发出去。 */
      persistHistory(immediate=false){
        clearTimeout(this.historyTimer);
        this.historyTimer=null;
        if(!this.historyFlushBound){
          this.historyFlushBound=true;
          window.addEventListener("pagehide",()=>{
            if(!this.historyPending)return;
            this.historyPending=false;
            try{fetch(`${analysisGatewayBase}/v1/history`,{method:"PUT",headers:{"Content-Type":"application/json"},body:this.historyBody(),keepalive:true}).catch(()=>{});}catch(error){/* 超过 keepalive 体积上限时放弃补发 */}
          });
        }
        const send=()=>{
          this.historyTimer=null;
          this.historyPending=false;
          fetch(`${analysisGatewayBase}/v1/history`,{method:"PUT",headers:{"Content-Type":"application/json"},body:this.historyBody()}).catch(()=>{/* 网关未启动时忽略 */});
        };
        this.historyPending=true;
        if(immediate)send();else this.historyTimer=setTimeout(send,600);
      },
      /* 当前登录人有权限的表：以服务端会话为准（/v1/auth/me），不再按写死的账号取 */
      async loadMyTables(){
        try{
          const response=await fetch(`${analysisGatewayBase}/v1/auth/me`);
          if(!response.ok)return;
          const data=await response.json();
          if(Array.isArray(data.tables))this.gatewayTables=data.tables;
        }catch(error){/* 网关未启动时回退到权限组本地数据 */}
      },
      async loadModels(){
        this.modelsLoading=true;
        try{
          const response=await fetch(`${analysisGatewayBase}/v1/models`);
          if(response.ok){
            const data=await response.json();
            this.models=data.models||[];
            this.defaultModel=data.default||this.models[0]||"";
            if(!this.models.includes(this.model))this.model=this.defaultModel;
            this.modelLimits={};
            this.modelCaps={};
            (data.details||[]).forEach(item=>{
              this.modelLimits[item.id]=item.contextLimit;
              this.modelCaps[item.id]={contextLimit:item.contextLimit,reasoning:item.reasoning||{levels:[],default:""},capabilityConfigured:Boolean(item.capabilityConfigured)};
            });
            this.applyMaxModelSettings();
          }
        }catch(error){/* 网关未启动时保持空列表，界面显示提示 */}
        this.modelsLoading=false;
      },
      /** 模型换了只改「默认」：上下文按该模型上限自动装填，思考档位沿用用户上次选的（不支持就落到该模型默认档） */
      applyMaxModelSettings(){
        const cap=this.modelCaps[this.model]||{};
        const levels=(cap.reasoning&&cap.reasoning.levels)||[];
        const preferred=this.reasoningPref||this.readReasoningPref();
        if(levels.length&&levels.includes(preferred))this.reasoning=preferred;
        else this.reasoning=(cap.reasoning&&cap.reasoning.default)||levels[levels.length-1]||"";
        this.maxTokens=this.currentContextLimit;
      },
      readReasoningPref(){
        try{return localStorage.getItem("portalReasoningPref")||"";}catch(error){return "";}
      },
      /** 用户手动选档：记住选择，下次提问 / 换回这个模型时都用它 */
      changeReasoning(level){
        if(!this.reasoningChoices.some(item=>item.value===level))return;
        this.reasoning=level;
        this.reasoningPref=level;
        try{localStorage.setItem("portalReasoningPref",level);}catch(error){/* 隐私模式忽略 */}
      },
      formatContextLimit(limit){
        const value=Number(limit)||0;
        if(value>=1000000)return (value/1000000).toFixed(value%1000000?1:0)+"M";
        return Math.round(value/1000)+"K";
      },
      changeTablePath(path){
        this.activeTable=Array.isArray(path)?path[1]||"":"";
      },
      newSession(){
        this.assetView=false;
        const session=createAnalysisSession({title:"新的分析",scenario:this.scenarioName});
        session.status="进行中";
        this.sessions.unshift(session);
        this.activeId=session.id;
        this.input="";
        this.mentionOpen=false;
        this.persistHistory();
      },
      openSession(id){
        this.activeId=id;
        const session=this.sessions.find(item=>item.id===id);
        if(session)this.scenario=this.skillScenarios.find(scene=>scene.name===session.scenario)?.key||this.skillScenarios[0]?.key||"single";
        this.$nextTick(()=>this.$refs.chatBox?.scrollTo({top:this.$refs.chatBox.scrollHeight}));
      },
      setScenario(key){
        this.scenario=key;
        const session=this.activeSession;
        if(session&&!session.messages.length&&!session.suggested)session.scenario=this.scenarioName;
      },
      isImageIcon(icon){return isImageIconValue(icon);},
      async removeReport(report){
        if(!await confirmAction("删除报告",`确认从分析资产中删除「${report.title}」？`))return;
        this.reports=this.reports.filter(item=>item.id!==report.id);
        if(this.activeReportId===report.id)this.reportDialog=false;
        notify(`报告「${report.title}」已删除`);
        fetch(`${analysisGatewayBase}/v1/history/report/${encodeURIComponent(report.id)}`,{method:"DELETE"}).catch(()=>{/* 网关未启动忽略 */});
        this.persistHistory();
      },
      findSession(id){return this.sessions.find(item=>item.id===id);},
      openAssets(){this.assetView=true;},
      openReport(report){
        this.activeReportId=report.id;
        this.reportDialog=true;
        // 打开弹窗后自动滚动到正文最底部，方便直接读到报告结尾
        this.$nextTick(()=>{
          const body=document.querySelector(".portal-vue-ai-report-dialog .el-dialog__body");
          if(body)body.scrollTop=body.scrollHeight;
        });
      },
      activeReport(){return this.reports.find(item=>item.id===this.activeReportId);},
      openReportById(reportId){
        const report=this.reports.find(item=>item.id===reportId);
        if(!report){ep.ElMessage.info("该报告不存在或已被删除");return;}
        this.openReport(report);
      },
      reportTitleOf(reportId){
        const report=this.reports.find(item=>item.id===reportId);
        return report?.title?.replace(/ · 报告$/,"")||"分析报告";
      },
      reportMarkdownOf(reportId){
        const report=this.reports.find(item=>item.id===reportId);
        return report?.markdown||"";
      },
      reportMarkdownHtmlOf(reportId){return this.renderMarkdown(this.reportMarkdownOf(reportId));},
      reportMarkdownHtml(report){return this.renderMarkdown(report?.markdown||"");},
      openSessionFromList(id){this.assetView=false;this.openSession(id);},
      async shareReport(report){
        report._sharing=true;
        try{
          const gatewayBase=analysisGatewayBase;
          const response=await fetch(`${gatewayBase}/v1/shares`,{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({
              title:report.title,
              scenario:report.scenario,
              model:report.model||"",
              tablesUsed:report.tables,
              question:(report.messages.find(msg=>msg.role==="user")?.lines||[]).join(" "),
              report:report.markdown||report.messages.filter(msg=>msg.role==="assistant").map(msg=>(msg.lines||[]).join("\n")).filter(Boolean).join("\n\n")||report.summary||"",
              createdBy:this.currentUser?.name||""
            })
          });
          const data=await response.json();
          if(!response.ok)throw new Error(data.error||"生成失败");
          const shareUrl=`${location.origin}${location.pathname}share.html?id=${data.id}`;
          report._shareUrl=shareUrl;
          report._shared=true;
          try{await navigator.clipboard.writeText(shareUrl);}catch(error){/* 无剪贴板权限时用户可从界面手动复制 */}
        }catch(error){
          ep.ElMessage.error(`生成分享链接失败：${error.message}，请确认网关已启动`);
        }
        report._sharing=false;
      },
      async shareChatReport(msg){
        const report=this.reports.find(item=>item.id===msg._reportId);
        if(!report){ep.ElMessage.warning("该报告尚未归档，无法分享");return;}
        msg._sharing=true;
        await this.shareReport(report);
        msg._sharing=false;
        msg._shared=report._shared;
      },
      copyShareUrl(report){
        try{navigator.clipboard.writeText(report._shareUrl);ep.ElMessage.success("分享链接已复制");}catch(error){ep.ElMessage.warning("复制失败，请点击链接手动选择复制");}
      },
      selectShareInput(event){event?.target?.select?.();},
      buildPortalContext(cnNames){
        return cnNames.map(cnName => {
          const asset = state.assets.find(item => item.cnName === cnName);
          if (!asset) return null;
          const dictIds = [...new Set((asset.fields || []).map(field => field.dictId).filter(Boolean))];
          const dictEnums = dictIds.map(dictId => {
            const dict = state.dictionaries.find(item => item.dictId === dictId);
            if (!dict) return null;
            return { name: dict.name, items: enabledDictItems(dict).map(item => item.code + "=" + item.name) };
          }).filter(Boolean);
          const tagTable = state.tables.find(table => table.name === asset.table);
          return {
            cnName: asset.cnName,
            externalName: asset.externalName || "",
            desc: asset.desc || "",
            bizLine: asset.bizLine || "",
            fields: (asset.fields || []).map(field => ({
              name: field.name,
              comment: field.comment || "",
              remark: field.remark || "",
              dict: field.dictId ? (state.dictionaries.find(item => item.dictId === field.dictId)?.name || "") : ""
            })),
            dictEnums,
            tagConfig: tagTable ? { 名称: tagTable.cn || "", 标签字段: tagTable.exportFields || [] } : null,
            dimensionRows: (asset.rows || []).slice(0, 30)
          };
        }).filter(Boolean);
      },
      dictNameById(dictId){ return state.dictionaries.find(item => item.dictId === dictId)?.name || ""; },
      jumpToSource(report){
        const session=report.sourceId?this.findSession(report.sourceId):null;
        if(!session){ep.ElMessage.info("演示数据：来源会话已归档，可在左侧会话记录中查看");return;}
        this.reportDialog=false;
        this.assetView=false;
        this.openSession(session.id);
      },
      toggleStar(report){
        report.starred=!report.starred;
        notify(report.starred?"已收藏":"已取消收藏");
      },
      archiveReport(session,question,reportData,markdownText,liveMsg,meta){
        const report=createAnalysisReport({
          sourceId:session.id,
          title:`${session.title} · 报告`,
          scenario:session.scenario,
          channel:session.channel==="飞书机器人"?"飞书机器人":"工作台对话",
          time:session.time,
          tables:reportData.tablesUsed||[],
          summary:reportData.summary,
          model:meta?.model||"",
          markdown:String(markdownText||""),
          messages:session.messages.filter(msg=>msg.role==="user"||msg.html||msg.lines?.length).map(msg=>({role:msg.role,lines:msg.lines||[],html:msg.html||"",refs:msg.refs}))
        });
        this.reports.unshift(report);
        if(liveMsg)liveMsg.reportId=report.id;
        this.persistHistory();
      },
      onEnter(event){
        if(event.shiftKey)return;
        event.preventDefault();
        this.sendMessage();
      },
      onInput(value){
        const match=String(value||"").match(/@([^@\s]*)$/);
        if(match){this.mentionOpen=true;this.mentionKeyword=match[1];}
        else this.mentionOpen=false;
      },
      insertMention(table){
        this.input=String(this.input||"").replace(/@([^@\s]*)$/,`@${table} `);
        this.mentionOpen=false;
        this.mentionKeyword="";
      },
      tablesForBusinessLine(line){return this.tableGroups.find(group=>group.name===line)?.tables||[];},
      shortTime(value){
        const m=String(value||"").match(/(\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})/);
        return m?`${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")} ${m[3].padStart(2,"0")}:${m[4]}`:String(value||"").slice(5,16);
      },
      isEmptyMsg(msg){
        return !(msg.ask||msg.reportId||msg.streaming||msg.html||(msg.lines||[]).some(line=>String(line).trim()));
      },
      /** 对话内的「AI 提问」卡片：单选 / 多选 / 自定义输入，提交后让 AI 带着答案继续回复 */
      buildAsk(cfg,resume){
        const questions=(cfg.questions||[]).map((q,index)=>({
          key:q.key||`q${index+1}`,label:q.label||"",question:String(q.question||""),hint:q.hint||"",
          multiple:!!q.multiple,allowCustom:q.allowCustom!==false,
          options:(q.options||[]).map(opt=>typeof opt==="string"?{label:opt,desc:(q.descriptions&&q.descriptions[opt])||""}:{label:String(opt.label||""),desc:String(opt.desc||"")}).filter(opt=>opt.label)
        }));
        const draft={};
        questions.forEach(q=>{draft[q.key]={picked:[],custom:""};});
        return {title:cfg.title||"",intro:cfg.intro||"",questions,draft,status:"pending",result:[],resume:resume||{}};
      },
      /** 从模型输出里取出 ```ask {json} ``` 提问块；返回去掉提问块后的正文 */
      extractAsk(text){
        const match=String(text).match(/```ask\s*([\s\S]*?)```/);
        if(!match)return null;
        let cfg;
        try{cfg=JSON.parse(match[1].trim());}catch(error){return null;}
        const questions=(Array.isArray(cfg.questions)?cfg.questions:[]).filter(q=>q&&q.question&&Array.isArray(q.options)&&q.options.length).slice(0,4)
          .map(q=>({...q,options:q.options.slice(0,8)}));
        if(!questions.length)return null;
        return {text:String(text).replace(match[0],"").trim(),cfg:{title:cfg.title,intro:cfg.intro,questions}};
      },
      /** 流式渲染时先把还没收完的提问块藏起来，避免闪出一段 JSON */
      stripAsk(text){return String(text).replace(/```ask[\s\S]*$/,"").replace(/`{1,3}(a|as)?$/,"");},
      askStatusText(ask){return ask.status==="pending"?"请选择或输入":ask.status==="skipped"?"已跳过":"已回答";},
      askPicked(ask,q){return ask.draft?.[q.key]?.picked||[];},
      askAnswerOf(ask,q){
        const draft=ask.draft?.[q.key];
        if(!draft)return [];
        const custom=String(draft.custom||"").trim();
        return custom?[...draft.picked,custom]:[...draft.picked];
      },
      askAnsweredCount(ask){return ask.questions.filter(q=>this.askAnswerOf(ask,q).length).length;},
      toggleAsk(ask,q,opt){
        const draft=ask.draft[q.key];
        const has=draft.picked.includes(opt.label);
        if(q.multiple)draft.picked=has?draft.picked.filter(item=>item!==opt.label):[...draft.picked,opt.label];
        else{draft.picked=has?[]:[opt.label];draft.custom="";}
      },
      onAskCustom(ask,q){
        /* 单选题里输入自定义内容，等价于换成「其他」，取消已选项 */
        if(!q.multiple&&String(ask.draft[q.key].custom||"").trim())ask.draft[q.key].picked=[];
      },
      submitAsk(msg,skip=false){
        const ask=msg.ask;
        if(!ask||ask.status!=="pending"||this.thinking)return;
        const result=skip?[]:ask.questions
          .map(q=>({key:q.key,label:q.label||q.question,question:q.question,answer:this.askAnswerOf(ask,q)}))
          .filter(item=>item.answer.length);
        ask.result=result;
        ask.status=skip?"skipped":"answered";
        const answers={};
        result.forEach(item=>{answers[item.key]=item.answer.join("、");});
        this.persistHistory();
        this.sendMessage({question:ask.resume?.question||"",clarifyAnswers:answers,askResult:result,resumed:true,skipped:skip});
      },
      async sendMessage({question:questionOverride="",clarifyAnswers=null,askResult=[],resumed=false,skipped=false,reportOutput=null,forcedSkillId=""}={}){
        const question=(questionOverride||this.input).trim();
        if(!question||this.thinking)return;
        const explicitlyReferenced=this.myTables.some(table=>question.includes(`@${table}`))||!!this.activeTable;
        /* clarifyAnswers 为 null 表示用户刚发出问题：先走澄清面板；{} 表示用户选择跳过 */
        // 追问（本会话已经有回答）和「整理成报告」不再重复问业务线：上下文已经有了
        const hasPriorAnswer=(this.activeSession?.messages||[]).some(msg=>msg.role==="assistant"&&(msg.html||msg.reportId));
        if(this.activeSkill?.clarification?.enabled&&!explicitlyReferenced&&clarifyAnswers===null&&!reportOutput&&!forcedSkillId&&!hasPriorAnswer&&this.clarifyQuestions.length){
          let first=this.activeSession;
          if(!first.id||first.suggested){
            first=createAnalysisSession({title:question.slice(0,18)||"新的分析",scenario:this.scenarioName});
            this.sessions.unshift(first);
            this.activeId=first.id;
          }
          first.messages.push({role:"user",lines:[question]});
          first.title=first.title==="新的分析"?question.slice(0,18):first.title;
          first.messages.push({role:"assistant",lines:[],ask:this.buildAsk({title:"先确认一下，我再开始分析",intro:"你的问题没有指定数据表，我需要先确定范围，避免在无关的表里检索。",questions:this.clarifyQuestions},{question})});
          this.input="";
          this.persistHistory();
          return this.$nextTick(()=>{this.$refs.chatBox?.scrollTo({top:this.$refs.chatBox.scrollHeight,behavior:"smooth"});});
        }
        const answers=clarifyAnswers||{};
        const businessLine=answers.businessLine||"";
        const confirmations=this.clarifyQuestions.filter(item=>answers[item.key])
          .map(item=>(item.label||item.question)+"："+answers[item.key]);
        const assetCandidates=businessLine?this.tablesForBusinessLine(businessLine):[];
        let session=this.activeSession;
        if(!session.id||session.suggested){
          session=createAnalysisSession({title:question.slice(0,18)||"新的分析",scenario:this.scenarioName});
          this.sessions.unshift(session);
          // 取回响应式代理：上面的本地变量是原始对象，之后对它的写入（流式文本、完成状态、反馈按钮）不会触发界面更新
          session=this.sessions[0];
          this.activeId=session.id;
        }
        const mentionedTables=[...new Set([...this.myTables.filter(table=>question.includes(`@${table}`)),...(this.activeTable?[this.activeTable]:[])])];
        const evidenceTables=assetCandidates.length?assetCandidates:mentionedTables;
        const askConfirms=askResult.map(item=>`${item.label}：${item.answer.join("、")}`);
        /* 提问卡片提交后：回显「补充信息」，并把答案拼进发给模型的问题里，让它继续而不是重复提问 */
        const apiQuestion=resumed?(askResult.length
          ?`${question}\n\n用户补充信息（针对你刚才的提问）：\n${askResult.map(item=>`- ${item.question}：${item.answer.join("、")}`).join("\n")}\n请基于以上补充信息直接给出分析，不要再次提问。`
          :`${question}\n\n（用户选择跳过补充，请基于现有信息尽力分析，并在结论中说明你的假设，不要再次提问。）`):question;
        session.messages.push({role:"user",lines:[resumed?(skipped?"跳过补充，直接分析":"已补充信息，请继续分析"):question],confirms:(resumed?askConfirms:confirmations).length?(resumed?askConfirms:confirmations):undefined,refs:evidenceTables.length?evidenceTables:undefined});
        if(!resumed)session.title=session.title==="新的分析"?question.slice(0,18):session.title;
        this.input="";
        this.mentionOpen=false;
        this.thinking=true;
        this.persistHistory();
        const gatewayAvailable=this.models.length>0;
        if(!gatewayAvailable){
          await new Promise(resolve=>setTimeout(resolve,700));
          this.thinking=false;
          if(!resumed&&!mentionedTables.length&&this.myTables.length){
            /* 演示：网关未启动时模拟「AI 信息不足 → 提问 → 用户选择后继续」 */
            session.messages.push({role:"assistant",lines:[],ask:this.buildAsk({
              title:"这个问题我还缺几个信息",
              intro:"为了给出准确的结论，请帮我确认下面几点（可多选，也可以自己写）。",
              questions:[
                {key:"metric",label:"关注指标",question:"你主要关注哪个指标？",hint:"选一个主指标，其余作为辅助参考",options:[{label:"消耗",desc:"cost，广告花费"},{label:"CPA",desc:"cost / activate_cnt"},{label:"ROI",desc:"收入 / 消耗"},{label:"注册转化率",desc:"register_cnt / activate_cnt"}]},
                {key:"period",label:"时间范围",question:"分析哪个时间范围？",options:["近 7 天","近 30 天","本月至今","自定义（请在下方输入）"]},
                {key:"dimension",label:"拆解维度",question:"希望按哪些维度拆解？",multiple:true,options:["媒体","账户","计划","产品","日期"]}
              ]
            },{question})});
            session.status="进行中";
            this.persistHistory();
            return this.$nextTick(()=>{this.$refs.chatBox?.scrollTo({top:this.$refs.chatBox.scrollHeight,behavior:"smooth"});});
          }
          session.status="已完成";
          session.time=new Date().toLocaleString("zh-CN",{hour12:false}).replaceAll("/","-");
          const lines=this.myTables.length
            ?["本地分析网关未启动（scripts/analysis-gateway.cjs），当前为原型演示回复。","启动方式：RELAY_API_KEY=<中转站Key> node scripts/analysis-gateway.cjs，刷新后即可获得真实分析报告。"]
            :["当前权限组未配置数据表权限，无法发起分析，请联系管理员在「权限组 → 数据表权限」中授权。"];
          session.messages.push({role:"assistant",lines:[...(askConfirms.length?[`已收到你的补充：${askConfirms.join("；")}。`]:[]),...(businessLine?[`已按「${businessLine}」业务线筛选 ${assetCandidates.length} 张可检索数据表。`]:[]),...lines],refs:(evidenceTables.length?evidenceTables:this.myTables).slice(0,3)});
          return this.$nextTick(()=>{this.$refs.chatBox?.scrollTo({top:this.$refs.chatBox.scrollHeight,behavior:"smooth"});});
        }
        try{
          const response=await fetch(`${analysisGatewayBase}/v1/analyze`,{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({user:this.currentUser?.name||"曾祥竞",question:apiQuestion,scenario:forcedSkillId?(this.skillScenarios.find(item=>item.id===forcedSkillId)?.key||this.scenario):this.scenario,skillId:forcedSkillId||this.activeSkill?.id||"",tables:mentionedTables,assetCandidates,businessLine,model:this.model,reasoningEffort:this.reasoning,maxTokens:this.maxTokens,stream:true,...(reportOutput||{}),conversation:this.buildConversation(session),portalContext:this.buildPortalContext(evidenceTables)})
          });
          const contentType=response.headers.get("content-type")||"";
          if(!response.ok||(contentType.includes("application/json")&&!contentType.includes("event-stream"))){
            const data=await response.json().catch(()=>({}));
            session.status="已完成";
            session.time=new Date().toLocaleString("zh-CN",{hour12:false}).replaceAll("/","-");
            session.messages.push({role:"assistant",lines:[`分析失败：${data.error||"未知错误"}`]});
            this.persistHistory();
          }else{
            const live={role:"assistant",lines:[""],streaming:true};
            session.messages.push(live);
            const liveMsg=session.messages[session.messages.length-1];
            const reader=response.body.getReader();
            const decoder=new TextDecoder();
            let buffer="",full="",meta=null,errorMsg="",reasoningText="";
            const toolLog=[];
            const idleTimeoutMs=45000, textIdleMs=60000;
            let lastDataAt=Date.now(), lastTextAt=Date.now();
            const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
            while(true){
              const elapsedData=Date.now()-lastDataAt;
              if(elapsedData>idleTimeoutMs){errorMsg="连接空闲超时（45s 无数据），模型响应中断，请重试";break;}
              if((full||reasoningText)&&Date.now()-lastTextAt>textIdleMs){errorMsg="模型输出停滞（60s 无新内容），请重试";break;}
              let chunk;
              try{
                chunk=await Promise.race([
                  reader.read(),
                  wait(Math.min(idleTimeoutMs-elapsedData, textIdleMs))
                ]);
              }catch(err){errorMsg="模型响应中断，请重试";break;}
              if(!chunk)continue;
              const {done,value}=chunk;
              if(done)break;
              lastDataAt=Date.now();
              buffer+=decoder.decode(value,{stream:true});
              const parts=buffer.split("\n\n");
              buffer=parts.pop();
              for(const part of parts){
                const line=part.trim();
                if(!line.startsWith("data:")||line==="# hb")continue;
                let evt;try{evt=JSON.parse(line.slice(5).trim());}catch(err){continue;}
                if(evt.delta){
                  this.thinking=false;
                  if(liveMsg.reasoning&&liveMsg.thinkOpen!==false&&!full)liveMsg.thinkOpen=false;
                  lastTextAt=Date.now();
                  full+=evt.delta;
                  // 流式中按 markdown 渲染，换行/列表/标题即时生效，避免整段文本挤在一起
                  liveMsg.html=this.renderMarkdown(this.stripAsk(full));
                  liveMsg.lines=[];
                  if(Date.now()-this.historyLastAt>5000){this.historyLastAt=Date.now();this.persistHistory();}
                  this.$nextTick(()=>{const box=this.$refs.chatBox;if(box)box.scrollTop=box.scrollHeight;});
                }
                if(evt.reasoning){
                  this.thinking=false;
                  lastTextAt=Date.now();
                  reasoningText+=evt.reasoning;
                  liveMsg.reasoning=reasoningText;
                  if(liveMsg.thinkOpen===undefined)liveMsg.thinkOpen=true;
                  if(!full)liveMsg.lines=[];
                  this.$nextTick(()=>document.querySelectorAll(".portal-vue-ai-think-body.is-live").forEach(el=>{el.scrollTop=el.scrollHeight;}));
                  if(Date.now()-this.historyLastAt>5000){this.historyLastAt=Date.now();this.persistHistory();}
                  this.$nextTick(()=>{const box=this.$refs.chatBox;if(box)box.scrollTop=box.scrollHeight;});
                }
                if(evt.started){
                  liveMsg.resolved=Array.isArray(evt.resolved)?evt.resolved:[];
                  liveMsg.skillId=evt.routedSkill?.id||this.activeSkill?.id||"";
                  liveMsg.plan=evt.plan||null;
                }
                if(evt.status){
                  lastTextAt=Date.now();
                  if(!full&&!reasoningText)liveMsg.lines=[evt.status];
                }
                if(evt.tool){
                  lastTextAt=Date.now();
                  toolLog.push(evt.tool);
                  if(!full)liveMsg.lines=[`工具取数：${toolLog.map(call=>call.name+(call.table?`（${call.table}）`:"")+(call.ok?"":" ✗")).join("、")}`];
                }
                if(evt.done)meta=evt.meta||{};
                if(evt.error)errorMsg=evt.error;
              }
            }
            this.thinking=false;
            liveMsg.streaming=false;
            if(liveMsg.reasoning)liveMsg.thinkOpen=false;
            const askFound=this.extractAsk(full);
            if(askFound)full=askFound.text;
            session.status=askFound?"进行中":"已完成";
            session.time=new Date().toLocaleString("zh-CN",{hour12:false}).replaceAll("/","-");
            if(errorMsg&&!full){
              session.messages.splice(session.messages.indexOf(liveMsg),1,{role:"assistant",lines:[`分析失败：${errorMsg}`]});
            }else{
              // 上下总结：取自报告首两行（lead）与末尾要点（trail），报告本体只以超链形式置于中间
              const allLines=String(full).split(/\r?\n/).map(line=>line.replace(/[#*`|>]/g,"").trim()).filter(Boolean);
              const lead=allLines.slice(0,2).join("；").slice(0,120);
              const trail=(allLines.slice(2).map(line=>line.replace(/^[-•\d、.\s]+/,"").trim()).filter(line=>line.length>6&&!line.startsWith("证据限制")&&!line.includes("证据限制")).pop()||"分析详情、指标口径与上下游血缘见报告全文。").slice(0,80);
              // 只有用户明确要报告（服务端判定 output=report）才归档成报告卡片；其余回答不论长短都直接显示在对话里
              const isReport=!errorMsg&&!askFound&&meta?.output==="report"&&full.trim().length>=40;
              liveMsg.meta=this.buildMetaLine(meta||{})+(errorMsg?` · ⚠️ ${errorMsg}`:"");
              liveMsg.requestId=meta?.requestId||"";
              if(liveMsg.requestId)this.loadReportTemplates();
              liveMsg.suggestions=(meta?.suggestions||[]).map(item=>item.text).filter(Boolean).slice(0,3);
              if(meta?.resolvedTerms)liveMsg.resolved=meta.resolvedTerms;
              if(meta?.pack)liveMsg.skillId=meta.pack;
              if(meta?.plan)liveMsg.plan=meta.plan;
              liveMsg.terms=(liveMsg.resolved||[]).map(item=>item.term).slice(0,6);
              if(isReport){
                // 真正的分析报告：消息上下总结 + 中间报告超链，归档到分析资产
                liveMsg.html="";
                liveMsg.lines=[];
                liveMsg.leadMsg=lead;
                liveMsg.trailMsg=trail;
                this.archiveReport(session,question,{tablesUsed:meta?.tablesUsed||[],summary:lead},full,liveMsg,meta);
              }else{
                // 非报告的回答（过短/中断/普通问答）：不归档，直接在聊天区展示内容
                liveMsg.html=this.renderMarkdown(full);
                liveMsg.lines=[];
              }
            }
            if(askFound){
              /* 模型信息不足、主动提问：正文（若有）保留，提问卡片接在后面，等用户选完再继续 */
              if(!full.trim()){const at=session.messages.indexOf(liveMsg);if(at>=0)session.messages.splice(at,1);}
              session.messages.push({role:"assistant",lines:[],ask:this.buildAsk(askFound.cfg,{question})});
              this.persistHistory();
            }
            this.persistHistory(true);
          }
        }catch(error){
          this.thinking=false;
          session.status="已完成";
          session.messages.push({role:"assistant",lines:[`分析请求失败：${error.message}。请确认本地网关已启动（node scripts/analysis-gateway.cjs）。`]});
          this.persistHistory();
        }
        this.$nextTick(()=>{this.$refs.chatBox?.scrollTo({top:this.$refs.chatBox.scrollHeight,behavior:"smooth"});});
        this.$nextTick(()=>{this.$refs.chatBox?.scrollTo({top:this.$refs.chatBox.scrollHeight,behavior:"smooth"});});
      },
      async rateMessage(msg,rating){
        if(!msg.requestId)return;
        let comment="";
        if(rating==="down"){
          try{
            const answer=await ep.ElMessageBox.prompt("哪里不满意？（可选，帮助我们改进口径与回答）","反馈",{confirmButtonText:"提交",cancelButtonText:"取消",inputPlaceholder:"例如：口径不对、数字对不上、没有回答我的问题"});
            comment=answer?.value||"";
          }catch(cancelled){return;}
        }
        try{
          const response=await fetch(`${analysisGatewayBase}/v1/feedback`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requestId:msg.requestId,rating,comment})});
          if(!response.ok){const data=await response.json().catch(()=>({}));ep.ElMessage.warning(data.error||"提交失败，请稍后再试");return;}
          msg.feedback=rating;
          this.persistHistory(true);
          ep.ElMessage.success("感谢反馈");
        }catch(error){ep.ElMessage.warning("提交失败：无法连接分析网关");}
      },
      /* 追问要带上前几轮：最近 3 轮的问题、回答摘要，以及上一轮用的技能和已确定的口径词（服务端据此沿用，不信任这里的过滤条件） */
      buildConversation(session){
        const messages=(session.messages||[]).slice(0,-1);
        const plain=value=>String(value||"").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();
        const turns=[];
        let pending=null;
        messages.forEach(msg=>{
          if(msg.role==="user"){
            const text=(msg.lines||[]).join(" ").trim();
            if(!text||/^(已补充信息|跳过补充)/.test(text))return;
            pending={question:text,answer:"",skillId:"",terms:[],requestId:""};
            turns.push(pending);
          }else if(pending&&!msg.ask){
            const answer=msg.reportId?[msg.leadMsg,msg.trailMsg].filter(Boolean).join(" "):(msg.html?plain(msg.html):(msg.lines||[]).join(" "));
            if(answer&&!pending.answer){pending.answer=answer;pending.skillId=msg.skillId||"";pending.terms=msg.terms||[];pending.requestId=msg.requestId||"";}
          }
        });
        return turns.filter(turn=>turn.answer).slice(-3);
      },
      /* 推荐问题只显示在最后一条回答下面，点一下就是一次提问 */
      showSuggestions(msg){
        const list=this.activeSession?.messages||[];
        return !this.thinking&&!msg.streaming&&Array.isArray(msg.suggestions)&&msg.suggestions.length>0&&list[list.length-1]===msg;
      },
      askFollowUp(text){
        if(this.thinking)return;
        this.sendMessage({question:text});
      },
      planReasonText(plan){
        if(plan.source==="sticky")return "沿用上一轮的技能";
        if(plan.source==="fallback")return "没有判断出特定业务，用了通用方式";
        return plan.reason||"";
      },
      /* 「换一个」：用另一个技能重新回答，或在回答与报告之间切换；沿用同一个问题，对话里保留之前的回答 */
      changePlan(msg,command){
        if(this.thinking)return;
        const messages=this.activeSession?.messages||[];
        const index=messages.indexOf(msg);
        const userMsg=messages.slice(0,Math.max(index,0)).reverse().find(item=>item.role==="user");
        const question=(userMsg?.lines||[]).join(" ").trim();
        if(!question)return;
        const [kind,value]=String(command).split(":");
        if(kind==="skill")this.sendMessage({question,forcedSkillId:value,reportOutput:msg.plan?.output==="report"?{output:"report",template:msg.plan.template||""}:{output:"answer"}});
        else if(kind==="output")this.sendMessage({question,forcedSkillId:msg.plan?.skillId||"",reportOutput:value==="report"?{output:"report",template:msg.plan?.template||""}:{output:"answer"}});
      },
      /* 「整理成报告」：报告是按需调用的输出 Skill，基于对话里已经取到的事实写，不重新取数 */
      requestReport(msg,templateId){
        if(this.thinking||!msg.requestId)return;
        const template=this.reportTemplates.find(item=>item.id===templateId);
        this.sendMessage({question:`把上面的分析整理成${template?.name||"报告"}`,reportOutput:{output:"report",template:templateId}});
      },
      async loadReportTemplates(){
        if(this.reportTemplates.length)return;
        try{
          const response=await fetch(`${analysisGatewayBase}/v1/report/templates`);
          if(response.ok)this.reportTemplates=await response.json();
        }catch(error){/* 取不到模板时按钮的下拉为空，不影响对话 */}
      },
      buildMetaLine(meta){
        let line=`${meta.scenario||""} · ${meta.model||""} · 推理 ${meta.reasoningEffort||"default"}${meta.maxTokens?` · 上下文 ${meta.maxTokens>=1024?Math.round(meta.maxTokens/1024)+"K":meta.maxTokens}`:""} · 引用表 ${(meta.tablesUsed||[]).join("、")||"—"} · 耗时 ${((meta.latencyMs||0)/1000).toFixed(1)}s${meta.usage?` · tokens ${meta.usage.total_tokens}`:""}`;
        if(meta.toolCalls?.length){const okCount=meta.toolCalls.filter(call=>call.ok).length;line+=` · 工具取数 ${meta.toolCalls.length} 次（成功 ${okCount}）：${meta.toolCalls.map(call=>call.tool+(call.table?`(${call.table})`:"")+(call.ok?"":" ✗")).join("、")}`;}
        else if(meta.toolMode&&meta.toolMode.startsWith("fallback:"))line+=` · 未使用工具取数（${meta.toolMode.slice("fallback:".length)}）`;
        if(meta.output==="report")line+=meta.basedOn?.length?` · 基于对话里 ${meta.basedOn.length} 次已核实的取数`:" · 报告";
        if(meta.warning)line+=` · ⚠️ `;
        if(meta.numericCheck?.ungrounded?.length)line+=` · ⚠️ ${meta.numericCheck.ungrounded.length} 个数字未在证据中找到，请核对（${meta.numericCheck.ungrounded.join("、")}）`;
        if(meta.deniedTables?.length)line+=` · 无权限表 ${meta.deniedTables.join("、")}`;
        return line;
      },
      renderMarkdown(markdown){
        const escape=value=>String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        const lines=String(markdown).split(/\r?\n/);
        let html="",inCode=false,inTable=false,inList=false,inMermaid=false,mermaidLines=[];
        const inline=value=>escape(value)
          .replace(/`([^`]+)`/g,"<code>$1</code>")
          .replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>");
        const closeList=()=>{if(inList){html+="</ul>";inList=false;}};
        const closeTable=()=>{if(inTable){html+="</tbody></table>";inTable=false;}};
        lines.forEach(raw=>{
          const line=raw.trimEnd();
          if(/^```/.test(line)){
            closeList();closeTable();
            if(inCode){
              if(inMermaid){html+="</div>";inMermaid=false;}else{html+="</code></pre>";}
              inCode=false;
            }else{
              const next=(lines[lines.indexOf(line)+1]||"");
              if(/^mermaid/i.test(next)&&(next.includes("flowchart")||next.includes("graph"))){html+='<div class="portal-vue-mermaid" data-mermaid="1">';inMermaid=true;inCode=true;mermaidLines=[];lines.indexOf(line);return;}
              html+='<pre><code>';inCode=true;
            }
            return;
          }
          if(inMermaid){mermaidLines.push(raw);return;}
          if(inCode){html+=escape(raw)+"\n";return;}
          if(/^\|.*\|$/.test(line)){
            const cells=line.replace(/^\||\|$/g,"").split("|");
            if(cells.every(cell=>/^\s*:?-{2,}:?\s*$/.test(cell)))return;
            if(!inTable){html+='<table class="portal-vue-ai-report-table"><tbody>';inTable=true;}
            html+="<tr>"+cells.map((cell,index)=>`<${inTable&&html.endsWith("<tbody>")?"th":"td"}>${inline(cell.trim())}</${inTable&&html.endsWith("<tbody>")?"th":"td"}>`).join("")+"</tr>";
            return;
          }
          closeTable();
          if(/^#{1,4}\s/.test(line)){closeList();const level=line.match(/^#+/)[0].length;html+=`<h${level+2}>${inline(line.replace(/^#+\s*/,""))}</h${level+2}>`;return;}
          if(/^[-*]\s/.test(line)){if(!inList){html+="<ul>";inList=true;}html+=`<li>${inline(line.replace(/^[-*]\s*/,""))}</li>`;return;}
          if(/^\d+\.\s/.test(line)){closeList();html+=`<p class="portal-vue-ai-report-ol">${inline(line)}</p>`;return;}
          closeList();
          if(!line.trim())return;
          html+=`<p>${inline(line)}</p>`;
        });
        closeList();closeTable();
        if(inCode)html+="</code></pre>";
        if(inMermaid)html+=this.renderMermaidSvg(mermaidLines.join("\n"));
        return html;
      },
      renderMermaidSvg(source){
        const esc=value=>String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        const nodeDefs={};
        const edgeRe=/(\w+)\s*-{2,}>\s*(?:\|([^|]*)\|\s*)?(\w+)/g;
        const nodeRe=/(\w+)\s*(?:[\[\(]([^\]\)]+)[\]\)])?/g;
        let direction="LR";
        const bodyLines=[];
        source.split(/\r?\n/).forEach(line=>{
          const t=line.trim();
          if(/^flowchart\b/i.test(t)||/^graph\b/i.test(t)){const m=t.match(/\b(TB|TD|LR|RL|BT)\b/i);if(m)direction=m[1].toUpperCase();return;}
          if(!t||/^%%/.test(t))return;
          bodyLines.push(t);
        });
        const text=bodyLines.join("\n");
        let m;
        while((m=nodeRe.exec(text))){const id=m[1];if(!nodeDefs[id]&&!/^(flowchart|graph)$/i.test(id))nodeDefs[id]={id,label:id};}
        while((m=edgeRe.exec(text))){
          const from=m[1],to=m[3],label=(m[2]||"").trim();
          if(!nodeDefs[from])nodeDefs[from]={id:from,label:from};
          if(!nodeDefs[to])nodeDefs[to]={id:to,label:to};
          nodeDefs[from].edges=nodeDefs[from].edges||[];
          nodeDefs[from].edges.push({to,label});
        }
        const nodes=Object.values(nodeDefs);
        if(!nodes.length)return '<pre><code>'+esc(source)+'</code></pre>';
        const incoming={},outgoing={};
        nodes.forEach(n=>(n.edges||[]).forEach(e=>{incoming[e.to]=(incoming[e.to]||0)+1;outgoing[n.id]=(outgoing[n.id]||0)+1;}));
        const column=n=>{const i=incoming[n.id]||0,o=outgoing[n.id]||0;if(i===0)return 0;if(o===0)return 2;return 1;};
        const cols=[[],[],[]];
        nodes.forEach(n=>cols[column(n)].push(n));
        const nodeW=150,nodeH=44,gapX=60,gapY=26;
        const colX=[20,20+nodeW+gapX,20+2*(nodeW+gapX)];
        const maxRows=Math.max(...cols.map(c=>c.length),1);
        const width=20*3+nodeW*3+gapX*2;
        const height=Math.max(maxRows*(nodeH+gapY)+20,140);
        const pos={};
        cols.forEach((col,ci)=>col.forEach((n,ri)=>{
          const colHeight=col.length*(nodeH+gapY)-gapY;
          const startY=(height-colHeight)/2;
          pos[n.id]={x:colX[ci],y:startY+ri*(nodeH+gapY)};
        }));
        const colors=["#1677ff","#13a8a8","#7c3aed","#d97706","#35805b"];
        let svg=`<div class="portal-vue-mermaid-figure"><div class="portal-vue-mermaid-title">血缘图（${direction==="LR"?"从左到右":"从上到下"} · ${nodes.length} 个节点）</div>`;
        svg+=`<svg viewBox="0 0 ${width} ${height}" style="width:100%;height:auto">`;
        nodes.forEach(n=>{
          (n.edges||[]).forEach(e=>{
            const a=pos[n.id],b=pos[e.to];
            if(!a||!b)return;
            const x1=a.x+nodeW,y1=a.y+nodeH/2,x2=b.x,y2=b.y+nodeH/2;
            const mx=(x1+x2)/2;
            svg+=`<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="#9db8e8" stroke-width="1.5" marker-end="url(#arrow)"/>`;
            if(e.label)svg+=`<text x="${mx}" y="${(y1+y2)/2-6}" text-anchor="middle" font-size="11" fill="#6b7280">${esc(e.label)}</text>`;
          });
        });
        svg+=`<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#9db8e8"/></marker></defs>`;
        nodes.forEach((n,ni)=>{
          const p=pos[n.id];
          const color=colors[ni%colors.length];
          svg+=`<g><rect x="${p.x}" y="${p.y}" width="${nodeW}" height="${nodeH}" rx="8" fill="#fff" stroke="${color}" stroke-width="1.5"/><text x="${p.x+nodeW/2}" y="${p.y+nodeH/2+4}" text-anchor="middle" font-size="12" fill="#1f2733">${esc(n.label).slice(0,14)}</text></g>`;
        });
        svg+="</svg></div>";
        return svg;
      }
    }
  };
  window.analysisWorkbenchVueApi = mount("#analysisWorkbenchView", AnalysisWorkbenchApp, "analysis-workbench");
})();
