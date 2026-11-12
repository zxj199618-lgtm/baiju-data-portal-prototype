# 业务线分组与业务线知识库 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 表管理增加「业务线」分组与业务线知识库；灵犀智析对话改为选业务线，业务线知识库进系统上下文，模型按需取表知识库并通过受限的 `query_join` 跨表取数。

**Architecture:** 服务端新增 `knowledge-store.cjs`（`DATA_DIR/knowledge.json`，写法参照 `org-store.cjs`）保存业务线、表所属业务线、表知识库、表关联；新增纯函数的 `join-engine.cjs`（关联图 + 分别汇总再拼接）与 `knowledge-tools.cjs`（业务线上下文包 + `get_table_knowledge` / `query_join` 两个额外工具，经现有 `createAnalysisToolkit({ extraTools })` 接入）。前端把表知识库的 Markdown 工具抽成共用文件，表管理页增加「业务线」视图，工作台把"选择数据表"换成"选择业务线"。

**Tech Stack:** Node.js（CommonJS，`node --test`）、无构建的 Vue 3 + Element Plus 全局构建、Playwright（本机 Chrome，可选）。

**Spec:** `docs/superpowers/specs/2026-11-12-business-line-knowledge-design.md`

## Global Constraints

- 业务线知识库 ≤ 20000 字；表知识库 ≤ 10000 字；每个业务线关联 ≤ 200 条；业务线数量 ≤ 50（含「公共」）。
- 内置业务线名称固定为「公共」：不可删除、不可改名、不能作为对话入口；其知识库与关联并入每个业务线的上下文。
- 一张表在 `tableLines` 里最多一个值；没有记录的表视为「未分组」，只能通过 `@表` 使用。
- 关系类型只取 `1:1` / `1:N` / `N:1`；字段必须存在于网关真实表定义，表必须存在；关联 `id` 全局唯一。
- `get_table_knowledge` 不限制表数，按总字数预算（默认 30000 字符，环境变量 `PORTAL_KNOWLEDGE_BUDGET_CHARS`）截断。
- `query_join` 不限制表数与跳数；限制按资源：中间结果行数（默认 200000，`PORTAL_JOIN_MAX_ROWS`）、耗时（默认 3000 毫秒，`PORTAL_JOIN_MAX_MS`）、返回大小（单次 12000 字符）。
- 业务线模式工具循环默认 8 轮 / 20 次（`PORTAL_KNOWLEDGE_TOOL_STEPS` / `PORTAL_KNOWLEDGE_TOOL_CALLS`）；原有 4 轮 / 8 次不变。
- 知识库正文里提到被隐藏字段的行，整行替换为「（已隐藏）」（`field-scope.cjs` 的 `redactLines`），给模型与返回给页面时都要做。
- 写入审计类型 `knowledge-change`，记业务线 / 表名与操作人，不记正文。
- 没选业务线、飞书机器人入口、`@表` 的现有流程不改变。
- 新增的网关脚本必须在 `Dockerfile` 加 `COPY scripts/<文件> ./<文件>`（`tests/dockerfile.test.cjs` 会检查）。
- 前端新增 / 修改 `assets/portal/*.js` 后，`manifest.json` 与 `index.html` 的 script 清单必须完全一致，`?v=` 版本号统一改为 `20261112a`。
- 提交信息用中文，格式如 `业务线：…`；每条提交末尾加 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`。

## 规划阶段的两处决定（与 spec 的差异，需要你知道）

- **业务线视图放在表管理页内切换**（`dataAssetView` 内的「数据表｜业务线」开关），不新增菜单项和独立路由：避免动菜单、权限组菜单清单与 `portal-routes.js`。spec 里"默认加 `#/asset/business-lines`"据此不做，业务线视图的选中状态不进地址。
- **服务端编辑权限**：网关现有写接口都是 `requiresAdmin`。业务线 / 表知识库的写接口不走 `requiresAdmin`，改为"门户管理员，或所在权限组 `menuEdits` 含「表管理」"，用 `orgStore.effective()` 判断（见 Task 4）。

## Review Focus

- 关联里有环、或同一对表登记了多条不同字段对：路径选择必须确定（最短优先，同长按关联 `id` 排序），同样输入两次结果相同。（Task 2）
- 一对多反向取数：指标来自"1"的一侧、却要按"N"的一侧分组或筛选，必须拒绝并点名是哪条关联、哪个指标，不返回数字。（Task 2）
- 关联键为空或在对端找不到匹配：分组显示「（未关联）」，筛选时丢弃该行，不报错、不丢整张表。（Task 2）
- 表为空、窗口内没有数据、除数为 0：返回"没有数据"或 `null` 的比率，不出现 `NaN` / `Infinity`。（Task 2）
- 请求里的 `businessLine` 是「公共」、不存在、或该用户在其下没有任何有权限的表：返回明确错误而不是退回全表。（Task 5）

---

### Task 1: 知识库存储 `knowledge-store.cjs`

**Files:**
- Create: `scripts/knowledge-store.cjs`
- Test: `tests/knowledge-store.test.cjs`

