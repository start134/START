# 多阶段构建：依赖 → 构建 → 运行时镜像
# 数据卷：/app/data（SQLite + 备份）、/app/public/uploads（上传的图片）
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# 运行时只需要 node_modules（含 better-sqlite3 原生模块）、构建产物与静态资源
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
VOLUME ["/app/data", "/app/public/uploads"]
EXPOSE 3000
CMD ["npm", "run", "start"]
