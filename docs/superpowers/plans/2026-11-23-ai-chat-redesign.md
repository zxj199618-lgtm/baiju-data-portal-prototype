# AI 对话改版与能力导览 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「灵犀智析」对话页换成去气泡的新视觉，并加上带视频 / 图文的「能力导览」（欢迎页卡片 + 右侧抽屉 + 详情弹层）。

**Architecture:** 对话页仍是 `page-analysis-workbench.js` 里的 Vue 模板字符串。新视觉放进一个新样式文件 `assets/portal-ai-chat.css`（最后加载），旧的 `.portal-vue-ai-*` 重复规则在第 4 任务清掉。能力内容放进新脚本 `assets/portal/ai-capabilities.js`（纯数据 + 两个纯函数，先于工作台脚本加载），工作台只消费它。

**Tech Stack:** Vue 3（全局构建，模板字符串）、Element Plus（`el-drawer` / `el-dialog`）、node:test 单元与源码断言、Playwright e2e（`tests/e2e-ui.test.cjs`，需要时才跑）。

**Spec:** [docs/superpowers/specs/2026-11-23-ai-chat-redesign-design.md](../specs/2026-11-23-ai-chat-redesign-design.md)

## Global Constraints
- **视觉按 [Ink & Paper 视觉规范](../specs/2026-11-23-ai-chat-design-system.md) 执行（用户 2026-11-23 要求跳出站点蓝色主题）**：颜色只通过 `portal-ai-chat.css` 里 `:root` 的 `--ai-*` 变量使用，不写色值、不用 `#0066FF`；圆角 8 / 12 / 18；标题用衬线体；不用渐变和发光；投影只用 `--ai-shadow-1/2`。弹层、抽屉要加 `ai-theme` 类以取到变量。
- 所有 emoji 换成线性图标；不新增外部依赖，图标用内联 SVG。
- 能力内容的字段固定为：`id, group('can'|'need'|'cannot'), title, summary, icon, example, video?{src,poster,duration}, steps[{image,text}], boundary, skillKey?`。
- 视频与封面约定放在 `assets/guide/`；示意图 `assets/guide/<id>-<n>.svg`。
- 现有 `data-test` 标记全部保留不变：`ai-starter ai-followups ai-followup ai-plan plan-change plan-to-report ai-scope ai-context-reset model-chip ai-line-select`；「＋ 新的分析」按钮文字保持原样（e2e 用文字定位）。
- `prototype-smoke.test.cjs` 断言了 `.portal-vue-ai-model-chip`、`.portal-vue-ai-model-pop .mp-levels` 等选择器在 `portal-vue-module.css` 里，**这些规则不删、不挪**。
- `assets/portal/` 下新增脚本必须同时登记 `manifest.json` 与 `index.html` 的 script 标签，且顺序一致（`tests/lint.test.cjs` 校验）。
- 提交信息用中文；结尾加 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`。
- e2e（`npm run test:e2e`，约 4 分钟）不自动跑：到「最终验证」任务时先问用户。

## Review Focus
1. 网关还没返回 Skill 列表（页面用兜底数据）时，能力卡片仍要显示，不能全部消失。→ Task 5 单元测试。
2. 某个 Skill 在「Skill 配置」里下线后，对应卡片隐藏；一组全空时抽屉不显示该组标题。→ Task 5 单元测试。
3. 视频文件不存在或加载失败时，详情弹层自动退回图文，不显示黑块。→ Task 8 源码断言 + 浏览器验证。
4. 点「试一试」时输入框里已有草稿：不丢草稿，示例问法追加到新的一行。→ Task 5 单元测试。
5. 历史会话和飞书机器人来源的回答没有 `plan / resolved / meta / requestId`：新的「依据」行和反馈按钮不能渲染空壳或报错。→ Task 3 源码断言 + 浏览器验证。

---

## 第一步：对话页改版

### Task 1: 新样式文件接入

**Files:**
- Create: `assets/portal-ai-chat.css`
- Modify: `index.html`（在 `portal-lanhu-theme.css` 之后加 `<link rel="stylesheet" href="assets/portal-ai-chat.css?v=20261118e" />`）
- Modify: `scripts/build-standalone.cjs:53` 附近（资源列表里加 `{ assetPath: "assets/portal-ai-chat.css", kind: "style" }`，位置在 lanhu-theme 之后）
- Modify: `tests/prototype-smoke.test.cjs:20`（`portalCss` 改为 `portal-vue-module.css` 与 `portal-ai-chat.css` 内容拼接）和第 44 行的文件清单（加入新文件）
- Test: `tests/ai-chat-redesign.test.cjs`（新建）

**Interfaces:**
- Produces: 样式根作用域 `.portal-vue-ai-layout`；`:root` 上的 `--ai-*` 设计变量（见视觉规范；实现时已按规范改为 Ink & Paper 的变量集），后续任务的样式直接引用。

- [ ] **Step 1: 写失败测试** `tests/ai-chat-redesign.test.cjs`：`test("新样式文件已接入页面和单文件构建")` 断言 `index.html` 含 `assets/portal-ai-chat.css` 且位置在 `portal-lanhu-theme.css` 之后；`scripts/build-standalone.cjs` 含该路径；文件存在。
- [ ] **Step 2:** `node --test tests/ai-chat-redesign.test.cjs`，预期 FAIL（文件不存在）。
- [ ] **Step 3:** 创建 css 文件（先只放变量定义和一行注释说明「灵犀智析对话页样式，最后加载」）；改 index.html、build-standalone、smoke 的两处读取。
- [ ] **Step 4:** `node --test tests/ai-chat-redesign.test.cjs tests/prototype-smoke.test.cjs tests/lint.test.cjs`，预期 PASS。
- [ ] **Step 5: Commit**：`git add` 上述文件，信息「对话页改版：接入新样式文件」。

### Task 2: 页面布局、会话栏、输入框卡片

**Files:**
- Modify: `assets/portal/page-analysis-workbench.js` 模板的 `<aside class="portal-vue-ai-side">`、`.portal-vue-ai-chat` 容器、`.portal-vue-ai-input` 区块（约 143–166、190、261–296 行）
- Modify: `assets/portal-ai-chat.css`
- Test: `tests/ai-chat-redesign.test.cjs`

**Interfaces:**
- Consumes: Task 1 的 CSS 变量。
- Produces: 输入卡片容器类 `.ai-composer-card`（内含 textarea、chip 行、发送按钮）；侧栏图标统一用内联 SVG，类名 `.ai-ico`（16px，`currentColor`）。Task 9 在 chip 行里加「能力」按钮，要用到这个容器。

- [ ] **Step 1: 写失败测试**：断言工作台模板里不再包含 `📊`、`🤔`、`📄`、`👍`、`👎`、`灵` 方块 logo 以外的 emoji（正则匹配 `\p{Extended_Pictographic}`，对 `page-analysis-workbench.js` 的 template 部分）；断言保留 `＋ 新的分析`、`data-test="ai-line-select"`、`data-test="model-chip"`、`class="portal-vue-ai-model-chip"`。
- [ ] **Step 2:** 运行，预期 FAIL（现在有 emoji）。
- [ ] **Step 3: 改模板与样式**：
  - 会话栏宽度 168px（`.portal-vue-ai-layout` 的 grid 第一列），会话行只显示标题 + 相对时间，渠道（飞书机器人 / 工作台）用 12px 小图标 + `title` 提示代替 `el-tag`；「运行中」状态保留为一个小圆点。
  - 对话区去灰底，内容列居中、最大宽度 760px。
  - 输入框改悬浮圆角卡片 `.ai-composer-card`（圆角 14、1px 边框、聚焦时边框加深为 `--ai-line-strong`），业务线、模型 chip 放卡片内底部左侧，发送按钮改圆形 30px 强调色图标按钮（保留 `@click="sendMessage"` 与 `:disabled`）。
  - 分析资产入口、会话图标、报告卡文件图标换成内联 SVG。
- [ ] **Step 4:** 运行 Step 2 的测试，预期 PASS；再跑 `npm run lint`。
- [ ] **Step 5: 浏览器验证**：`preview_start`（`static` 配置只能看静态页，登录需要网关）→ 改用 `PORTAL_DEMO_LOGIN_PASSWORD=x node scripts/analysis-gateway.cjs` 起网关，打开 `http://localhost:8787/`，用演示登录进入「灵犀智析」，截图确认：侧栏变窄、输入卡片悬浮、控制台无报错。
- [ ] **Step 6: Commit**「对话页改版：布局、会话栏与输入卡片」。

