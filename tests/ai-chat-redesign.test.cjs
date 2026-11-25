const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const exists = relative => fs.existsSync(path.join(root, relative));
/** 组件样式（portal-ai-ui.css）和页面样式（portal-ai-chat.css）一起读 */
const allCss = () => read("assets/portal-ai-ui.css") + "\n" + read("assets/portal-ai-chat.css");

test("新样式文件已接入页面和单文件构建", () => {
  const html = read("index.html");
  assert.ok(exists("assets/portal-ai-chat.css"), "缺少 assets/portal-ai-chat.css");
  const chat = html.indexOf("assets/portal-ai-chat.css");
  const lanhu = html.indexOf("assets/portal-lanhu-theme.css");
  assert.ok(chat > -1 && lanhu > -1 && chat > lanhu, "新样式文件必须在 portal-lanhu-theme.css 之后加载");
  assert.ok(read("scripts/build-standalone.cjs").includes("assets/portal-ai-chat.css"), "单文件构建需要内联新样式文件");
});

const workbench = () => {
  const source = read("assets/portal/page-analysis-workbench.js");
  const start = source.indexOf("template: `");
  const end = source.indexOf("data:()=>({");
  assert.ok(start > -1 && end > start, "找不到工作台模板");
  return source.slice(start, end);
};

test("布局：模板里没有 emoji，关键入口与 data-test 保持不变", () => {
  const template = workbench();
  assert.equal(template.match(/\p{Extended_Pictographic}/gu), null, "模板里不应再有 emoji：" + (template.match(/\p{Extended_Pictographic}/gu) || []).join(""));
  for (const needle of ["＋ 新的分析", 'data-test="ai-line-select"', 'data-test="model-chip"', 'class="portal-vue-ai-model-chip"', "<ai-prompt-input"]) {
    assert.ok(template.includes(needle), "模板缺少：" + needle);
  }
});

