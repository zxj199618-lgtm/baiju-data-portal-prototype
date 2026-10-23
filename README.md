# 观星台原型

管理后台交互原型（静态页面）+ AI 分析网关（Node.js）。

## 本地开发

```bash
# 原型页面（任选一种）
python3 -m http.server 8080        # 或 npx serve .
# 打开 http://localhost:8080

# 测试（单元 + 经网关的端到端 + 浏览器端到端）
npm test
```

### 前端结构

前端是无构建的多个 `<script>`（Vue 3 + Element Plus 的全局构建，模板在运行时编译）。门户的主体按页面拆在 `assets/portal/`：

| 文件 | 内容 |
|---|---|
| `core.js` | 共享状态、权限判断、通用工具；被页面使用的名字挂在 `window.PortalVue` 上 |
| `page-*.js` | 每个页面一个文件（含只被该页面使用的数据与工具），末尾 `mount("#xxxView", 组件, "名字")` |
| `boot.js` | 全部页面挂载后的收尾（对外 API、首次页面同步、服务端权限同步） |
| `manifest.json` | 加载顺序（`core.js` 最先、`boot.js` 最后）；`index.html` 的 script 标签必须与它完全一致 |

新增一个页面：写 `assets/portal/page-xxx.js` → 加进 `manifest.json` 与 `index.html`（同一个 `?v=` 版本号）→ 在 `index.html` 加容器
`<div class="manager-view hidden" id="xxxView">`，并在 `assets/portal-bridge.js` 里登记导航、页面标题、显示 / 隐藏与管理员菜单 →
在 `page-menu-management.js` 的菜单树里加一项。`npm run lint`（ESLint `no-undef`）会检查页面文件里有没有用到没定义的变量，
`tests/lint.test.cjs` 与浏览器冒烟测试会检查清单一致与每个菜单页都能打开。

`npm test` 会启动真实网关（临时数据目录 + 本地假模型），不需要中转站 Key。其中浏览器端到端用例（`tests/e2e-ui.test.cjs`）
通过 Playwright 驱动本机 Chrome；没有 Chrome 时这组用例自动跳过。

## AI 分析网关（Docker）

灵犀智析（分析工作台）的真实分析能力由本地/服务器上的分析网关提供，网关负责：

1. 校验用户表权限（与原型权限组数据一致）；
2. 按分析场景（单表分析 / 血缘 / 资产问答 / 归因）组装证据与提示词；
3. 调用模型中转站生成 Markdown 分析报告。

### 启动

```bash
cp .env.example .env        # 填入 RELAY_API_KEY（模型中转站的 Key）
docker compose up -d --build
```

验证：

```bash
curl http://localhost:8787/v1/models
```

前端在本地打开时自动连 `http://localhost:8787`；部署在其他机器时，前端会连 `http://<页面域名>:8787`，
也可以在浏览器控制台用 `localStorage.portalGatewayBase = "http://网关地址:8787"` 指定。

### 登录与管理员

- 网关接口需要登录：页面里用「账号 + 密码」登录，令牌 12 小时有效。账号即「用户管理」里的成员。
- **首次启动**会为每个成员创建账号：密码取 `.env` 里的 `PORTAL_INITIAL_PASSWORD`；未设置则随机生成，**只打印一次**到日志（`docker compose logs analysis-gateway`）。
- 「门户管理员」权限组的成员是管理员，可以：修改权限、管理供应商与模型、上传/配置 Skill、编辑表数据。
- 修改密码（运维命令，写入数据卷中的账号文件）：

```bash
docker compose exec analysis-gateway node gateway-auth.cjs set-password 曾祥竞 新密码
```

- **会话令牌**：页面由网关同源托管时（线上默认），登录后令牌只放在 `httpOnly` cookie（`gxt_session`，`SameSite=Lax`，HTTPS 下带 `Secure`），
  页面脚本读不到，localStorage 里只有账号名；cookie 身份的写请求会校验 `Origin`（防 CSRF）。跨域访问网关（本地开发、独立 HTML）仍用 `Authorization: Bearer` 令牌。`POST /v1/auth/logout` 清除 cookie。