### Task 3: 消息样式（去气泡）与「依据」行

**Files:**
- Modify: `assets/portal/page-analysis-workbench.js`：模板里 assistant 消息的三处重复块（`msg.reportId`、`msg.html`、纯文本）、`data` 的消息字段、`methods`
- Modify: `assets/portal-ai-chat.css`
- Test: `tests/ai-chat-redesign.test.cjs`

**Interfaces:**
- Produces: 方法 `basisSummary(msg): string`（返回「已用「单表分析」查了「xx 表」」；没有 `plan` 且没有 `meta` 时返回 `""`）；消息字段 `msg.basisOpen`（布尔，默认 undefined 即收起）。
- 模板里把原来 `ai-plan`、`ai-scope`、`ai-meta-card` 三块**搬进**一个 `v-if="basisSummary(msg)"` 的折叠区：折叠行显示 `basisSummary(msg)` + 「看依据」；展开后依次是原 `ai-plan`（含「换一个」下拉）、`ai-scope`、元信息卡。三块原有的 `data-test` 与事件处理不变。

- [ ] **Step 1: 写失败测试**：断言模板包含 `basisSummary(msg)`、`msg.basisOpen`；`ai-plan`、`plan-change`、`plan-to-report`、`ai-scope` 仍在；assistant 气泡类 `portal-vue-ai-bubble` 在 assistant 分支下不再有背景（读 css：`portal-ai-chat.css` 含 `.portal-vue-ai-message.assistant .portal-vue-ai-bubble` 且声明 `background: transparent`）；用户气泡保留且不含 `linear-gradient`。
- [ ] **Step 2:** 运行，预期 FAIL。
- [ ] **Step 3: 实现**：
  - 去掉 assistant 气泡背景 / 阴影 / 最大宽度 78%，正文 14px / 行高 1.75；头像改墨色圆角方块（8px 圆角、26px，衬线「灵」）。
  - 三处重复的 `ai-plan / ai-scope / meta` 块各自替换成同一个折叠区（可抽成局部模板片段，避免第四份复制）。`basisSummary` 在 `msg.plan` 与 `msg.meta` 都不存在时返回 `""`，折叠区整体不渲染（历史会话、飞书来源消息走这条）。
  - 思考过程默认收起为一行（去 emoji，箭头用 SVG）；流式生成中保持原行为。
  - 报告卡改线框、一行标题 + 「打开」；反馈按钮换线性 SVG 图标（保留 `rateMessage` 与 `on` 状态类）；追问 chip 改细边框无填充。
  - 澄清提问卡（`msg.ask`）只统一边框、圆角、字号，不改交互。
