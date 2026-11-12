# Skill 详情页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Skill 的长配置从右侧抽屉改成整页详情（四个页签：基本信息、提示词、引用的表、版本管理），列表只负责检索、上线开关和进入详情；引用的表可编辑并立刻作为分析默认取数范围。

**Architecture:** 表清单覆盖值写在 `DATA_DIR/skill-registry.json` 的 `entry.tables`，不改仓库里的 `skill-packs/*/skill.json`。`GET /v1/skills` 与分析取数都通过 `resolveSkillTables(entry, pack)` 合并：有覆盖用覆盖，否则用规范包 `spec.tables`。前端新增独立页面「Skill 详情」，切换方式对齐「表详情」（`bridge` + `setPage` + `#/ai/skills/:skill`）。版本、灰度、回滚仍走现有的门户原型状态（`state.skills[].versions`），本期不把版本历史搬到网关。

**Tech Stack:** Node.js（CommonJS，`node --test`）、无构建的 Vue 3 + Element Plus 全局构建、Playwright（本机 Chrome，可选）。

**Spec:** `docs/superpowers/specs/2026-11-12-skill-detail-page-design.md`

## Global Constraints

- 权限：页面按钮仍按 `canEdit('Skill 配置')` / `canView('Skill 配置')`；网关 `PUT /v1/skills/:id/config` 维持现有 `requiresAdmin`（门户管理员），不在本期改成按菜单权限判断。
- `PUT` 新增字段 `tables`：必须是数组，元素为表中文名字符串，去空、去重；只接受 `allTableNames` 里的表，否则 400 并返回未识别表名；允许空数组；防护上限 100。
- 引用的表保存后即时生效，不新建版本；基本信息和提示词（或路由规则）保存为「未发布」新版本。列表上的上线开关仍可单独改 `enabled`，不新建版本。
- 分析算法不改：只把默认取数范围从「规范包 `spec.tables`」改为「注册表覆盖优先，否则规范包」。用户在对话里指定了表时，仍以对话为准。
- 写操作记审计类型 `skill-config-change`（Skill id、操作人、改了哪些字段），不把提示词正文写入审计。
- 前端新增 / 修改 `assets/portal/*.js` 后，`assets/portal/manifest.json` 与 `index.html` 的 script 清单必须完全一致（顺序也一致），`?v=` 统一改为 `20261112d`。`tests/lint.test.cjs` 会检查清单。
- 工作区里已有一批未提交改动（业务线样式、表详情业务线字段等）。提交本功能时只 `git add` 本任务列出的文件；不要 `git add -A`。若必须改已脏的 `index.html`，只纳入本功能相关行，或先 stash 无关改动。
- 提交信息用中文，格式如 `Skill详情：…`。不推送、不生产发版。
- 不要把 Skill 配置改成可视化编排，也不做「按 Skill 批量配置表管理」。

## 规划阶段的两处决定（与 spec 的差异，需要你知道）

- **表清单的落盘位置：** 规范包安装时会从写入 `DATA_DIR/skills/<id>/skill.json` 的清单里去掉 `spec`，分析运行时读的是内存里的 `skillPacks`，不是这份落盘清单。因此覆盖值写在 `skill-registry.json` 的 `entry.tables`，启动安装规范包时不得清掉这个字段。仓库里的 `skill-packs/*/skill.json` 只作为默认值。
- **详情页地址：** spec 写「不新做 hash 路由」，但表详情实际上已有 `#/asset/tables/{库.表}`，刷新仍打开同一对象。Skill 详情沿用同一套 `assets/portal-routes.js`，新增 `#/ai/skills/:skill`（参数是 Skill `id`）。找不到该 id 时回退到「Skill 配置」并提示。这不是另做一套路由。

## File Structure