test("布局：会话栏 248px、对话列居中、输入卡片有样式", () => {
  const css = allCss();
  assert.match(css, /\.portal-vue-ai-layout\s*\{[^}]*grid-template-columns:\s*248px/);
  assert.match(css, /\.ai-prompt-input\s*\{/);
  assert.match(css, /max-width:\s*760px/);
});

test("消息：过程信息用 Trace 行，原有功能与 data-test 保留", () => {
  const template = workbench();
  for (const needle of ["<ai-trace", "traceRows(msg)", 'data-test="ai-trace-row"', "toggleTrace(msg", 'ai-basis-toggle', 'data-test="ai-plan"', 'data-test="plan-change"', 'data-test="plan-to-report"', 'data-test="ai-scope"', 'data-test="ai-followups"', 'data-test="ai-followup"', "rateMessage(msg, 'up')", "rateMessage(msg, 'down')"]) {
    assert.ok(template.includes(needle), "模板缺少：" + needle);
  }
  assert.ok(!template.includes("basisSummary") && !/portal-vue-ai-think(?!ing)/.test(template), "旧的「依据」折叠条和思考块应被 Trace 行取代");
  assert.ok(template.includes('v-if="msg.requestId && !msg.streaming" class="portal-vue-ai-feedback"'), "反馈按钮仍只在有 requestId 且生成完成后出现");
  assert.equal(template.split('data-test="ai-plan"').length - 1, 1, "ai-plan 只在技能行里出现一次");
});

test("消息：助手回答无气泡背景，用户气泡无渐变", () => {
  const css = read("assets/portal-ai-ui.css");
  const block = selector => {
    const escaped = selector.replace(/[.[\]"()]/g, "\\$&");
    const match = css.match(new RegExp(escaped + "\\s*\\{([^}]*)\\}"));
    assert.ok(match, "缺少样式：" + selector);
    return match[1];
  };
  assert.match(block('.ai-bubble[data-role="assistant"]'), /background:\s*transparent/);
  assert.doesNotMatch(block('.ai-bubble[data-role="user"]'), /gradient/);
});

test("清理：旧样式里被新样式取代的重复规则和没人用的规则已删除", () => {
  const moduleCss = read("assets/portal-vue-module.css");
  const count = pattern => (moduleCss.match(pattern) || []).length;
  assert.equal(count(/^\.portal-vue-ai-welcome \{/gm), 0, "欢迎页样式统一放在 portal-ai-chat.css");
  assert.equal(count(/^\.portal-vue-ai-bubble \{/gm), 0, "气泡基础样式统一放在 portal-ai-chat.css");
  for (const dead of ["portal-vue-ai-scenario", "portal-vue-ai-side-summary", "portal-vue-ai-skillbar", "portal-vue-ai-welcome-tips", "portal-vue-ai-asset-drawer", "portal-vue-ai-report-linkcard", "portal-vue-ai-input-row"]) {
    assert.ok(!moduleCss.includes(dead), "已没有页面使用，应删除：" + dead);
  }
  assert.ok(!read("assets/portal-shell.css").includes("portal-vue-ai-make-report"), "portal-shell.css 里没人用的 make-report 规则应删除");
  assert.ok(moduleCss.includes("portal-vue-ai-bot-icon"), "告警页在用的 bot-icon 规则不能删");
});

test("视觉规范：新样式自成一套中性色变量（shadcn 风格），不沿用站点蓝，颜色只通过变量使用", () => {
  const css = allCss();
  const rootBlock = css.match(/:root\s*\{([^}]*)\}/);
  assert.ok(rootBlock, "缺少 :root 变量定义");
  for (const token of ["--ai-canvas", "--ai-surface", "--ai-sunken", "--ai-line", "--ai-ink", "--ai-accent", "--ai-accent-tint", "--ai-amber", "--ai-shadow-1", "--ai-shadow-2", "--ai-font-display"]) {
    assert.ok(rootBlock[1].includes(token + ":"), "缺少变量：" + token);
  }
  assert.ok(!/#0066ff/i.test(css), "新样式不应使用站点蓝 #0066FF");
  const outsideRoot = css.replace(/:root\s*\{[^}]*\}/, "");
  const hexes = (outsideRoot.match(/#[0-9a-fA-F]{3,8}\b/g) || []).filter(hex => !["#fff"].includes(hex));
  assert.deepEqual(hexes, [], "变量定义之外不应直接写色值（#fff 除外）：" + hexes.join(" "));
  assert.ok(read("docs/superpowers/specs/2026-11-23-ai-chat-design-system.md").includes("shadcn 风格"), "缺少视觉规范文档");
});

test("能力导览：欢迎页只有能力卡片 + 「我能做什么」入口，没有另外一排推荐胶囊", () => {
  const template = workbench();
  const source = read("assets/portal/page-analysis-workbench.js");
  for (const needle of ['data-test="ai-capability-card"', 'data-test="ai-capability-open"', "capabilityCan", "openCapability(item)", "openCapabilityDrawer", "你好，想分析点什么？"]) {
    assert.ok(template.includes(needle), "模板缺少：" + needle);
  }
  assert.ok(!template.includes("portal-vue-ai-welcome-tips"), "文字 tips 应被能力卡片取代");
  assert.ok(!read("assets/portal-ai-chat.css").includes("portal-vue-ai-welcome-tips"), "不再使用的 tips 样式应删除");
  assert.match(source, /aiCapabilities,[\s\S]*?\}\s*=\s*window\.PortalVue/, "工作台要从 PortalVue 取 aiCapabilities");
  assert.ok(source.includes("capabilityGroups(){") && source.includes("state.skills?.length?"), "能力卡片要随 Skill 在线情况过滤，Skill 未加载时全部显示");
  assert.ok(source.includes("mergeDraft(this.input"), "试一试必须用 mergeDraft 保留草稿");
  const tryBody = source.slice(source.indexOf("tryCapability(item)"), source.indexOf("tryCapability(item)") + 600);
  assert.ok(!/sendMessage|askFollowUp/.test(tryBody), "试一试只填入输入框，不能自动发送");
});

test("能力导览：抽屉按三组展示，详情弹层有视频 / 图文切换、试一试和边界，视频出错自动退回图文", () => {
  const template = workbench();
  const source = read("assets/portal/page-analysis-workbench.js");
  for (const needle of ['data-test="ai-capability-drawer"', 'data-test="ai-capability-dialog"', 'data-test="ai-capability-try"', 'data-test="ai-capability-row"', "tryCapability(capDetail, text)", '@error="onCapVideoError"', "capVideoFailed", "capDetail.video", "可以改问", "边界："]) {
    assert.ok(template.includes(needle), "模板缺少：" + needle);
  }
  assert.ok(template.includes('class="ai-theme') || template.includes('ai-theme"'), "抽屉和弹层是挂到 body 上的，要加 ai-theme 类才能取到视觉变量");
  assert.match(source, /onCapVideoError\(\)\{[^}]*capVideoFailed\s*=\s*true/, "视频出错要置 capVideoFailed");
  assert.match(source, /capSteps\(\)\{|showVideo\(\)\{/, "要有判断「显示视频还是图文」的计算属性");
});

test("输入框里不放「能力」按钮（每次新建会话首页都有入口）；静态资源版本号已递增", () => {
  const template = workbench();
  assert.ok(!template.includes("ai-capability-entry"), "输入卡片里不再放「能力」按钮");
  assert.ok(!allCss().includes(".ai-cap-entry"), "不再使用的「能力」按钮样式应删除");
  const html = read("index.html");
  assert.ok(!html.includes("20261124b"), "index.html 里还有旧的静态资源版本号 20261124b");
  assert.ok(html.includes("?v=20261125c"), "index.html 缺少新的静态资源版本号 20261125c");
});


test("细节：会话分组、对话标题栏、浮层带 ai-theme，状态标签改为圆点", () => {
  const template = workbench();
  const source = read("assets/portal/page-analysis-workbench.js");
  for (const needle of ["sessionGroups", 'class="ai-chat-head"', "ai-live-dot"]) assert.ok(template.includes(needle), "模板缺少：" + needle);
  assert.ok(!template.includes("portal-vue-ai-session-status"), "「进行中」文字标签应改成分组标题上的圆点");
  assert.match(source, /popper-class="portal-vue-ai-select-popper ai-theme"/);
  assert.match(source, /popper-class="portal-vue-ai-model-pop ai-theme"/);
  assert.match(source, /portal-vue-ai-report-dialog ai-theme/);
});

test("细节：聊天样式只由 portal-ai-chat.css 一处负责，Markdown 内容有完整排版", () => {
  for (const file of ["assets/portal-vue-module.css", "assets/portal-shell.css"]) {
    const leftovers = (read(file).match(/^[^\n{}]*\.portal-vue-ai-(?!bot-icon|fb-)[^\n{}]*\{/gm) || []);
    assert.deepEqual(leftovers, [], file + " 里不应再有聊天页的 .portal-vue-ai-* 规则：" + leftovers.slice(0, 3).join(" | "));
  }
  const css = read("assets/portal-ai-chat.css");
  for (const selector of [".portal-vue-ai-report-body table", ".portal-vue-ai-report-body blockquote", ".portal-vue-ai-report-body pre", ".portal-vue-ai-report-body h3", ".ai-chat-head", ".ai-live-dot", ".ai-session-group"]) {
    assert.ok(css.includes(selector), "缺少样式：" + selector);
  }
  assert.match(css, /:focus-visible/, "键盘焦点要有可见的样式");
});

test("Trace 样式：行、展开内容、三种状态、流光（尊重减少动效）", () => {
  const css = read("assets/portal-ai-ui.css");
  for (const needle of [".ai-trace-trigger", ".ai-trace-line", ".ai-trace-content", ".ai-trace-title", '[data-status="running"]', '[data-status="error"]', '[data-status="pending"]', "@keyframes ai-shimmer", "prefers-reduced-motion"]) {
    assert.ok(css.includes(needle), "缺少 Trace 样式：" + needle);
  }
  assert.match(css, /\.ai-trace-content\s*\{[^}]*border-left:\s*1px solid var\(--ai-line\)/, "展开内容左侧要有 1px 竖线");
});

test("能力卡片：每张卡直接列出几条问法，点一条填进输入框（不自动发送）；整张卡仍可点开详情", () => {
  const template = workbench();
  const source = read("assets/portal/page-analysis-workbench.js");
  assert.match(template, /<div[^>]*class="ai-cap-card"[^>]*role="button"[^>]*data-test="ai-capability-card"|<div[^>]*data-test="ai-capability-card"[^>]*class="ai-cap-card"[^>]*role="button"/, "卡片根节点不能是 button（里面还有按钮），要用带 role=button 的 div");
  for (const needle of ['data-test="ai-capability-question"', "item.examples.slice(0, 3)", '@click.stop="tryCapability(item, text)"', '@keydown.enter="openCapability(item)"', 'v-for="text in capDetail.examples"', "tryCapability(capDetail, text)"]) {
    assert.ok(template.includes(needle), "模板缺少：" + needle);
  }
  assert.match(source, /tryCapability\(item,text\)\{[^}]*mergeDraft\(this\.input,\s*text\s*\|\|\s*item\.example\)/, "tryCapability 要支持传入具体问法，不传时用 example");
});

test("站点左侧导航默认折叠，用户手动展开 / 收起后记住选择", () => {
  const source = read("assets/portal/page-sidebar.js");
  assert.ok(source.includes("portalSidebarCollapsed"), "要用 localStorage 记住导航的折叠状态");
  assert.match(source, /data:\s*\(\)\s*=>\s*\(\{\s*collapsed:\s*readCollapsed\(\)\s*\}\)/, "初始折叠状态来自 readCollapsed()");
  assert.match(source, /function readCollapsed\(\)\s*\{[\s\S]*?return\s+true;/, "没有存过选择时默认折叠");
  assert.match(source, /mounted\(\)\s*\{[^}]*classList\.toggle\("collapsed",\s*this\.collapsed\)/, "挂载后要把状态同步到 #sidebar 的 collapsed 类");
  assert.match(source, /toggleCollapse\(\)[\s\S]*?writeCollapsed\(this\.collapsed\)/, "切换时写入存储");
});

test("欢迎页（空会话）打开后停在顶部，有消息的会话才停在最新一条", () => {
  const source = read("assets/portal/page-analysis-workbench.js");
  assert.match(source, /scrollChatToStart\(\)\{[^}]*messages\?\.length\?box\.scrollHeight:0/);
  assert.ok(!source.includes("scrollTo({top:this.$refs.chatBox.scrollHeight}))"), "打开会话后的滚动要统一走 scrollChatToStart");
});

test("线条精简：页面只有一层外框，会话栏与对话区之间、标题栏下面都不再画分割线", () => {
  const css = allCss();
  const block = selector => {
    const escaped = selector.replace(/[.#[\]"()>]/g, "\\$&");
    const all = [...css.matchAll(new RegExp("(?:^|\\n)" + escaped + "\\s*\\{([^}]*)\\}", "g"))].map(m => m[1]).join(" ");
    assert.ok(all, "缺少样式：" + selector);
    return all;
  };
  assert.match(block("#analysisWorkbenchView .portal-vue-panel"), /border:\s*0/, "站点自带的面板外框要去掉");
  assert.match(block(".portal-vue-ai-layout"), /border:\s*0/, "对话页自己的外框也要去掉，不能双层框");
  assert.match(block(".portal-vue-ai-side"), /border-right:\s*0/, "会话栏右侧不画分割线，靠底色区分");
  assert.match(block(".ai-chat-head"), /border-bottom:\s*0/, "标题栏下面不画线");
  assert.match(block(".ai-cap-card"), /border:\s*0/, "能力卡不再描边，用浅底色");
  const template = workbench();
  for (const gone of ["portal-vue-ai-suggests", "ai-starter", "你也可以问", "portal-vue-ai-welcome-label"]) assert.ok(!template.includes(gone), "欢迎页下面那排推荐胶囊应删除：" + gone);
});

test("按权限个性化的问法并入能力卡：有权益表权限的用户，看趋势和找原因卡里排在最前", () => {
  const source = read("assets/portal/page-analysis-workbench.js");
  assert.ok(!source.includes("starterSuggests") && !/\bsuggests:\s*\[/.test(source), "旧的推荐胶囊数据应删除");
  assert.match(source, /equityExamples\(\)\{[\s\S]*?权益-账号维度消耗统计表[\s\S]*?trend:\[[^\]]*任哥近 7 天的消耗和自营 ROI/, "权益用户的个性化问法来自 equityExamples");
  assert.match(source, /capabilityCan\(\)\{[\s\S]*?equityExamples[\s\S]*?new Set\(\[\.\.\.extra\[item\.id\],\.\.\.item\.examples\]\)/, "capabilityCan 把个性化问法放在前面并去重");
});

test("「不能做什么」：首页只留一个入口，抽屉只列「要你补充信息」和「暂时做不了」（能做的已经在卡片里）", () => {
  const template = workbench();
  const source = read("assets/portal/page-analysis-workbench.js");
  assert.ok(template.includes("我暂时做不了什么"), "入口文案和抽屉标题应是「我暂时做不了什么」");
  assert.ok(!template.includes("我能做什么，不能做什么") && !template.includes("我能帮你做什么"), "旧的「我能做什么」文案应删除");
  assert.ok(template.includes('v-for="group in boundaryGroups"') && !template.includes('v-for="group in capabilityGroups"'), "抽屉按 boundaryGroups 渲染");
  assert.match(source, /boundaryGroups\(\)\{[^}]*filter\(group=>group\.key!=="can"\)/, "boundaryGroups 要去掉「直接能做」组");
});

test("追问胶囊要安静：小一号字、常规字重、灰色文字、浅边框，不抢回答的风头", () => {
  const css = allCss();
  const match = css.match(/\.portal-vue-ai-followups \.ai-button\s*\{([^}]*)\}/);
  assert.ok(match, "缺少 .portal-vue-ai-followups .ai-button 样式");
  const body = match[1];
  assert.match(body, /font-weight:\s*400/);
  assert.match(body, /color:\s*var\(--ai-ink-2\)/);
  assert.match(body, /font-size:\s*12\.5px/);
  assert.match(body, /background:\s*transparent/);
  assert.match(body, /height:\s*28px/);
});

test("回答末尾列出引用的 skill，鼠标移上去显示简介", () => {
  const template = workbench();
  const source = read("assets/portal/page-analysis-workbench.js");
  assert.equal(template.split('data-test="ai-skill-refs"').length - 1, 2, "报告类和回答类消息的末尾各一处");
  for (const needle of ["skillRefs(msg)", 'data-test="ai-skill-chip"', "<el-tooltip", 'popper-class="ai-theme ai-skill-tip"', "skill.desc || '暂无简介'", 'class="ai-skill-refs-label">引用了']) {
    assert.ok(template.includes(needle), "模板缺少：" + needle);
  }
  assert.ok(template.indexOf('data-test="ai-skill-refs"') < template.indexOf('class="portal-vue-ai-feedback"'), "引用的 skill 在反馈按钮之前，也就是回答的结尾");
  assert.match(source, /skillRefs\(msg\)\{[\s\S]*?state\.skills[\s\S]*?skill\.desc\|\|skill\.displayDesc/, "简介来自 Skill 注册表的 desc / displayDesc");
  const css = allCss();
  for (const selector of [".ai-skill-refs", ".ai-skill-chip", ".ai-skill-tip"]) assert.ok(css.includes(selector), "缺少样式：" + selector);
});

test("预计回答时长：每次提问开始计时，生成中显示「已用 · 预计」，按模型和思考档位记录最近几次耗时", () => {
  const template = workbench();
  const source = read("assets/portal/page-analysis-workbench.js");
  for (const needle of ['title="正在基于你有权限的数据表进行分析…"', ':desc="etaText"']) assert.ok(template.includes(needle), "模板缺少：" + needle);
  for (const needle of ["portalAnswerDurations", "etaBegin()", "etaEnd(", "estimateSeconds(", "pushDuration(", "formatEta(", "clearInterval(this.etaTimer)", "buildTraceRows(msg,this.metaItems,this.etaText)"]) assert.ok(source.includes(needle), "缺少：" + needle);
  assert.equal((source.match(/this\.etaBegin\(\)/g) || []).length, 1, "只在 sendMessage 开始处计时一次");
  assert.ok((source.match(/this\.etaEnd\(/g) || []).length >= 3, "完成、失败、网关不可用三处都要结束计时");
  assert.match(source, /beforeUnmount\(\)\{[^}]*clearInterval\(this\.etaTimer\)/, "离开页面要清掉定时器");
});

test("输入框里的业务线和模型选择：文字标签换成图标，去掉描边，改成安静的按钮；模型没有思考档位时在面板里说明", () => {
  const css = allCss();
  const grab = selector => {
    const escaped = selector.replace(/[.#[\]"()>:]/g, "\\$&");
    return [...css.matchAll(new RegExp("(?:^|\\n)" + escaped + "\\s*\\{([^}]*)\\}", "g"))].map(m => m[1]).join(" ");
  };
  assert.match(grab(".ai-composer-card .portal-vue-ai-chip-line-select .el-select__wrapper::before"), /content:\s*none/, "不再用伪元素写「线」字");
  assert.match(grab(".ai-composer-card .portal-vue-ai-model-chip"), /background:\s*transparent/);
  const template = workbench();
  assert.ok(template.includes("<template #prefix><span class=\"ai-ico\" v-html=\"icon('briefcase')\"></span></template>"), "业务线下拉用图标做前缀");
  assert.ok(template.includes("icon('cpu')") && !template.includes("<b>模型</b>"), "模型按钮用图标，不再写「模型」两个字");
  assert.ok(template.includes('aria-label="业务线"') || template.includes("title=\"业务线\""), "图标按钮要有文字提示");
  assert.ok(template.includes('class="mp-note"') && template.includes("没有配置思考深度"), "不支持思考的模型要说明原因，而不是悄悄少一项");
});

test("对话里粘贴图片：缩略图显示在输入框和用户消息里，发送时随请求带给网关，澄清续答沿用原图", () => {
  const template = workbench();
  const source = read("assets/portal/page-analysis-workbench.js");
  for (const needle of [':images="attachments"', ':busy="attachBusy"', '@paste-files="addImageFiles"', '@remove-image="removeAttachment"', 'class="ai-msg-images"']) assert.ok(template.includes(needle), "模板缺少：" + needle);
  for (const needle of ["async addImageFiles(files)", "removeAttachment(index)", "pickImageFiles(files,existingCount)", "this.readImages(files,this.attachments.length)", "compressImage(", "makeThumb(", "images:images.length?images:undefined", "images:thumbs.length?thumbs:undefined", "lastImages"]) assert.ok(source.includes(needle), "缺少：" + needle);
  assert.match(source, /const images=resumed\?this\.lastImages:this\.attachments\.map\(item=>item\.dataUrl\)/, "续答（澄清后）沿用上一次的原图，新提问用输入框里的图");
  assert.match(source, /if\(!resumed\)\{this\.lastImages=images;this\.attachments=\[\];\}/, "发出新问题后清空输入框里的图片");
  assert.ok(!/images:\s*thumbs\.length\?\s*thumbs/.test(source) || source.includes("thumbs"), "历史里只保留缩略图");
});

test("负反馈：弹窗里写评语、粘贴 / 选择截图，提交时自动带上上下文", () => {
  const template = workbench();
  const source = read("assets/portal/page-analysis-workbench.js");
  for (const needle of ['data-test="ai-feedback-dialog"', 'data-test="ai-feedback-comment"', '@paste="onFeedbackPaste"', 'type="file"', 'accept="image/*"', "提交时会自动附上", "只有管理员能看到", 'data-test="ai-feedback-submit"', 'class="ai-fb-shots"']) assert.ok(template.includes(needle), "模板缺少：" + needle);
  assert.ok(!source.includes("ElMessageBox.prompt(\"哪里不满意"), "旧的单行输入弹窗应被新的反馈弹窗取代");
  for (const needle of ["openFeedback(msg)", "async submitFeedback()", "buildFeedbackContext(", "images:this.fb.images.map(item=>item.dataUrl)", "context", "postFeedback("]) assert.ok(source.includes(needle), "缺少：" + needle);
  assert.match(source, /rateMessage\(msg,rating\)\{[\s\S]*?rating==="down"[\s\S]*?openFeedback\(msg\)/, "点踩打开反馈弹窗");
  const css = allCss();
  for (const selector of [".ai-prompt-input-tray", ".ai-attach", ".ai-msg-images", ".ai-fb-shots", ".ai-feedback-dialog", ".ai-fb-context"]) assert.ok(css.includes(selector), "缺少样式：" + selector);
});

test("样式防呆：同一条规则里文字颜色和背景色不能是同一个令牌（否则文字看不见，比如黑底黑字的按钮）", () => {
  const css = allCss();
  const bad = [];
  for (const match of css.matchAll(/(?:^|\n)([^{}\n@][^{}\n]*)\{([^}]*)\}/g)) {
    const body = match[2];
    const background = (body.match(/(?:^|;|\s)background(?:-color)?:\s*(var\(--ai-[a-z0-9-]+\))/) || [])[1];
    const color = (body.match(/(?:^|;|\s)color:\s*(var\(--ai-[a-z0-9-]+\))/) || [])[1];
    if (background && color && background === color) bad.push(match[1].trim().slice(0, 80));
  }
  assert.deepEqual(bad, [], "这些规则的文字色和背景色相同：" + bad.join(" | "));
});

test("问卷底部按钮一行排完：操作区不换行，提示文字只留「已回答 N / M」，长说明放进提示里", () => {
  const css = read("assets/portal-ai-ui.css");
  const actions = (css.match(/\.ai-questionnaire-actions\s*\{([^}]*)\}/) || [])[1] || "";
  assert.match(actions, /flex-wrap:\s*nowrap/);
  const hint = (css.match(/\.ai-questionnaire-hint\s*\{([^}]*)\}/) || [])[1] || "";
  assert.match(hint, /white-space:\s*nowrap/);
  assert.match(hint, /text-overflow:\s*ellipsis/);
  const kit = read("assets/portal/ai-ui.js");
  assert.ok(kit.includes('class="ai-questionnaire-hint" title="没回答的我按常规口径处理">已回答 {{ answered }} / {{ total }}</span>'), "提示文字缩短，完整说明放在 title 里");
});

test("会话栏：每条只有标题 + 一行「时间 · 业务线」；只有来自飞书的会话才有图标，不再给每条都放一个显示器图标", () => {
  const template = workbench();
  assert.ok(!template.includes("icon('web')"), "工作台来源不再显示显示器图标");
  assert.ok(template.includes('v-if="session.channel === \'飞书机器人\'"') && template.includes("来自飞书机器人"), "飞书来源才显示图标，并有文字提示");
  assert.match(template, /class="portal-vue-ai-session-meta"><time[^>]*>\{\{ relativeTime\(session\.time\) \}\}<\/time>/, "时间和业务线放在同一行");
  const css = allCss();
  assert.match(css, /\.portal-vue-ai-session-top\s*\{[^}]*display:\s*block/, "标题单独一行");
});

test("会话栏顶部两个按钮更突出：「新的分析」是黑色主按钮，「分析资产」是深色描边按钮，报告数是黑底小标", () => {
  const css = allCss();
  const grab = selector => {
    const escaped = selector.replace(/[.#[\]"()>:]/g, "\\$&");
    return [...css.matchAll(new RegExp("(?:^|\\n)" + escaped + "\\s*\\{([^}]*)\\}", "g"))].map(m => m[1]).join(" ");
  };
  const primary = grab(".portal-vue-ai-new.el-button");
  assert.match(primary, /background:\s*var\(--ai-accent\)/);
  assert.match(primary, /color:\s*#fff/);
  assert.match(primary, /height:\s*36px/);
  const secondary = grab(".portal-vue-ai-asset-btn");
  assert.match(secondary, /background:\s*var\(--ai-surface\)/);
  assert.match(secondary, /border:\s*1px solid var\(--ai-ink\)/, "分析资产用深色描边，比之前醒目");
});

test("报告卡片重做：卡片头是图标块 + 标题 + 描边小按钮（文字可见），预览渐隐收起，表格只画横线，不再有虚线", () => {
  const css = allCss();
  const grab = selector => {
    const escaped = selector.replace(/[.#[\]"()>:]/g, "\\$&");
    return [...css.matchAll(new RegExp("(?:^|\\n)" + escaped + "\\s*\\{([^}]*)\\}", "g"))].map(m => m[1]).join(" ");
  };
  const open = grab(".portal-vue-ai-report-open-btn");
  assert.match(open, /color:\s*var\(--ai-ink\)/);
  assert.match(open, /background:\s*var\(--ai-surface\)/);
  assert.match(grab(".portal-vue-ai-report-card-file"), /background:\s*var\(--ai-sunken\)/, "文件图标放在浅灰图标块里");
  assert.match(grab(".portal-vue-ai-report-preview"), /mask-image:/, "预览底部渐隐收起");
  const cell = grab(".portal-vue-ai-report-table td");
  assert.ok(/border-bottom:\s*1px solid var\(--ai-line\)/.test(cell) && !/border:\s*1px/.test(cell), "表格单元格只画横线，不画竖线和四周框");
  const dashedReport = css.split("\n").filter(line => /report/.test(line.split("{")[0]) && line.includes("dashed"));
  assert.deepEqual(dashedReport, [], "报告相关的规则里不再有虚线分割");
});

test("引用 skill 的提示框：浅色箭头（不是黑色菱形），名称前带 skill 图标，芯片里也有图标", () => {
  const template = workbench();
  const source = read("assets/portal/page-analysis-workbench.js");
  assert.equal(template.split('effect="light"').length - 1, 2, "两处 el-tooltip 都用浅色样式，箭头才会跟着变浅");
  assert.equal(template.split('class="ai-skill-icon"').length - 1 >= 4, true, "芯片和提示框标题里都有图标（图片或线性图标各一种写法）");
  assert.match(source, /iconSrc:isImageIconValue\(iconSrc\)\?iconSrc:""/, "图标来自 Skill 注册表，只接受图片地址，不用 emoji");
  assert.ok(source.includes("resolveSkillIcon(skill.icon)"), "旧的 emoji 图标要先转成新的图标文件");
  const css = allCss();
  const arrow = (css.match(/\.ai-skill-tip\.is-light \.el-popper__arrow::before\s*\{([^}]*)\}/) || [])[1] || "";
  assert.match(arrow, /background:\s*var\(--ai-surface\)/);
  assert.match(arrow, /border-color:\s*var\(--ai-line\)/);
  assert.ok(css.includes(".ai-skill-icon"), "缺少 .ai-skill-icon 样式");
});

test("业务线下拉宽度跟着当前文字走，不再留一块固定宽度的空白", () => {
  const template = workbench();
  const source = read("assets/portal/page-analysis-workbench.js");
  assert.ok(template.includes(':style="{ width: lineSelectWidth }"'), "下拉按钮宽度来自 lineSelectWidth");
  assert.match(source, /lineSelectWidth\(\)\{return `\$\{aiChatHelpers\.chipWidth\(this\.activeBusinessLine\|\|"通用"\)\}px`;\}/);
  assert.ok(!/portal-vue-ai-chip-line-select\s*\{[^}]*(?:min-)?width:\s*132px/.test(allCss()), "不再写死 132px");
});

test("会话栏滚动条默认隐藏，鼠标移进列表才显示一条很细的浅色滚动条；报告数标签是黑底白字", () => {
  const css = allCss();
  const bar = (css.match(/\.portal-vue-ai-session-scroll \.el-scrollbar__bar\s*\{([^}]*)\}/) || [])[1] || "";
  assert.match(bar, /opacity:\s*0\s*!important/, "默认不显示");
  assert.match(bar, /width:\s*4px/, "显示时也只有 4px 宽");
  const hover = (css.match(/\.portal-vue-ai-session-scroll:hover \.el-scrollbar__bar\s*\{([^}]*)\}/) || [])[1] || "";
  assert.match(hover, /opacity:\s*1\s*!important/, "鼠标移进列表才显示");
  const thumb = (css.match(/\.portal-vue-ai-session-scroll \.el-scrollbar__thumb\s*\{([^}]*)\}/) || [])[1] || "";
  assert.match(thumb, /background:\s*var\(--ai-line-strong\)/, "滚动条滑块用浅色");
  const tag = (css.match(/\.portal-vue-ai-asset-btn \.el-tag\s*\{([^}]*)\}/g) || []).join(" ");
  assert.match(tag, /background:\s*var\(--ai-ink\)/);
  assert.match(tag, /color:\s*#fff/);
});

test("@ 引用数据表改成下拉列表：一行一张表，鼠标移上去或键盘选中时右侧显示这张表的基本介绍", () => {
  const template = workbench();
  const source = read("assets/portal/page-analysis-workbench.js");
  for (const needle of ['class="ai-mention"', 'role="listbox"', 'role="option"', '@mouseenter="mentionIndex = i"', '@mousedown.prevent="insertMention(table)"', 'data-test="ai-mention-info"', 'data-test="ai-mention-item"', "mentionInfo", "暂无介绍", '@keydown="onComposerKey"']) assert.ok(template.includes(needle), "模板缺少：" + needle);
  assert.ok(!template.includes("portal-vue-ai-mention-list"), "旧的胶囊式列表应删除");
  for (const needle of ["mentionInfo(){", "tableIntro(", "onComposerKey(event)", '"ArrowDown"', '"ArrowUp"', '"Escape"', "moveIndex(", "mentionIndex"]) assert.ok(source.includes(needle), "缺少：" + needle);
  assert.match(source, /onEnter\(event\)\{[\s\S]{0,80}?if\(this\.mentionOpen&&this\.mentionTables\.length\)\{[^}]*insertMention\(/, "下拉打开时回车是选中当前这张表，不是发送");
  const css = allCss();
  for (const selector of [".ai-mention", ".ai-mention-list", ".ai-mention-item", ".ai-mention-info"]) assert.ok(css.includes(selector), "缺少样式：" + selector);
  assert.ok(!css.includes(".portal-vue-ai-mention-list"), "旧样式应删除");
});