- [ ] **Step 4:** 运行测试，预期 PASS；`npm run lint`。
- [ ] **Step 5: 浏览器验证**：登录后发起一次分析，截图确认：回答无气泡、「已用…· 看依据」可展开、「换一个」仍能点开；再打开一个只有 `lines` 的种子历史会话，确认没有空的依据行、没有控制台报错。
- [ ] **Step 6: Commit**「对话页改版：回答去气泡，依据收成一行」。

### Task 4: 清理旧样式

**Files:**
- Modify: `assets/portal-vue-module.css`、`assets/portal-shell.css`
- Test: `tests/ai-chat-redesign.test.cjs`、`tests/prototype-smoke.test.cjs`

- [ ] **Step 1:** 在仓库里 `grep -rn "portal-vue-ai-" assets share.html` 列出每个 `.portal-vue-ai-*` 类实际被哪些文件使用；只把**仅被灵犀智析页面使用、且新文件已重新定义**的类的旧规则删掉。`model-chip`、`model-pop`、`mp-levels`、`ai-report-body`（`share.html` 与报告弹层共用）及被其它页面用到的规则保留。
- [ ] **Step 2: 写测试**：断言 `portal-vue-module.css` 中 `.portal-vue-ai-welcome {` 与 `.portal-vue-ai-bubble {` 各最多出现 1 次（原来分别出现 4 / 2 次以上）；`portal-shell.css` 里不再有与新文件重复定义的 `.portal-vue-ai-message` 规则。
- [ ] **Step 3:** 删除旧规则，运行 `npm test`（不含 e2e），预期全部 PASS。
- [ ] **Step 4: 浏览器回归**：灵犀智析、分析资产页、报告弹层、`share.html` 公开报告页各截一张图，确认样式正常。
- [ ] **Step 5: Commit**「对话页改版：清理重复的旧样式」。