- 登录页默认是「密码登录」，会记住上次登录的账号（不记密码；浏览器自带的密码管理器可以自动填充）。
- **本地演示登录**：本机开发时设置 `PORTAL_DEMO_LOGIN_PASSWORD=<账号共用密码>`，登录页会出现账号快捷按钮，点一下自动填密码并登录。
  这会把密码公开给任何访问者，默认关闭；设置后（本机或线上演示环境）会同时：不做「连续输错锁定」（否则任何人都能把演示账号锁死）、
  禁止修改 / 重置密码（共用密码不能被改掉）、历史与用量按「账号 + 访客」分开（每个浏览器一个随机访客 id，互相看不到、各自计数），
  并启用全站每日 token 兜底（默认 2000 万，`PORTAL_GLOBAL_DAILY_TOKEN_LIMIT` 可调）。启动时会打印警告。
- **账号管理**（管理员，界面在「AI 中心 → 运营中心 → 账号管理」，接口见下表）：新增账号（随机初始密码只显示一次）、停用 / 启用（立即生效，已签发的令牌下一次请求就失效）、重置密码、分配权限组。
  不提供删除：账号名是历史、反馈、审计的归属键。
- 用户可以在页头菜单「修改密码」自己改密码（需要旧密码，至少 8 位）；旧密码连续输错 5 次会被临时锁定。
- 分析身份只取登录账号，请求里的 `user` 字段会被忽略。
- **跨域**：默认只允许同源页面与本机开发页（localhost / 127.0.0.1）。页面部署在别的域名时，把来源写进 `PORTAL_ALLOWED_ORIGINS`（逗号分隔）。
- **权限组与账号分组**由服务端保存（`DATA_DIR/org.json`）：管理员在界面里修改权限组、成员后自动保存，服务端据此判断数据表权限与管理员角色；
  登录后界面从服务端读取。服务端会拒绝危险修改（例如把最后一个管理员降级），界面会提示并回退到服务端配置。
  还没有管理员保存过时使用内置默认值。账号本身（可登录的成员）目前是固定的 5 个，新增账号需要改代码并重新发布。
- Skill 上传只接受元信息与指令（SKILL.md）；包内的 `tools` 命令**不会被执行**，只有随网关代码发布的内置 Skill 能运行取数工具。

### 分析能力

- **工具取数**：模型按需调用 `search_tables` / `get_schema` / `list_metrics` / `query_metric` / `run_metric` / `get_sample_rows`，
  平台在每次调用里校验权限（无权限与不存在的表提示一致）、限制输出大小（单次 6000 字符、样例最多 5 行）、最多 4 轮 / 8 次调用，并写审计。
  模型不支持工具、或只支持非 OpenAI 兼容协议（Anthropic 原生 / Gemini）时，自动回到把证据整包放进提示词的方式；`toolMode: false` 可强制关闭。
- **语义层（指标口径即代码）**：业务指标定义在 `semantic/metrics.json`（消耗、激活、点击、CPA、点击率、ROI…），随代码评审发布；
  启动时会对照真实表结构校验，不合格的定义被丢弃并在日志与 `GET /v1/metrics`（管理员）里给出警告。
  比率指标一律「先分别汇总再相除」。目前所有口径都标为**草稿（待数据团队确认）**，确认后把对应指标的 `reviewed` 改为 `true`。
- 语义层查询支持 `filters`（按维度取值筛选，如只看某个媒体），筛选后比率仍是先汇总再相除；取值需与数据里的写法一致。
- **归因**：问题里的「近 14 天 / 最近两周 / 近一个月」会被解析成窗口（周按 7 天、月按 30 天，上限 90 天，默认 7 天）。指标异动的维度贡献、CPA 的结构 / 效率效应由代码确定性计算（`scripts/attribution-calc.cjs`），模型只负责解释。
- **数字回查**：报告里的数字会对照证据与问题，找不到的写进 `meta.numericCheck`，界面在回答下方提示「N 个数字未在证据中找到」。
- **追问**：信息不足时模型调用 `ask_user`，平台校验（最多 3 题、每题 2–6 个选项）后以问题卡片展示；用户已补充信息后不再提供该工具。

### Skill 规范包与回答协议

