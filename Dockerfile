# Dockerfile — 腾讯云 CloudBase 部署
# Next.js standalone 模式

# ===== Stage 1: deps =====
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm ci

# ===== Stage 2: builder =====
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="file:/tmp/build.db"
RUN npx prisma generate
RUN npx prisma db push --skip-generate
RUN npm run build

# 生成生产数据库（含 schema）— 供运行阶段使用
RUN mkdir -p /app/data \
 && DATABASE_URL="file:/app/data/prod.db" npx prisma db push --skip-generate

# ===== Stage 3: runner =====
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# --- 运行时必需的环境变量（CloudBase 控制台可覆盖） ---
# SQLite 数据库路径 — 容器内持久化目录
ENV DATABASE_URL="file:/app/data/prod.db"
# 信任 CloudBase 代理转发的 Host 头，让 Auth.js 构建正确的外部访问地址
# （缺失时 Auth.js 会把回调地址推断为 localhost:3000 → 手机端 ERR_CONNECTION_REFUSED）
ENV AUTH_TRUST_HOST=true
# 兜底密钥 — 强烈建议在 CloudBase 控制台环境变量中覆盖为自己的随机值
# 生成命令: openssl rand -base64 32
ENV AUTH_SECRET="fallback-secret-please-override-in-cloudbase-console-Kx9mQ2vT7wZ4nB8c"

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
# 复制已初始化 schema 的生产数据库
COPY --from=builder --chown=nextjs:nodejs /app/data ./data

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