- Create: `scripts/skill-tables.cjs` — `sanitizeSkillTables` / `resolveSkillTables`
- Create: `assets/portal/page-skill-detail.js` — 「Skill 详情」整页（四个页签）
- Modify: `scripts/analysis-gateway.cjs` — PUT/GET 的 `tables`、分析默认表、审计；`installSkillPacks` 保留覆盖
- Modify: `assets/portal-routes.js`、`tests/routes.test.cjs`、`tests/e2e-routes.test.cjs` — `#/ai/skills/:skill`
- Modify: `assets/portal-bridge.js` — `get/setSkillDetailId`、显隐 `#skillDetailView`、解析地址
- Modify: `assets/portal/core.js`、`assets/portal/page-sidebar.js` — 「Skill 详情」归属「Skill 配置」
- Modify: `assets/portal/page-skill-management.js` — 列表进入详情、短表单新增；去掉配置抽屉
- Modify: `index.html`、`assets/portal/manifest.json` — 挂载点与脚本
- Modify: `assets/portal-vue-module.css` — 仅为本页增加提示词编辑区高度（提交时避开无关样式改动，必要时把本页样式写进 `page-skill-detail.js` 的 `injectStyle`）
- Test: `tests/skill-tables.test.cjs`、`tests/skill-config.test.cjs`、`tests/prototype-smoke.test.cjs`、`tests/e2e-ui.test.cjs`

---

### Task 1: 表清单校验、注册表覆盖与分析默认范围

**Files:**
- Create: `scripts/skill-tables.cjs`
- Create: `tests/skill-tables.test.cjs`
- Create: `tests/skill-config.test.cjs`
- Modify: `scripts/analysis-gateway.cjs`（`GET /v1/skills`、`PUT /v1/skills/:id/config`、`installSkillPacks`、分析里计算 `packTables` 的那一行，约 3459）

**Interfaces:**
- Produces: `sanitizeSkillTables(input, knownNames, { max = 100 } = {}) → { ok: true, tables: string[] } | { ok: false, error: string, unknown?: string[] }`
- Produces: `resolveSkillTables(entry, pack) → string[]`：若 `Array.isArray(entry.tables)` 用它，否则用 `pack?.spec?.tables`，再否则 `[]`。结果已是字符串数组（调用方仍应再按权限过滤）。
- Consumes: `allTableNames`（网关已有的表中文名列表）

- [ ] **Step 1: Write the failing tests** in `tests/skill-tables.test.cjs`

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeSkillTables, resolveSkillTables } = require("../scripts/skill-tables.cjs");

const known = ["广告计划日报表", "权益-账号维度消耗统计表"];

test("空数组和缺省都合法", () => {
  assert.deepEqual(sanitizeSkillTables([], known), { ok: true, tables: [] });
});

test("去空、去重、去两端空白，保留顺序", () => {
  const result = sanitizeSkillTables([" 广告计划日报表 ", "广告计划日报表", "", "权益-账号维度消耗统计表"], known);
  assert.equal(result.ok, true);
  assert.deepEqual(result.tables, ["广告计划日报表", "权益-账号维度消耗统计表"]);
});

test("未知表名返回 400 信息且列出表名", () => {
  const result = sanitizeSkillTables(["广告计划日报表", "不存在的表"], known);
  assert.equal(result.ok, false);
  assert.match(result.error, /不存在的表/);
  assert.deepEqual(result.unknown, ["不存在的表"]);
});

test("超过 100 张被拒绝", () => {
  const result = sanitizeSkillTables(Array.from({ length: 101 }, (_, i) => `表${i}`), Array.from({ length: 101 }, (_, i) => `表${i}`));
  assert.equal(result.ok, false);
  assert.match(result.error, /100/);
});

test("不是数组被拒绝", () => {
  assert.equal(sanitizeSkillTables("广告计划日报表", known).ok, false);
});

