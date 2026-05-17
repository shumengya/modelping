# modelping · 萌芽Ping

在 Cloudflare Workers 上运行的大模型 API **流式首字延迟**与**可用性**监控面板：React + Vite 前端（Static Assets CDN）+ D1 存储（默认保留 30 天探测记录）+ 每分钟 Cron 调度。

## 功能概要

- 管理端配置：API 根地址、API Key、模型名、协议（**OpenAI Chat Completions 经典** / **OpenAI Responses 新版** / Claude Anthropic）。
- 探测间隔：1、5、10、30、60、360（分钟）。
- 公开仪表盘：24h / 30d 可用率、按日时间条、最近状态码与首字延迟。
- 管理员入口：访问 **`/admin?token=<ADMIN_TOKEN>`**（与 `.dev.vars` / Secrets 中 `ADMIN_TOKEN` 一致即可，示例 `shumengya520`）。校验通过后 token 写入当前浏览器 `sessionStorage`，并自动 **`replace` 到 `/admin`**（从地址栏去掉 token，减少泄露）。
- 一键部署：`npm run build && wrangler deploy`（Cloudflare Vite 插件会自动使用 `dist/modelping` 构建产物与资源目录）。

## 前置条件

- Node.js 20+
- Cloudflare 账号与 [Wrangler](https://developers.cloudflare.com/workers/wrangler/) 登录（`npx wrangler login`）

## 初始化 D1

```bash
npx wrangler d1 create modelping
```

将输出中的 `database_id` 写入根目录 [`wrangler.json`](wrangler.json) 里 `d1_databases[0].database_id`（替换 `replace-with-your-d1-database-id`）。

应用迁移（本地与远程各执行一次按你开发需要；升级含「OpenAI 新版 Responses」协议时请确保已执行最新 SQL）：

```bash
npx wrangler d1 migrations apply modelping --local
npx wrangler d1 migrations apply modelping --remote
```

## 密钥与环境变量

| 变量 | 说明 |
|------|------|
| `ADMIN_TOKEN` | 管理 API Bearer Token；本地可复制 [`.dev.vars.example`](.dev.vars.example) 为 `.dev.vars`。生产务必执行 `npx wrangler secret put ADMIN_TOKEN`。 |
| `ENCRYPTION_KEY` | 可选。32 字节 Base64，或任意字符串（将做哈希派生）。不设时，用 `ADMIN_TOKEN` 派生加密密钥（仅建议用于内网/演示）。 |

本地开发：

```bash
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars
```

## 开发与部署

```bash
npm install
npm run dev
```

生产构建与部署：

```bash
npm run deploy
```

等价于 `tsc -b && vite build && wrangler deploy`。Wrangler 会使用重定向后的 `dist/modelping/wrangler.json` 上传 Worker 与 `dist/client` 静态资源。

## 出现「服务端未配置 ADMIN_TOKEN」（503）怎么修

含义：当前运行的 Worker **读不到** `ADMIN_TOKEN`（既不是 Secret，本地也没从 `.dev.vars` 注入）。

**线上（你已 `wrangler deploy` 的网站）**

`.dev.vars` **只对本地 dev 有效**，不会跟着部署上去。在项目目录执行：

```bash
npx wrangler secret put ADMIN_TOKEN
```

按提示粘贴与 URL 里一致的口令（例如 `shumengya520`）。成功后无需改代码，再访问 `/admin?token=...` 即可。

也可使用快捷脚本：`npm run secret:admin`（同上，仍是交互式输入 Secret）。

**本地（`npm run dev`）**

1. 项目根目录必须有 **`.dev.vars`**，且**第一行**建议直接写：`ADMIN_TOKEN=你的口令`（不要先写一大段注释，部分环境解析更稳）。
2. 保存后 **关掉 dev 再重新执行** `npm run dev`。
3. 浏览器访问的必须是 dev 打印出的地址（如 `http://localhost:5173/admin?token=你的口令`），不要误用线上域名或 `vite preview` 的静态站（可能没有 Worker）。

## 管理员登录排障（`/admin?token=...` 进不去）

1. 打开浏览器 **开发者工具 → Network**，访问 `/admin?token=你的口令`，查看 **`/api/admin/ping`**：  
   - **（失败 / 无记录）**：当前页面没有打到本项目的 Worker。本地请使用 **`npm run dev`**（Cloudflare Vite 插件会同时起前端与 Worker）；不要只用纯静态预览访问，否则没有 `/api/*`。  
   - **503 + `admin_token_not_configured`**：Worker 上 **没有可用的 `ADMIN_TOKEN`**。本地检查项目根目录 **`.dev.vars`** 并重启 dev；已部署环境必须执行 **`npx wrangler secret put ADMIN_TOKEN`**（`.dev.vars` **不会**随 `deploy` 传到线上）。  
   - **401**：请求里的 token 与 `ADMIN_TOKEN` **不一致**（含多余空格时，服务端与 URL 两侧已做 trim，但仍需内容一致）。  
   - **200**：校验已通过；若仍停在说明页，请看 **Application → Session Storage** 是否写入 `modelping_admin_token`，并尝试硬性刷新或排除扩展拦截。

2. 未登录页面上方如显示 **红色提示条**，即为本次 URL 校验失败原因（此前固定文案下不会显示，容易造成「后台没做」的误解）。

## 默认内网口令（仅示例）

本地示例默认 Admin Token 为 `shumengya520`。**线上环境请在 Dashboard 或 `wrangler secret put` 修改为强随机字符串。**

## API 摘要

| 方法 | 路径 | 认证 | 说明 |
|------|-----|------|------|
| GET | `/api/monitors` | 无 | 公开列表与聚合统计 |
| GET | `/api/monitors/:id` | 无 | 单条详情 |
| GET | `/api/admin/ping` | `Authorization: Bearer <ADMIN_TOKEN>` | 校验 Token |
| GET/POST/PUT/DELETE | `/api/admin/monitors`… | Bearer | 增删改监控；`POST .../:id/run` 立即探测一次 |

## 备注

- Cron 表达式为每分钟 `* * * * *`，在 Worker 内根据 `next_run_at` 与 `interval_minutes` 决定是否真正发起外呼。
- 探测使用 `stream: true`，以**首个内容增量**到达时间作为首字延迟。
- Worker 脚本体积请保持精简；前端由 CDN 提供，整体符合常见 Workers 体积限制实践。

## 许可证

MIT（若需其他许可证请自行替换。）
