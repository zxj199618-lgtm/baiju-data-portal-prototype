# 字段权限 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在表权限之下增加字段权限：被取消勾选的字段对该组用户完全隐藏，服务端强制。

**Architecture:** 权限组新增 `hiddenFields`（只存被取消的字段）。网关每次请求按用户算出「隐藏字段表」，用一个纯函数模块裁剪表定义与行数据，再传给取数工具集、语义层、证据聚合、推荐问题；下游不再自行判断。界面在权限组页与用户页的「表权限」里加字段面板。

**Tech Stack:** Node.js（CommonJS，`node:test`），Vue 3 + Element Plus 内联模板（`assets/portal/*.js`）。

**Spec:** `docs/superpowers/specs/2026-11-04-field-permission-design.md`

## Global Constraints

- 完全隐藏，不做脱敏、多级标签、历史记录追溯清除。
- `hiddenFields` 只存被取消勾选的字段，表新增字段默认可见。
- 门户管理员组 / 「全部数据表」不可限制字段。
- 被隐藏字段的名称、类型、注释、枚举值、取值不得出现在任何工具输出或给模型的提示词里；以其做指标、分组、筛选统一返回与「字段不存在」相同的提示。
- 个人追加：组授予的不可取消；个人可把组里被取消的字段追加回来（`grantedFields`）。
- 沿用现有测试风格：`node --test tests/*.test.cjs`；每个任务结束时全量测试通过。

## Spec 修订（写计划时发现，已同步到规格）

1. 个人覆盖保存在网关的 `user-permissions.json`（不在 org-store），所以 org-store 只提供「组级」`hiddenFieldsOf(账号)`，与个人 `grantedFields` 的合并在网关里做。
2. 保存校验放宽：表必须在该组 `tables` 内；字段名只校验为 ≤60 字符的非空字符串，不要求在网关表定义里存在（界面字段列表来自门户资产，可能与网关定义漂移；隐藏一个不存在的字段无害）。

## Review Focus

- 用户直接在提问里写被隐藏字段名 → 回答里不出现该字段的任何信息（Task 4 端到端）。
- 比率指标的分子或分母字段被隐藏 → 该指标整体不可用，`list_metrics` 不列出（Task 3）。
- 指标的固定筛选字段被隐藏 → 筛选仍然生效，但报错文案里不出现该字段与取值（Task 3）。
- 门户前端随请求传来的 `portalContext.fields` 带着被隐藏字段 → 证据里仍不出现（Task 4）。
- 权限组取消某表授权 / 把表授权给组后字段设置的清理与初始化（Task 1）。

---

## File Structure

- Create: `scripts/field-scope.cjs` — 纯函数：按隐藏字段裁剪表定义与行数据。
- Modify: `scripts/org-store.cjs` — 组的 `hiddenFields` / `confirmedFields` 校验、保存、`hiddenFieldsOf`。
- Modify: `scripts/semantic-layer.cjs` — `scoped(hidden)` 视图。
- Modify: `scripts/analysis-gateway.cjs` — 隐藏字段表合并、请求级裁剪、证据与接口接入、个人覆盖读写。
- Modify: `assets/portal/page-permission-groups.js`、`assets/portal/page-permission-config.js`、`assets/portal/core.js` — 界面。
- Test: `tests/org.test.cjs`、`tests/field-scope.test.cjs`（新）、`tests/semantic-layer.test.cjs`、`tests/analysis-tools.test.cjs`、`tests/prototype-smoke.test.cjs`。

---

### Task 1: 权限组保存 `hiddenFields`

**Files:**
- Modify: `scripts/org-store.cjs`
- Test: `tests/org.test.cjs`

**Interfaces:**
- Produces: 权限组对象多两个可选字段 `hiddenFields: { [表名]: string[] }`、`confirmedFields: { [表名]: string[] }`；`orgStore.hiddenFieldsOf(账号名: string): { [表名]: string[] }`（只含该账号所属组、且该组已授权的表；无则 `{}`）。

