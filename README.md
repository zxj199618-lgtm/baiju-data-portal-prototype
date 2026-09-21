# 观星台原型

管理后台交互原型（静态页面）+ AI 分析网关（Node.js）。

## 本地开发

```bash
# 原型页面（任选一种）
python3 -m http.server 8080        # 或 npx serve .
# 打开 http://localhost:8080

# 测试
npm test
```

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

### 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/v1/models` | 中转站可用模型列表（已过滤图像/语音模型） |
| POST | `/v1/analyze` | 发起分析，入参 `{ user, question, scenario, tables, model }` |

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

## 模型配置：自配供应商接入

「模型配置」除了列内置中转站的模型，还支持接入自己的供应商（参考 CC Switch / DeepSeek Harness 的配置方式）：

- **预设模板 + 自定义**：DeepSeek / Kimi / 智谱 GLM / 百炼 Qwen / 火山方舟 ARK / OpenAI / Anthropic / Gemini / Azure OpenAI / 本地 Ollama / 自定义。
- **常见 Key 类型**：`Authorization: Bearer`、`x-api-key`（自动补 `anthropic-version`）、`x-goog-api-key`、`api-key`（Azure，可填 api-version）、URL 查询参数、自定义 Header。
- **拉取模型 + 连通性测试**：按协议请求 `{base}/models`（Anthropic 走 `/v1/models?limit=1000`、Gemini 走 `/v1beta/models`），失败原因按 401/403、404/405、429、5xx 分别提示，不会把「鉴权失败」误报成「没有模型」。
- **Key 只写不读**：`DATA_DIR/providers.json`（权限 0600）保存，接口只回显掩码（如 `sk-••••7890`），页面不再显示明文。
- **分析路由**：模型按「自配供应商优先」路由——同名模型命中已启用供应商时走该供应商的 Base URL 与 Key；OpenAI 兼容 / ARK / 自定义 / Azure 可参与调用，Anthropic、Gemini 等原生协议只登记与测试，模型不会进入灵犀智析下拉框。

接口：`GET/POST /v1/providers`、`PUT/DELETE /v1/providers/:id`、`POST /v1/providers/test`、`POST /v1/providers/:id/refresh`。