- **规范包**（`skill-packs/<id>/`，随代码发布）把一个业务场景的知识变成平台能执行、能测试的东西：
  `SKILL.md`（每次都进上下文的核心规则，要短）、`skill.json` 里的 `spec`（术语表 `glossary`、拦截规则 `guards`、缺省值 `defaults`、默认数据表 `tables`）、
  `references/*.md`（长资料，模型需要时用 `read_reference` 读取，不占每次的上下文）。目前有「权益投放分析」（`equity-union-analyst`，来自 union-order-analysis 规范）。
- **术语解析**由代码做，不靠模型自觉：「任哥」→ `department IN (投放一部权益一组, 二组)`，「存量 / 子墨 / 白驹存量」→ `account_id = '白驹存量'`；
  「白驹」是歧义词，要求两种口径并列给出。解析结果会显示在回答上方（口径提示），追问时沿用上一轮的口径。
- **拦截规则**：`block` 类（如按商户 / 支付渠道拆分，本表做不到）直接给出答复和替代方案，不调用模型；`warn` 类（日级 ROI、小时级转化、三方签约…）作为提示交给模型。
- **语义层固定口径**：`semantic/metrics.json` 里表级 `baseFilters`（只取常规套餐与三方支付套餐）和指标级 `baseFilters`（自营 ROI 只算常规套餐、三方 ROI 只算三方支付套餐）由代码强制；
  `caveat` 会随结果返回（用户数跨行累加含重复、日级 ROI 不稳定…）；`query_metric` 的 `daily=true` 返回逐日趋势、最高 / 最低日和异常日。
- **回答协议**（所有技能）：答案优先、篇幅跟着问题走、口径一行带过；按使用者的权限组调整关注点（优化师 / 投放组长：给可执行动作；运营：业务语言讲趋势和结构；数据分析师：口径、公式和 SQL）。
  短回答直接显示在对话里，只有长篇且带标题结构的内容才归档成报告卡片。
- **多轮上下文**：前端随请求带上最近 3 轮（问题 + 回答摘要 + 上一轮技能与口径词）。没有关键词的追问沿用上一轮的技能；业务专属技能的路由关键词优先于通用技能的多个命中（`priority`）。
- 权益表（`权益-账号维度消耗统计表`）目前是**示例数据**（结构同生产的 56 个字段，固定随机种子生成，埋了几条故事线）；接入真实数据源后由数据源替换，规范包、语义层指标和评测用例不用改。
  默认授权给投放组长 / 优化师 / 数据分析师；已有环境需要在「权限组 → 数据表权限」里补授权。

### 推荐问题：回答后一键继续问

- 每次回答下面显示最多 3 条**推荐问题**（只在最后一条回答下显示），点一下就是一次提问，用来把追问留在平台真正能回答的范围里；首屏的推荐问题同样只推能回答的（有权益表权限的用户先看到权益场景的问法）。
- **确定性生成，不调用模型**（`scripts/followups.cjs`）：根据这一轮实际用到的工具和结果（取了哪个指标、有没有按维度拆、变化是否明显、有没有做归因…）生成，并用语义层校验——只推荐存在的指标、该表确实有的维度，以及平台支持的动作（拆开看、趋势、为什么变了、相关指标、整理成报告 / 异动复盘、取数 SQL）。
- 口径词沿用（「任哥近 7 天…」）；按角色排序（优化师先看「为什么 / 往下拆」，运营先看趋势，数分先看口径与拆解）；报告类最多 1 条；归因之后先推荐往下拆贡献最大的那一组；报告之后推荐换模板重新整理；被拦截的需求（按商户拆分）推荐规范里写的替代问法。
- 规范包可配置：`skill.json` 的 `spec.followUps`（`relatedMetrics` 相关指标、`dimensionOrder` 拆分维度顺序、`sql` 是否给取数 SQL 追问、`starters` 没有事实时的起步问题），拦截规则的 `suggest`。配置里写错的指标会被校验过滤掉。
- 回答协议不再让模型在结尾写「还可以继续看…」，避免和推荐问题重复。`meta.suggestions` 为 `[{ kind, text }]`，也随对话历史保存。
- 界面里的「当前用户」不再写死成某个账号：可用的数据表取自服务端会话（`GET /v1/auth/me`）。

### 规划层：用哪个技能、输出什么形式