- [ ] **Step 1: 写失败测试**（`tests/org.test.cjs` 的「组织存储（单元）」里）。测试名与断言：
  - `保存 hiddenFields 后 hiddenFieldsOf 返回该组被隐藏的字段`：组「优化师」tables=[A,B]，`hiddenFields:{A:["phone"]}`；`hiddenFieldsOf("谭嘉颖")` 深度等于 `{A:["phone"]}`；未授权的组/账号返回 `{}`。
  - `hiddenFields 里的表不在该组 tables 内会被拒绝`：错误信息含「未授权」。
  - `门户管理员组不允许设置 hiddenFields`：保存被拒，错误信息含「门户管理员」。
  - `取消表授权时清除该表的 hiddenFields 与 confirmedFields`：保存组时 tables 去掉 A，再读 `effective().groups` 该组不含 A 的键。
  - `字段名必须是 60 字符以内的非空字符串`：超长或空串被拒。
- [ ] **Step 2: 运行确认失败**：`node --test tests/org.test.cjs` → 新增用例 FAIL。
- [ ] **Step 3: 实现**：在 `save()` 的逐组循环里，对 `raw.hiddenFields` 与 `raw.confirmedFields` 用同一个 `fieldMap(raw, tables, name)` 校验（键必须 ∈ 该组 `tables`，值经 `list(value, 200, 60)`，空数组的键丢弃）；`ADMIN_GROUP` 或 `tables` 含 `ALL_TABLES` 时 `hiddenFields` 非空即拒绝。把两个字段写进 `groups.push({...})`。新增并导出 `hiddenFieldsOf(name)`，基于 `effective()` 与账号所属组。
- [ ] **Step 4: 运行确认通过**：`node --test tests/org.test.cjs` → PASS。
- [ ] **Step 5: 提交**：`git add scripts/org-store.cjs tests/org.test.cjs && git commit -m "字段权限：权限组保存 hiddenFields / confirmedFields，提供 hiddenFieldsOf"`

---

### Task 2: 表与行的裁剪（纯函数）

**Files:**
- Create: `scripts/field-scope.cjs`
- Test: `tests/field-scope.test.cjs`

**Interfaces:**
- Consumes: 表定义形状 `{ cnName, fields:[{name,type,comment,enum?}], agg:{dateKey,groupBy,metric}, lineage }`；`rowsOf(cnName): object[]`。
- Produces（`module.exports`）：
  - `scopeTables(tables: object[], hidden: {[表名]: string[]|Set<string>}): object[]` — 返回新数组，不改原对象；每张表去掉 `fields` 里被隐藏的字段，`agg.groupBy` 去掉被隐藏项，`agg.metric` 与 `agg.dateKey` 被隐藏时置为 `""`。
  - `scopeRowsOf(rowsOf, hidden): (cnName: string) => object[]` — 每行去掉被隐藏列（`hidden` 为空时直接返回原 `rowsOf`）。
  - `isHidden(hidden, table: string, field: string): boolean`。

- [ ] **Step 1: 写失败测试**：`scopeTables` 不改原对象、去掉隐藏字段及其出现在 `agg.groupBy` 的项、`agg.metric` 被隐藏变 `""`；`scopeRowsOf` 返回的行不含被隐藏的键、未隐藏的表原样返回；`hidden` 为空对象时 `scopeRowsOf(rowsOf, {}) === rowsOf`。
- [ ] **Step 2: 运行确认失败**：`node --test tests/field-scope.test.cjs`。
- [ ] **Step 3: 实现** 上述三个函数；`hidden` 的值同时接受数组与 `Set`。
- [ ] **Step 4: 运行确认通过**。
- [ ] **Step 5: 提交**：`git add scripts/field-scope.cjs tests/field-scope.test.cjs && git commit -m "字段权限：表与行的裁剪函数"`

---

### Task 3: 语义层的裁剪视图