**Interfaces:**
- Produces: `createKnowledgeStore({ dataDir, tableNames, fieldsOf, defaults }) → store`
  - `tableNames: () => string[]`（真实表中文名）；`fieldsOf: (table: string) => string[]`（真实字段名，表不存在返回 `[]`）
  - `defaults: { businessLines: string[], tableLines: Record<string,string>, tableKnowledge: Record<string,{markdown,updatedBy,updatedAt}> }`（首次启动种子，不含「公共」，由 store 自动补）
  - `store.PUBLIC = "公共"`
  - `store.effective() → { rev: number, businessLines: BusinessLine[], tableLines: Record<string,string>, tableKnowledge: Record<string,Knowledge> }`，`BusinessLine = { id, name, order, knowledge: Knowledge|null, relations: Relation[] }`，`Relation = { id, left:{table,field}, right:{table,field}, type:"1:1"|"1:N"|"N:1", note }`，`Knowledge = { markdown, updatedBy, updatedAt }`
  - `store.saveBusinessLines({ rev, businessLines, tableLines }, actor: string) → { ok: true, rev } | { ok: false, error: string, conflict?: true }`
  - `store.saveTableKnowledge(table: string, markdown: string, actor: string) → { ok: true, entry: Knowledge } | { ok: false, error: string }`
  - `store.lineOf(table: string) → string`（未分组返回 `""`）
  - `store.tablesOfLine(name: string) → string[]`

- [ ] **Step 1: Write the failing tests**（`tests/knowledge-store.test.cjs`，用 `fs.mkdtempSync` 临时目录，表 `["表甲","表乙","表丙"]`，`fieldsOf` 对表甲返回 `["user_id","cost"]`）
  - `没保存过时用种子：自动补「公共」，种子表知识库可读`：`effective().businessLines[0].name === "公共"`，种子里的 `tableKnowledge["表甲"].markdown` 原样可读。
  - `保存后立即生效并落盘到 knowledge.json，rev 加 1`。
  - `校验：重名、空名、超过 50 个、知识库超 20000 字、表知识库超 10000 字、关联超 200 条都被拒绝`（每条断言 `ok === false` 且 `error` 含对应关键词）。
  - `校验：关联的表或字段不存在、关系类型不在枚举内、关联 id 重复都被拒绝`。
  - `「公共」不可删除、不可改名`。
  - `改名同步：同一个 id 改名后，原来属于旧名的表自动归到新名`。
  - `删除保护：删除仍有表的业务线被拒绝，错误里列出表名`。
  - `rev 不一致返回 conflict: true`。
  - `tableLines 的值不是已有业务线时被拒绝；表名不存在时被拒绝`。
  - `knowledge.json 损坏时按种子启动，不抛错`。

- [ ] **Step 2: Run** `node --test tests/knowledge-store.test.cjs` — Expected: FAIL（模块不存在）。

- [ ] **Step 3: Implement `createKnowledgeStore`** in `scripts/knowledge-store.cjs`。结构、`load` 容错、`text()` 限长小工具参照 `scripts/org-store.cjs`；`saveBusinessLines` 是整份快照替换，先在内存里算出新状态并完整校验，通过后一次写文件。改名同步规则：对比已存 `id → name`，同 id 名称变化时，把已存 `tableLines` 里指向旧名且 payload 的 `tableLines` 没有显式给出的表改成新名；已存指向的业务线 id 在 payload 里消失、且 payload 没把这些表分到别的业务线时，返回"请先迁出：…"。

- [ ] **Step 4: Run** `node --test tests/knowledge-store.test.cjs` — Expected: PASS。

- [ ] **Step 5: Commit**
```bash
git add scripts/knowledge-store.cjs tests/knowledge-store.test.cjs
git commit -m "业务线：知识库存储（业务线、表归属、表知识库、表关联）"
```

---

### Task 2: 关联引擎 `join-engine.cjs`

**Files:**
- Create: `scripts/join-engine.cjs`
- Test: `tests/join-engine.test.cjs`

**Interfaces:**
- Consumes: Task 1 的 `Relation` 形状；`tables`（已按字段权限裁剪的表定义 `{ cnName, fields:[{name,type}], agg:{dateKey} }`）与 `rowsOf(name) → object[]`（同样已裁剪，即 `scopeFor(user)` 的结果）。
- Produces:
  - `usableRelations(relations: Relation[], tables) → { usable: Relation[], dropped: { id: string, reason: string }[] }`：任一端的表或字段不在裁剪后的 `tables` 里，整条丢弃。
  - `createJoinEngine({ tables, rowsOf, relations, limits? }) → { query(request) }`，`limits = { maxRows=200000, maxMs=3000, maxGroups=20 }`。
  - `request = { metrics: [{ name?: string, table: string, field: string, agg: "sum"|"count" }], groupBy?: [{ table, field }], filters?: [{ table, field, values: string[] }], ratios?: [{ name, numerator: string, denominator: string }], days?: number, dateTable?: string }`（`metrics[].name` 缺省为 `表.字段`；`ratios` 引用指标名）。
  - `query(request) → { ok: true, data: { 指标: string[], 分组字段: string[], 明细: { 分组: object, 值: object }[], 合计: object, 关联路径: string[], 窗口?: { 起: string, 止: string, N: number }, 其余组数: number } } | { ok: false, error: string }`。

