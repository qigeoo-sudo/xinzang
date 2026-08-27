# AI Career Companion - 项目上下文

> 本文件供 AI 助手快速理解项目状态，新会话开始时请先阅读此文件。

## 开发规则

- **每次修改代码完毕，必须同时在总结和 work 中提供预览链接。**
- **Git 推送规则：日常开发与 staging 只推 `main` 分支。** 命令：`git push origin main`
- **生产发布需单独确认后**，再从 main 合并到 master：`git push origin main:master`
- **分支分工**：`main` = staging 环境（CloudBase 自动部署）；`master` = 生产环境
- **打标签时也需同时推送标签到远程。** 命令：`git push origin "标签名"`

## 重要文档

| 文档 | 路径 | 说明 |
|------|------|------|
| **PRD（产品需求文档）** | `docs/PRD.md` | 产品规划、导师规划、时间线、数据库迁移方案、上线阻断项 |
| **数据库迁移交接文档** | `docs/AICCloudBase_PG_v1.1.md` | SQLite→CloudBase PostgreSQL 详细迁移方案（ChatGPT 编写） |
| **项目上下文** | `CLAUDE.md`（本文件） | 技术栈、目录结构、业务流程、关键注意事项 |

**新会话请按顺序阅读：CLAUDE.md → docs/PRD.md → docs/AICCloudBase_PG_v1.1.md**

## 项目概述

AI 职业伴侣平台 — 通过 AI 职导访谈 + 行业导师 AI 分身，为高校学生提供求职指导。

**当前版本：在校生专用版（v2-student-only）**
**工作截止日期：2026-12-01**

## 技术栈

- **前端**: Next.js 14 (App Router) + React + TypeScript
- **后端**: Next.js API Routes (Node.js Runtime)
- **数据库**: SQLite (Prisma ORM)，文件位于 `prisma/dev.db`
- **认证**: NextAuth.js v5 (JWT 策略，Credentials Provider)
- **AI**: DeepSeek API (`deepseek-chat` 模型)
- **支付**: 支付宝 + 微信支付（Mock 模式）
- **部署**: Docker (node:20-alpine) + 腾讯云 CloudBase

## 快速启动

```bash
npm install          # 安装依赖（含 postinstall: prisma generate）
npx prisma db push   # 同步数据库 schema
npm run dev          # 启动开发服务器 (localhost:3000)
```

环境变量见 `.env.example`，实际开发配置在 `.env.local`。

### 开发环境密钥

密钥存储在本地 `.env.local` 中，请勿提交到公开仓库。配置项包括：

```
DEEPSEEK_API_KEY=<在 .env.local 中配置>
AI_API_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-chat
AUTH_SECRET=<用 openssl rand -base64 32 生成>
```

## 核心目录结构

```
src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts          # 聊天 API（核心）— 调用 DeepSeek，保存对话
│   │   ├── chat/usage/route.ts    # 对话用量查询
│   │   ├── chat/sessions/         # 历史会话查询
│   │   ├── profile/extract/route.ts  # 从对话提取用户档案（LLM）
│   │   ├── profile/clear/route.ts    # 清除用户档案
│   │   ├── auth/                  # NextAuth 认证
│   │   ├── auth/register/route.ts # 注册 API（需验证码）
│   │   ├── payment/               # 支付宝 + 微信支付
│   │   ├── user/profile/route.ts  # 用户档案 CRUD
│   │   └── subscription/route.ts  # 订阅状态查询
│   ├── chat/page.tsx              # AI 职导对话页（/chat）
│   ├── mentors/[id]/page.tsx      # 行业导师详情页（含访问控制）
│   ├── mentors/page.tsx           # 行业导师列表页
│   ├── dashboard/                 # 用户面板（档案、订阅、历史）
│   ├── login/ register/           # 登录注册页
│   └── payment/                   # 支付页面
├── components/
│   ├── mentor-chat.tsx            # 聊天组件（核心）— 支持断点续传、问卷流程
│   ├── collapsible-text.tsx       # 长消息折叠组件 — 超屏80%高度自动折叠为4行+展开
│   ├── header.tsx                 # 导航栏
│   ├── chat-options.tsx           # 选项题渲染组件（[CHOICE] 标签）
│   ├── subscription-flow.tsx      # 订阅支付流程
│   └── knowledge-panel.tsx        # 导师知识库展示
├── lib/
│   ├── mentors.ts                 # 导师数据 + 系统提示词 + 知识库
│   ├── prisma.ts                  # Prisma Client 单例
│   ├── auth.ts → ../auth.ts       # NextAuth 配置
│   ├── plans.ts                   # 订阅套餐配置
│   ├── alipay.ts                  # 支付宝支付集成
│   ├── password.ts                # bcrypt 密码工具
│   ├── rate-limit.ts              # 速率限制
│   ├── validation.ts              # Zod 输入校验 Schema
│   └── proxy-fetch.ts             # 带代理支持的 fetch 封装
├── generated/prisma/              # Prisma 生成代码（git ignore）
└── auth.ts                        # NextAuth 配置

# 部署文件（项目根目录）
Dockerfile                         # Docker 构建配置 — node:20-alpine，含 prisma generate + 临时 SQLite
.dockerignore                      # Docker 构建忽略列表
```