- 每次提问先「规划」，顺序是便宜的先来：**手动选择**的技能 > **关键词命中 / 沿用上一轮**（业务专属技能优先）> 前两者都没把握、落到兜底，并且有两个以上业务技能可选时，才用**一次便宜的模型调用**判断技能和输出形式（简短回答 / 报告）。
- 判断用的模型：环境变量 `PORTAL_PLANNER_MODEL`，其次在已启用的模型里找名字带 flash / mini / lite / turbo 的，最后用本次请求的模型；20 秒超时。判断失败、超时、技能无效或置信度低于 0.6，都保留兜底结果，不影响回答。判断的 token 计入用量与审计。
- 每次决定都输出 **`plan`**：技能、来源（manual / keyword / sticky / model / fallback）、理由、置信度、输出形式、模板、备选技能；出现在 SSE 的 `started` 事件、`meta` 和审计日志（`plan`、`planSkill`）里。判断期间界面会先收到「正在判断用什么技能…」。
- 界面上回答上方显示「本次：权益投放分析 · 回答 · 理由」，点「换一个」可以**改用别的技能重新回答**，或**在回答与报告之间切换**（改成报告时沿用对话里已有的事实）。用户手动选择了技能时不显示。
- 请求参数：`planner: false` 关闭判断；`output: "answer"` 明确不要报告（优先于文字里的「周报」等说法）；`output: "report"` 明确要报告。

### 报告提速

- 报告慢的主因不是提示词，而是**模型的思考**：线上实测周报输入只有约 5,000 tokens，但输出里 78% 是推理 token。写报告是把已有事实排版成文，所以**生成报告时默认压低 / 关闭模型思考**（`scripts/thinking-control.cjs`）：声明了 low 档的模型用 `reasoning_effort=low`，千问用 `enable_thinking=false`，智谱 / Kimi / DeepSeek / 豆包等用 `thinking: {type: "disabled"}`，不认识的模型不改变行为；上游拒绝这些参数时自动去掉重试。`PORTAL_REPORT_THINKING=on` 可恢复默认思考。`meta.reasoningEffort` 会显示 `low` / `off`。
- **限定篇幅**：每个模板有字数上限（通用 700、周报 900、复盘 900、口径说明 800，表格最多 2 个），写进提示词——输出越短越快。
- **精简提示词与事实**：报告提示词不再带场景名、数据表说明、门户配置说明、取数用的缺省值和前几轮的回答摘要；事实去掉每次取数都重复的口径说明 / 负责人 / 读法和空值，重复的口径提示与草稿口径合并成一段（账本里存的原件不变，数字回查仍用原件）。

- **取数循环的思考**：选工具、取数的后续步骤同样不需要深度推理。环境变量 `PORTAL_LOOP_THINKING`：`on`（默认，不改变行为）/ `after-first`（第一步保留思考、决定怎么查之后的步骤关闭）/ `off`（每一步都关）。
  线上评测里 `off` 会让「问到数值该先取数」「「白驹」两种口径都查」这类指令遵循偶发退化，所以不建议；`after-first` 见评测对比。取数循环的提示里还写明「问到具体数值必须先取数」。请求参数 `loopThinking` 可覆盖，评测脚本用 `--loop-thinking`。

### 可组合的工具：归因与血缘

- 工具箱里除了取数（`list_metrics` / `query_metric`），还有 **`attribute_change`**（指标为什么变了）和 **`get_lineage`**（上下游血缘），在任何技能的对话里都能被模型按需调用，和权益口径等知识包组合使用。
- `attribute_change` 由代码确定性计算，模型只解释：加法指标给出各维度下各组占总变化的比例；比率指标（CPA、ROI、签约率…）拆成**结构效应**（分母占比变了，例如停投、放量）、**效率效应**（自身比率变了）和「分母为零的分组的影响」，三部分之和严格等于总变化，每个维度都会核对；
  维度按「前几名能解释多少变化」排序，可以先用 `filters` 限定到某个部门 / 账号再拆。固定口径（只取两类套餐、自营 ROI 只算常规套餐）同样生效。