- [ ] **Step 1: Write the failing tests**（`tests/join-engine.test.cjs`，用内存里的三表夹具：`订单`（user_id, product_id, cost, order_id）、`用户`（user_id, channel）、`产品`（product_id, line_name），关联 `订单.user_id N:1 用户.user_id`、`订单.product_id N:1 产品.product_id`）
  - `单事实表 + 一个维度：按渠道汇总订单金额` → 明细按 `channel` 分组，值等于手算。
  - `经过未点名的中间表：按 line_name 分组需经 订单→产品` 已覆盖；另加 `多跳`：再加 `产品.brand_id N:1 品牌.brand_id`，按 `品牌.brand_name` 分组，断言 `关联路径` 含两条。
  - `没有登记的关联：返回 error，且点名两张表`（如"用户 与 活动 在关联清单里没有登记"）。
  - `一对多重复计数被拒绝`：指标来自 `用户.cost`、按 `订单.product_id` 分组（用户→订单是 1:N），断言 `ok === false`，`error` 同时含关联描述与指标名。
  - `两个事实表共享维度：订单金额与退款金额按渠道各自汇总再合并`，断言每个渠道两项都有且不被互相放大。
  - `比率先汇总再相除`：`ratios` 的结果等于 总分子/总分母，不等于各行比率均值。
  - `关联键为空或对端没有匹配：分组显示「（未关联）」；筛选时该行被丢弃`。
  - `空表、窗口内没有数据：返回 ok 且 明细 为空数组或 合计 为 null，不出现 NaN`。
  - `除数为 0 的比率为 null`。
  - `路径确定：存在环或两条平行关联时，两次查询的 关联路径 完全一致，且选最短、同长按关联 id 排序`。
  - `超出 maxRows 时返回资源上限错误而不是卡住`（用 `limits: { maxRows: 5 }`）。
  - `usableRelations：关联一端字段在裁剪后的表里不存在时整条被丢弃，dropped 里有原因`。

- [ ] **Step 2: Run** `node --test tests/join-engine.test.cjs` — Expected: FAIL。

- [ ] **Step 3: Implement `usableRelations` and `createJoinEngine`** in `scripts/join-engine.cjs`。算法（签名与测试没定的部分）：
  1. 以关联为无向边建图；每条边记录"从 a 走到 b 时对 a 的行是 to-one 还是 to-many"（`N:1` 从左到右是 to-one，反向是 to-many；`1:1` 双向 to-one）。
  2. 涉及的表 = 指标表 ∪ 分组表 ∪ 筛选表。对每个指标表，用 BFS（邻接按关联 `id` 排序保证确定）找到它到其余每张涉及表的最短路径；找不到则报"X 与 Y 在关联清单里没有登记"。
  3. 路径上任何一条边从指标表方向看是 to-many，就拒绝并说明"指标 M 来自一对多关系的『1』侧，按『N』侧分组 / 筛选会重复计数"。
  4. 每个指标表独立：先应用自身窗口与筛选，再沿 to-one 路径用哈希查找把分组 / 筛选字段取到行上，按分组值汇总；多个指标表的结果按分组值元组合并（缺的一侧补 0）。分组字段必须从每个指标表出发都是 to-one 可达。
  5. 窗口：`days` 默认不限；给了 `days` 时对 `dateTable`（缺省第一个指标表）的 `agg.dateKey`，以该表最大日期为锚取最近 N 天，其余表不按日期过滤。
  6. 累计访问的行数超过 `maxRows` 或耗时超过 `maxMs` 立即返回资源上限错误；分组按第一个指标降序取 `maxGroups`，余下计入 `其余组数`。

- [ ] **Step 4: Run** `node --test tests/join-engine.test.cjs` — Expected: PASS。

- [ ] **Step 5: Commit**
```bash
git add scripts/join-engine.cjs tests/join-engine.test.cjs
git commit -m "业务线：关联引擎（登记关联图、一对多重复计数拦截、分别汇总再拼接）"
```

---

### Task 3: 业务线上下文包与两个工具 `knowledge-tools.cjs`

**Files:**
- Create: `scripts/knowledge-tools.cjs`
- Test: `tests/knowledge-tools.test.cjs`

**Interfaces:**
- Consumes: Task 1 的 `store.effective()` 形状；Task 2 的 `usableRelations`、`createJoinEngine`；`field-scope.cjs` 的 `redactLines(text, names)`。
- Produces:
  - `resolveLine(store, lineName: string, allowedTables: string[]) → { ok: true, line: BusinessLine, publicLine: BusinessLine, tables: string[] } | { ok: false, status: 400|404, error: string }`：`tables` 为 `tableLines` 属于该业务线或「公共」、且在 `allowedTables` 内的表；业务线是「公共」→ 400；不存在 → 404；`tables` 为空 → 404（"业务线下没有可用数据资产…"）。
  - `buildContextPack({ line, publicLine, tables, scopedTables, relations, tableKnowledgeFlags, hiddenNames }) → string`：Markdown，含「业务线知识库」「公共知识库」「可用表清单（表名、说明、有无表知识库）」「表关联清单」，知识库正文已 `redactLines`。
  - `createKnowledgeTools({ store, resolved, scopedTables, rowsOf, hiddenNames, budgetChars?, limits? }) → [{ schema, execute, maxChars }, { schema, execute, maxChars }]`，即 `get_table_knowledge` 与 `query_join`，直接作为 `createAnalysisToolkit` 的 `extraTools`。
    - `get_table_knowledge` 参数 `{ tables: string[] }`，返回 `{ ok: true, data: { 知识库: [{ 表名, 内容 }], 未提供: [{ 表名, 原因 }] } }`；无权限与不存在的表给同一条原因；总字符超过预算时按点名顺序截断，被截的表进 `未提供`（原因"超出本次字数预算"）；没有表知识库的表原因为"该表还没有知识库"。
    - `query_join` 参数同 Task 2 的 `request`，`execute` 调用 `createJoinEngine({ tables: scopedTables, rowsOf, relations: usable })`，只使用 `resolved` 范围内的表与该业务线加「公共」的关联；`maxChars` 为 12000。

