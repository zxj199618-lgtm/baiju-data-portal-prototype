/**
 * AI 对话组件库：shadcn/ui（Trace / Marker / Message / Bubble / Button / Empty / Questionnaire / Prompt Input）的 Vue + Element Plus 版本。
 * shadcn 是 React + Tailwind，这里照它的结构、尺寸和状态重写；展开动画用 Element Plus 的 el-collapse-transition，输入框用 el-input。
 * 样式在 assets/portal-ai-ui.css。依赖 core.js（window.PortalVue）；必须先于 page-analysis-workbench.js 加载。
 *
 * 导出：window.PortalVue.aiUi = { icon, components, questionnaire }
 *  - icon(name)：线性图标的 SVG 字符串（24 栅格，描边 currentColor）
 *  - components：可以直接放进 Vue 的 components 选项
 *  - questionnaire：问卷的纯函数（回答、进度），给测试和页面共用
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;

  /* ---------- 图标 ---------- */
  const ICON_PATHS = {
    grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
    chat: "M4 5h16v11H9l-5 4zM8 9h8M8 12h5",
    web: "M3 5h18v12H3zM8 21h8M12 17v4",
    spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18",
    file: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
    up: "M7 11v9H4v-9zM7 11l4-8c1.5 0 2.5 1 2 2.5L12.5 9H19a1.5 1.5 0 0 1 1.4 2l-2 7a2 2 0 0 1-1.9 1.5H7",
    down: "M7 13V4H4v9zM7 13l4 8c1.5 0 2.5-1 2-2.5L12.5 15H19a1.5 1.5 0 0 0 1.4-2l-2-7A2 2 0 0 0 16.5 4.5H7",
    send: "M12 19V5M6 11l6-6 6 6",
    check: "M5 12.5l4.5 4.5L19 7.5",
    "chevron-down": "M6 9l6 6 6-6",
    "chevron-up": "M6 15l6-6 6 6",
    "chevron-right": "M9 6l6 6-6 6",
    close: "M6 6l12 12M18 6L6 18",
    alert: "M12 8v5M12 16.5v.01M10.3 4.5L3 18h18L13.7 4.5a2 2 0 0 0-3.4 0z",
    database: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6",
    trend: "M4 17l5-5 4 3 7-8M16 7h4v4",
    search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
    book: "M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h10",
    share: "M5 12h5M10 12l6-6M10 12l6 6M17 4a2 2 0 1 1 0 .01M17 18a2 2 0 1 1 0 .01",
    layers: "M12 4l8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4",
    clock: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2",
    lock: "M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3",
    play: "M8 5l11 7-11 7z",
    image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9h.01",
    briefcase: "M4 8h16v11H4zM9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M4 13h16",
    cpu: "M7 7h10v10H7zM10 10h4v4h-4zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4"
  };
  const icon = name => `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON_PATHS[name] || ""}"/></svg>`;

  /* ---------- 问卷的纯函数 ---------- */
  /** 一道题当前的回答：已选项 + 自定义输入（去空白后非空才算）。 */
  function answerOf(ask, q) {
    const draft = ask && ask.draft && ask.draft[q.key];
    if (!draft) return [];
    const custom = String(draft.custom || "").trim();
    return custom ? [...draft.picked, custom] : [...draft.picked];
  }
  const answeredCount = ask => ask.questions.filter(q => answerOf(ask, q).length).length;
  /** 上一题 / 下一题的下标，夹在 [0, total-1] 内，题目数变化时不会越界。 */
  const clampStep = (step, total) => Math.max(0, Math.min(step, Math.max(total - 1, 0)));
  /** 选项的快捷键标记：A、B、C…（最多 26 个，之后为空）。 */
  const optionKey = index => (index >= 0 && index < 26 ? String.fromCharCode(65 + index) : "");

  /* ---------- Trace ---------- */
  const AiTrace = { name: "AiTrace", template: `<div class="ai-trace"><slot></slot></div>` };

  const AiTraceLine = {
    name: "AiTraceLine",
    props: { status: String, icon: String, title: String, desc: String },
    computed: { svg() { return icon(this.status === "error" ? "alert" : this.icon); } },
    template: `<span class="ai-trace-line" :data-status="status || null"><span class="ai-ico ai-trace-icon" v-html="svg"></span><span class="ai-trace-title"><slot>{{ title }}</slot></span><span v-if="desc" class="ai-trace-desc">{{ desc }}</span></span>`
  };

  const AiTraceCollapsible = {
    name: "AiTraceCollapsible",
    components: { AiTraceLine },
    props: { open: Boolean, status: String, icon: String, title: String, desc: String, triggerTest: String },
    emits: ["update:open"],
    computed: { chevron() { return icon("chevron-right"); } },
    template: `<div class="ai-trace-row">
      <button type="button" class="ai-trace-trigger" :data-test="triggerTest || null" :aria-expanded="open" @click="$emit('update:open', !open)">
        <ai-trace-line :status="status" :icon="icon" :title="title" :desc="desc"></ai-trace-line>
        <span class="ai-ico ai-trace-chevron" :class="{ 'is-open': open }" v-html="chevron"></span>
      </button>
      <el-collapse-transition><div v-show="open" class="ai-trace-content"><slot></slot></div></el-collapse-transition>
    </div>`
  };

  /* ---------- Marker ---------- */
  const AiMarker = {
    name: "AiMarker",
    props: { variant: { type: String, default: "default" }, icon: String },
    computed: { svg() { return this.icon ? icon(this.icon) : ""; } },
    template: `<div class="ai-marker" :data-variant="variant" role="status"><span v-if="icon" class="ai-ico ai-marker-icon" v-html="svg"></span><span class="ai-marker-content"><slot></slot></span></div>`
  };

  /* ---------- Message / Bubble ---------- */
  /* 同时带 portal-vue-ai-message / portal-vue-ai-bubble：e2e 和历史样式还在用这两个类名 */
  const AiMessage = { name: "AiMessage", props: { role: { type: String, default: "assistant" } }, template: `<div class="ai-message portal-vue-ai-message" :class="role" :data-role="role"><slot></slot></div>` };
  const AiBubble = { name: "AiBubble", props: { role: { type: String, default: "assistant" } }, template: `<div class="ai-bubble portal-vue-ai-bubble" :data-role="role"><slot></slot></div>` };

  /* ---------- Button ---------- */
  const AiButton = {
    name: "AiButton",
    props: { variant: { type: String, default: "outline" }, size: { type: String, default: "md" } },
    template: `<button type="button" class="ai-button" :data-variant="variant" :data-size="size"><slot></slot></button>`
  };

  /* ---------- Empty ---------- */
  const AiEmpty = {
    name: "AiEmpty",
    template: `<div class="ai-empty portal-vue-ai-welcome"><div v-if="$slots.media" class="ai-empty-media"><slot name="media"></slot></div><h3 class="ai-empty-title"><slot name="title"></slot></h3><p class="ai-empty-desc"><slot name="description"></slot></p><div class="ai-empty-content"><slot></slot></div></div>`
  };

  /* ---------- Questionnaire ---------- */
  /* 一次一道题：进度 → 题目 → 选项（单选 / 多选，带 A B C 标记）→ 自由输入 → 上一题 / 跳过 / 下一题 / 提交。
     回答保存在 ask.draft（由页面持有），组件只负责展示并通过事件通知页面。
     沿用 portal-vue-ai-ask-q / portal-vue-ai-ask-option 两个类名，旧的 e2e 用它们定位。 */
  const AiQuestionnaire = {
    name: "AiQuestionnaire",
    props: { ask: { type: Object, required: true }, disabled: Boolean },
    emits: ["toggle", "custom", "submit", "skip"],
    data: () => ({ step: 0 }),
    computed: {
      total() { return this.ask.questions.length; },
      current() { return this.ask.questions[clampStep(this.step, this.total)]; },
      index() { return clampStep(this.step, this.total); },
      last() { return this.index >= this.total - 1; },
      answered() { return answeredCount(this.ask); },
      statusText() { return this.ask.status === "skipped" ? "已跳过" : "已回答"; }
    },
    methods: {
      optionKey,
      picked(q) { return (this.ask.draft && this.ask.draft[q.key] && this.ask.draft[q.key].picked) || []; },
      move(delta) { this.step = clampStep(this.index + delta, this.total); }
    },
    template: `<div class="ai-questionnaire" :class="'is-' + ask.status">
      <template v-if="ask.status === 'pending' && current">
        <div v-if="total > 1" class="ai-questionnaire-progress">第 {{ index + 1 }} / {{ total }} 题</div>
        <div class="ai-questionnaire-item portal-vue-ai-ask-q" :key="current.key">
          <h4 class="ai-questionnaire-title">{{ current.question }}</h4>
          <p v-if="current.hint || ask.intro" class="ai-questionnaire-desc">{{ current.hint || ask.intro }}</p>
          <div class="ai-questionnaire-choices" role="group">
            <label v-for="(opt, oi) in current.options" :key="opt.label" class="ai-questionnaire-choice portal-vue-ai-ask-option" :class="{ 'is-picked': picked(current).includes(opt.label) }" @click.prevent="$emit('toggle', current, opt)">
              <span class="ai-questionnaire-mark" :class="{ 'is-multi': current.multiple }"></span>
              <span class="ai-questionnaire-text"><b>{{ opt.label }}</b><small v-if="opt.desc">{{ opt.desc }}</small></span>
              <kbd class="ai-questionnaire-key">{{ optionKey(oi) }}</kbd>
            </label>
          </div>
          <el-input v-if="current.allowCustom !== false" v-model="ask.draft[current.key].custom" clearable class="ai-questionnaire-input" placeholder="都不合适？在这里自己写" @input="$emit('custom', current)"></el-input>
        </div>
        <div class="ai-questionnaire-actions">
          <span class="ai-questionnaire-hint">已回答 {{ answered }} / {{ total }}，没回答的我按常规口径处理</span>
          <ai-button variant="ghost" :disabled="disabled" @click="$emit('skip')">跳过，直接分析</ai-button>
          <ai-button v-if="index > 0" variant="outline" @click="move(-1)">上一题</ai-button>
          <ai-button v-if="!last" variant="outline" @click="move(1)">下一题</ai-button>
          <ai-button v-else variant="default" :disabled="disabled || !answered" @click="$emit('submit')">提交并继续分析</ai-button>
        </div>
      </template>
      <div v-else class="ai-questionnaire-result">
        <p class="ai-questionnaire-result-title">{{ ask.title || "补充信息" }}<span>{{ statusText }}</span></p>
        <p v-if="!(ask.result || []).length" class="ai-questionnaire-desc">已跳过补充，按现有信息直接分析。</p>
        <div v-for="item in ask.result || []" :key="item.key" class="ai-questionnaire-result-row"><span>{{ item.question }}</span><strong>{{ item.answer.join("、") }}</strong></div>
      </div>
    </div>`
  };
  AiQuestionnaire.components = { AiButton };

  /* ---------- Prompt Input ---------- */
  /* 输入卡片：多行输入 + 工具栏插槽 + 发送。回车 / 输入事件原样抛给页面处理（发送、@ 引用）。 */
  const AiPromptInput = {
    name: "AiPromptInput",
    props: { modelValue: { type: String, default: "" }, placeholder: String, canSend: Boolean },
    emits: ["update:modelValue", "enter", "input", "send"],
    computed: { sendSvg() { return icon("send"); } },
    methods: { focus() { const field = this.$refs.field; if (field && field.focus) field.focus(); } },
    template: `<div class="ai-prompt-input portal-vue-ai-composer ai-composer-card">
      <el-input ref="field" :model-value="modelValue" type="textarea" :rows="2" resize="none" :placeholder="placeholder" @update:model-value="$emit('update:modelValue', $event)" @keydown.enter="$emit('enter', $event)" @input="$emit('input', $event)"></el-input>
      <div class="ai-prompt-input-bar portal-vue-ai-composer-bar">
        <slot name="tools"></slot>
        <button type="button" class="ai-prompt-input-send portal-vue-ai-composer-send" aria-label="发送" :disabled="!canSend" @click="$emit('send')"><span class="ai-ico" v-html="sendSvg"></span></button>
      </div>
    </div>`
  };

  window.PortalVue.aiUi = {
    icon,
    components: { AiTrace, AiTraceLine, AiTraceCollapsible, AiMarker, AiMessage, AiBubble, AiButton, AiEmpty, AiQuestionnaire, AiPromptInput },
    questionnaire: { answerOf, answeredCount, clampStep, optionKey }
  };
})();