**Files:**
- Modify: `scripts/semantic-layer.cjs`（`prepare`、`listMetrics`、`query`、`attribute`、`metricInfo`、`dimensionsOf`、返回值）
- Test: `tests/semantic-layer.test.cjs`

**Interfaces:**
- Consumes: Task 2 的 `isHidden`。
- Produces: `semantic.scoped(hidden: {[表名]: string[]}): { listMetrics(allowedTables, keyword), query(args), attribute(args), metricInfo(key), dimensionsOf(key, table) }` — 与原对象同名同参，行为是「叠加隐藏字段后的结果」。原函数保持不变（等价于 `scoped({})`）。

规则：某表上某指标不可用 ⇔ 指标（含比率的分子、分母及其依赖的求和指标）在该表上的取值字段或该表日期字段被隐藏。被隐藏的维度从该表可用分组中移除（用它分组 / 筛选走原有「不支持按 X 分组 / 筛选」报错，与乱写字段名一致）。固定筛选字段被隐藏时筛选仍生效，但冲突报错改为「指标「X」在该表上不可用」，不出现字段名与取值，`查询` 输出里的筛选说明也不含该字段。

- [ ] **Step 1: 写失败测试**（沿用该文件已有的 fixture 目录与调用方式）：
  - 求和指标取值字段被隐藏 → `scoped(h).listMetrics([表])` 不含该指标；`scoped(h).query` 返回 `ok:false`。
  - 比率指标分子字段被隐藏 → 该比率指标不可用，另一张未隐藏的表上仍可用。
  - 维度被隐藏 → `query({group:该维度})` 与 `query({group:"不存在的字段"})` 返回相同的 `error` 文案形态（都是「不支持按 … 分组」），且 `dimensionsOf` 不含它。
  - 固定筛选字段被隐藏 → 正常查询仍应用筛选（结果与未隐藏时一致），`JSON.stringify(结果)` 不含该字段名。
  - 泄露扫描：对所有 `scoped(h)` 的输出 `JSON.stringify` 后，不含任何被隐藏字段名。
- [ ] **Step 2: 运行确认失败**：`node --test tests/semantic-layer.test.cjs`。
- [ ] **Step 3: 实现** `scoped(hidden)`：内部用 `blocked(metric, tableName, hidden)` 与 `visibleDimensions(tableName, hidden)` 两个辅助函数；`prepare` 增加可选参数 `hidden`，`listMetrics` / `query` / `attribute` / `metricInfo` / `dimensionsOf` 都带上它；`scoped` 返回把 `hidden` 绑定好的同名函数。
- [ ] **Step 4: 运行确认通过**，并跑 `node --test tests/attribution-tool.test.cjs tests/analysis-tools.test.cjs` 确认无回归。
- [ ] **Step 5: 提交**：`git commit -am "字段权限：语义层裁剪视图"`

---

### Task 4: 网关接入（取数工具、证据、推荐问题、个人覆盖）

**Files:**
- Modify: `scripts/analysis-gateway.cjs`（`userTables` 附近、`/v1/permissions*`、`buildEvidence` / `aggregateEvidence` / `recentRows`、`/v1/semantic/*`、`/v1/analyze` 里创建工具集与推荐问题处）
- Modify: `scripts/org-store.cjs` 的构造参数无需改动
- Test: `tests/analysis-tools.test.cjs`、`tests/org.test.cjs`

**Interfaces:**
- Consumes: Task 1 `orgStore.hiddenFieldsOf`，Task 2 `scopeTables / scopeRowsOf`，Task 3 `semanticLayer.scoped`。
- Produces（网关内部）：
  - `hiddenFieldsFor(userName: string): {[表名]: string[]}` — 规则：该表由所属组授予 → 组 `hiddenFields[表]` 减去个人 `grantedFields[表]`；该表只由个人覆盖授予 → 覆盖里的 `hiddenFields[表]`（默认无）。管理员账号返回 `{}`。
  - `scopeFor(userName): { tables, rowsOf, semantic, hidden }` — 裁剪后的表定义、`rowsOf`、语义层视图。