test("resolveSkillTables：注册表覆盖优先于规范包，空数组也算已覆盖", () => {
  const pack = { spec: { tables: ["广告计划日报表"] } };
  assert.deepEqual(resolveSkillTables({ tables: ["权益-账号维度消耗统计表"] }, pack), ["权益-账号维度消耗统计表"]);
  assert.deepEqual(resolveSkillTables({ tables: [] }, pack), []);
  assert.deepEqual(resolveSkillTables({}, pack), ["广告计划日报表"]);
  assert.deepEqual(resolveSkillTables({}, null), []);
});
```

- [ ] **Step 2: Run** `node --test tests/skill-tables.test.cjs` — Expected: FAIL（模块不存在）。

- [ ] **Step 3: Implement** `scripts/skill-tables.cjs`，导出上面两个函数。`sanitizeSkillTables` 对每个元素 `String(...).trim()`，丢掉空串，用 `Set` 按首次出现去重；不在 `knownNames` 的放进 `unknown`；`input` 不是数组、或去重后长度 > `max`，返回 `ok: false`。

- [ ] **Step 4: Run** `node --test tests/skill-tables.test.cjs` — Expected: PASS。

- [ ] **Step 5: 在网关接入，并补 HTTP 测试** `tests/skill-config.test.cjs`（启动方式抄 `tests/gateway-auth.test.cjs`：临时 `DATA_DIR`、管理员「曾祥竞」登录）。用例：
  - 管理员 `PUT /v1/skills/equity-union-analyst/config`，body `{ tables: ["权益-账号维度消耗统计表"] }`，200；随后 `GET /v1/skills` 里该 Skill 的 `tables` 为这一项。
  - `PUT` 带未知表名，400，`error` 含表名。
  - 普通用户（李雨航）`PUT` 仍为 403（现有管理员闸门不变）。
  - `PUT { tables: [] }` 后，`GET` 得到 `tables: []`（空数组覆盖规范包默认值，不会掉回包内的表）。
  - 重启网关进程后再 `GET`，覆盖值还在（证明写进了 `skill-registry.json`，且 `installSkillPacks` 没有清掉）。

  网关改动要点：
  - 文件顶部 `const { sanitizeSkillTables, resolveSkillTables } = require("./skill-tables.cjs");`
  - `GET /v1/skills` 返回对象时加上 `tables: resolveSkillTables(entry, skillPacks.get(entry.id))`
  - `PUT /v1/skills/:id/config` 在现有字段循环之后：若 `body.tables !== undefined`，调用 `sanitizeSkillTables(body.tables, allTableNames)`，失败则 400，成功则 `entry.tables = result.tables`
  - 该 PUT 成功后 `appendAuditEntry({ type: "skill-config-change", user: req.session.name, skillId: id, fields: Object.keys(body).filter(key => key !== "prompt") })`
  - 分析路径把 `const packTables = packEntry ? (packEntry.spec.tables || []).filter(...) : []` 改为 `const packTables = resolveSkillTables(registrySkill, packEntry).filter(name => allowed.includes(name))`（`registrySkill` 已在上方取出；无 registry 时不要引用）
  - `installSkillPacks` 里 `Object.assign(existing, display)` 不得带上 `tables` 字段，也不得 `delete existing.tables`

- [ ] **Step 6: Run** `node --test tests/skill-tables.test.cjs tests/skill-config.test.cjs tests/gateway-auth.test.cjs tests/equity-pack.test.cjs tests/skill-pack.test.cjs` — Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add scripts/skill-tables.cjs tests/skill-tables.test.cjs tests/skill-config.test.cjs scripts/analysis-gateway.cjs
git commit -m "Skill详情：注册表可覆盖 Skill 引用的表，分析默认范围优先用覆盖值"
```

---

### Task 2: 「Skill 详情」路由与空页面壳

**Files:**
- Create: `assets/portal/page-skill-detail.js`
- Modify: `assets/portal-routes.js`（在「Skill 配置」那一行后增加详情路由）
- Modify: `assets/portal-bridge.js`（`routeParams` / `resolveRoute`、显隐、`get/setSkillDetailId`，对标 `portalTableDetailAsset`）
- Modify: `assets/portal/core.js` 的 `MENU_OF_PAGE`：`"Skill 详情": "Skill 配置"`
- Modify: `assets/portal/page-sidebar.js` 的 `menuActive`：`if (this.page === "Skill 详情") return "Skill 配置";`
- Modify: `index.html`（在 `#skillManagementView` 旁增加 `#skillDetailView`；在 `page-skill-management.js` 的 script 后增加 `page-skill-detail.js`；所有 `assets/portal/*.js` 与相关 CSS 的 `?v=` 改为 `20261112d`）
- Modify: `assets/portal/manifest.json`（`page-skill-management.js` 后面插入 `page-skill-detail.js`）
- Test: `tests/routes.test.cjs`、`tests/prototype-smoke.test.cjs`、`tests/e2e-routes.test.cjs`、`tests/lint.test.cjs`