---

## 第二步：能力导览

### Task 5: 能力数据与纯函数

**Files:**
- Create: `assets/portal/ai-capabilities.js`
- Modify: `assets/portal/manifest.json`、`index.html`（登记在 `core.js` 之后、`page-analysis-workbench.js` 之前）
- Test: `tests/ai-capabilities.test.cjs`（新建；用 `vm` 在带 `window.PortalVue = {}` 的上下文里执行脚本）

**Interfaces:**
- Produces（挂在 `window.PortalVue.aiCapabilities`）：
  - `GROUPS: [{ key: 'can'|'need'|'cannot', label: '直接能做'|'要你补充信息'|'暂时做不了' }]`
  - `list: Capability[]`（初始 7 项：`can` 4 项 —— 看趋势 `skillKey:'data-query'`、找原因 `'attribution'`、查口径 `'asset'`、查影响 `'lineage'`；`need` 1 项 —— 跨业务线分析；`cannot` 2 项 —— 实时数据 / 修改数据，`example` 为「可以改问」的问法；每项 3 张 `steps`，路径 `assets/guide/<id>-<n>.svg`；`video` 全部先不填）
  - `visibleCapabilities(list: Capability[], enabledSkillKeys: string[] | null): Capability[]` —— `enabledSkillKeys` 为 `null` 表示 Skill 列表还没加载，返回全部；否则隐藏 `skillKey` 不在其中的项；无 `skillKey` 的项始终保留。
  - `groupCapabilities(items: Capability[]): { key, label, items }[]` —— 按 `GROUPS` 顺序，空组不返回。
  - `mergeDraft(current: string, example: string): string` —— `current` 去空白后为空则返回 `example`；否则 `current` 末尾去换行后加 `\n` + `example`。
- 每项 `boundary` 文案是草稿，在文件顶部注释里写明「待业务方确认」。

- [ ] **Step 1: 写失败测试**，断言：
  - `visibleCapabilities(list, null).length === list.length`（Review Focus 1）；
  - `visibleCapabilities(list, ['asset','lineage'])` 不含 `skillKey` 为 `data-query` / `attribution` 的项，且 `need`、`cannot` 项保留（Review Focus 2）；
  - 下线后 `groupCapabilities` 不返回空组；
  - `mergeDraft('', 'A') === 'A'`，`mergeDraft('已有内容\n', 'A') === '已有内容\nA'`（Review Focus 4）；
  - `list` 每项都有 `id/group/title/summary/example/boundary`，`steps.length === 3`，`id` 不重复。
- [ ] **Step 2:** `node --test tests/ai-capabilities.test.cjs`，预期 FAIL。
- [ ] **Step 3: 实现** 文件与登记；数据文案按 Spec 的示例（看趋势问法「近 7 天各媒体消耗怎么变化？」等）起草。
- [ ] **Step 4:** 运行该测试和 `tests/lint.test.cjs`、`npm run lint`，预期 PASS。
- [ ] **Step 5: Commit**「能力导览：能力数据与纯函数」。

