# 部署指南

## 重要：先读这一段

本项目当前的数据层是**本地 JSON 文件**（`data/posts.json`、`data/comments.json`、
`data/stats.json` 等），加进程内写锁。这意味着：

- **必须部署在有持久化磁盘的 Node 主机上**（VPS、Railway / Render 等挂载磁盘的服务、
  自托管 Docker），文章、评论、统计才能持久保存。
- **Vercel 等无持久文件系统的 Serverless 平台当前不受支持**：`data/` 目录写不进去
  （或写了在实例重启后丢失），发文章会"看似成功、重启即消失"。
  此前文档提到的 Vercel Blob / KV 自动切换**尚未实现**——代码里没有任何 Blob/KV 逻辑。
  如要上 Vercel，需先把 `lib/storage.ts` / `lib/posts-store.ts` / `lib/kv-stats.ts`
  的数据层替换为 Blob/KV/数据库实现。
- 数据层为单实例设计（进程内锁 + 文件存储），请以**单实例**方式运行；
  多实例需要共享数据库。
- 会话是无状态 HMAC 签名 Cookie（见 `lib/auth.ts`），不依赖服务端存储，
  重启/多实例不会导致登录态丢失；修改 `ADMIN_PASSWORD` 会让所有已登录会话失效。

## 部署步骤（Node 主机）

### 1. 准备环境

- Node.js 20+（与本地开发版本一致）
- 建议用 pm2 或 systemd 守护进程

### 2. 获取代码并安装依赖

```bash
git clone <你的仓库地址> STARTweb
cd STARTweb
npm install
npm run build
```

### 3. 配置环境变量

创建 `.env.local`（或用进程管理器注入环境变量）：

| 变量名 | 必填 | 说明 |
|---|---|---|
| `ADMIN_PASSWORD` | **生产必填** | 管理员登录密码。生产环境未配置时登录接口直接返回 503，不存在默认密码回退 |
| `NEXT_PUBLIC_SITE_URL` | 建议 | 如 `https://yourblog.com`，用于 sitemap / RSS / OG 卡片的 URL 拼接 |
| `SESSION_SECRET` | 可选 | 会话签名密钥；不设置时从 `ADMIN_PASSWORD` 派生 |
| `BARK_URL` | 可选 | iOS Bark 推送地址（含 Key），有新评论时推送 |
| `SERVERCHAN_SENDKEY` | 可选 | Server酱 SendKey，微信收到新评论推送 |
| `RESEND_API_KEY` + `NOTIFY_EMAIL` | 可选 | Resend 邮件通知；`NOTIFY_FROM` 可自定义发件人 |

推送渠道按需配置（可多选），全部不配置时评论只进站内通知，不影响功能。

### 4. 启动

```bash
npm run start   # 默认 3000 端口，可用 PORT 环境变量修改
```

用 Nginx / Caddy 反代并配置 HTTPS（`secure` Cookie 要求生产走 HTTPS）。

### 5. 数据备份

所有数据都在 `data/` 目录下，备份该目录即可：

```bash
tar czf backup-$(date +%F).tgz data/
```

系统自带**每日自动备份**：每天第一次有访客访问时，自动把全部数据打包到
`data/backups/backup-YYYYMMDD-HHmmss.json`，保留最近 7 份。该目录也在 `data/` 下，
随上面的命令一并备份。管理后台「仪表盘 → 数据备份」还提供手动一键导出 / 导入。

**注意**：编辑器上传的图片保存在 `public/uploads/`，不在 `data/` 里，备份时一并处理：

```bash
tar czf backup-full-$(date +%F).tgz data/ public/uploads/
```

## 本地开发

```bash
npm install
npm run dev     # http://localhost:3000
```

本地未配置 `ADMIN_PASSWORD` 时使用开发默认密码 `123456`（仅开发环境；
`.env.local` 已在 .gitignore 中，不会提交）。

## 有用的命令

```bash
npm run dev     # 本地开发
npm run build   # 构建生产版本
npm run start   # 启动生产服务
npx tsc --noEmit  # 类型检查（构建时也会执行）
```

## 注意事项

1. **不要部署到 Vercel**（当前代码）：Serverless 文件系统不持久，数据会丢。
   上文"重要"一节有详细说明。
2. **生产必须配置 `ADMIN_PASSWORD`**：这是登录的唯一凭证，请使用强密码。
3. **内置限流**：登录失败 5 次/15 分钟锁定（按 IP）；评论 5 条/10 分钟（按 IP）。
   均为进程内实现，重启后计数清零。
4. **HTTPS**：生产环境 Cookie 带 `secure` 标记，请确保通过 HTTPS 访问。