- [ ] **Step 1: Write the failing tests**
  - `resolveLine：公共 → 400；不存在 → 404；用户在其下没有任何有权限的表 → 404；正常返回的 tables 含公共表且不含无权限表`。
  - `上下文包：含业务线与公共知识库、可用表清单；无权限的表名不出现`。
  - `上下文包：知识库正文里提到隐藏字段的行被替换为「（已隐藏）」`。
  - `上下文包：关联一端字段被隐藏的整条关联不出现`。
  - `get_table_knowledge：一次可取 12 张表；总字数超过预算时按点名顺序截断并在 未提供 里说明`（`budgetChars: 100`）。
  - `get_table_knowledge：无权限的表与不存在的表提示一致；没有表知识库的表有单独原因`。
  - `get_table_knowledge：返回的正文同样做隐藏字段脱敏`。
  - `query_join：只用本业务线加公共的关联；别的业务线登记的关联不可用`。
  - `两个工具的 schema 名称为 get_table_knowledge / query_join，且能直接塞进 createAnalysisToolkit({ extraTools })`（用真实 `createAnalysisToolkit` 构造并 `execute("get_table_knowledge", "{...}")` 得到 `ok: true`）。

- [ ] **Step 2: Run** `node --test tests/knowledge-tools.test.cjs` — Expected: FAIL。

- [ ] **Step 3: Implement** the three exports in `scripts/knowledge-tools.cjs`；`execute(args)` 的入参是已解析的对象（`createAnalysisToolkit` 已做 JSON 解析与审计）。工具描述里写清"关联不用自己写，平台按登记的关联自动连接"。

- [ ] **Step 4: Run** `node --test tests/knowledge-tools.test.cjs` — Expected: PASS。

- [ ] **Step 5: Commit**
```bash
git add scripts/knowledge-tools.cjs tests/knowledge-tools.test.cjs
git commit -m "业务线：上下文包与 get_table_knowledge / query_join 工具"
```

---

### Task 4: 网关接口与存储接入

**Files:**
- Modify: `scripts/analysis-gateway.cjs`（在 `orgStore` 创建之后新增 `knowledgeStore`；在 `/v1/org` 路由附近新增四个路由；`DEFAULT_TABLE_LINES` 种子常量）
- Modify: `Dockerfile`（新增三行 COPY）
- Test: `tests/knowledge-api.test.cjs`

**Interfaces:**
- Consumes: Task 1 `createKnowledgeStore`；现有 `orgStore.effective()`、`scopeFor(user)`、`appendAuditEntry`、`userTables(user)`、`hiddenNamesOf`。
- Produces（HTTP，登录后）:
  - `GET /v1/knowledge` → `{ rev, businessLines: BusinessLine[], tableLines, canEdit: boolean }`。管理员全量；其他人只含"自己有权限的表所在的业务线与「公共」"，`tableLines` 只含自己有权限的表，关联用 `usableRelations` 按其字段权限过滤，知识库正文按其隐藏字段脱敏。
  - `PUT /v1/knowledge/business-lines`，body `{ rev, businessLines, tableLines }` → `{ rev }`；校验失败 400，`rev` 不一致 409。
  - `GET /v1/knowledge/tables/:表名`（表名 URL 编码）→ `{ table, knowledge: Knowledge|null }`；无权限与不存在均 404 同一条提示。
  - `PUT /v1/knowledge/tables/:表名`，body `{ markdown }` → `{ knowledge }`。
  - 写接口权限：门户管理员，或所在权限组 `menuEdits` 含「表管理」；否则 403。
- 种子 `DEFAULT_TABLE_LINES`：广告计划日报表 / 广告账户日报 / 广告组转化日报 / 媒体消耗汇总 / 产品 ROI 日报 / 媒体账户健康度 / 权益-账号维度消耗统计表 → 权益；用户画像标签明细表 / 用户设备关系明细 / 用户生命周期日报 → 存量；RTA 请求小时监控表 / 用户订单明细 → 号卡；渠道归因明细 → 保险；渠道维表 / 产品维表 → 公共。业务线种子：权益、存量、号卡、保险。表知识库种子：把 `assets/portal/page-table-detail.js` 里 `tableKnowledgeStore` 的示例（键是物理表名 `dm_ad_plan_daily_media_account_product_performance_detail`）按「广告计划日报表」中文名落到 `defaults.tableKnowledge`。

