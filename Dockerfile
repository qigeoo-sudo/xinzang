# Dockerfile — 腾讯云 CloudBase 部署
# Next.js standalone 模式

# ===== Stage 1: deps =====
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
# Alpine 使用 musl libc，明确指定平台以安装正确的 SWC 二进制
RUN npm_config_platform=linux npm_config_arch=x64 npm_config_libc=musl npm ci

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

# 生成生产数据库（含 schema + 知识卡 seed）
RUN mkdir -p /app/data \
 && DATABASE_URL="file:/app/data/prod.db" npx prisma db push --skip-generate \
 && DATABASE_URL="file:/app/data/prod.db" npx tsx prisma/seed-mentor-kb.ts \
 && DATABASE_URL="file:/app/data/prod.db" npx tsx prisma/seed-winnie-kb.ts

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
# 信任 CloudBase 代理转发的 Host 头（需确保代理层正确配置 X-Forwarded-Host）
ENV AUTH_TRUST_HOST=true
# AUTH_URL 和 AUTH_SECRET 必须在 CloudBase 控制台环境变量中设置
# AUTH_URL: 外部访问地址（如 https://aihr.top）
# AUTH_SECRET: JWT 签名密钥，未设置时启动会失败

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

# Prisma schema + 知识卡数据（启动时自动 seed 需要）
COPY --from=builder /app/prisma ./prisma

# Prisma CLI + tsx — 用于启动时 db push 和知识卡 seed（幂等）
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/tsx ./node_modules/tsx
COPY --from=builder /app/node_modules/get-tsconfig ./node_modules/get-tsconfig
COPY --from=builder /app/node_modules/resolve-pkg-maps ./node_modules/resolve-pkg-maps

# 复制已初始化 schema + 知识卡的生产数据库
RUN mkdir -p /app/data
COPY --from=builder --chown=nextjs:nodejs /app/data ./data

# 确保数据目录可写
RUN chown -R nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

# 构建阶段已完成 db push + 知识卡 seed，直接启动 Next.js
# （CloudBase 无持久卷，每次部署都是全新镜像，无需启动时重复 seed）
CMD ["node", "server.js"]