- 归因与血缘的结果和取数结果一样进证据账本，之后「整理成异动复盘」直接用，不用重新计算。
- 「指标异动诊断」Skill 仍保留原来的整表归因流程（适用于没有语义层指标的表）；问到权益等有语义层口径的业务时，会自动走上面的组合方式。

### 按需报告（输出类 Skill）

- 对话默认是简短回答，**不是报告**。只有用户明确要（「出个周报」「整理成文档」「复盘一下」），或点回答下方的「📝 整理成报告」选模板，才调用**报告生成 Skill**（`skill-packs/report-writer/`，`kind: output`，不出现在技能选择里）。
- 报告**基于对话里已经取到并核实的事实**写，不重新取数：每次分析的取数结果存进**证据账本**（`DATA_DIR/evidence/<requestId>.json`，只有产生它的账号能读，不存参考资料，保留 14 天、最多 2000 条）。
  说「把上面的分析…」或点按钮时直接用账本；没有已有事实时先取数再写；说「再加上伯都…出周报」会在已有事实上补取。
- 模板（`skill.json` 的 `spec.templates`）：通用分析报告、周报、异动复盘、口径说明；每个模板是一组带写作要求的章节，没有内容的章节省略。`GET /v1/report/templates` 返回清单。
- 报告同样做数字回查；审计日志里这次分析带 `output: report`、`template`、`basedOn`（用了几次已有取数）。
- 追问和「整理成报告」不会再触发「先选业务线」的澄清面板（上下文已有）。

### 用量、配额与审计

- 每人每日分析次数 / token 上限：环境变量 `PORTAL_DAILY_REQUEST_LIMIT`（默认 200）、`PORTAL_DAILY_TOKEN_LIMIT`（默认 200 万），`0` 表示不限；
  超限返回 429。管理员可运行时调整：`PUT /v1/quota`（全员或按人覆盖，保存在 `DATA_DIR/quota-config.json`）；`GET /v1/usage` 看自己的今日用量，`GET /v1/usage/all`（管理员）看全员。
- **默认模型**：管理员在「运营中心 → 默认模型」设置（`PUT /v1/default-model`），其次环境变量 `DEFAULT_MODEL`，最后内置值；
  配置的模型被停用或不可用时自动退回到清单里的第一个可用模型。
- **运营中心**（管理员）：用量与配额、审计日志（按类型 / 账号 / 状态筛选）、回答反馈（好评 / 差评与按模型 / Skill 汇总）、账号管理、默认模型。
- 审计日志 `DATA_DIR/analysis-audit.jsonl`（每行一条 JSON）：每次分析（谁、问题前 300 字、模型、Skill、工具模式、表、token、耗时、结果）、
  每次工具调用（含被拒绝的）、密码修改、权限变更。
- 审计日志超过 8MB（环境变量 `AUDIT_MAX_BYTES` 可调）自动换新文件，旧的按时间命名留档，只保留最近 5 份。
- **健康检查**：`GET /healthz`（无需登录）；Dockerfile 自带 `HEALTHCHECK`，`docker ps` 能看到 healthy / unhealthy。
- **数据备份**：`bash scripts/deploy.sh` 在重建容器前会把数据卷打包到服务器项目目录的 `backups/`（保留最近 14 份，权限 600，已加入 `.gitignore`）；
  数据在宿主机目录时也可用 `scripts/backup-data.sh` 配合 crontab。备份里含密钥与密码哈希，不要提交到 Git。
- 回答反馈：界面回答下方的 👍 / 👎（👎 可附原因），`POST /v1/feedback`；只能评价自己的分析。管理员 `GET /v1/feedback` 查看明细与按模型 / Skill 的汇总。

### 评测

`evals/cases.json` 是一组黄金问题（指标数字、比率口径、权限、提示词注入、未定义指标、追问、归因…）。标准答案由平台按口径算出（`POST /v1/metrics/query`），
评测检查报告是否引用了这些数字，权限类用例检查「无权限的数字不能出现」，并统计 token 与耗时。

```bash
EVAL_PASSWORD=<评测账号密码> npm run eval -- --base http://localhost:8787 --models gpt-5.6-sol,gpt-6-sol
# 选项：--filter <用例 id 片段>  --baseline evals/baseline.json（相对基线出现回退时退出码为 1）
```

