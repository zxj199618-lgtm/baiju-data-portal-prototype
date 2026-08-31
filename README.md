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

## 服务器部署（给开发 / 测试 / UI 演示）

```bash
git clone <本仓库> && cd 观星台原型
cp .env.example .env             # 填入 RELAY_API_KEY
docker compose up -d --build     # 网关跑在 8787

# 静态页面用任意静态服务器，例如：
docker run -d --name guanxingta-web -p 8080:80 \
  -v "$PWD":/usr/share/nginx/html:ro nginx:alpine
```

访问 `http://<服务器IP>:8080` 即为原型页面，灵犀智析（分析工作台）会自动连接同机的 8787 网关。
生产环境建议在前面加一层 Nginx 把 `/v1/*` 反代到网关，避免跨端口。