- [ ] **Step 1: Write the failing tests**（`tests/knowledge-api.test.cjs`，用 `tests/helpers/gateway-harness.cjs` 的 `startHarness`，参照 `tests/org.test.cjs` 的写法）
  - `未登录 401`。
  - `GET /v1/knowledge 首次返回种子：含 公共、权益 等业务线与 tableLines，且 rev 为数字`。
  - `非管理员只看到自己有权限的表所在的业务线`；`有隐藏字段的用户看不到一端字段被隐藏的关联`。
  - `PUT business-lines：管理员保存成功后 GET 立即可见，rev 加 1；用旧 rev 再保存得 409`。
  - `PUT business-lines：没有「表管理」编辑权限的普通用户 403；权限组 menuEdits 含「表管理」的用户可保存`（先用 `PUT /v1/org` 配好）。
  - `表知识库：保存后 GET 读回；无权限用户读同一张表得 404`。
  - `审计：保存后 GET /v1/audit 有 type 为 knowledge-change 的记录，且不含正文`。
  - `Dockerfile 含 knowledge-store / join-engine / knowledge-tools 的 COPY`（沿用 `tests/dockerfile.test.cjs`，不另写）。

- [ ] **Step 2: Run** `node --test tests/knowledge-api.test.cjs tests/dockerfile.test.cjs` — Expected: FAIL。

- [ ] **Step 3: Implement** the store wiring and four routes in `analysis-gateway.cjs`（`tableNames: () => allTableNames`、`fieldsOf: name => (tables.find(t => t.cnName === name)?.fields || []).map(f => f.name)`）；`canEditTableAdmin(session)` 小函数放在路由旁；返回给非管理员的视图在一个函数 `knowledgeViewFor(userName)` 里集中裁剪。Dockerfile 加：
```
COPY scripts/knowledge-store.cjs ./knowledge-store.cjs
COPY scripts/join-engine.cjs ./join-engine.cjs
COPY scripts/knowledge-tools.cjs ./knowledge-tools.cjs
```

- [ ] **Step 4: Run** `node --test tests/knowledge-api.test.cjs tests/dockerfile.test.cjs tests/org.test.cjs` — Expected: PASS（org 测试不回归）。

- [ ] **Step 5: Commit**
```bash
git add scripts/analysis-gateway.cjs Dockerfile tests/knowledge-api.test.cjs
git commit -m "业务线：网关知识库接口与权限、字段权限过滤、审计"
```

---

### Task 5: `/v1/analyze` 业务线模式

**Files:**
- Modify: `scripts/analysis-gateway.cjs`（`/v1/analyze` 里 `businessLine` 与 `scopedCandidates` 一段约 3115–3140 行；工具循环创建处约 3307–3320 行；非工具回退路径的 `## 业务线范围` 约 3371 行）
- Test: `tests/knowledge-analyze.test.cjs`

**Interfaces:**
- Consumes: Task 3 `resolveLine` / `buildContextPack` / `createKnowledgeTools`；现有 `createAnalysisToolkit({ extraTools })`、`runAnalysisToolLoop({ maxSteps, maxCalls, systemExtra })`。
- Produces: 当请求带 `businessLine` 且该名称是 store 里的业务线（非「公共」）时：
  1. 候选表由服务端决定（`resolveLine().tables`，上限 60），忽略客户端的 `assetCandidates`；`resolveLine` 失败时直接按其 `status` / `error` 返回。
  2. 工具循环的 `extraTools` 追加两个知识工具；`systemExtra` 追加上下文包，再追加一段顺序要求："先按问题判断需要哪些表，再调用 get_table_knowledge 与 get_schema，再取数；跨表用 query_join，不要自己写关联条件；数字只引用工具返回值；业务线里没有登记的关联不要猜。"
  3. `maxSteps` / `maxCalls` 取 `PORTAL_KNOWLEDGE_TOOL_STEPS`（默认 8）/ `PORTAL_KNOWLEDGE_TOOL_CALLS`（默认 20）。
  4. 模型不支持工具时走回退路径：上下文包放进 `## 业务线范围` 一节。
  业务线名称不在 store 里（旧的客户端值）：保持现有行为（按 `assetCandidates` 缩小范围）。

- [ ] **Step 1: Write the failing tests**（`startHarness` + `harness.relay.respond` 脚本化假模型，参照 `tests/analysis-tools.test.cjs` / `tests/planner-flow.test.cjs`）
  - `选业务线后，发给模型的系统消息里含业务线知识库正文、公共知识库与可用表清单`。
  - `业务线上下文包里没有用户无权限的表`；`隐藏字段所在行被替换为（已隐藏）`。
  - `请求的 tools 列表里含 get_table_knowledge 与 query_join；没选业务线时不含`。
  - `脚本化模型依次调用 get_table_knowledge → query_join，网关返回的取数结果里有平台算好的数字，且审计里有两次调用`。
  - `businessLine 为「公共」→ 400；不存在的业务线（且客户端没给 assetCandidates）按旧行为；用户在该业务线下没有有权限的表 → 404 且提示含业务线名`。
  - `业务线模式允许超过 4 轮：脚本化模型连续 6 轮调用工具仍能得到最终回答；没选业务线时仍是 4 轮上限`。
  - `@表 与业务线同时给：@表 仍作为 referenced，上下文包照常放入`。