- 个人覆盖（`PUT /v1/permissions/:user`）请求体新增可选 `hiddenFields`（个人追加的表上被取消的字段）与 `grantedFields`（组里被取消、个人追加回来的字段），形状同 Task 1 的字段映射；`GET /v1/permissions` 的每个 user 带回这两项以及所属组的 `hiddenFields`。

- [ ] **Step 1: 写失败测试**
  - 单元（`analysis-tools.test.cjs`，用 `scopeTables/scopeRowsOf` 构造被裁剪的 `tables/rowsOf` 传给 `createAnalysisToolkit`）：`search_tables` 用被隐藏字段的注释关键词搜不到该表；`get_schema` 的字段与口径里无该字段；`get_sample_rows` 的行无该列；`run_metric` 以该字段做指标 / 分组的 `error` 与乱写字段名的 `error` 同一文案模板。
  - 端到端（沿用该文件已有的假中转站 + 网关启动方式）：管理员把「优化师」组对某表隐藏字段 X 后，优化师提问并让假模型调用 `get_schema`，响应与审计的整段文本不含 X；恢复 `hiddenFields` 后立即可见。
  - 端到端：请求体 `portalContext` 的 `fields` 里带 X，证据里仍不含 X。
  - 端到端：个人 `grantedFields` 把 X 追加回来后该用户能看到 X。
  - `PUT /v1/permissions/:user` 的 `hiddenFields` / `grantedFields` 形状非法（非数组、字段名超长）返回 400。
- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现**
  - 新增 `hiddenFieldsFor` 与 `scopeFor`；`/v1/analyze` 里创建 `createAnalysisToolkit` 时传 `scopeFor(user).tables / rowsOf / semantic`；`followups.suggestFollowUps` 的 `semantic` 也传裁剪视图。
  - `buildEvidence(cnNames, portalContext, scope)`：增加第三个参数；用裁剪后的 `tables` 与 `rowsOf`（`aggregateEvidence` / `recentRows` 改为接收 `rowsOf` 参数）；`portalContext` 里该表的 `fields` 按 `isHidden` 过滤。
  - `/v1/semantic/metrics` 与 `/v1/semantic/query` 用 `scopeFor(req.session.name).semantic`。
  - 个人覆盖读写支持 `hiddenFields` / `grantedFields`，复用 Task 1 的字段映射校验思路（形状校验：对象、键为表名、值为 ≤200 个 ≤60 字符的字符串数组）。
  - `/v1/auth/me` 增加 `hiddenFields: hiddenFieldsFor(name)`，供界面使用。
- [ ] **Step 4: 运行确认通过**：`npm test`。
- [ ] **Step 5: 提交**：`git commit -am "字段权限：网关按用户裁剪表、行、指标与证据，个人覆盖支持字段追加"`

---

### Task 5: 权限组页的字段面板与新增字段提醒

**Files:**
- Modify: `assets/portal/page-permission-groups.js`（表权限标签页，约 64–71 行的模板与 `selectedTables`、`toggleTable`、`saveGroup`）
- Modify: `assets/portal/core.js`（`orgSync.snapshot` 约 70 行、`load` 应用服务端配置处：增加 `hiddenFields`、`confirmedFields`）
- Test: `tests/prototype-smoke.test.cjs`

**Interfaces:**
- Consumes: Task 1 的组字段形状；`state.assets[i].fields[].name` 是界面字段来源。
- Produces: 界面状态 `group.hiddenFields`、`group.confirmedFields`（形状同服务端）。