### Task 6: 图文示意图

**Files:**
- Create: `assets/guide/<id>-<n>.svg`（7 项 × 3 张，共 21 张；宽 640、高 360，深松绿 `#1F5A4C` + 暖灰线稿，底色 `#F6F4EF`，图内不放小于 12px 的文字）
- Test: `tests/ai-capabilities.test.cjs`

- [ ] **Step 1: 写失败测试**：遍历 `list` 的每个 `steps[].image`，断言文件存在且是以 `<svg` 开头的有效文件。
- [ ] **Step 2:** 运行，预期 FAIL。
- [ ] **Step 3:** 生成 21 张示意图：每项三步分别示意「输入问题 → 系统选表 / 查数 → 得到结果」，用输入框、表格、折线图等简单图形，不放真实业务数据。
- [ ] **Step 4:** 运行，预期 PASS；用浏览器打开其中 3 张目测。
- [ ] **Step 5: Commit**「能力导览：图文示意图」。

### Task 7: 欢迎页卡片与「试一试」

**Files:**
- Modify: `assets/portal/page-analysis-workbench.js`（顶部解构、欢迎页模板、`computed`、`methods`）
- Modify: `assets/portal-ai-chat.css`
- Modify: `tests/e2e-ui.test.cjs`（仅在需要时，见 Step 5）
- Test: `tests/ai-chat-redesign.test.cjs`

**Interfaces:**
- Consumes: Task 5 的 `aiCapabilities`；Task 2 的 `.ai-composer-card`。
- Produces（工作台组件）：
  - `data`: `capDrawer: false`、`capDetail: null`
  - `computed capabilityGroups(): {key,label,items}[]` —— `groupCapabilities(visibleCapabilities(list, 已加载则为 skillScenarios 的 key 数组，否则 null))`。「已加载」= `state.skills?.length > 0`。
  - `methods openCapability(item)`、`tryCapability(item)`（`this.input = mergeDraft(this.input, item.example)`，关闭抽屉与弹层，聚焦输入框，**不自动发送**）。
- 欢迎页：标题「你好，想分析点什么？」+ 副标题；`can` 组渲染为 2×2 卡片，每张带 `data-test="ai-capability-card"`，显示图标、名称、`example`、「30 秒看示例」（有 `video`）或「图文说明」；卡片下方一行「我能做什么，不能做什么 ›」（`data-test="ai-capability-open"`）；再下面保留一行「你也可以问」，继续渲染 `starterSuggests`，按钮保留 `data-test="ai-starter"`（**与 Spec 有一处出入**：Spec 写并入卡片，但 e2e 校验了权益用户的个性化首屏问法，所以保留这一行）。去掉文字 tips。

- [ ] **Step 1: 写失败测试**：断言模板含 `data-test="ai-capability-card"`、`data-test="ai-capability-open"`、`tryCapability`、`capabilityGroups`；`ai-starter` 仍在；不再含 `portal-vue-ai-welcome-tips`。
- [ ] **Step 2:** 运行，预期 FAIL。
- [ ] **Step 3: 实现** 上述 data / computed / methods / 模板 / 样式（卡片 12px 圆角、1px 边框、悬停边框变蓝；≤900px 时卡片单列）。
- [ ] **Step 4:** 运行测试 + `npm run lint`，预期 PASS。
- [ ] **Step 5: 浏览器验证**：新开会话看欢迎页；点卡片应打开弹层（Task 8 完成前先确认 `capDetail` 被设置）；用有权益表权限的账号确认个性化问法仍显示。
- [ ] **Step 6: Commit**「能力导览：欢迎页能力卡片」。

### Task 8: 抽屉与详情弹层

**Files:**
- Modify: `assets/portal/page-analysis-workbench.js`（模板里加 `el-drawer` 与 `el-dialog`；`data` 加 `capView: 'video'|'steps'`、`capVideoFailed: false`；`methods` 加 `openCapabilityDrawer()`、`onCapVideoError()`）
- Modify: `assets/portal-ai-chat.css`
- Test: `tests/ai-chat-redesign.test.cjs`