- [ ] **Step 2: Run** `node --test tests/knowledge-analyze.test.cjs` — Expected: FAIL。

- [ ] **Step 3: Implement** the three changes in `/v1/analyze`；把"业务线模式"准备工作收进一个函数 `prepareKnowledgeMode({ user, businessLine, allowed, fieldScope })` 返回 `{ error?: { status, message }, tables, extraTools, contextPack }`，放在 `/v1/analyze` 附近，避免继续膨胀处理函数。

- [ ] **Step 4: Run** `node --test tests/knowledge-analyze.test.cjs tests/analysis-tools.test.cjs tests/planner-flow.test.cjs tests/followups-flow.test.cjs` — Expected: PASS（现有流程不回归）。

- [ ] **Step 5: Commit**
```bash
git add scripts/analysis-gateway.cjs tests/knowledge-analyze.test.cjs
git commit -m "业务线：分析接口支持业务线模式（上下文包、知识库与关联取数工具、放宽工具轮次）"
```

---

### Task 6: 抽出共用的 Markdown 知识库工具（不改行为）

**Files:**
- Create: `assets/portal/knowledge-md.js`
- Modify: `assets/portal/page-table-detail.js`（删除被抽走的函数，改从 `window.PortalKnowledgeMd` 取；`knowledge-md.js` 自行挂载，不经 `core.js`）
- Modify: `assets/portal/manifest.json`、`index.html`（在 `page-table-detail.js` 之前加载 `knowledge-md.js`；`?v=` 统一 `20261112a`）
- Test: `tests/knowledge-md.test.cjs`

**Interfaces:**
- Produces（`window.PortalKnowledgeMd`，同时 `module.exports`，写法参照 `assets/portal-routes.js` 的 UMD 头，便于 Node 单测）:
  - `renderKnowledgeMarkdown(markdown: string) → string`（HTML，先转义再套标签）
  - `normalizeToMarkdown(raw: string) → string`
  - `knowledgeTemplate(name: string) → string`（表知识库模板，沿用现有内容）
  - `businessLineTemplate(name: string) → string`（业务线模板：业务概述、术语与口径、核心指标、表地图、常见分析套路、注意事项）
  - `knowledgeNow() → string`

- [ ] **Step 1: Write the failing tests**（`tests/knowledge-md.test.cjs`，`require("../assets/portal/knowledge-md.js")`）
  - `渲染：标题降一级、加粗、行内代码、https 链接；<script> 被转义`。
  - `规范化：「【标题】」「一、标题」「键：值」转成二级标题与列表项；代码块内容保持原样`。
  - `businessLineTemplate 含 业务概述 / 术语与口径 / 核心指标 / 表地图 / 常见分析套路 / 注意事项 六个二级标题`。

- [ ] **Step 2: Run** `node --test tests/knowledge-md.test.cjs` — Expected: FAIL。

- [ ] **Step 3: Implement**：把 `page-table-detail.js` 里 `escapeHtml` / `renderInlineMd` / `renderKnowledgeMarkdown` / `normalizeToMarkdown` / `knowledgeTemplate` / `knowledgeNow` 原样搬到新文件并导出，新增 `businessLineTemplate`；`page-table-detail.js` 顶部改为 `const { renderKnowledgeMarkdown, normalizeToMarkdown, knowledgeTemplate, knowledgeNow } = window.PortalKnowledgeMd;`。同步 `manifest.json` 与 `index.html`。

- [ ] **Step 4: Run** `node --test tests/knowledge-md.test.cjs tests/lint.test.cjs tests/prototype-smoke.test.cjs && npm run lint` — Expected: PASS（`lint.test.cjs` 检查清单一致；表详情页知识库渲染不变）。

- [ ] **Step 5: Commit**
```bash
git add assets/portal/knowledge-md.js assets/portal/page-table-detail.js assets/portal/manifest.json index.html tests/knowledge-md.test.cjs
git commit -m "业务线：抽出共用的 Markdown 知识库工具，并增加业务线模板"
```

---

### Task 7: 前端同步服务端知识库；表知识库与业务线选项改读服务端

**Files:**
- Modify: `assets/portal/core.js`（新增 `knowledgeSync`，参照 `orgSync`；导出 `knowledgeSync`、`knowledgeData`）
- Modify: `assets/portal/boot.js`（登录后与 `orgSync.load()` 并行调用 `knowledgeSync.load()`）
- Modify: `assets/portal/page-table-detail.js`（知识库的读写改走服务端；删除内存里的 `tableKnowledgeStore` 示例）
- Modify: `assets/portal/page-asset-management.js`（业务线筛选与新增表的业务线选项取自 `knowledgeData.businessLines`；表行的 `bizLine` 取自 `tableLines`）
- Test: `tests/e2e-ui.test.cjs`（新增用例，Playwright；没有 Chrome 时自动跳过）