会调用真实模型，会消耗 token；换模型、改提示词或 Skill 之后建议跑一遍。评测账号需要能登录且所有账号使用同一密码（本地测试环境用 `PORTAL_INITIAL_PASSWORD` 即可）。

### 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/v1/models` | 中转站可用模型列表（已过滤图像/语音模型） |
| POST | `/v1/analyze` | 发起分析，入参 `{ question, scenario, tables, model, stream, toolMode }`（身份取自登录令牌）；流式时先推送 `started / status / tool` 事件，再推送回答与 `done` |
| POST | `/v1/auth/login` · `/v1/auth/password` · GET `/v1/auth/me` | 登录、改密码、当前身份（含权限组与可用数据表） |
| GET / PUT | `/v1/org` | 权限组与账号分组（PUT 仅管理员） |
| GET | `/v1/metrics` · POST `/v1/metrics/query` | 当前用户可用的业务指标；按口径直接查询指标 |
| GET | `/v1/usage` · `/v1/usage/all` · PUT `/v1/quota` | 用量与配额 |
| POST / GET | `/v1/feedback` | 提交反馈；管理员查看列表与汇总 |
| GET | `/v1/audit` | 审计日志（管理员）：`type` / `user` / `status` / `limit` 筛选，最近的在前，只读日志末尾 |
| GET / POST / PATCH | `/v1/accounts` · `/v1/accounts/:name` · POST `/v1/accounts/:name/reset-password` | 账号管理（管理员） |
| PUT | `/v1/default-model` | 设置 / 清除默认模型（管理员） |

## 服务器部署（推荐：容器自带页面托管 + Caddy HTTPS）

网关现在**同源托管前端页面与分享页**（`/` 与 `/share.html?id=…`），报告分享链接用你自己的域名即可直接打开，同事无需登录。

```bash
# 1. 服务器上安装 Docker + Docker Compose 插件
# 2. 把域名 A 记录解析到服务器（如 data.example.com -> 服务器 IP），等待生效
# 3. 获取代码并配置环境
git clone <本仓库> && cd 观星台原型
cp .env.example .env
vim .env        # 填入 RELAY_API_KEY 与 DOMAIN（如 data.example.com）
# 4. 启动（首次自动申请 HTTPS 证书）
docker compose -f docker-compose.prod.yml up -d --build
```

访问 `https://<域名>/` 即完整的观星台（页面 + 灵犀智析分析 + 分享链接）。

> 服务器上已有其他项目占用 80/443（如已有 Caddy）时，把观星台域名加进既有 Caddy，
> 并用叠加文件启动（要求外部网络 `jianguang_internal` 存在）：
> `sudo docker compose -f docker-compose.prod.yml -f docker-compose.jianguang.yml up -d --build`

### 需要服务器放行的端口

- 80/443（Caddy，对外 HTTPS）；网关 8787 为容器内部端口，无需对公网开放。

### 域名解析（腾讯云 DNSPod 可选脚本）

```bash
# 本机 ~/.tc-dns.json 放 { "secretId": "...", "secretKey": "..." }（子账号仅授权 dnspod 即可），或使用环境变量
node scripts/tc-dns.cjs add --domain example.com --sub ai --ip <服务器IP> --ttl 600
# 域名不在腾讯云注册时，先 query 拿到 NS 记录，再去注册商修改 NS
node scripts/tc-dns.cjs query --domain example.com
```

也可以在腾讯云控制台「云解析 DNS → 解析」手动添加 A 记录，效果相同。

### 用服务器 IP 快速试（无域名）

```bash
docker compose up -d --build        # 网关跑在 8787，页面与 API 同源托管
```

访问 `http://<服务器IP>:8787/` 即可，功能与域名部署一致（无 HTTPS）。

## 模型配置：供应商接入 + 模型总表

「模型配置」页只做两件事：**看全部可用模型、开关模型**；所有模型来源都在右上角「供应商配置」抽屉里维护。

- **中转站也是供应商**：首次启动时按环境变量 `RELAY_BASE_URL` / `RELAY_API_KEY`（多个 Key 用逗号分隔）
  自动迁移成一条普通供应商记录 `prov-relay`（名称「内置中转站」，带 `内置` 标签），
  之后与自配供应商共用同一套表单、接口与路由，不再有特例通道；迁移只做一次，删掉后重启不会复活。
