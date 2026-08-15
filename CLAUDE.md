# AI Career Companion - 项目上下文

> 本文件供 AI 助手快速理解项目状态，新会话开始时请先阅读此文件。

## 项目概述

AI 职业伴侣平台 — 通过 AI 职导访谈 + 行业导师 AI 分身，为高校学生提供求职指导。

**当前版本：在校生专用版（v2-student-only）**

## 技术栈

- **前端**: Next.js 14 (App Router) + React + TypeScript
- **后端**: Next.js API Routes (Node.js Runtime)
- **数据库**: SQLite (Prisma ORM)，文件位于 `prisma/dev.db`
- **认证**: NextAuth.js v5 (JWT 策略，Credentials Provider)
- **AI**: DeepSeek API (`deepseek-chat` 模型)
- **支付**: 支付宝 + 微信支付（Mock 模式）

## 快速启动

```bash
npm install          # 安装依赖（含 postinstall: prisma generate）
npx prisma db push   # 同步数据库 schema
npm run dev          # 启动开发服务器 (localhost:3000)
```

环境变量见 `.env.example`，实际开发配置在 `.env.local`。

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

## 待办 / 已知问题

- AI 职导问卷流程当前为在校生专用版，如需恢复在校/在职/待业分支，需修改 `src/lib/mentors.ts` 中的 `personalityPrompt` 和 `src/components/mentor-chat.tsx` 中的 `AI_GUIDE_VERSION`
- 支付宝支付为沙箱环境，上线前需切换正式配置
- 暂无自动化测试