**Interfaces:**
- Produces（`window.PortalVue`）:
  - `knowledgeData`：`reactive({ rev: 0, businessLines: [], tableLines: {}, canEdit: false, ready: false })`。
  - `knowledgeSync.load() → Promise<void>`：`GET /v1/knowledge`，成功后更新 `knowledgeData`、`refreshTick.value += 1`。
  - `knowledgeSync.saveBusinessLines() → Promise<boolean>`：`PUT /v1/knowledge/business-lines`（带当前 `rev`）；409 或 400 时提示服务端的 `error` 并 `load()` 回退；成功更新 `rev`。
  - `knowledgeSync.loadTable(table: string) → Promise<Knowledge|null>`、`knowledgeSync.saveTable(table: string, markdown: string) → Promise<{ ok: boolean, knowledge?: Knowledge, error?: string }>`。
- 表详情页：知识库页签进入时调用 `loadTable`；保存调用 `saveTable`，失败不关闭编辑框并提示原因；原先"仅广告计划日报表有示例"的说明文字去掉。

- [ ] **Step 1: Write the failing e2e tests**（`tests/e2e-ui.test.cjs`，沿用文件里现有的登录与页面辅助函数）
  - `表详情：编辑并保存知识库后刷新页面仍在（证明落到了服务端）`。
  - `表管理的业务线筛选下拉包含 公共 与 种子业务线`。
  - `没有「表管理」编辑权限的账号看不到「编辑知识库」按钮`。

- [ ] **Step 2: Run** `node --test tests/e2e-ui.test.cjs` — Expected: 新用例 FAIL（没有 Chrome 时显示跳过，此时改为人工在浏览器里验证并在提交说明里写明）。

- [ ] **Step 3: Implement** `knowledgeSync` 与前端改动；`knowledgeData.tableLines` 加载后把 `state.assets` 里每张表的 `bizLine` 覆盖为 `tableLines[cnName] || ""`（只在加载时覆盖，不反向写回；页面里改表所属业务线统一走业务线视图，见 Task 8，以及新增表时调用 `saveBusinessLines` 更新 `tableLines`）。

- [ ] **Step 4: Run** `node --test tests/e2e-ui.test.cjs tests/lint.test.cjs tests/prototype-smoke.test.cjs && npm run lint` — Expected: PASS。

- [ ] **Step 5: Commit**
```bash
git add assets/portal/core.js assets/portal/boot.js assets/portal/page-table-detail.js assets/portal/page-asset-management.js tests/e2e-ui.test.cjs
git commit -m "业务线：前端同步服务端知识库，表知识库与业务线选项改读服务端"
```

---

### Task 8: 表管理「业务线」视图

**Files:**
- Create: `assets/portal/page-business-lines.js`（组件 `BusinessLinePanel`，导出到 `window.PortalVue.BusinessLinePanel`）
- Modify: `assets/portal/page-asset-management.js`（顶部「数据表｜业务线」开关；`components: { BusinessLinePanel }`）
- Modify: `assets/portal/manifest.json`、`index.html`（`page-business-lines.js` 放在 `page-asset-management.js` 之前；`?v=` 统一 `20261112a`）
- Modify: `assets/portal-vue-module.css`（业务线视图样式，类名前缀 `portal-vue-bizline-`）
- Test: `tests/e2e-ui.test.cjs`

**Interfaces:**
- Consumes: Task 6 `window.PortalKnowledgeMd`；Task 7 `knowledgeData` / `knowledgeSync`；`state.assets`、`canEdit('表管理')`、`notify`、`confirmAction`。
- Produces: `BusinessLinePanel`（无 props）。左侧业务线列表（名称、表数；「公共」置顶且不可改名 / 删除），支持新增、改名、上移 / 下移排序、删除（有表时按钮提示先迁出）；右侧三个子页：
  - **知识库**：编辑 / 预览 / 保存，沿用表详情页的交互（最近编辑人与时间、新建模板用 `businessLineTemplate`）。
  - **表关联**：表格（左表、左字段、关系、右表、右字段、备注、操作），新增 / 编辑用对话框；表与字段下拉来自 `state.assets` 与 `GET /v1/table-fields`（管理员）——非管理员编辑者退回 `state.assets[].fields`；保存前端校验两端必填且不是同一张表同一字段。
  - **包含的表**：该业务线下的表列表，「移入」下拉选未分组或其他业务线的表，「移出」把表改为未分组。
  所有保存走 `knowledgeSync.saveBusinessLines()`；没有编辑权限时只读。

- [ ] **Step 1: Write the failing e2e tests**
  - `业务线视图：新增「AI 短剧」、写知识库、保存后刷新仍在`。
  - `表关联：添加一条 订单.user_id N:1 用户.user_id 后刷新仍在；两端字段下拉里只有该表的字段`。
  - `包含的表：把一张未分组的表移入业务线后，数据表视图里该表的业务线列显示新业务线`。
  - `删除有表的业务线时被拦并提示表名；「公共」没有删除与改名入口`。
  - `只读账号进入业务线视图：没有任何编辑按钮`。

- [ ] **Step 2: Run** `node --test tests/e2e-ui.test.cjs` — Expected: 新用例 FAIL（无 Chrome 则人工验证）。

- [ ] **Step 3: Implement** the panel and the view switch；模板用 Element Plus 的 `el-menu` / `el-tabs` / `el-table` / `el-dialog`，不引入新依赖。

- [ ] **Step 4: Run** `node --test tests/e2e-ui.test.cjs tests/lint.test.cjs tests/prototype-smoke.test.cjs && npm run lint` — Expected: PASS。

