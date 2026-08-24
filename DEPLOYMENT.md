# Vercel 部署指南

## 部署步骤

### 1. 准备工作

确保您已安装 Vercel CLI：
```bash
npm install -g vercel
```

### 2. 推送代码到 GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/您的用户名/STARTweb.git
git push -u origin main
```

### 3. 在 Vercel 上导入项目

1. 访问 [vercel.com](https://vercel.com) 并登录
2. 点击 "Add New Project" → 选择您的 GitHub 仓库
3. Framework 会自动检测为 Next.js
4. 点击 "Deploy"

### 4. 配置环境变量

在 Vercel 项目设置 → Environment Variables 中添加：

| 变量名 | 说明 | 示例 |
|---|---|---|
| `ADMIN_PASSWORD` | 管理员登录密码 | `您的强密码` |

### 5. 配置 Vercel KV（阅读量统计）

1. 项目设置 → Storage → Create → KV Database
2. 创建后会自动注入 `KV_REST_API_URL` 和 `KV_REST_API_TOKEN` 环境变量
3. 代码会自动检测 Vercel 环境并使用 KV

### 6. 配置 Vercel Blob（文章数据，可选）

如果您需要多实例间共享文章数据：

1. 项目设置 → Storage → Create → Blob Store
2. 创建后会自动注入 `BLOB_READ_WRITE_TOKEN` 环境变量
3. 在代码中使用 `lib/storage.ts` 的抽象接口

## 本地开发 vs 生产环境

| 功能 | 本地开发 | Vercel 生产 |
|---|---|---|
| 文章存储 | `data/posts.json` | Vercel Blob（自动） |
| 阅读量统计 | `data/stats.json` / SQLite | Vercel KV（自动） |
| 认证 Token | 内存 Map | 内存 Map（单实例可接受） |
| 环境变量 | `.env.local` | Vercel 控制台配置 |

## 自定义域名

1. 在 Vercel 项目 → Settings → Domains
2. 添加您的域名（如 `yourblog.com`）
3. 按提示配置 DNS 记录
4. Vercel 自动签发 SSL 证书

## 有用的命令

```bash
# 本地开发
npm run dev

# 构建生产版本
npm run build

# 部署到 Vercel
vercel

# 部署到生产环境
vercel --prod

# 查看日志
vercel logs
```

## 注意事项

1. **Vercel 文件系统是只读的**：`data/` 目录在 Vercel 上无法写入，代码已自动切换到 Blob/KV
2. **SQLite 不适合 Vercel**：Vercel 的函数实例之间不共享文件系统，SQLite 数据会丢失
3. **认证 Token**：Vercel 多实例部署时，内存 Token 不共享。管理员可能需要重新登录。如需持久化，建议使用 Vercel KV 存储 Token
4. **免费额度**：Vercel Hobby 版提供 100GB 带宽/月，KV 1GB，Blob 1GB，对个人博客完全够用