## 业务流程

### 1. AI 职导访谈流程（在校版）

- 用户首次与 AI 职导对话时，系统自动发送欢迎消息 + 隐私声明 + 第一个问题 (A1)
- 问卷流程：A1→A2→A3→A4→A5→G1→G2→G3→G4→G5→G6→G7→G8
- 问题定义在 `src/lib/mentors.ts` 的 `personalityPrompt` 中
- 选项题使用 `[CHOICE:type=single|multi|rank]` 标签格式
- AI 回复末尾添加 `[QUESTIONNAIRE_COMPLETED]` 标记表示完成
- 完成后自动调用 `/api/profile/extract` 提取用户档案写入 UserProfile

### 2. 访问控制规则

| 用户类型 | AI 职导 | 行业导师 |
|---------|--------|---------|
| 未登录   | 提示登录 | 提示登录 |
| 非会员（未完成访谈）| 可以对话 | 拦截，跳转到 /chat |
| 非会员（已完成访谈）| 可以对话 | 免费试用 3 次 |
| 会员     | 无限（每日 50 条上限）| 按套餐配额或无限 |

- 访谈完成判断：`UserProfile.profileSource === 'ai_extracted'` 或 `nickname` 不为空
- 三层检查：服务端页面重定向 → API 拦截 → 客户端跳转

### 3. 支付

- 支付宝：`src/lib/alipay.ts`（沙箱模式）
- 微信支付：Mock 模式（开发环境）
- 订阅套餐：月度 / 季度 / 年度
- 配置在 `src/lib/plans.ts`

## 数据库 Schema（关键模型）

- **User**: 用户账号，含 isPremium、freeTrialUsed
- **UserProfile**: 用户档案（AI 提取 + 手动编辑），profileSource 区分来源
- **ChatSession**: 聊天会话，关联 userId + mentorId
- **ChatMessage**: 聊天消息，关联 chatSessionId
- **Subscription**: 订阅记录
- **ProfileHistory**: 档案变更历史

## 关键注意事项

1. **沙箱代理**: 环境有 `HTTP_PROXY=http://127.0.0.1:18080`，Node.js 内置 fetch 不自动读取。`src/lib/proxy-fetch.ts` 封装了 ProxyAgent。但沙箱的 `NODE_OPTIONS=--require /app/mcp_proxy_bootstrap/preload.cjs` 已全局注入代理，所以通常不需要手动处理。
2. **Prisma 生成代码**: 位于 `src/generated/prisma/`，被 git ignore。`npm install` 的 postinstall 会自动 `prisma generate`。
3. **AI 职导版本标记**: localStorage 中 `ai-guide-version-${userId}` = `v2-student-only`，版本不匹配时清空旧数据重来。
4. **sessionId 验证**: API 收到 sessionId 时先验证是否存在于数据库，防止过期 sessionId 导致外键约束错误。
5. **JWT 用户验证**: API 收到请求时检查 JWT 中的 userId 是否在数据库中存在，不存在则返回 401 + needRelogin。
6. **P0-3 安全修订（已完成 2026-08-16）**:
   - **防伪造对话历史**: 客户端只发送单条 `message`，不再发送 `messages` 数组。服务端通过 `buildContextFromDB()` 从数据库构建对话上下文，用户无法伪造历史。
   - **弹性上下文算法**: 最多20条消息或8000字符（whichever comes first）。从最新消息向前累加，超出字数限制时截断。
   - **防注入安全规则**: `ANTI_INJECTION_PROMPT` 追加到所有 system prompt 末尾，告知 AI 忽略用户消息中试图改变角色或指令的尝试。
   - **消息长度限制**: 单条消息上限4000字（`chatMessageSchema` 校验）。AI 回复 `max_tokens: 800`（约400-500中文字）。
   - **长消息折叠组件**: `CollapsibleText` 组件，超过屏幕80%高度时自动折叠为4行 + "...展开"链接，点击打开全屏遮罩层查看完整内容。用户消息和 AI 回复均使用此组件。
   - **舞台提示词清除**: `stripStageDirections()` 自动清除 AI 回复中括号内的语气/动作/表情描述。