- [ ] **Step 5: Commit**
```bash
git add assets/portal/page-business-lines.js assets/portal/page-asset-management.js assets/portal/manifest.json index.html assets/portal-vue-module.css tests/e2e-ui.test.cjs
git commit -m "业务线：表管理增加业务线视图（知识库、表关联、包含的表）"
```

---

### Task 9: 工作台选业务线

**Files:**
- Modify: `assets/portal/page-analysis-workbench.js`（输入框下方的级联 `tableCascadeOptions` / `activeTablePath` / `changeTablePath`，约 267、332、398、560 行；`sendMessage` 的 `businessLine` 与 `assetCandidates`，约 819–822、875 行）
- Test: `tests/e2e-ui.test.cjs`、`tests/table-switch.test.cjs`

**Interfaces:**
- Consumes: Task 7 `knowledgeData`；现有 `myTables`（用户有权限的表）。
- Produces: 输入框下方改为单选的「选择业务线」（`el-select`，清空即不选）。可选项 = `knowledgeData.businessLines` 去掉「公共」，且该业务线或「公共」下至少有一张 `myTables` 里的表。选中后 `sendMessage` 带 `businessLine: <名称>`，`assetCandidates` 不再由前端给（置空数组）；原有澄清卡（`clarification.enabled` 且没选业务线时先问业务线）的选项改为同一份业务线列表；`@表` 引用保持不变。切换业务线按"切表"处理（沿用 `applyTableBoundary` 的现有边界：换了业务线，之前对话不再作为上下文——前端在 `buildConversation` 里按 `session.businessLine` 变化清空，请求里不再传上文）。

- [ ] **Step 1: Write the failing tests**
  - e2e：`工作台输入框下方是「选择业务线」，不再出现「选择数据表」级联`。
  - e2e：`没有权限的业务线不在选项里；选业务线发问时请求体 businessLine 为所选名称、assetCandidates 为空`（拦截 `/v1/analyze` 请求断言）。
  - e2e：`@表 仍可引用；同时选业务线时请求体 tables 含该表`。
  - `tests/table-switch.test.cjs` 补一条：`换业务线后上一轮对话不再作为 conversation 上文`（按该测试现有写法）。

- [ ] **Step 2: Run** `node --test tests/e2e-ui.test.cjs tests/table-switch.test.cjs` — Expected: 新用例 FAIL。

- [ ] **Step 3: Implement** the selector and request changes；`tableGroups` 里按业务线分组的旧逻辑保留给 `@` 提及面板用。

- [ ] **Step 4: Run** `node --test tests/e2e-ui.test.cjs tests/table-switch.test.cjs tests/lint.test.cjs tests/prototype-smoke.test.cjs && npm run lint` — Expected: PASS。

- [ ] **Step 5: Commit**
```bash
git add assets/portal/page-analysis-workbench.js tests/e2e-ui.test.cjs tests/table-switch.test.cjs
git commit -m "业务线：灵犀智析改为选择业务线，业务线变化重置上文"
```

---

### Task 10: 评测用例、文档与全量回归

**Files:**
- Modify: `evals/cases.json`（跨表用例）、`README.md`（新增"业务线与业务线知识库"一节，并把「表知识库」说明改为服务端存储）、`.env.example`（新增 5 个环境变量）
- Test: `tests/evals.test.cjs`（现有，校验用例格式）

**Interfaces:**
- Consumes: Task 5 业务线模式；`scripts/run-evals.cjs` 现有用例格式（先读 `evals/cases.json` 里一条现有用例的字段，照其结构写）。

- [ ] **Step 1: Write the failing test** — 在 `tests/evals.test.cjs` 里加一条：`evals/cases.json 里含 businessLine 字段的用例都能被 run-evals 的格式校验接受，且至少有 3 条跨表用例`。

- [ ] **Step 2: Run** `node --test tests/evals.test.cjs` — Expected: FAIL（没有这些用例）。

- [ ] **Step 3: Implement**：`evals/cases.json` 加三条：多表关联（订单 + 用户 + 产品，按产品线汇总）、没有登记关联（应如实说明做不到）、一对多重复计数陷阱（应被拒绝并解释）；`run-evals.cjs` 若不支持用例里带 `businessLine`，按现有请求构造处补传。README 补：数据文件、四个接口、`PORTAL_KNOWLEDGE_*` / `PORTAL_JOIN_*` 环境变量、已知边界（别名与中文叙述不脱敏、业务线视图不进地址）。`.env.example` 加 `PORTAL_KNOWLEDGE_BUDGET_CHARS` / `PORTAL_JOIN_MAX_ROWS` / `PORTAL_JOIN_MAX_MS` / `PORTAL_KNOWLEDGE_TOOL_STEPS` / `PORTAL_KNOWLEDGE_TOOL_CALLS` 及默认值注释。

- [ ] **Step 4: Run** the full suite `npm test && npm run lint` — Expected: 全部 PASS（浏览器端到端在没有 Chrome 时显示跳过，需在提交说明里注明）。

- [ ] **Step 5: Commit**
```bash
git add evals/cases.json README.md .env.example tests/evals.test.cjs scripts/run-evals.cjs
git commit -m "业务线：评测用例、README 与环境变量说明"
```