**Interfaces:**
- Consumes: 现有 `PortalRoutes`、`bridge.setPage`、`portal:page-change`
- Produces: 页面名「Skill 详情」；地址 `#/ai/skills/:skill`；`bridge.getSkillDetailId()` / `bridge.setSkillDetailId(id)`（存在 `window.portalSkillDetailId`）

- [ ] **Step 1: 先改路由单测** `tests/routes.test.cjs`，增加：

```js
assert.equal(R.toHash("Skill 详情", { skill: "equity-union-analyst" }), "#/ai/skills/equity-union-analyst");
assert.deepEqual(R.parseHash("#/ai/skills/equity-union-analyst"), { page: "Skill 详情", params: { skill: "equity-union-analyst" } });
assert.equal(R.listOf("Skill 详情"), "Skill 配置");
assert.equal(R.menuOf("Skill 详情"), "Skill 配置");
```

  把「Skill 详情」加入 `legacyPages` 数组。无参旧地址 `#page=Skill%20详情` 应回退到「Skill 配置」（`unresolved`）。

- [ ] **Step 2: Run** `node --test tests/routes.test.cjs` — Expected: FAIL（还没有这条路由）。

- [ ] **Step 3: 在 `assets/portal-routes.js` 的 ROUTES 里，「Skill 配置」后面加一行：**

```js
{ page: "Skill 配置", path: "/ai/skills" },
{ page: "Skill 详情", path: "/ai/skills/:skill", list: "Skill 配置", menu: "Skill 配置" },
```

  在 `assets/portal-bridge.js`：
  - `routeParams`：`else if (page === "Skill 详情") { const id = window.portalSkillDetailId; if (id) params.skill = id; }`
  - `resolveRoute`：若 `page === "Skill 详情"`，用 `params.skill` 在 `state.skills` 或 `window.portalVueModuleApi?.state?.skills` 里找 `item.id`；找不到则 `fallback("Skill 配置", "链接中的 Skill 不存在或已删除，已回到 Skill 配置")`；找到则 `window.portalSkillDetailId = params.skill`
  - 桥 API 增加 `getSkillDetailId: () => window.portalSkillDetailId || ""`、`setSkillDetailId: value => { window.portalSkillDetailId = value || ""; }`
  - `setSimplePage` 与 `showNoPermissionPage` 两处显隐：增加 `#skillDetailView`，条件为 `page !== "Skill 详情"` 时 hidden（对标 `#tableDetailView`）

  在 `index.html` 增加 `<div class="manager-view hidden" id="skillDetailView"></div>`，并按 Constraints 改 script 清单与版本号。

  新建 `assets/portal/page-skill-detail.js`，先做一个空壳（后续任务再填页签）：

```js
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const { bridge, mount, refreshTick, state } = window.PortalVue;
  const SkillDetailApp = {
    template: `
      <el-config-provider :locale="locale">
        <div>
          <el-page-header class="portal-vue-form-header" title="返回 Skill 管理" :content="headerTitle" @back="back"></el-page-header>
          <div v-if="!skill" style="padding:60px 20px"><el-empty description="请先从「Skill 配置」选择一个 Skill 进入详情" /></div>
        </div>
      </el-config-provider>
    `,
    data: () => ({ skill: null }),
    computed: {
      headerTitle() {
        if (!this.skill) return "Skill 详情";
        return this.skill.version ? `${this.skill.name} · ${this.skill.version}` : this.skill.name;
      }
    },
    methods: {
      back() { bridge.setPage("Skill 配置"); },
      loadSkill() {
        const id = bridge.getSkillDetailId?.() || "";
        this.skill = (state.skills || []).find(item => item.id === id) || null;
      }
    },
    mounted() {
      this.pageHandler = event => { if (event.detail?.page === "Skill 详情") this.loadSkill(); };
      window.addEventListener("portal:page-change", this.pageHandler);
      if (bridge.getPage() === "Skill 详情") this.loadSkill();
    },
    beforeUnmount() { window.removeEventListener("portal:page-change", this.pageHandler); }
  };
  mount("#skillDetailView", SkillDetailApp, "skill-detail");
})();
```

  `prototype-smoke.test.cjs` 增加：`index.html` 含 `id="skillDetailView"`，源码含 `mount("#skillDetailView"`，`MENU_OF_PAGE` 与侧栏把「Skill 详情」映射到「Skill 配置」。