## 待办 / 已知问题

### 近期（2026年9月前）
- AI 职导问卷流程当前为在校生专用版，如需恢复在校/在职/待业分支，需修改 `src/lib/mentors.ts` 中的 `personalityPrompt` 和 `src/components/mentor-chat.tsx` 中的 `AI_GUIDE_VERSION`
- 支付宝支付为沙箱环境，上线前需切换正式配置
- 暂无自动化测试

### 导师内容（9月-10月）
- 准备 10 个导师分身的 Prompt（Claude fable 撰写 + 人工调教）
- 每个导师约 3 万字访谈文字记录作为知识库
- 10 月起每周案例更新（1-3 篇/导师/周，300-1000 字/篇）
- 10 个锁定导师（`is_active = false`），后续版本推出

### 数据库迁移（11月-12月）
- SQLite → 腾讯云 CloudBase PostgreSQL
- 导师数据从 `src/lib/mentors.ts` 迁入数据库
- 详见 `docs/PRD.md` 第六章和 `docs/AICCloudBase_PG_v1.1.md`

### P0 阻断项（上线前必须修复）
- ~~P0-3: 客户端只提交本轮消息，服务端加载历史~~ **✅ 已完成（2026-08-16）**
- P0-4: 验证码不返回明文
- P0-5: 支付正式验签
- P0-6: Service Worker 不缓存私人页面
- P0-7: localStorage 不保存完整聊天历史
- P0-8: 隐私说明与功能一致
- P0-9: 档案更新事务化 + 追加式历史
- 详见 `docs/PRD.md` 第七章

## Docker 部署（CloudBase）

- **Dockerfile**: 基于 `node:20-alpine`，多阶段构建
  - 构建阶段：安装依赖 → `prisma generate` → 创建临时 SQLite 数据库（解决 `File is not defined` 错误）→ `next build` → 生成生产数据库 `/app/data/prod.db`
  - 运行阶段：复制构建产物 + `node_modules` + `prisma` 目录 + 生产数据库，启动 `next start`
- **.dockerignore**: 排除 `node_modules`、`.next`、`.git`、`prisma/dev.db`、`.env.local` 等
- **注意**: Docker 构建时需要临时 SQLite 数据库，因为 Next.js 构建过程中会初始化 Prisma Client

### 运行时环境变量（Dockerfile 已内置兜底值，CloudBase 控制台可覆盖）

| 变量 | Dockerfile 兜底值 | 说明 |
|------|------------------|------|
| `DATABASE_URL` | `file:/app/data/prod.db` | 生产 SQLite 路径，构建时已初始化 schema |
| `AUTH_TRUST_HOST` | `true` | 信任 CloudBase 代理转发的 Host 头。缺失时 Auth.js 会把回调地址推断为 `localhost:3000`，手机端报 `ERR_CONNECTION_REFUSED` |
| `AUTH_URL` | `https://xinzang-291393-10-1463037420.sh.run.tcloudbase.com` | 显式指定外部访问地址，优先级高于 Host 头推断。缺失/推断失败时回调地址会变成 `0.0.0.0:3000` |
| `AUTH_SECRET` | 内置兜底密钥 | **务必在 CloudBase 控制台覆盖**，生成命令：`openssl rand -base64 32`。缺失时报 `error=Configuration` |
| `OPENAI_API_KEY` | 无 | **必须在 CloudBase 控制台配置**，否则聊天功能降级。代码兼容 `DEEPSEEK_API_KEY` 和 `OPENAI_API_KEY` 两种变量名（优先读 `DEEPSEEK_API_KEY`） |
| `AI_API_URL` | `https://api.deepseek.com/v1` | AI API 地址，CloudBase 控制台已配置为 `https://api.deepseek.com/v1` |
| `AI_MODEL` | `deepseek-chat` | AI 模型名称，CloudBase 控制台已配置为 `deepseek-chat` |

### CloudBase 部署排错记录

