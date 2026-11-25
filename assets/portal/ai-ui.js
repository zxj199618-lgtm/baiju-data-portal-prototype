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

  /* ---------- 图标（Lucide 风格 24x24 精细几何，统一 1.65 描边） ---------- */
  const ICON_SHAPES = {
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8"/>',
    chat: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
    web: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z"/>',
    file: '<path d="M14 2.5H7a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5L14 2.5z"/><path d="M14 2.5v6h5M9 13h6M9 17h4"/>',
    up: '<path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3zm0 0l3.7-6.5A1.5 1.5 0 0 1 13.5 4.3L12.5 9h6.2a2 2 0 0 1 1.9 2.5l-1.6 6.8a2 2 0 0 1-1.9 1.7H7"/>',
    down: '<path d="M7 14V3H4a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3zm0 0l3.7 6.5a1.5 1.5 0 0 0 2.8-.8L12.5 15h6.2a2 2 0 0 0 1.9-2.5l-1.6-6.8A2 2 0 0 0 17.1 4H7"/>',
    send: '<path d="M12 19V5M6.5 10.5L12 5l5.5 5.5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    "chevron-down": '<path d="M6 9l6 6 6-6"/>',
    "chevron-up": '<path d="M6 15l6-6 6 6"/>',
    "chevron-right": '<path d="M9 6l6 6-6 6"/>',
    close: '<path d="M18 6L6 18M6 6l12 12"/>',
    alert: '<path d="M10.3 3.9L2.8 17.1A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 16.8h.01"/>',
    database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13"/><path d="M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5"/>',
    trend: '<path d="M3.5 17l5.5-5.5 4 3.5 7.5-8"/><path d="M15.5 7h5v5"/>',
    search: '<circle cx="11" cy="11" r="6.8"/><path d="M20.2 20.2l-4.1-4.1"/>',
    book: '<path d="M4.5 19.5A2.5 2.5 0 0 1 7 17h12.5"/><path d="M6.5 2.5H19.5v19H7a2.5 2.5 0 0 1-2.5-2.5V5a2.5 2.5 0 0 1 2-2.5z"/>',
    share: '<circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="M8.3 13.3l7.4 4.4M15.7 6.3l-7.4 4.4"/>',
    layers: '<path d="M12 3L3.5 7.5 12 12l8.5-4.5L12 3z"/><path d="M3.5 12L12 16.5 20.5 12"/><path d="M3.5 16.5L12 21l8.5-4.5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    play: '<path d="M7.5 5.2l11.2 6.8-11.2 6.8V5.2z" fill="currentColor" stroke="none"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.2"/><circle cx="8.8" cy="9.5" r="1.4"/><path d="M20.5 15.5l-4.5-4.5-6.5 6.5"/>',
    briefcase: '<rect x="3.5" y="7.5" width="17" height="12.5" rx="2.2"/><path d="M8.5 7.5V5.8A1.8 1.8 0 0 1 10.3 4h3.4a1.8 1.8 0 0 1 1.8 1.8v1.7M3.5 12.5h17"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="2.2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5.5 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v.5"/>',
    stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.2" fill="currentColor" stroke="none"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.9-4L3.5 8.8"/><path d="M3.5 4.5v4.3h4.3"/><path d="M4 13a8 8 0 0 0 14.9 4l1.6-1.8"/><path d="M20.5 19.5v-4.3h-4.3"/>',
    trash: '<path d="M4.5 7h15M9.5 11v6M14.5 11v6M6.5 7l.8 11.6a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9L17.5 7M9.5 7V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3V7"/>',
    edit: '<path d="M12 20h7.5"/><path d="M16.2 3.8a2.1 2.1 0 0 1 3 3L7.5 18.5 3.5 20l1.5-4L16.2 3.8z"/>',
    pin: '<path d="M12 17v5M8.5 4h7l-1.2 5.8 2.7 2.7v1H7v-1l2.7-2.7L8.5 4z"/>',
    upload: '<path d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
    download: '<path d="M12 4v11.5M7.5 11.5L12 16l4.5-4.5M4.5 19.5h15"/>',
    "panel-right": '<rect x="3.5" y="4.5" width="17" height="15" rx="2.2"/><path d="M14.5 4.5v15"/>',
    "shield-check": '<path d="M12 3l7.5 3v5.2c0 4.6-3.1 8.5-7.5 10.3-4.4-1.8-7.5-5.7-7.5-10.3V6L12 3z"/><path d="M9 12.2l2 2 4.2-4.2"/>',
    expand: '<path d="M15 4h5v5M9 20H4v-5M20 4l-6 6M4 20l6-6"/>',
    star: '<path d="M12 3.5l2.6 5.4 6 .9-4.3 4.2 1 6-5.3-2.8L6.7 20l1-6-4.3-4.2 6-.9L12 3.5z"/>',
    slash: '<path d="M16 4L8 20"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_SHAPES[name] || '<path d=""/>'}</svg>`;

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
          <span class="ai-questionnaire-hint" title="没回答的我按常规口径处理">已回答 {{ answered }} / {{ total }}</span>
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
    props: { modelValue: { type: String, default: "" }, placeholder: String, canSend: Boolean, streaming: Boolean, onStop: Function, images: { type: Array, default: () => [] }, busy: Boolean },
    emits: ["update:modelValue", "enter", "input", "send", "paste-files", "remove-image", "keydown"],
    computed: { sendSvg() { return icon("send"); }, stopSvg() { return icon("stop"); }, closeSvg() { return icon("close"); } },
    methods: {
      focus() { const field = this.$refs.field; if (field && field.focus) field.focus(); },
      /* 剪贴板里有图片就交给页面处理（并阻止把图片当文字粘贴）；纯文字粘贴不受影响 */
      onPaste(event) {
        const attachments = window.PortalVue.aiAttachments;
        const files = attachments ? attachments.filesFromClipboard(event.clipboardData) : [];
        if (!files.length) return;
        event.preventDefault();
        this.$emit("paste-files", files);
      }
    },
    template: `<div class="ai-prompt-input portal-vue-ai-composer ai-composer-card">
      <div v-if="images.length || busy" class="ai-prompt-input-tray">
        <div v-for="(item, index) in images" :key="item.id" class="ai-attach"><img :src="item.thumb" alt="已粘贴的图片" /><button type="button" class="ai-attach-x" :aria-label="'移除图片 ' + (index + 1)" @click="$emit('remove-image', index)"><span class="ai-ico" v-html="closeSvg"></span></button></div>
        <span v-if="busy" class="ai-attach-busy">处理图片中…</span>
      </div>
      <el-input ref="field" :model-value="modelValue" type="textarea" :rows="2" resize="none" :placeholder="placeholder" @update:model-value="$emit('update:modelValue', $event)" @keydown.enter="$emit('enter', $event)" @keydown="$emit('keydown', $event)" @input="$emit('input', $event)" @paste="onPaste"></el-input>
      <div class="ai-prompt-input-bar portal-vue-ai-composer-bar">
        <slot name="tools"></slot>
        <button v-if="streaming" type="button" class="ai-prompt-input-send is-stop" data-test="ai-stop-btn" aria-label="停止生成" title="停止生成" @click="onStop && onStop()"><span class="ai-ico" v-html="stopSvg"></span></button>
        <button v-else type="button" class="ai-prompt-input-send portal-vue-ai-composer-send" aria-label="发送" :disabled="!canSend" @click="$emit('send')"><span class="ai-ico" v-html="sendSvg"></span></button>
      </div>
    </div>`
  };

  window.PortalVue.aiUi = {
    icon,
    components: { AiTrace, AiTraceLine, AiTraceCollapsible, AiMarker, AiMessage, AiBubble, AiButton, AiEmpty, AiQuestionnaire, AiPromptInput },
    questionnaire: { answerOf, answeredCount, clampStep, optionKey }
  };
})();
