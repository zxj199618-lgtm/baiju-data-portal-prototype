const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const exists = relative => fs.existsSync(path.join(root, relative));

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
  const start = source.indexOf("const BASIS_TPL");
  const end = source.indexOf("data:()=>({");
  assert.ok(start > -1 && end > start, "找不到工作台模板");
  return source.slice(start, end);
};

test("布局：模板里没有 emoji，关键入口与 data-test 保持不变", () => {
  const template = workbench();
  assert.equal(template.match(/\p{Extended_Pictographic}/gu), null, "模板里不应再有 emoji：" + (template.match(/\p{Extended_Pictographic}/gu) || []).join(""));
  for (const needle of ["＋ 新的分析", 'data-test="ai-line-select"', 'data-test="model-chip"', 'class="portal-vue-ai-model-chip"', "ai-composer-card"]) {
    assert.ok(template.includes(needle), "模板缺少：" + needle);
  }
});

test("布局：会话栏收窄、对话列居中、输入卡片有样式", () => {
  const css = read("assets/portal-ai-chat.css");
  assert.match(css, /\.portal-vue-ai-layout\s*\{[^}]*grid-template-columns:\s*168px/);
  assert.match(css, /\.ai-composer-card/);
  assert.match(css, /max-width:\s*760px/);
});

test("消息：依据收成一行，原有功能与 data-test 保留", () => {
  const template = workbench();
  assert.ok(template.includes('v-if="basisSummary(msg)"'), "依据折叠区必须由 basisSummary(msg) 控制，没有依据的历史 / 飞书消息不渲染空壳");
  assert.ok(template.includes("msg.basisOpen"), "缺少展开状态 msg.basisOpen");
  for (const needle of ['data-test="ai-plan"', 'data-test="plan-change"', 'data-test="plan-to-report"', 'data-test="ai-scope"', 'data-test="ai-basis-toggle"', 'data-test="ai-followups"', 'data-test="ai-followup"', "rateMessage(msg, 'up')", "rateMessage(msg, 'down')"]) {
    assert.ok(template.includes(needle), "模板缺少：" + needle);
  }
  assert.ok(template.includes('v-if="msg.requestId && !msg.streaming" class="portal-vue-ai-feedback"'), "反馈按钮仍只在有 requestId 且生成完成后出现");
  assert.equal(template.split('data-test="ai-plan"').length - 1, 1, "ai-plan 只在共用的 BASIS_TPL 里定义一次");
  assert.equal(template.split("${BASIS_TPL}").length - 1, 2, "报告类与回答类消息都要引用 BASIS_TPL");
});

test("消息：助手回答无气泡背景，用户气泡无渐变", () => {
  const css = read("assets/portal-ai-chat.css");
  const block = selector => {
    const match = css.match(new RegExp(selector.replace(/[.]/g, "\\.") + "\\s*\\{([^}]*)\\}"));
    assert.ok(match, "缺少样式：" + selector);
    return match[1];
  };
  assert.match(block(".portal-vue-ai-message.assistant .portal-vue-ai-bubble"), /background:\s*transparent/);
  assert.doesNotMatch(block(".portal-vue-ai-message.user .portal-vue-ai-bubble"), /gradient/);
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
  assert.ok(moduleCss.includes(".portal-vue-ai-chip-model-select { width: 200px; }") && moduleCss.includes(".portal-vue-ai-chip-line-select { width: 200px; }"), "smoke 测试断言的下拉宽度规则不能删");
  assert.ok(moduleCss.includes("portal-vue-ai-bot-icon"), "告警页在用的 bot-icon 规则不能删");
});

test("视觉规范：新样式自成一套 Ink & Paper 变量，不沿用站点蓝，颜色只通过变量使用", () => {
  const css = read("assets/portal-ai-chat.css");
  const rootBlock = css.match(/:root\s*\{([^}]*)\}/);
  assert.ok(rootBlock, "缺少 :root 变量定义");
  for (const token of ["--ai-canvas", "--ai-surface", "--ai-sunken", "--ai-line", "--ai-ink", "--ai-accent", "--ai-accent-tint", "--ai-amber", "--ai-shadow-1", "--ai-shadow-2", "--ai-font-display"]) {
    assert.ok(rootBlock[1].includes(token + ":"), "缺少变量：" + token);
  }
  assert.ok(!/#0066ff/i.test(css), "新样式不应使用站点蓝 #0066FF");
  const outsideRoot = css.replace(/:root\s*\{[^}]*\}/, "");
  const hexes = (outsideRoot.match(/#[0-9a-fA-F]{3,8}\b/g) || []).filter(hex => !["#fff", "#F6F4EF"].includes(hex));
  assert.deepEqual(hexes, [], "变量定义之外不应直接写色值（#fff 和象牙白字色除外）：" + hexes.join(" "));
  assert.ok(read("docs/superpowers/specs/2026-11-23-ai-chat-design-system.md").includes("Ink & Paper"), "缺少视觉规范文档");
});

test("能力导览：欢迎页是能力卡片 + 「我能做什么」入口，个性化问法保留为一行", () => {
  const template = workbench();
  const source = read("assets/portal/page-analysis-workbench.js");
  for (const needle of ['data-test="ai-capability-card"', 'data-test="ai-capability-open"', "capabilityCan", "openCapability(item)", "openCapabilityDrawer", "你好，想分析点什么？", 'data-test="ai-starter"']) {
    assert.ok(template.includes(needle), "模板缺少：" + needle);
  }
  assert.ok(!template.includes("portal-vue-ai-welcome-tips"), "文字 tips 应被能力卡片取代");
  assert.ok(!read("assets/portal-ai-chat.css").includes("portal-vue-ai-welcome-tips"), "不再使用的 tips 样式应删除");
  assert.match(source, /aiCapabilities\s*\n?\s*\}\s*=\s*window\.PortalVue/, "工作台要从 PortalVue 取 aiCapabilities");
  assert.ok(source.includes("capabilityGroups(){") && source.includes("state.skills?.length?"), "能力卡片要随 Skill 在线情况过滤，Skill 未加载时全部显示");
  assert.ok(source.includes("mergeDraft(this.input"), "试一试必须用 mergeDraft 保留草稿");
  const tryBody = source.slice(source.indexOf("tryCapability(item)"), source.indexOf("tryCapability(item)") + 600);
  assert.ok(!/sendMessage|askFollowUp/.test(tryBody), "试一试只填入输入框，不能自动发送");
});

test("能力导览：抽屉按三组展示，详情弹层有视频 / 图文切换、试一试和边界，视频出错自动退回图文", () => {
  const template = workbench();
  const source = read("assets/portal/page-analysis-workbench.js");
  for (const needle of ['data-test="ai-capability-drawer"', 'data-test="ai-capability-dialog"', 'data-test="ai-capability-try"', 'data-test="ai-capability-row"', "tryCapability(capDetail)", '@error="onCapVideoError"', "capVideoFailed", "capDetail.video", "可以改问", "边界："]) {
    assert.ok(template.includes(needle), "模板缺少：" + needle);
  }
  assert.ok(template.includes('class="ai-theme') || template.includes('ai-theme"'), "抽屉和弹层是挂到 body 上的，要加 ai-theme 类才能取到视觉变量");
  assert.match(source, /onCapVideoError\(\)\{[^}]*capVideoFailed\s*=\s*true/, "视频出错要置 capVideoFailed");
  assert.match(source, /capSteps\(\)\{|showVideo\(\)\{/, "要有判断「显示视频还是图文」的计算属性");
});