- [ ] **Step 4: Run** `node --test tests/routes.test.cjs tests/lint.test.cjs tests/prototype-smoke.test.cjs` — Expected: PASS。若有 Playwright，补一条 `tests/e2e-routes.test.cjs`：打开某个已有 Skill 的 `#/ai/skills/<id>` 刷新后仍是「Skill 详情」，伪造 id 回到 `#/ai/skills`。

- [ ] **Step 5: Commit**

```bash
git add assets/portal-routes.js assets/portal-bridge.js assets/portal/core.js assets/portal/page-sidebar.js assets/portal/page-skill-detail.js assets/portal/manifest.json index.html tests/routes.test.cjs tests/prototype-smoke.test.cjs tests/e2e-routes.test.cjs
git commit -m "Skill详情：增加独立页面与 #/ai/skills/:skill 地址"
```

---

### Task 3: 列表进入详情，新增改为短表单

**Files:**
- Modify: `assets/portal/page-skill-management.js`
- Modify: `tests/prototype-smoke.test.cjs`（所有断言「新增版本抽屉 / 列表行新增版本 / 620px 新增抽屉含提示词」的用例改到新行为）

**Interfaces:**
- Consumes: `bridge.setSkillDetailId`、`bridge.setPage`
- Produces: `openDetail(row)`；`saveCreate` 成功后写入 Skill 并进入详情

- [ ] **Step 1: 先改失败的源码断言，明确新行为。** 把 `tests/prototype-smoke.test.cjs` 里这些断言改掉（或删除后改写）：
  - 列表操作列不再包含「新增版本」「版本管理」，改为点名称或「详情」进入详情。
  - 「新增 Skill」不再是 620px、含提示词 / 图标 / 版本号的长抽屉；改为短对话框，只必填「Skill 名称」。
  - 不再断言 `openNewVersion(scope.row)`、`el-drawer ... title="新增 Skill" size="620px"`、`v-model="createForm.prompt"`。
  - 改为断言：`openDetail(`、`bridge.setSkillDetailId`、`bridge.setPage("Skill 详情")`、短表单 `v-model="createForm.name"`、成功后 `setSkillDetailId`。
  - 「保存为新版本」「回滚到此版本」「openVersionManage」等逻辑改到详情页源码里再断言（本任务先把列表侧旧断言去掉，避免红灯；详情页断言放 Task 4–6）。

- [ ] **Step 2: Run** `node --test tests/prototype-smoke.test.cjs` — Expected: FAIL（列表源码还是旧抽屉）。

