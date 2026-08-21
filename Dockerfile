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

# 生成生产数据库（含 schema）
RUN mkdir -p /app/data \
 && DATABASE_URL="file:/app/data/prod.db" npx prisma db push --skip-generate

# ===== Stage 3: runner =====
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# --- 运行时必需的环境变量（CloudBase 控制台可覆盖） ---
# SQLite 数据库路径 — 容器内持久化目录
ENV DATABASE_URL="file:/app/data/prod.db"
# 信任 CloudBase 代理转发的 Host 头
ENV AUTH_TRUST_HOST=true
# 显式指定外部访问地址
ENV AUTH_URL="https://xinzang-291393-10-1463037420.sh.run.tcloudbase.com"
# 兜底密钥 — 强烈建议在 CloudBase 控制台环境变量中覆盖
ENV AUTH_SECRET="fallback-secret-please-override-in-cloudbase-console-Kx9mQ2vT7wZ4nB8c"

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Next.js standalone 构建
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# public 静态资源（头像等）— standalone 不会自动包含
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma 引擎二进制文件 — standalone 构建可能未包含
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/src/generated/prisma ./src/generated/prisma

# bcryptjs — 外部化后需要单独复制
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/bcryptjs ./node_modules/bcryptjs

# Prisma schema（运行时可能需要）
COPY --from=builder /app/prisma ./prisma

# 复制已初始化 schema 的生产数据库
RUN mkdir -p /app/data
COPY --from=builder --chown=nextjs:nodejs /app/data ./data

# 确保数据目录可写
RUN chown -R nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
