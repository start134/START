# 部署指南

## 架构一句话

数据层是 **SQLite 单文件数据库**（`data/app.db`，better-sqlite3 + WAL），
首次启动会自动把旧版 JSON 数据迁移进库（原文件重命名为 `*.migrated.json` 留底）。
**必须部署在有持久化磁盘的 Node 主机上**（VPS / Railway / Render 挂卷 / 自托管 Docker）。
**Vercel 等 Serverless 平台仍然不支持**：无持久文件系统，数据会丢。

## 方式一：Docker Compose（推荐）

最省心，环境一致，一条命令起停。

```bash
# 1. 拿代码
git clone https://github.com/start134/START.git blog && cd blog

# 2. 配置环境变量
cp .env.docker.example .env.docker
vim .env.docker          # 至少改 ADMIN_PASSWORD

# 3. 构建并启动（自动建库 + 迁移旧数据）
docker compose up -d --build

# 4. 查看日志 / 更新 / 停止
docker compose logs -f
git pull && docker compose up -d --build   # 更新版本
docker compose down                        # 停止（数据在 ./data 与 ./public/uploads，不丢）
```

默认监听 3000 端口，前面用 Nginx/Caddy 反代并配 HTTPS（生产 Cookie 带 `secure`，必须走 HTTPS）。

Caddy 最简反代（自动 HTTPS）：

```
your-domain.com {
    reverse_proxy 127.0.0.1:3000
}
```

## 方式二：VPS 手动部署

```bash
# Node 22+（better-sqlite3 需要）
node -v

git clone https://github.com/start134/START.git blog && cd blog
npm ci

# 环境变量（二选一：.env.local 或进程管理器注入）
cp .env.docker.example .env.local
vim .env.local

npm run build
npm run start            # 默认 3000，PORT 环境变量可改
```

用 pm2 守护：`pm2 start npm --name blog -- run start`。

## 环境变量

| 变量名 | 必填 | 说明 |
|---|---|---|
| `ADMIN_PASSWORD` | **生产必填** | 管理员登录密码。未配置时登录接口直接返回 503，不存在默认密码回退 |
| `NEXT_PUBLIC_SITE_URL` | 建议 | 如 `https://your-domain.com`，用于 sitemap / RSS / OG 卡片的 URL 拼接 |
| `SESSION_SECRET` | 可选 | 会话签名密钥；不设置时从 `ADMIN_PASSWORD` 派生。更换会使所有登录态失效 |
| `BARK_URL` | 可选 | iOS Bark 推送（含 Key），有新评论时推送 |
| `SERVERCHAN_SENDKEY` | 可选 | Server酱 SendKey，微信收到新评论推送 |
| `RESEND_API_KEY` + `NOTIFY_EMAIL` | 可选 | Resend 邮件通知；`NOTIFY_FROM` 可自定义发件人 |

推送渠道按需配置（可多选），全部不配置时评论只进站内通知，不影响功能。

## 数据与备份

- **数据库**：`data/app.db`（WAL 模式会同时产生 `app.db-wal` / `app.db-shm`，备份时三个一起拷，或停服后拷贝）
- **上传图片**：`public/uploads/`
- **自动备份**：每天首次有访客时自动做 SQLite 一致快照到 `data/backups/backup-*.db`，保留最近 7 份
- **手动备份**：管理后台「仪表盘 → 数据备份」一键导出 JSON（格式与导入接口兼容，可跨库迁移）

全量备份命令：

```bash
tar czf backup-$(date +%F).tgz data/ public/uploads/
```

## 从旧版 JSON 数据升级

无需手动操作：启动新版本后首次访问会自动把 `data/posts.json`、`comments.json`、
`notifications.json`、`stats.json` 迁入 `app.db`，原文件改名 `*.migrated.json` 留底。
确认数据无误后可自行删除留底文件。

## 本地开发

```bash
npm install
npm run dev        # http://localhost:3000
```

本地未配置 `ADMIN_PASSWORD` 时使用开发默认密码 `123456`（仅开发环境）。

## 注意事项

1. **不要部署到 Vercel**（Serverless 无持久磁盘，数据会丢；上文有说明）
2. **生产必须配置 `ADMIN_PASSWORD`**：这是登录唯一凭证，请使用强密码
3. **HTTPS 必须有**：生产 Cookie 带 `secure` 标记
4. **单实例运行**：SQLite 面向单进程；如需多实例请先改造为外部数据库（PostgreSQL 等）
5. **内置限流**：登录失败 5 次/15 分钟锁定（按 IP）、评论 5 条/10 分钟（按 IP），进程内实现，重启清零
6. **CI**：push 到 main 会自动跑类型检查 + 生产构建（.github/workflows/ci.yml），红了先修再部署