- [ ] **Step 3: 改 `page-skill-management.js`**
  - Skill 名称做成可点击：`@click="openDetail(scope.row)"`，样式用现有 `portal-vue-name`；操作列只留「详情」（只读用户也能点，因为可以查看）。
  - `openDetail(row){ bridge.setSkillDetailId(row.id); bridge.setPage("Skill 详情"); }`
  - 删除「新增版本」「版本管理」两个行按钮，以及 `editVisible` / `publishVisible` / `viewVisible` 三个抽屉和相关方法（`openNewVersion`、`saveAll`、`openVersionManage`、`openViewVersion`、`publishVersion`、`rollback`、`openGrayDraft` 等）。灰度对话框也一起挪走，本页不再需要。`toggleEnabled`、`loadGatewaySkills`、搜索、上线开关保留。
  - `openCreate` 只重置 `{ name: "" }`，用 `el-dialog`（短表单不会裁掉按钮，spec 允许小对话框）。`saveCreate`：名称必填、不可重名；`title` 默认等于名称；`icon` 默认 `"✦"`，`version` 默认 `"v1.0"`，`enabled` 默认 `true`，`prompt` 默认 `""`，`tables` 默认 `[]`；其余与现在一样写入 `state.skills` 并尝试 `PUT /config`（可附带 `tables: []`）。成功后关对话框，`openDetail(skill)`，提示「已创建，请在详情页补全配置」。
  - 底部说明文案改成：配置请进入详情页；新版本先存为未发布，在详情的「版本管理」里灰度或发版。

- [ ] **Step 4: Run** `node --test tests/prototype-smoke.test.cjs` — Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add assets/portal/page-skill-management.js tests/prototype-smoke.test.cjs
git commit -m "Skill详情：列表改为进入详情，新增只先填名称"
```

---

### Task 4: 详情页「基本信息」与「提示词」页签，保存为未发布版本

**Files:**
- Modify: `assets/portal/page-skill-detail.js`
- Modify: `tests/prototype-smoke.test.cjs`

**Interfaces:**
- Consumes: Task 1 的 `PUT /v1/skills/:id/config`（原有字段：icon/title/desc/displayDesc/sort/enabled/prompt/routes/fallbackSkillId）；现有 `saveAll` 的版本写入逻辑（从旧列表页搬过来）
- Produces: `saveVersion()` 生成 `status: "未发布"` 的新版本；`dirty` 检测；离开页签或返回列表前确认

- [ ] **Step 1: 在 smoke 测试中断言详情页源码包含：** `el-tab-pane label="基本信息"`、`label="提示词"`、`label="引用的表"`、`label="版本管理"`、`saveVersion`、`自动路由规则`、`兜底技能`、整页提示词输入（不是 `:rows="6"`）、`beforeLeave` 或返回前的确认、`canEdit('Skill 配置')`。页签可以先出现，引用的表与版本管理的完整操作在后续任务补。

- [ ] **Step 2: Run** `node --test tests/prototype-smoke.test.cjs` — Expected: FAIL。

- [ ] **Step 3: 实现页签与保存**（对齐表详情：`el-page-header` + `el-tabs` + 底部「取消 / 保存」）。要点：
  - `loadSkill` 时把当前 Skill 拷到 `draft`：`{ icon, title, desc, displayDesc, sort, enabled, prompt, routes, fallbackSkillId, versionNote: "", version: nextVersion() }`。路由规则的编辑格式与旧抽屉相同：`keywords` 用顿号拼接，保存时再拆回数组。
  - 「基本信息」：名称（可改）、图标上传（复用原来的 `applyIcon`，上限 300KB，png/jpg/gif/svg/webp）、描述、展示标题、展示文案、排序、上线状态。无编辑权限时只读。
  - 「提示词」：`skill.kind === 'router'` 时展示关键词规则 + 兜底技能（选项为 `kind !== 'router'` 且不是 `numa-warehouse` 的 Skill）；否则展示吃满工作区的 textarea（CSS 用 `min-height: calc(100vh - 280px)` 或同等方案，不要 `:rows="6"`）。
  - 底部按钮只在「基本信息」和「提示词」显示：取消恢复 draft，保存走 `saveVersion`。校验：展示标题必填。版本号默认 `nextVersion()`（`v1.3` → `v1.4`），说明可空，空则用「更新配置」。写入 `versions` 的方式与旧 `saveAll` 完全相同（新版本 `current: true`、`status: "未发布"`、带 `snapshot`），并 `PUT` 同样的字段（含 `latestVersion`，网关现在会忽略它，保持原行为）。
  - `dirty`：`draft` 与当前 Skill 的基本信息 / 提示词 / 路由相比有差异。`back()` 或切换到「引用的表」「版本管理」前，若 dirty，用 `ElMessageBox.confirm` 询问「有未保存的修改，确定离开？」。
  - 只读用户看不到保存按钮，也不能改表单。

- [ ] **Step 4: Run** `node --test tests/prototype-smoke.test.cjs` — Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add assets/portal/page-skill-detail.js tests/prototype-smoke.test.cjs
git commit -m "Skill详情：基本信息与提示词页签，保存为未发布版本"
```

