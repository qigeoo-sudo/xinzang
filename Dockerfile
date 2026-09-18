# Dockerfile — 火山引擎 ECS Docker 部署
# Next.js standalone 模式

# ===== Stage 1: deps =====
FROM node:25-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
# Alpine 使用 musl libc，明确指定平台以安装正确的 SWC 二进制
RUN npm_config_platform=linux npm_config_arch=x64 npm_config_libc=musl npm ci
# 显式安装 musl 版 SWC，防止 Next.js build 时找不到二进制
RUN npm install @next/swc-linux-x64-musl --save-optional
# 显式安装 musl 版 sharp：standalone 模式的 next/image 图片优化必须有 sharp，
# 否则线上每张优化图片都会报 'sharp' is required to be installed in standalone mode
RUN npm install @img/sharp-linuxmusl-x64 --save-optional

# ===== Stage 2: builder =====
FROM node:25-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="file:/tmp/build.db"
RUN npx prisma generate
RUN npx prisma db push --skip-generate
RUN npm run build

# 生成生产数据库（含 schema + 六位规范导师 339 张知识卡 seed）
RUN mkdir -p /app/data \
 && DATABASE_URL="file:/app/data/prod.db" npx prisma db push --skip-generate \
 && DATABASE_URL="file:/app/data/prod.db" npx tsx prisma/seed-knowledge-cards.ts

# ===== Stage 3: runner =====
FROM node:25-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# --- 运行时必需的环境变量（服务器上通过 docker run --env-file 注入） ---
# SQLite 数据库路径 — 容器内持久化目录（生产挂载宿主机卷 /opt/xinzang-data:/app/data）
ENV DATABASE_URL="file:/app/data/prod.db"
# 信任前置代理（Nginx 等）转发的 Host 头
ENV AUTH_TRUST_HOST=true
# AUTH_URL 和 AUTH_SECRET 必须在宿主机 /opt/xinzang/.env 中设置
# AUTH_URL: 外部访问地址（如 https://aihr.top）
# AUTH_SECRET: JWT 签名密钥，未设置时启动会失败

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Next.js standalone 构建
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# public 静态资源（头像等）— standalone 不会自动包含
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# 导师治理资产（运行时只读：全局 policy + 六位导师 persona prompt md）
# cards/*.jsonl 仅构建期 seed 使用，不进运行镜像（避免内部来源/置信度等元数据随镜像分发）
COPY --from=builder --chown=nextjs:nodejs \
  /app/content/knowledge-governance/GLOBAL_MENTOR_SYSTEM_POLICY.md \
  /app/content/knowledge-governance/prompts \
  ./content/knowledge-governance/

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
# 生产数据通过宿主机挂载卷持久化（-v /opt/xinzang-data:/app/data）
CMD ["node", "server.js"]