- **预设模板 + 自定义**：DeepSeek / 月之暗面 Kimi / 智谱 GLM / 阿里百炼 Qwen / 火山方舟 ARK /
  OpenAI 官方 / 本地 Ollama·vLLM / Anthropic 原生 / 自定义（OpenAI 兼容）。
  协议下拉只暴露 **OpenAI 兼容 / Anthropic 原生** 两类，鉴权方式按协议自动推断，
  自建网关要特殊 header 时到「高级设置」里覆盖。
- **常见 Key 类型**：`Authorization: Bearer`、`x-api-key`（自动补 `anthropic-version`）、`x-goog-api-key`、
  `api-key`（Azure，可填 api-version）、URL 查询参数、自定义 Header。
- **一个 Key 一条供应商**：环境变量里多个 `RELAY_API_KEY` 时，首次迁移会按 Key 拆成多条记录
  （「内置中转站 · 1/2/3」），每条只带自己的 Key 与自己的模型清单——公司中转站的多个 Key 往往对应
  不同厂商（DeepSeek / GPT / 百炼），合成一条会把不同厂商的模型混在一起、也没法分别命名与停用。
- **一键拆分**：已经是一条多 Key 的供应商，在「供应商配置」列表里点「拆分 Key」，
  逐个 Key 命名后即拆成多条，各自拉取模型清单与连通性；模型开关按模型名保留。
- **多 Key 轮换**（同一账号的备用 Key）：API Key 每行一个，最多 10 个；按「该模型上次成功的 Key」优先重试。
- **拉取模型 + 连通性测试**：按协议请求 `{base}/models`（Anthropic 走 `/v1/models?limit=1000`、Gemini 走 `/v1beta/models`），
  失败原因按 401/403、404/405、429、5xx 分别提示，不会把「鉴权失败」误报成「没有模型」；
  模型清单为空的供应商会在后台自动补拉一次。
- **Key 只写不读**：`DATA_DIR/providers.json`（权限 0600）保存，接口只回显掩码与 Key 个数（如 `sk-••••7890 等 2 个 Key`）。
- **路由规则**：模型按「供应商列表顺序优先」路由——同名模型取列表里第一个声明它的供应商；
  OpenAI 兼容 / ARK / 自定义 / Azure / Anthropic 原生（走 `/v1/messages`，请求、响应与流式都会在网关里翻译成
  OpenAI 形状）都能参与调用；Gemini 等仍只登记与测试，模型不会进入灵犀智析下拉框。
- **停用供应商 = 它的模型一起消失**：供应商「启用」关闭后，它下面的模型整条退出「全部可用模型」
  与灵犀智析下拉框，抬头计数只统计启用中的供应商；清单空了会说明是哪些供应商停用、隐藏了多少个模型、
  去哪里恢复（`GET /v1/model-config` 的 `hiddenProviders` 驱动空态与提示）。行内启停只提交 `{ enabled }`，
  不会被「模型清单为空」的校验挡住。
- **模型能力（上下文 + 思考深度）**：「能选什么」按模型声明，「这次用哪档」由用户在灵犀智析输入框选。
  列表页每行有「上下文」「思考深度」两列（`已配` / `推断` 标出值是手配还是按模型名推断），行内「能力」
  可改上下文上限（32K…1M 或自定义）与思考档位（快速/标准/深度，一个都不勾 = 不支持思考）。
  覆盖值存在 `DATA_DIR/model-config.json` 的 `models` 里，走 `PUT /v1/model-config/:id`（带 `enabled`
  才改启停，只存能力不会把模型停掉）；`GET /v1/models` 的 `details` 会带上 `contextLimit` 与 `reasoning`。
  灵犀智析只渲染该模型支持的档位（不支持的模型不显示「深度」），换模型时沿用用户上次的选择
  （`localStorage.portalReasoningPref`），窗口大小只读显示、不摆 token 滑杆；网关侧还会按声明过滤
  `reasoning_effort`（流式与非流式两条路径都过滤）。

接口：`GET/POST /v1/providers`、`PUT/DELETE /v1/providers/:id`、`POST /v1/providers/test`、`POST /v1/providers/:id/refresh`。