---

### Task 5: 「引用的表」页签

**Files:**
- Modify: `assets/portal/page-skill-detail.js`
- Modify: `tests/prototype-smoke.test.cjs`

**Interfaces:**
- Consumes: `PUT /v1/skills/:id/config` 的 `tables`；`state.assets[].cnName` 与（若已加载）`gatewayFields.tables` 作为可选表名；`resolve` 后的 `skill.tables`
- Produces: `saveTables()`：不新建版本；网关失败时保留本地原型数据并提示「没有写到服务端」

- [ ] **Step 1: smoke 断言详情页包含可增删的表清单**（`el-select` 多选或「添加表」按钮）、`saveTables`、失效表标记（不在已知表里的项标「失效」）、空清单说明「不预置默认表」。

- [ ] **Step 2: Run** `node --test tests/prototype-smoke.test.cjs` — Expected: FAIL。

- [ ] **Step 3: 实现「引用的表」**
  - `knownTables`：与核心里补全网关表的逻辑一致，用 `(state.assets || []).map(item => item.cnName)`，若 `window.PortalVue` 已暴露网关字段则并入。
  - 进入详情时 `tableDraft = [...(skill.tables || [])]`。
  - 用 `el-select` `multiple` `filterable` 从 `knownTables` 添加；已选但不在 `knownTables` 的项仍显示，并加 `el-tag`「失效」。
  - 保存：若仍有失效表，先 `ElMessage.warning` 提示「请先移除已失效的表」，不提交。通过后把 `skill.tables = [...tableDraft]`，`PUT { tables: skill.tables }`。成功提示「引用的表已更新，分析默认范围即时生效」；`fetch` 抛错或网关非 2xx 时本地仍更新，并提示没有写到服务端。
  - 此页签的保存不调用 `saveVersion`。无编辑权限时只读。
  - `loadGatewaySkills` 之后应能看到服务端返回的 `tables`（列表页已有加载函数；详情页进入时若 `skill.tables` 为空且刚拉过网关，以网关字段为准）。在 `loadSkill` 里读 `skill.tables || []` 即可，前提是列表进入前已经 `loadGatewaySkills`。详情页 `mounted` 时可再拉一次 `GET /v1/skills`，用返回项覆盖当前 Skill 的 `tables` 及其他展示字段，避免本地种子没有表清单。