- [ ] **Step 1: 写失败测试**：在 `prototype-smoke.test.cjs` 的现有方式下加用例：打开权限组页「表权限」，每张已勾选的表出现「全部字段」标签；点击后出现该表的字段勾选面板；取消一个字段后标签变为 `字段 n-1/n`；保存后 `state.groups[i].hiddenFields` 含该字段（若该文件为静态源码检查风格，则断言源码含 `hiddenFields` 的保存与 `字段 ` 标签渲染）。
- [ ] **Step 2: 运行确认失败**：`node --test tests/prototype-smoke.test.cjs`。
- [ ] **Step 3: 实现**
  - 每张表行右侧加标签：全选显示「全部字段」，否则 `字段 勾选数/总数`；点击切换展开该表字段面板（字段名、类型、注释，顶部「全选」）。
  - 勾选一张表 → 自动全选字段（`hiddenFields[表]` 不存在）、`confirmedFields[表]` 设为当前全部字段名；取消勾选一张表 → 删除两项。
  - 新增字段提醒：`asset.fields` 中有名称不在 `confirmedFields[表]` 内时，表行显示小红点与「新增 N 个字段，请确认」；打开面板并保存后把 `confirmedFields[表]` 更新为全部字段名。
  - `全部数据表` 开关与「门户管理员」组不渲染字段标签。
  - `saveGroup` 把 `hiddenFields`、`confirmedFields` 写回 `activeGroup`；`core.js` 的快照与服务端配置加载带上这两项。
- [ ] **Step 4: 运行确认通过**：`npm test`、`npm run lint`。
- [ ] **Step 5: 提交**：`git commit -am "字段权限：权限组页字段面板与新增字段提醒"`

---

### Task 6: 用户页的字段展示与个人追加

**Files:**
- Modify: `assets/portal/page-permission-config.js`（表权限标签页约 65 行，`load` / `save`）
- Test: `tests/prototype-smoke.test.cjs`

**Interfaces:**
- Consumes: Task 4 的 `PUT /v1/permissions/:user` 新增的 `hiddenFields` / `grantedFields`；所属组的 `hiddenFields`。

- [ ] **Step 1: 写失败测试**：同上风格——用户页的表行出现字段标签；组授予表上组已取消的字段显示灰色锁定标签（权限组名）；个人可勾选追加；保存请求体含 `grantedFields`；个人追加的表上取消的字段进入请求体 `hiddenFields`。
- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现**：字段面板复用 Task 5 的呈现；组授予的表 → 字段默认勾选取消状态由组决定，被组取消的字段可勾（勾上即 `grantedFields`），组已勾选的字段锁定；个人追加的表 → 与组页行为一致（默认全选，可取消，进 `hiddenFields`）。`save` 在现有 `fetch` 请求体里增加 `hiddenFields`、`grantedFields`；`user.fieldGrants` / `user.fieldHidden` 保存在页面状态，供回显。
- [ ] **Step 4: 运行确认通过**：`npm test`、`npm run lint`。
- [ ] **Step 5: 提交**：`git commit -am "字段权限：用户页字段展示与个人追加"`

---

### Task 7: 回归与说明

**Files:**
- Modify: `README.md`（权限一节：字段权限、边界说明）
- Modify: 管理页说明文案（权限组「表权限」页脚）：加一句「已产生的历史记录与报告不会追溯清除」
- Test: 全量

- [ ] **Step 1: 全量回归**：`npm test` 全部通过；`node scripts/run-evals.cjs --help` 先确认评测不依赖线上模型的部分可跑，涉及线上模型的评测只在用户要求时运行。
- [ ] **Step 2: 补 README 与页脚文案**，说明规则、边界（历史记录不追溯）。
- [ ] **Step 3: 提交**：`git commit -am "字段权限：README 与管理页说明"`

---

## Self-Review

- **Spec 覆盖**：规则与数据结构 → Task 1；裁剪与各入口表现 → Task 2/3/4；个人追加 → Task 4/6；界面（标签、面板、锁定、新增字段提醒、管理员组不显示）→ Task 5/6；测试 → 各任务；已知边界说明 → Task 7。
- **类型一致**：`hiddenFields` / `confirmedFields` / `grantedFields` 形状在 Task 1/4/5/6 一致（`{表名: string[]}`）；`scopeFor` 返回 `{tables, rowsOf, semantic, hidden}`，Task 4 内使用一致。
- **偏差**：校验放宽与 org-store 只做组级，见顶部「Spec 修订」。
