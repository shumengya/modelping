# modelping · 萌芽Ping

在 Cloudflare Workers 上运行的大模型 API **流式首字延迟**与**可用性**监控面板：React + Vite 前端（Static Assets CDN）+ D1 存储（默认保留 30 天探测记录）+ 每分钟 Cron 调度。

## 目录结构

- [`frontend/`](frontend/)：React 前端（入口 [`frontend/index.html`](frontend/index.html)、源码 [`frontend/src/`](frontend/src/)）；根目录 [`vite.config.ts`](vite.config.ts) 将 `root` 指向此处，[`public/`](public/) 仍为静态资源目录。
- [`worker/`](worker/)：Cloudflare Worker — Hono API、D1、加密与定时探测调度；入口见 [`wrangler.json`](wrangler.json) 的 `main` 字段。

## 功能概要

- 管理端配置：API 根地址、API Key、模型名、协议（**OpenAI Chat Completions 经典** / **OpenAI Responses 新版** / Claude Anthropic）。
- 探测间隔：1、5、10、30、60、360（分钟）。
- 公开仪表盘：24h / 30d 可用率、按日时间条、最近状态码与首字延迟。
- 管理员入口：访问 **`/admin?token=<ADMIN_TOKEN>`**（与 `.dev.vars` / Secrets 中 `ADMIN_TOKEN` 一致即可，示例 `your-strong-token`）。校验通过后 token 写入当前浏览器 `sessionStorage`，并自动 **`replace` 到 `/admin`**（从地址栏去掉 token，减少泄露）。
- 一键部署：`pnpm build && wrangler deploy`（Cloudflare Vite 插件会自动使用 `dist/modelping` 构建产物与资源目录）。

## 前置条件