- [ ] **Step 4: Run** `node --test tests/prototype-smoke.test.cjs` — Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add assets/portal/page-skill-detail.js tests/prototype-smoke.test.cjs
git commit -m "Skill详情：引用的表可编辑并写回注册表覆盖值"
```

---

### Task 6: 「版本管理」页签，去掉全部配置抽屉

**Files:**
- Modify: `assets/portal/page-skill-detail.js`
- Modify: `tests/prototype-smoke.test.cjs`

**Interfaces:**
- Consumes: 从旧 `page-skill-management.js` 搬走的 `versionStatusName` / `versionStatusType` / `openGrayDraft` / `saveGrayDraft` / `publishVersion` / `rollback` / `openViewVersion`（行为保持不变）
- Produces: 版本列表与操作都在本页签内；查看快照用本页只读面板或 `el-dialog`，不再开配置抽屉。灰度仍用小对话框。

- [ ] **Step 1: smoke 断言**
  - 详情页含「灰度」「调整灰度」「发版」「回滚到此版本」「查看」、发版前 `ElMessageBox.confirm`。
  - `page-skill-management.js` 不再含 `el-drawer`、不再含「新增版本 ·」「版本管理」抽屉。
  - 查看快照展示基本信息、提示词或路由规则、版本说明；不把引用的表放进快照（表清单不进版本）。

- [ ] **Step 2: Run** `node --test tests/prototype-smoke.test.cjs` — Expected: FAIL。

- [ ] **Step 3: 把旧版本管理抽屉的模板与方法搬到详情页「版本管理」页签**（列表样式可继续用 `portal-vue-skill-version`）。操作对象改为 `this.skill`，不再用 `publishSkill`。查看快照：本页签下方展开或 `el-dialog` 只读展示，含图标、标题、描述、排序、上线、说明、灰度用户、提示词（路由型展示规则与兜底）。回滚逻辑与旧 `rollback` 相同（有 snapshot 就 `Object.assign` 并 `PUT` 配置，然后切换 `current`）。

- [ ] **Step 4: Run** `node --test tests/prototype-smoke.test.cjs` — Expected: PASS。确认列表页源码里已没有配置用 `el-drawer`。

- [ ] **Step 5: Commit**

```bash
git add assets/portal/page-skill-detail.js assets/portal/page-skill-management.js tests/prototype-smoke.test.cjs
git commit -m "Skill详情：版本管理搬到详情页，去掉配置抽屉"
```

---

### Task 7: 端到端与回归

**Files:**
- Modify: `tests/e2e-ui.test.cjs`（新增 Skill 详情用例；不要改无关的业务线用例，那些属于未提交的本地改动）
- 如 Task 2 未完成路由 e2e，这里补上

- [ ] **Step 1: 在 `tests/e2e-ui.test.cjs` 增加用例**（登录管理员，模式与现有「表详情」用例相同，用 `withPage`）：
  - 打开「Skill 配置」，点某个 Skill 的名称或「详情」，页面变为「Skill 详情」，侧栏高亮仍是「Skill 配置」，地址为 `#/ai/skills/<id>`；点「返回 Skill 管理」回到列表。
  - 在「基本信息」改展示文案并保存，到「版本管理」能看到一个「未发布」新版本。
  - 在「引用的表」加入一张已知表并保存，再进入详情仍能看到；加入不存在的表名应无法保存（或根本选不中）。
  - 用无「Skill 配置」编辑权的账号进入详情（若现有测试已有这类账号），看不到保存 / 灰度 / 发版。
  - 刷新 `#/ai/skills/<id>` 后仍是同一个 Skill。

- [ ] **Step 2: Run** `node --test tests/e2e-ui.test.cjs tests/e2e-routes.test.cjs tests/prototype-smoke.test.cjs tests/lint.test.cjs tests/skill-tables.test.cjs tests/skill-config.test.cjs tests/gateway-auth.test.cjs tests/equity-pack.test.cjs` — Expected: PASS。若本机没有 Playwright / Chrome，e2e 按仓库现有约定跳过，但单测与 smoke、lint 必须过。

- [ ] **Step 3: 再跑** `npm test`（或仓库文档指定的全量命令）。Expected: PASS。失败只修本功能引入的问题，不要顺手改掉未提交的业务线样式测试。

- [ ] **Step 4: Commit**

```bash
git add tests/e2e-ui.test.cjs tests/e2e-routes.test.cjs
git commit -m "Skill详情：补上详情页端到端与刷新地址用例"
```

---

## Self-Review

- 目标与四个页签、保存规则、权限、去掉抽屉、新增短表单：Task 3–6。
- `spec.tables` 可编辑、即时生效、校验、GET 回显、分析默认范围、审计、不改规范包源文件：Task 1 + Task 5。
- 未发布 → 灰度 / 发版 / 回滚 / 查看：Task 6。
- 侧栏高亮、返回列表、刷新仍打开同一 Skill：Task 2 + Task 7。
- 无编辑权限只读：Task 4–6 的按钮显隐 + Task 7。
- 网关未连接时保留原型状态并提示：Task 5（表清单）与现有名称 / 提示词保存的 catch。
- 占位符扫描：无 TBD / TODO /「类似 Task N」。
- 名称一致：`sanitizeSkillTables` / `resolveSkillTables` / `setSkillDetailId` / `portalSkillDetailId` / 页面名「Skill 详情」/ 地址参数 `skill`。
