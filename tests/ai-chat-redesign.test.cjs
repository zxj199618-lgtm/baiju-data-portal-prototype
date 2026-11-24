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

test("能力入口：输入卡片里有常驻的「能力」按钮；静态资源版本号已递增", () => {
  const template = workbench();
  assert.ok(template.includes('data-test="ai-capability-entry"'), "输入卡片缺少「能力」入口");
  assert.ok(/data-test="ai-capability-entry"[^>]*@click="openCapabilityDrawer"|@click="openCapabilityDrawer"[^>]*data-test="ai-capability-entry"/.test(template), "「能力」按钮要打开抽屉");
  const html = read("index.html");
  assert.ok(!html.includes("20261118e"), "index.html 里还有旧的静态资源版本号 20261118e");
  assert.ok(html.includes("?v=20261124b"), "index.html 缺少新的静态资源版本号 20261124b");
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