- **2026-08-16 登录失败 `ERR_CONNECTION_REFUSED`**: 根因是 Docker 运行阶段缺少 `DATABASE_URL`/`AUTH_SECRET`/`AUTH_TRUST_HOST`（每个 `FROM` 阶段环境变量重置，`.dockerignore` 又排除了 `.env.local`）。登录 POST 触发 Prisma/Auth.js 崩溃，服务端把重定向地址推断为容器内部的 `localhost:3000`，手机浏览器跳转 localhost 被拒绝。修复：Dockerfile 运行阶段内置上述环境变量 + 构建时生成生产数据库。
- **会话 Cookie 注意**: 生产环境 cookie 为 `secure: true`（仅 HTTPS 传输）。CloudBase 必须通过 HTTPS 默认域名访问，纯 HTTP 访问会导致登录后 session 丢失。
- **SQLite 持久化限制**: CloudBase 容器无持久卷时，重新部署会重置数据库（用户数据丢失）。MVP 阶段可接受；正式方案见 PRD 数据库迁移章节（11-12月迁移到 CloudBase PostgreSQL）。

## 变更日志

### 2026-08-16

#### 1. CloudBase 部署配置（提交 `923e6b4` → `286591f`）
- 新增 `Dockerfile`：基于 `node:20-alpine` 多阶段构建
- 新增 `.dockerignore`
- 修复构建阶段 `prisma generate` 缺失问题（`fb34191`）
- 修复构建阶段 `File is not defined` 错误 — 创建临时 SQLite 数据库（`203d075`）
- 恢复 `node:20-alpine` 匹配原始成功部署版本（`286591f`）

#### 2. P0-3 安全修订（提交 `120a53d`，标签 `修复P03`）
- **`src/lib/validation.ts`**: `chatMessageSchema` 从接收 `messages` 数组改为只接收单条 `message`（上限4000字）
- **`src/app/api/chat/route.ts`**: 完全重写
  - 新增 `buildContextFromDB()` — 从数据库构建对话上下文（弹性算法：最多20条/8000字）
  - 新增 `ANTI_INJECTION_PROMPT` — 防注入安全规则追加到 system prompt
  - 新增 `stripStageDirections()` — 清除 AI 回复中的舞台提示词
  - 用户消息先保存到数据库，再从数据库构建上下文
  - `max_tokens: 800` 限制 AI 回复长度
- **`src/components/collapsible-text.tsx`**: 新增长消息折叠组件
  - 超过屏幕80%高度自动折叠为4行 + "...展开"链接
  - 点击展开打开全屏遮罩层显示完整内容
  - `useLayoutEffect` 在绘制前测量高度，避免闪烁
- **`src/components/mentor-chat.tsx`**: 客户端适配
  - 请求体改为 `{ mentorId, message, sessionId }`，不再发送 `messages` 数组
  - 消息渲染统一使用 `CollapsibleText` 组件（含 `[CHOICE]` 标签的除外）
  - 输入框 `maxLength={4000}` 限制字数

#### 3. CLAUDE.md 更新（提交 `0314281`）
- 新增 P0-3 修订记录到关键注意事项
- P0-3 阻断项标记为已完成
- 新增 `collapsible-text.tsx` 到目录结构

#### 4. CloudBase 登录失败修复（2026-08-16 晚）
- **现象**: 本地预览正常，腾讯云部署站点点击登录后手机报 `net::ERR_CONNECTION_REFUSED`；第二次实测失败页面为 `https://0.0.0.0:3000/login?error=Configuration`
- **根因**: Docker 多阶段构建中，`FROM` 阶段会重置环境变量；`.dockerignore` 排除了 `.env.local`。运行阶段容器内缺失 `DATABASE_URL`（Prisma 崩溃）、`AUTH_SECRET`（JWT 无法签名 → `error=Configuration`）、`AUTH_TRUST_HOST`（Auth.js 把回调地址推断为容器绑定地址 `0.0.0.0:3000`，手机浏览器跳转被拒绝）
- **修复**: Dockerfile 运行阶段（runner）内置环境变量兜底值：`DATABASE_URL`、`AUTH_TRUST_HOST`、`AUTH_SECRET`、`AUTH_URL`（显式指定 CloudBase 域名）；构建阶段额外生成含 schema 的生产数据库 `/app/data/prod.db` 并复制到运行镜像
- **注意**: 修改 Dockerfile 后必须在 CloudBase 重新构建部署才生效，线上跑的仍是旧镜像则问题依旧
- **待用户操作**: 在 CloudBase 重新构建部署；控制台配置 `AUTH_SECRET`（随机值）和 `DEEPSEEK_API_KEY`