**Interfaces:**
- Consumes: Task 7 的 `capabilityGroups`、`openCapability`、`tryCapability`；Task 5 的 `Capability`。
- 抽屉 `data-test="ai-capability-drawer"`：右侧、宽 360px（≤900px 全宽），标题「我能帮你做什么」；按组渲染，每项一行（缩略图位、名称、`summary`），`cannot` 组每项多一行「可以改问：{{ example }}」；点行 = `openCapability(item)`。
- 弹层 `data-test="ai-capability-dialog"`：宽 480px；顶部媒体区 16:9 —— `item.video?.src && !capVideoFailed && capView==='video'` 时渲染 `<video controls :poster :src @error="onCapVideoError">` 与时长；否则渲染 `steps`（图 + 一行说明，纵向）。右上角「视频 | 图文」切换仅在有 `video` 时显示。中部：名称、`summary`。示例问法一行 + 「试一试」按钮（`data-test="ai-capability-try"`，`@click="tryCapability(capDetail)"`）。底部一行「边界：{{ boundary }}」提示条。`openCapability` 每次打开重置 `capView='video'`、`capVideoFailed=false`。

- [ ] **Step 1: 写失败测试**：断言模板含上述四个 `data-test`、`@error="onCapVideoError"`、`capVideoFailed`、`item.video`（或 `capDetail.video`）的判断、`example` 在 `cannot` 组以「可以改问」展示。
- [ ] **Step 2:** 运行，预期 FAIL。
- [ ] **Step 3:** 实现模板、方法与样式。
- [ ] **Step 4:** 运行测试 + `npm run lint`，预期 PASS。
- [ ] **Step 5: 浏览器验证**：点欢迎页链接开抽屉 → 点一项开弹层 → 点「试一试」，输入框被填入示例问法且未发送；输入框已有文字时再试，确认追加到新一行；给 `ai-capabilities.js` 里某项临时填一个不存在的 `video.src`，确认弹层自动退回图文（验证后还原）。
- [ ] **Step 6: Commit**「能力导览：能力抽屉与详情弹层」。

### Task 9: 输入框入口、版本号与最终验证

**Files:**
- Modify: `assets/portal/page-analysis-workbench.js`（`.ai-composer-card` 的 chip 行加「能力」按钮，`data-test="ai-capability-entry"`，`@click="openCapabilityDrawer"`）
- Modify: `index.html`（所有 `?v=20261118e` 改为 `?v=20261123a`）
- Modify: `docs/superpowers/specs/2026-11-23-ai-chat-redesign-design.md`（把「`starterSuggests` 并入卡片、不再单独显示」改为「保留为卡片下方一行『你也可以问』」）
- Test: `tests/ai-chat-redesign.test.cjs`

- [ ] **Step 1: 写失败测试**：断言模板含 `data-test="ai-capability-entry"`；`index.html` 不再含 `20261118e` 且含 `20261123a`。
- [ ] **Step 2:** 运行，预期 FAIL。
- [ ] **Step 3:** 实现入口按钮、批量替换版本号（`sed -i '' 's/20261118e/20261123a/g' index.html`）、改 Spec 一句。
- [ ] **Step 4:** 运行 `npm test`、`npm run lint`、`npm run build:standalone`（确认单文件版能构建），预期全部成功。
- [ ] **Step 5: 全流程浏览器验证**：欢迎页 → 卡片 → 弹层 → 试一试 → 发送；对话中点「能力」按钮开抽屉；窄屏（`resize_window` 宽 800）下卡片单列、抽屉全宽；桌面宽度与窄屏各截一张图。
- [ ] **Step 6:** **询问用户**是否运行 `npm run test:e2e`（约 4 分钟）；用户同意再跑，失败要贴出输出。
- [ ] **Step 7: Commit**「能力导览：输入框入口，静态资源版本 20261123a」。