- Node.js 20+
- Cloudflare 账号与 [Wrangler](https://developers.cloudflare.com/workers/wrangler/) 登录（`pnpm exec wrangler login`）

## 初始化 D1

```bash
pnpm exec wrangler d1 create modelping
```

将输出中的 `database_id` 写入根目录 [`wrangler.json`](wrangler.json) 里 `d1_databases[0].database_id`（替换 `replace-with-your-d1-database-id`）。

应用迁移（本地与远程各执行一次按你开发需要；升级含「OpenAI 新版 Responses」协议时请确保已执行最新 SQL）：

```bash
pnpm exec wrangler d1 migrations apply modelping --local
pnpm exec wrangler d1 migrations apply modelping --remote
```

## 密钥与环境变量

| 变量 | 说明 |
|------|------|
| `ADMIN_TOKEN` | 管理 API Bearer Token；本地可复制 [`.dev.vars.example`](.dev.vars.example) 为 `.dev.vars`。生产务必执行 `pnpm exec wrangler secret put ADMIN_TOKEN`。 |
| `ENCRYPTION_KEY` | 可选。32 字节 Base64，或任意字符串（将做哈希派生）。不设时，用 `ADMIN_TOKEN` 派生加密密钥（仅建议用于内网/演示）。 |

本地开发：

```bash
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars
```

## 开发与部署

```bash
pnpm install
pnpm dev
```

生产构建与部署：

```bash
pnpm run deploy
```

等价于 `tsc -b && vite build && wrangler deploy`。Wrangler 会使用重定向后的 `dist/modelping/wrangler.json` 上传 Worker 与 `dist/client` 静态资源。

## 连接 Cloudflare 自动部署（Workers Builds）

`git push` 后由 Cloudflare 自动构建并部署。**注意：Workers Builds 只支持 GitHub / GitLab，不支持自建 Gitea**，所以请连接 GitHub 仓库（如 `shumengya/modelping`）。

### 1. 在 Dashboard 建立连接

已有 Worker：`Workers & Pages` → 选中 `modelping` → `Settings` → `Builds` → `Connect`。
新建 Worker：`Workers & Pages` → `Create application` → `Import a repository`。

首次连接需授权 Cloudflare 的 GitHub App，只勾选本仓库即可。

### 2. 构建设置

| 设置项 | 值 |
|--------|-----|
| Production branch | `main` |
| Root directory | `.` |
| Build command | `pnpm run build` |
| Deploy command | `npx wrangler deploy`（默认值即可） |
| Preview / 非生产分支 | 默认 `npx wrangler preview`；暂无独立 D1 预览库时建议关闭非生产分支构建 |

说明：`vite build` 经 `@cloudflare/vite-plugin` 生成 `dist/modelping/wrangler.json` 与 `.wrangler/deploy/config.json`，因此 `wrangler deploy` 会自动重定向到构建产物配置，**不需要**手写 `--config`。Worker 名称必须与 `wrangler.json` 的 `name`（`modelping`）一致。

依赖安装由 Workers Builds 自动完成：识别 `pnpm-lock.yaml`，并按 `packageManager` 字段安装 `pnpm@11.21.0`；Node 版本由 [`.node-version`](.node-version) 固定为 `24.21.0`（构建镜像自带）。

### 3. 运行时密钥（只需设置一次）

```bash
pnpm exec wrangler secret put ADMIN_TOKEN
pnpm exec wrangler secret put ENCRYPTION_KEY   # 可选
```

Workers Builds 设置里的 `Build variables and secrets` 只对构建过程可见，**不会**注入运行时；`.dev.vars` 也不会随仓库上传。Secret 归 Worker 所有，自动部署不会覆盖它。

### 4. D1 迁移不会自动执行

改了 `migrations/*.sql` 后，需在本地对远程库执行一次：

```bash
pnpm run db:migrate:remote
```

若希望构建阶段顺带迁移，把 Deploy command 改成：

```bash
pnpm exec wrangler d1 migrations apply DB --remote && npx wrangler deploy
```

非交互环境下 Wrangler 会跳过确认并自动备份。但 Workers Builds 自动创建的 API Token 默认不含 D1 权限，需到 `My Profile` → `API Tokens` 自建一个包含 **D1: Edit** 的 Token，并在 `Settings → Builds → API token` 中选用。

### 5. 验证

推送后进入 Worker 的 `Deployments` → `View build history` 查看日志；成功后可访问 `*.workers.dev` 或自定义域名。构建失败时优先看：Worker 名称是否匹配、`pnpm-lock.yaml` 是否提交、Secret 是否已设置。

### 可选：改用 GitHub Actions

若不想用 Workers Builds，也可在 GitHub 侧用 `cloudflare/wrangler-action` 部署（需在仓库 Secrets 配置 `CLOUDFLARE_API_TOKEN` 与 `CLOUDFLARE_ACCOUNT_ID`），命令为 `pnpm install --frozen-lockfile && pnpm run build` 后执行 `wrangler deploy`。两条链路不要同时启用，避免重复部署。

## 出现「服务端未配置 ADMIN_TOKEN」（503）怎么修

含义：当前运行的 Worker **读不到** `ADMIN_TOKEN`（既不是 Secret，本地也没从 `.dev.vars` 注入）。

**线上（你已 `wrangler deploy` 的网站）**

`.dev.vars` **只对本地 dev 有效**，不会跟着部署上去。在项目目录执行：

```bash
pnpm exec wrangler secret put ADMIN_TOKEN
```

按提示粘贴与 URL 里一致的口令（例如 `your-strong-token`）。成功后无需改代码，再访问 `/admin?token=...` 即可。

也可使用快捷脚本：`pnpm secret:admin`（同上，仍是交互式输入 Secret）。

**本地（`pnpm dev`）**

1. 项目根目录必须有 **`.dev.vars`**，且**第一行**建议直接写：`ADMIN_TOKEN=你的口令`（不要先写一大段注释，部分环境解析更稳）。
2. 保存后 **关掉 dev 再重新执行** `pnpm dev`。
3. 浏览器访问的必须是 dev 打印出的地址（如 `http://localhost:5173/admin?token=你的口令`），不要误用线上域名或 `vite preview` 的静态站（可能没有 Worker）。

## 管理员登录排障（`/admin?token=...` 进不去）

1. 打开浏览器 **开发者工具 → Network**，访问 `/admin?token=你的口令`，查看 **`/api/admin/ping`**：  
   - **（失败 / 无记录）**：当前页面没有打到本项目的 Worker。本地请使用 **`pnpm dev`**（Cloudflare Vite 插件会同时起前端与 Worker）；不要只用纯静态预览访问，否则没有 `/api/*`。  
   - **503 + `admin_token_not_configured`**：Worker 上 **没有可用的 `ADMIN_TOKEN`**。本地检查项目根目录 **`.dev.vars`** 并重启 dev；已部署环境必须执行 **`pnpm exec wrangler secret put ADMIN_TOKEN`**（`.dev.vars` **不会**随 `deploy` 传到线上）。  
   - **401**：请求里的 token 与 `ADMIN_TOKEN` **不一致**（含多余空格时，服务端与 URL 两侧已做 trim，但仍需内容一致）。  
   - **200**：校验已通过；若仍停在说明页，请看 **Application → Session Storage** 是否写入 `modelping_admin_token`，并尝试硬性刷新或排除扩展拦截。

2. 未登录页面上方如显示 **红色提示条**，即为本次 URL 校验失败原因（此前固定文案下不会显示，容易造成「后台没做」的误解）。

## 默认内网口令（仅示例）

请使用强随机字符串作为 `ADMIN_TOKEN`（如 `openssl rand -hex 24` 生成），并在本地 `.dev.vars` 与线上 Secret 保持一致。**不要将真实 Token 提交进仓库。**

## API 摘要

| 方法 | 路径 | 认证 | 说明 |
|------|-----|------|------|
| GET | `/api/monitors` | 无 | 公开列表与聚合统计 |
| GET | `/api/monitors/:id` | 无 | 单条详情 |
| GET | `/api/admin/ping` | `Authorization: Bearer <ADMIN_TOKEN>` | 校验 Token |
| GET/POST/PUT/DELETE | `/api/admin/monitors`… | Bearer | 增删改监控；`POST .../:id/run` 立即探测一次 |

## 备注

- 探测 Cron 为每 5 分钟 `*/5 * * * *`，在 Worker 内根据 `next_run_at` 决定是否真正发起外呼；过期探测记录在每日 `03:00 UTC` 那次触发里顺带清理（Free 计划每账号仅 5 个 Cron 触发额度，故只保留一条）。
- 探测使用 `stream: true`，以**首个内容增量**到达时间作为首字延迟。
- Worker 脚本体积请保持精简；前端由 CDN 提供，整体符合常见 Workers 体积限制实践。

## 许可证

MIT（若需其他许可证请自行替换。）
