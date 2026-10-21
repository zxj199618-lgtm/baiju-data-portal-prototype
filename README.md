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

- 登录页默认是「密码登录」，会记住上次登录的账号（不记密码；浏览器自带的密码管理器可以自动填充）。
- **本地演示登录**：本机开发时设置 `PORTAL_DEMO_LOGIN_PASSWORD=<账号共用密码>`，登录页会出现账号快捷按钮，点一下自动填密码并登录。
  这会把密码公开给任何访问者，默认关闭，**只能用于本机，不要在服务器上设置**（启动时会打印警告）。
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
- **归因**：指标异动的维度贡献、CPA 的结构 / 效率效应由代码确定性计算（`scripts/attribution-calc.cjs`），模型只负责解释。
- **数字回查**：报告里的数字会对照证据与问题，找不到的写进 `meta.numericCheck`，界面在回答下方提示「N 个数字未在证据中找到」。
- **追问**：信息不足时模型调用 `ask_user`，平台校验（最多 3 题、每题 2–6 个选项）后以问题卡片展示；用户已补充信息后不再提供该工具。

### 用量、配额与审计

- 每人每日分析次数 / token 上限：环境变量 `PORTAL_DAILY_REQUEST_LIMIT`（默认 200）、`PORTAL_DAILY_TOKEN_LIMIT`（默认 200 万），`0` 表示不限；
  超限返回 429。管理员可运行时调整：`PUT /v1/quota`（全员或按人覆盖，保存在 `DATA_DIR/quota-config.json`）；`GET /v1/usage` 看自己的今日用量，`GET /v1/usage/all`（管理员）看全员。
- 审计日志 `DATA_DIR/analysis-audit.jsonl`（每行一条 JSON）：每次分析（谁、问题前 300 字、模型、Skill、工具模式、表、token、耗时、结果）、
  每次工具调用（含被拒绝的）、密码修改、权限变更。
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
