# AI Career Companion — 产品需求文档（PRD）

**版本：** v3.0
**日期：** 2026-09-20
**当前状态：** 生产已部署临时公网（aihr.top），正式域名 + ICP 备案预计至少一个月后上线，届时重新解析到新域名；待完成 RDS MySQL 迁移后上正式公网
**前置文档：** [CLAUDE.md](../CLAUDE.md)（项目上下文，新会话先读）
**历史版本：** v2.0（2026-08-15，已废弃）、v1.0（ChatGPT 编写，已废弃）

> 本次重写基于 2026-09-20 实际代码状态。旧版 PRD 中 CloudBase PostgreSQL 迁移路线已被火山引擎 RDS MySQL 取代，旧导师分身三表设计已被 MentorKnowledgeCard 单表取代。详见 [docs/AICCloudBase_PG_v1.1.md](./AICCloudBase_PG_v1.1.md)（已 archived）。

---

## 一、产品概述

**榨职机（AI Career Companion）** 是通过 AI 职导访谈 + 行业导师 AI 分身，为高校学生提供求职指导的平台。

- **目标用户：** 高校在校生（大三、大四为主）
- **核心价值：** 通过 AI 职导访谈了解用户背景，推荐匹配的行业导师分身进行深度对话
- **商业模式：** 免费试用 + 会员订阅（月/季/年）+ 多榨包加购，支持支付宝 + 微信支付
- **当前版本：** 在校生专用版（v2-student-only），问卷流程直接从学生问题开始
- **生产状态：** 已部署在火山引擎 ECS（aihr.top 内网），待上公网前完成 RDS MySQL 迁移

### 1.1 工作区与仓库

| 项目 | 值 |
|------|-----|
| 主工作区 | `C:\Users\bingw\Documents\trae_projects\squeezer` |
| GitHub | `https://github.com/qigeoo-sudo/xinzang.git` |
| 远程名 | `origin` |
| 默认分支 | `master`（生产）；`main`（staging） |
| 生产服务器 | 火山引擎 ECS `14.103.104.122`（aihr.top 临时公网，正式域名+ICP 至少一个月后上线） |
| 生产容器 | `xinzang`（Docker，`--restart unless-stopped` 常驻） |
| 数据卷 | 宿主机 `/opt/xinzang-data` 绑定挂载到容器 `/app/data` |
| 8G 内存 ECS | 单台，无冷启动/缩容 |

> **Git 推送规则：** 日常开发与 staging 推 `main`；生产发布单独确认后 `git push origin main:master`。

---

## 二、项目时间线

| 里程碑 | 状态 | 说明 |
|--------|------|------|
| 核心功能开发 | ✅ 已完成 | AI 职导访谈、导师分身对话、用户档案、订阅支付、PWA |
| 安全加固第一轮 | ✅ 已完成（2026-09-19） | 54 项自检：0 FAIL / 37 PASS / 7 已修复 / 2 暂缓 / 8 待真机 |
| 渠道归因一期 | ✅ 已完成（2026-09-18） | Channel 表 + /r/[code] 短链 + /admin/channels 后台 |
| 多榨包加购 | ✅ 已完成 | CREDIT_10，9折/8.5折批量折扣，余额上限 2970 |
| 会员卡压印名 | ✅ 已完成 | 年/季/月卡共用组件，压印行绝对定位 |
| 档案页改版 | ✅ 已完成 | 三按钮一行 + 清空资料两级确认弹窗 |
| 生产部署（临时公网） | ✅ 已完成 | aihr.top（临时域名），Docker 多阶段构建非 root |
| 运维加固 | ✅ 已完成 | 每日 03:30 冷备 crontab、Docker 日志轮转、部署脚本体系 |
| **RDS MySQL 迁移** | ⏳ **上公网前必做** | 见第十二章 |
| **真实环境验证 8 项** | ⏳ **上公网前必做** | 见第十章 |
| **Mock 支付关闭** | ⏳ **上公网前必做** | 真实微信支付接入后 |
| 上公网 | 📅 待定 | RDS 迁移 + 真机验证完成后 |
| 渠道归因二期 | 📋 路线图 | 分成结算规则 |
| Redis 限流 | 📋 路线图 | 多实例前提 |
| chat/route.ts 拆分 | 📋 路线图 | 当前 1100+ 行 |

---

## 三、技术栈

| 层级 | 当前实现 |
|------|---------|
| Web 框架 | Next.js 14.2 App Router + React 18 + TypeScript |
| UI | Tailwind CSS |
| PWA | `public/manifest.json` + `public/sw.js`（Network First + Cache First） |
| 认证 | Auth.js v5 + Credentials Provider + JWT（7 天过期，HttpOnly Cookie） |
| ORM | Prisma 5.22 |
| **数据库** | **SQLite**（开发 `prisma/dev.db`，生产 `/app/data/prod.db` 绑定挂载） |
| AI | DeepSeek API（`deepseek-chat`，自动映射 `deepseek-v4-flash`） |
| 支付 | 支付宝（`src/lib/alipay.ts`）+ 微信支付（`src/lib/wxpay.ts`）+ Mock（开发环境） |
| 限流 | 内存 Map + DB 三层配额兜底（周期总量/24h 滚动/加购包） |
| 部署 | Docker 多阶段构建（`node:20-alpine`，非 root）+ 火山引擎 ECS |
| 备份 | 每日 03:30 crontab 冷备，保留 14 天 |
| 密码 | bcrypt hash/compare |
| 输入校验 | Zod `safeParse` |

**密钥与配置：**
- 本地开发写入 `.env.local`（已 gitignore，参考 `.env.example`）
- 生产环境变量走 `--env-file /opt/xinzang/.env`
- AI Key 兼容 `DEEPSEEK_API_KEY`（优先）和 `OPENAI_API_KEY`
- AI API URL 白名单：deepseek/openai/moonshot（防 SSRF）

---

## 四、目录结构

```
src/
├── app/
│   ├── api/
│   │   ├── auth/                      # NextAuth + /register
│   │   ├── chat/                      # /route.ts（核心）+ /usage + /sessions/*
│   │   ├── profile/                   # /extract + /clear
│   │   ├── payment/
│   │   │   ├── orders/                # 创建/查询订单 + /orders/[id]
│   │   │   ├── notify/                # 微信回调
│   │   │   ├── notify/alipay/         # 支付宝回调（POST）
│   │   │   └── mock-pay/              # 开发环境 Mock 支付
│   │   ├── user/profile/              # 用户档案 CRUD
│   │   ├── subscription/              # 订阅状态查询
│   │   ├── admin/                     # ADMIN 鉴权（含 /channels）
│   │   └── search/                    # 知识卡检索
│   ├── chat/page.tsx                  # AI 职导对话页
│   ├── mentors/[id]/page.tsx          # 导师详情页（含访问控制）
│   ├── mentors/page.tsx               # 导师列表页
│   ├── assessment/                    # 职业兴趣测评（RIASEC）
│   ├── history/                       # 历史会话
│   ├── dashboard/                     # 用户面板（档案/订阅/历史）
│   ├── login/ register-v2/            # 登录注册页（/register 已移除）
│   ├── subscribe/ payment/            # 订阅与支付页面
│   ├── payment/mock-pay/ success/     # Mock 支付与成功页
│   ├── r/[code]/route.ts              # 渠道短链（写 httpOnly cookie）
│   └── admin/channels/                # 渠道后台（ADMIN）
├── components/
│   ├── mentor-chat.tsx                # 聊天组件（断点续传、问卷流程）
│   ├── collapsible-text.tsx           # 长消息折叠（>80% 屏高自动折叠）
│   ├── chat-options.tsx               # 选项题渲染（[CHOICE] 标签）
│   ├── subscription-flow.tsx          # 订阅支付流程（含会员卡压印名）
│   ├── knowledge-panel.tsx            # 导师知识库展示
│   └── header.tsx                     # 导航栏
├── lib/
│   ├── mentors.ts                     # 6 个静态导师 + 人格 Prompt + 知识库索引
│   ├── prisma.ts                      # Prisma Client 单例
│   ├── auth.ts → ../auth.ts           # NextAuth 配置
│   ├── plans.ts                       # 订阅套餐 + 多榨包定价
│   ├── alipay.ts                      # 支付宝集成（generateSignature 空 key 抛错）
│   ├── wxpay.ts                       # 微信支付 v3（平台证书验签）
│   ├── payment-fulfillment.ts         # 统一履约（fulfillPaidOrder）
│   ├── password.ts                    # bcrypt
│   ├── rate-limit.ts                  # 内存 Map 限流（注释标注 RDS 约束）
│   ├── validation.ts                  # Zod Schema
│   └── proxy-fetch.ts                 # 代理 fetch 封装
└── generated/prisma/                  # Prisma 生成代码（gitignore）

# 项目根
Dockerfile                             # node:20-alpine 多阶段，非 root
.dockerignore
next.config.js                         # 安全头配置（CSP/HSTS/X-Frame-Options）
deploy-scripts/                        # 部署脚本体系
├── 01-build.sh                        # 本地或服务器构建
├── 02-push.sh                         # 推送镜像
├── 03-migrate.sh                      # 数据库迁移（db push 非破坏性）
├── 04-run.sh                          # 容器启动（含日志轮转）
├── 05-verify.sh                       # 部署验证
├── 20-deploy-nodb.sh                  # 快速部署（无数据库变更）
└── 30-cron-backup.sh                  # 每日 03:30 冷备
docs/
├── PRD.md                             # 本文档
├── AICCloudBase_PG_v1.1.md            # 已 archived（旧 PG 迁移方案）
├── 安全自检报告-第一轮.md             # 2026-09-19 自检结果
├── 安全与质量自检清单.md               # 54 项可复用模板
└── 外包安全检查清单.md                 # 安全工程师外包检查清单
```

---

## 五、数据库设计

### 5.1 当前模型（14 个，SQLite）

| 模型 | 用途 |
|------|------|
| `User` | 用户账号，含 isPremium、freeTrialUsed、mentorCredits（多榨包余额）、channelId（渠道归因）、attributionJson |
| `Channel` | 渠道归因（code/name/partner/shareRate/status/landingPath） |
| `Account` | Auth.js 标准 OAuth 账户 |
| `Session` | Auth.js 标准会话 |
| `VerificationToken` | Auth.js 邮箱验证令牌 |
| `VerificationCode` | 短信/邮箱验证码（5 分钟过期，5 次尝试上限） |
| `UserProfile` | 用户档案（register-v2 注册 + 手动编辑共用） |
| `ProfileHistory` | 档案变更历史（action + snapshot JSON） |
| `InterestAssessment` | 职业兴趣测评（RIASEC 六维，一人一份重测覆盖） |
| `PaymentOrder` | 支付订单（amount Decimal，status：PENDING/PAID/FAILED/REFUNDED/EXPIRED/CANCELLED） |
| `Subscription` | 订阅记录（plan：MONTHLY/QUARTERLY/YEARLY，status：ACTIVE/EXPIRED/CANCELLED/PENDING） |
| `ChatSession` | 聊天会话（含 summary 滚动摘要、crossConsent 跨导师授权） |
| `ChatMessage` | 聊天消息（含 tokensUsed、modelUsed、hitCardIds 知识卡命中） |
| `MentorKnowledgeCard` | 导师知识卡（4 知识分类 + 3 披露方式，详见 5.3） |

### 5.2 导师分身架构决策

**保持 `MentorKnowledgeCard` 单表设计**（不迁旧 PRD 规划的 mentor_agents 三表）：

- `src/lib/mentors.ts` 保留作静态人格配置（6 个导师：lydia/winnie/tina/freya/phyllis/ying）
- 知识库通过 `MentorKnowledgeCard` 表管理，结构对齐 knowledge-governance 规范 schemaVersion 1.1
- 旧 PRD 中 `mentor_agents` + `mentor_agent_prompt_versions` + `mentor_knowledge_entries` 三表设计**已废弃**

### 5.3 MentorKnowledgeCard 知识治理

**knowledgeClass（知识分类，4 类）：**
- `internal_pending` 内部待定（disclosureMode 必须为 none，永不进用户上下文）
- `internal_approved` 内部已审（仅内部用途，永不进用户回答）
- `external_pending` 外部待终审（仅内测环境开关下放行）
- `external_approved` 外部已审（**生产唯一可检索类**）

**disclosureMode（披露方式，3 种）：** none | generalized | exact

**检索规则：**
- 生产环境只检索 `external_approved` 类
- 检索字段仅 `title` + `applicableTo`（`domain` 字段已不再使用）
- 元数据（cardId/source/confidence）**不进模型上下文**，防止模型引用"卡1"式编号

### 5.4 字段约束

- 金额：`PaymentOrder.amount Decimal`（生产建议转 `amountFen Int`，见第十二章 RDS 迁移）
- 验证码：`VerificationCode.code String`（明文，5 分钟过期 + 5 次尝试；生产建议改 `codeHash`）
- JSON 数组：当前用 String 存储（SQLite 限制），RDS 迁移后改 `Json`/`jsonb`
- 日期时间：SQLite 语义弱，RDS 迁移后改 `timestamptz(3)`
- `ChatSession.mentorId String`：无外键（对应 mentors.ts 静态 ID），RDS 迁移可选加外键

---

## 六、核心业务流程

### 6.1 AI 职导访谈（在校版）

**问卷序列：** A1 → A2 → A3 → A4 → A5 → G1 → G2 → G3 → G4 → G5 → G6 → G7 → G8

- 问题定义在 `src/lib/mentors.ts` 的 `personalityPrompt` 中
- 选项题使用 `[CHOICE:type=single|multi|rank]` 标签格式
- AI 回复末尾添加 `[QUESTIONNAIRE_COMPLETED]` 标记表示完成
- 完成后自动调用 `/api/profile/extract` 提取用户档案写入 UserProfile
- 支持断点续传：localStorage 中保存进度
- 版本标记：localStorage `ai-guide-version-${userId}` = `v2-student-only`

**P0-3 安全修订（已完成 2026-08-16）：**
- 客户端只发送单条 `message`，不再发送 `messages` 数组
- 服务端 `buildContextFromDB()` 从数据库构建上下文（弹性算法：最多 20 条/8000 字）
- `ANTI_INJECTION_PROMPT` 追加到所有 system prompt 末尾
- 单条消息上限 4000 字，AI 回复 `max_tokens: 800`
- `CollapsibleText` 组件：超屏 80% 高度自动折叠为 4 行 + 展开
- `stripStageDirections()` 清除 AI 回复中的舞台提示词

### 6.2 访问控制规则

| 用户类型 | AI 职导 | 行业导师 |
|---------|--------|---------|
| 未登录 | 提示登录 | 提示登录 |
| 非会员（未完成访谈） | 可以对话 | **拦截，跳转到 /chat** |
| 非会员（已完成访谈） | 可以对话 | 免费试用 3 次 |
| 会员 | 按套餐配额 | 按套餐配额 |

- 访谈完成判断：`UserProfile.profileSource === 'ai_extracted'` 或 `nickname` 不为空
- 三层检查：服务端页面重定向 → API 拦截 → 客户端跳转
- 会员状态由服务端数据库管理（`User.isPremium` + `Subscription` 表）

### 6.3 订阅套餐与多榨包

**订阅套餐**（`src/lib/plans.ts`）：

| 套餐 | 价格 | 周期 | 导师对话总轮次 | 每日上限 | 历史保留 |
|------|------|------|--------------|---------|---------|
| 月度 | ¥29.9 | 30 天 | 60 | 15 | 365 天 |
| 季度 | ¥79.9 | 90 天 | 180 | 16 | 3 年 |
| 年度 | ¥269.9 | 365 天 | 720 | 17 | 永久 |

- 升级/续费按自然月对日叠加（`addMonthsDate`）
- 年卡续费上限：剩余 ≤ 1460 天才可再续一年

**多榨包**（消耗品，不是时间订阅）：

| 项目 | 值 |
|------|-----|
| Pack ID | `CREDIT_10` |
| 单价 | ¥19.9（1990 分） |
| 包含轮次 | 10 |
| 适用对象 | 会员/非会员均可购买 |
| 过期规则 | **不过期**，用完再续 |
| 使用顺序 | 会员/免费额度耗尽后优先消耗 |
| 每日上限 | **无**（受限于突发限流 60 次/分） |
| 单笔订单上限 | 99 个 |
| 余额累计上限 | 2970（297 包），超限"榨干"按钮失活 |
| 批量折扣 | 1-4 原价 / 5-9 九折 / 10+ 八五折 |
| 折后取整 | 向下取整到角（1 位小数） |

**金额计算**：服务端下单与前端展示必须共用 `calcCreditPackPriceFen()`，避免双端不一致。

### 6.4 支付

**三套实现：**
- **支付宝**：`src/lib/alipay.ts`（`generateSignature` 空 key 抛 `Error`，不返回空字符串）
- **微信支付**：`src/lib/wxpay.ts`（v3 平台证书验签，Mock 模式跳过验签）
- **Mock 支付**：开发环境，`MOCK_PAYMENT_ENABLED=true` 时启用

**统一履约：** `fulfillPaidOrder()` 处理 metadata、订阅续期、CREDIT_PACK 处理

**Mock 支付门控（双重）：**
- 代码层：`MOCK_PAYMENT_ENABLED=true` + (`NODE_ENV !== 'production'` OR `DEPLOY_ENV='staging'` OR `ALLOW_MOCK_IN_PRODUCTION=true`)
- 部署层：`04-run.sh` 已改为只读检查（不再强制写回 true）
- 生产 env 当前仍为开启状态（真实支付未接入前必须保留），**上公网前关闭**

**金额精度：** `Number(toFixed(2))` 防止浮点误差；微信支付要求 `priceFen`（分）

**回调要求：**
- 支付宝异步通知必须用 POST 方法 on `/api/payment/notify/alipay`
- 微信支付回调 on `/api/payment/notify`
- 回调比对金额与数据库订单金额一致
- `paymentOrderId` 唯一约束防重复支付

### 6.5 渠道归因一期（2026-09-18 已完成）

**链路：** 二维码 → `/r/{code}`（写 httpOnly cookie `ch_attr`，30 天）或 `?ch=&utm_*`（attribution-capture.tsx 写 cookie + localStorage）→ 注册接口 `/api/auth/register` 校验 ACTIVE 渠道后盖章 → `User.channelId` + `attributionJson`

**首次触点锁定：** 注册时一次性写入，之后不可更改（分成反查依据）

**脏码处理：** 不匹配 ACTIVE 渠道归自然量

**后台：** `/admin/channels`（ADMIN 鉴权 + qrcode 库生成 PNG + 注册/付费/收入统计 + CSV 导出）

**生产迁移：** `deploy-scripts/03-migrate.sh` 对运行中挂载库 `db push`（新增表和可空列，非破坏性）

**二期预留：** 匿名触点漏斗、分成结算规则

### 6.6 职业兴趣测评

- RIASEC 霍兰德六维（R/I/A/S/E/C）
- 一人一份，重测覆盖
- 题库版本管理（`questionVersion`）
- 主码/副码（如 "SIA"）便于列表与推荐直接使用

### 6.7 PWA

- `public/manifest.json`：应用名称、启动页、显示模式、主题色、图标
- `public/sw.js`：Network First（页面）+ Cache First（静态资源）
- iOS 兼容
- P0-6 已修复：私人页面 Network Only，不缓存

---

## 七、API 设计

### 7.1 认证

| 路由 | 方法 | 用途 |
|------|------|------|
| `/api/auth/*` | * | NextAuth（signIn/signOut/callback） |
| `/api/auth/register` | POST | 注册（校验 ACTIVE 渠道后盖章 channelId） |

**认证约束：**
- 仅支持手机号 + 密码登录（邮箱登录已完全移除）
- 重置密码仅支持手机短信验证码（邮箱找回已移除）
- `/register` 路由已移除，新用户注册必须用 `/register-v2`
- 密码重置不使旧 JWT 失效（旧 token 7 天后自然过期）
- 登录失败 5 次锁定 15 分钟（`loginAttempts` + `lockUntil`）

### 7.2 AI 对话

| 路由 | 方法 | 用途 |
|------|------|------|
| `/api/chat` | POST | 发送单条消息（服务端构建上下文） |
| `/api/chat/usage` | GET | 对话用量查询 |
| `/api/chat/sessions` | GET | 历史会话列表 |
| `/api/chat/sessions/[id]` | GET | 单会话详情 |
| `/api/profile/extract` | POST | 从对话提取用户档案 |
| `/api/profile/clear` | POST | 清空用户档案（真实删除会话/历史/测评） |

### 7.3 支付

| 路由 | 方法 | 用途 |
|------|------|------|
| `/api/payment/orders` | POST/GET | 创建/查询订单 |
| `/api/payment/orders/[id]` | GET | 单订单详情 |
| `/api/payment/notify` | POST | 微信支付回调（v3 验签） |
| `/api/payment/notify/alipay` | POST | 支付宝回调（必须 POST） |
| `/api/payment/mock-pay` | POST | Mock 支付（门控） |

### 7.4 用户与订阅

| 路由 | 方法 | 用途 |
|------|------|------|
| `/api/user/profile` | GET/PUT | 用户档案 CRUD |
| `/api/subscription` | GET | 订阅状态查询 |

### 7.5 管理后台

| 路由 | 方法 | 用途 |
|------|------|------|
| `/api/admin/*` | * | ADMIN 鉴权（`getAdminUserId()` 实时校验 `role==='ADMIN'`，401/403 区分） |
| `/api/admin/channels` | * | 渠道 CRUD + 统计 |
| `/api/search` | GET | 知识卡检索（仅 title + applicableTo 字段） |

### 7.6 渠道短链

| 路由 | 方法 | 用途 |
|------|------|------|
| `/r/[code]` | GET | 写 httpOnly cookie `ch_attr`，跳转 landingPath |

> `/r` 已加入 `auth.ts` publicPaths，无需鉴权。

---

## 八、前端页面

| 路径 | 用途 |
|------|------|
| `/` | 首页（蓝灰鼠色 + 浅棕 + 红橙色系） |
| `/login` | 登录（手机号 + 密码） |
| `/register-v2` | 新版注册（/register 已移除） |
| `/chat` | AI 职导对话 |
| `/mentors` | 导师列表 |
| `/mentors/[id]` | 导师详情（含访问控制三层检查） |
| `/assessment` | 职业兴趣测评 |
| `/history` | 历史会话 |
| `/dashboard` | 用户面板（档案/订阅/历史） |
| `/subscribe` | 订阅套餐选择 |
| `/payment` | 支付页 |
| `/payment/mock-pay` | Mock 支付页 |
| `/payment/success` | 支付成功页 |
| `/r/[code]` | 渠道短链跳转 |
| `/admin/channels` | 渠道后台（ADMIN） |

**会员卡设计约束**（来自设计规范）：
- 四张卡（三色卡 + 黑卡）尺寸完全一致
- `max-width: 335px`，ISO 7810 信用卡长宽比 `1.586/1`
- `aspect-[1.586/1]` 强制比例防失真
- 2.5D 金属压印风格（金/银箔、压印文字、微妙高光）
- 黑卡顶部橙→深蓝渐变条，磁条纹理用 `repeating-linear-gradient`
- 黑卡文案用深金箔色 `#F5D785`，无亮度调整
- 卡片文案用 `.text-foil-light`（近白色）保证可读性
- 黑卡 slogan：`陪你一起  见证成长`（无标点，双空格）
- 签名：`榨职机 · AI Career Companion 团队`，刘建毛草草体字体，`榨职机`放大倾斜 -7°
- 桌面端点击"安装到手机"按钮提示`请用手机浏览器打开本页面后再点此按钮`

---

## 九、部署架构

### 9.1 部署形态

```
用户 → aihr.top（临时公网，火山引擎 ECS 14.103.104.122；正式域名+ICP 至少一个月后上线，届时重新解析）
       → Docker 容器 xinzang（--restart unless-stopped 常驻）
         → Next.js standalone（PORT=3000, HOSTNAME=0.0.0.0）
         → 数据卷：宿主机 /opt/xinzang-data ↔ 容器 /app/data
         → SQLite：/app/data/prod.db
         → 环境变量：--env-file /opt/xinzang/.env
```

**实机验证（2026-09-18）：** `docker inspect xinzang` RestartCount=0，OOMKilled=false

### 9.2 Dockerfile 要求

- 基础镜像：`node:20-alpine`
- 多阶段构建：deps → builder → runner
- 构建阶段：`npm install` → `prisma generate` → `prisma db push`（临时 SQLite）→ `next build`
- 运行阶段：复制 `.next/standalone` + `.next/static` + `public/` + `prisma/` + 生产数据库
- **非 root 用户运行**
- 不把 `.env*` COPY 进镜像
- `HOSTNAME=0.0.0.0`，`PORT=3000`
- 二进制引擎：`binaryTargets = ["native", "linux-musl-openssl-3.0.x"]`

### 9.3 部署脚本体系（`deploy-scripts/`）

| 脚本 | 用途 |
|------|------|
| `01-build.sh` | 本地或服务器构建镜像 |
| `02-push.sh` | 推送镜像到服务器 |
| `03-migrate.sh` | 数据库迁移（对运行中挂载库 `db push`，非破坏性） |
| `04-run.sh` | 容器启动（含 Docker 日志轮转） |
| `05-verify.sh` | 部署验证 |
| `20-deploy-nodb.sh` | 快速部署（无数据库变更） |
| `30-cron-backup.sh` | 每日 03:30 冷备（保留 14 天） |

### 9.4 数据备份

- **每日 03:30 crontab 冷备**：`/opt/xinzang-backup/`，保留 14 天
- 已实测成功
- 备份脚本：`deploy-scripts/30-cron-backup.sh`

### 9.5 日志

- Docker 日志轮转已配置（`04-run.sh`）
- chat 路由 3 处 `console.log` 收敛：调试类改 `AI_DEBUG_LOGS=true` 门控，边界拦截保留为 `console.warn`（不含用户消息内容）

---

## 十、安全策略

### 10.1 自检结果概览（2026-09-19）

| 状态 | 数量 | 说明 |
|------|------|------|
| PASS | 37 | 架构与实现正确 |
| WARN → 已修复 | 7 | 代码已改，部分随下次部署生效 |
| WARN → 暂缓 | 2 | CSP nonce、chat/route.ts 拆分 |
| TODO-真机验证 | 8 | 只能在真实环境完成 |
| **FAIL（高危）** | **0** | 未发现可直接利用的严重漏洞 |

详见 [docs/安全自检报告-第一轮.md](./安全自检报告-第一轮.md)。

### 10.2 已实现的安全机制

**API 鉴权与越权：**
- `/api/*` 均调 `auth()`，未登录 401
- 数据查询全部带 `userId` 过滤（防水平越权）
- `/api/admin/*` 用 `getAdminUserId()` 实时校验 `role==='ADMIN'`（401/403 区分，防垂直越权）
- 全表 cuid 主键（防 ID 枚举）

**数据安全：**
- 密钥仅 `process.env` 读取，无硬编码
- `.env*` 在 .gitignore；`.env.example` 只有占位符
- `*.db` 在 .gitignore
- JWT 7 天过期，HttpOnly Cookie
- bcrypt hash/compare
- 清空接口真实删除会话/历史/测评并置空档案

**AI 特有：**
- Key 仅 Node 端使用，浏览器 bundle 无 key
- AI API URL 白名单：deepseek/openai/moonshot（防 SSRF）
- 60 次/分突发限流 + 数据库三层配额（周期总量/24h 滚动/加购包）
- 成功回复才计费，冷回复不计费
- mentor-router 领域门禁 + persona 约束 + 模型策略
- 注册/档案有不文明用语审核

**支付：**
- 金额服务端从套餐表读取，客户端不可传价
- notify 路由比对回调金额；微信 v3 平台证书验签
- `paymentOrderId` 唯一约束防重复支付
- 统一履约 `fulfillPaidOrder`

**基础：**
- `next.config.js` 安全头：`X-Frame-Options`、`X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy`、CSP、`Strict-Transport-Security`
- 无 `$queryRaw`/`$executeRaw`，纯 Prisma API（防 SQL 注入）
- 生产不返回堆栈
- 默认同源，未配置跨域放行
- Docker 非 root 运行

### 10.3 暂缓项（2 项）

| # | 项目 | 暂缓原因 |
|---|------|---------|
| 1 | CSP nonce 化 | 当前 CSP 含 `unsafe-inline`；nonce 化需改 Next.js 配置和所有内联脚本，工作量大 |
| 2 | chat/route.ts 拆分 | 当前 1100+ 行，功能正确但可维护性差；拆分需充分回归测试 |

### 10.4 待真机验证（8 项，上公网前必做）

| # | 项目 | 验证方式 |
|---|------|---------|
| 1 | 注入—数据越权 | 黑盒对话测试 |
| 2 | 注入—策略泄露 | 黑盒"复述指令"测试 |
| 3 | 微信支付真实回调 | 真实支付订单 |
| 4 | 支付宝真实回调 | 真实支付订单 |
| 5 | 短信验证码真实下发 | 真实手机号 |
| 6 | Cookie secure 在 HTTPS 下生效 | 真实 HTTPS 域名 |
| 7 | 渠道归因真实扫码 | 真实二维码 |
| 8 | PWA 真实安装 | 真实手机浏览器 |

---

## 十一、上公网前阻断项（P0）

| 编号 | 问题 | 当前状态 | 上公网前要求 |
|------|------|---------|-------------|
| P0-1 | 导师 Prompt 可能进入浏览器 | ✅ 已修复 | 维持 |
| P0-2 | 聊天接口未验证 sessionId 归属 | ✅ 已修复 | 维持 |
| P0-3 | 客户端控制整段模型上下文 | ✅ 已修复（2026-08-16） | 维持 |
| P0-4 | 验证码接口直接返回验证码 | Mock 模式 | 真实短信 Provider 接入或禁用注册 |
| P0-5 | 支付验签未完成 | 微信 v3 已接入，支付宝沙箱 | 切换支付宝正式配置；微信真实回调验证 |
| P0-6 | Service Worker 缓存登录后页面 | ✅ 已修复 | 维持 |
| P0-7 | 完整聊天内容写入 localStorage | 部分缓解 | RDS 迁移后数据库成为唯一权威消息源 |
| P0-8 | 隐私承诺与功能不一致 | 待复核 | 同步修改欢迎语和隐私说明 |
| P0-9 | 档案更新未形成可审计事务 | ✅ 已修复 | ProfileHistory 追加式历史已落地 |
| **P0-10** | **SQLite 单文件** | **生产现状** | **RDS MySQL 迁移（见第十二章）** |
| **P0-11** | **Mock 支付** | **生产 env 仍开启** | **真实支付接入后关闭** |
| **P0-12** | **8 项真机验证** | **TODO** | **上公网前完成** |

---

## 十二、RDS MySQL 迁移计划（上公网前必做）

> 用户已明确决策：上公网前必须迁移到火山引擎 RDS MySQL。RDS 具备 RAG 能力，但当前不启用（技术成熟度问题）。

### 12.1 迁移原则

1. 保留 Next.js、Auth.js、Prisma 和现有 API Routes
2. 仅将 Prisma 数据源从 SQLite 改为火山引擎 RDS MySQL
3. 浏览器不直接访问数据库，所有数据通过 `/api/*` 路由
4. 不迁移 Auth.js 到 RDS Auth（第二阶段可选）
5. 导师分身保持 `mentors.ts` 静态 + `MentorKnowledgeCard` 单表（不迁旧 PRD 三表设计）
6. Prompt 只能由服务端读取，不序列化到浏览器

### 12.2 Prisma Schema 变更

```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}
```

### 12.3 类型映射（SQLite → MySQL）

| 当前字段 | 问题 | MySQL 目标 |
|---------|------|------------|
| 多个 JSON 数组字符串 | 查询、校验困难 | Prisma `Json` / MySQL `json` |
| `PaymentOrder.amount Decimal` | 浮点误差 | `amountFen Int`（人民币分） |
| `VerificationCode.code String` | 明文验证码 | `codeHash`（哈希存储） |
| 日期时间 | SQLite 语义弱 | `DateTime`（MySQL `datetime(3)`） |
| 长文本（`caseText`/`coreView`/`content` 等） | SQLite 无类型约束 | `@db.Text` |
| 短字符串 | SQLite 无类型约束 | `@db.VarChar(N)` |

### 12.4 数据 ETL 步骤

1. 在 RDS 创建空库，配置 migration role 和 runtime role
2. 生成 Prisma migration SQL，**人工 review 后**执行 `npx prisma migrate deploy`
3. 编写 ETL 脚本：从生产 SQLite `/app/data/prod.db` 导出 → 转换（JSON 字符串 → JSON 对象、金额 → 分）→ 导入 RDS
4. 数据校验：行数对比、关键字段抽样比对、外键孤儿检查
5. 切换 `DATABASE_URL` 环境变量
6. 灰度观察日志和指标
7. 旧 SQLite 文件保留 30 天作回滚备份

### 12.5 数据库账号

| 账号 | 用途 | 权限 |
|------|------|------|
| migration role | CI/CD 执行 `prisma migrate deploy` | schema 变更权限 |
| runtime role | Next.js 日常运行 | 仅业务表 SELECT/INSERT/UPDATE/DELETE |

### 12.6 迁移注意事项

- **禁止在生产使用** `prisma db push` 或 `prisma migrate reset`
- 生产只应用已提交、审阅过的 migration：`npx prisma migrate deploy`
- Trae 必须先输出 migration SQL 供人工 review
- 不在聊天、代码、截图或 Git 中传递真实数据库密码
- ECS 与 RDS 同地域时优先配置 VPC 内网连接
- 长文本字段必须用 `@db.Text`，否则 MySQL 默认 `varchar(191)` 会截断
- 现有 `MentorKnowledgeCard.caseText/coreView/reasoning/content` 等字段必须显式标注 `@db.Text`

### 12.7 RDS 迁移验收清单

- [ ] Prisma 能从 ECS 连接 RDS MySQL（VPC 内网）
- [ ] 连接使用正确的 SSL 配置
- [ ] `npx prisma migrate status` 无 pending/failed migration
- [ ] runtime 账号不能建表、删表或修改 schema
- [ ] 14 个 model 全部迁移成功
- [ ] 6 个静态导师数据保留在 mentors.ts（不迁库）
- [ ] `MentorKnowledgeCard` 全部记录迁移成功
- [ ] 金额统一为整数分（`amountFen Int`）
- [ ] JSON 数组能正常读写（`Json` 类型）
- [ ] 用户档案当前快照与历史版本数量一致
- [ ] 支付订单与订阅关联正确
- [ ] 数据库中不存在外键孤儿
- [ ] 旧 SQLite 文件保留 30 天

### 12.8 迁移后的后续优化（非阻断）

- **限流从内存 Map → Redis**：多实例前提（当前单容器单实例，内存限流 100% 有效；DB 三层配额兜底已防多实例绕过）
- **CSP nonce 化**：移除 `unsafe-inline`
- **chat/route.ts 拆分**：1100+ 行拆分为多个模块
- **RDS RAG 能力**：当前不启用（技术成熟度问题），未来评估

---

## 十三、后续路线图

| 优先级 | 项目 | 说明 |
|--------|------|------|
| P1 | Redis 限流 | 多实例前提；当前内存 Map + DB 兜底已足够 |
| P1 | CSP nonce 化 | 移除 `unsafe-inline` |
| P1 | chat/route.ts 拆分 | 1100+ 行 → 多模块 |
| P2 | 真实短信验证码 | 替代 Mock（需短信 Provider） |
| P2 | 渠道归因二期 | 分成结算规则（shareRate 字段已占位） |
| P2 | 账号注销流程 | 仅面向从未付费 / 服务期结束且无未结事项用户 |
| P3 | 多榨包二期 | 更多 Pack ID（如 CREDIT_30、CREDIT_50） |
| P3 | 导师内容扩充 | 10 月起每周案例更新（1-3 篇/导师/周，300-1000 字/篇） |
| P3 | RDS RAG 评估 | 技术成熟度提升后再评估 |

---

## 十四、验收矩阵

### 数据库（RDS 迁移后）

- [ ] Prisma 能从 ECS 连接 RDS MySQL
- [ ] 14 个 model 全部迁移成功
- [ ] 6 个静态导师保留在 mentors.ts
- [ ] `MentorKnowledgeCard` 全部记录迁移成功
- [ ] 金额统一为整数分
- [ ] JSON 数组能正常读写
- [ ] 用户档案当前快照与历史版本数量一致
- [ ] 支付订单与订阅关联正确
- [ ] 数据库中不存在外键孤儿
- [ ] runtime 账号不能建表、删表或修改 schema

### 权限与隐私

- [ ] 用户 A 不能读取用户 B 的数据
- [ ] 修改 sessionId 不能向他人会话写入
- [ ] 客户端 HTML/JS/API 中不存在 system Prompt
- [ ] localStorage 中不存在完整聊天历史
- [ ] Service Worker 不缓存私人页面
- [ ] 日志不包含密码、Key、完整 Prompt 或完整聊天内容

### AI 对话

- [x] 客户端只发送本轮消息
- [x] 服务端从数据库加载历史
- [x] 同一请求重试不会重复扣次数
- [ ] 对话记录了实际使用的 Prompt 版本和模型（RDS 迁移后可选加 promptVersionId）
- [x] 免费、付费和套餐配额测试通过

### 认证与支付

- [ ] 生产验证码响应不包含验证码
- [ ] 生产 Mock 支付接口返回 404/403
- [ ] 支付回调使用官方验签
- [ ] 回调重复发送不会重复创建订阅
- [ ] 回调金额与数据库订单金额一致
- [ ] 支付宝异步通知完成官方验签
- [ ] 同一订单换渠道不会重复开通服务

### 渠道归因

- [x] Channel 表与 /r/[code] 短链生效
- [x] 注册时盖章 channelId + attributionJson
- [x] 首次触点锁定，之后不可更改
- [x] 脏码归自然量
- [x] /admin/channels 后台 CRUD + 统计 + CSV 导出
- [ ] 真实二维码扫码验证（真机）

### 多榨包

- [x] CREDIT_10 定价 ¥19.9 / 10 轮次
- [x] 批量折扣（5-9 九折，10+ 八五折）
- [x] 余额上限 2970，超限按钮失活
- [x] 不过期，会员/非会员均可购买
- [x] 使用顺序：会员/免费额度耗尽后优先消耗

---

## 十五、关联文档与参考资料

| 文档 | 路径 | 说明 |
|------|------|------|
| 项目上下文 | `CLAUDE.md` | 新会话先读 |
| 数据库迁移（旧） | `docs/AICCloudBase_PG_v1.1.md` | **已 archived**，旧 PG 迁移方案，仅供历史参考 |
| 安全自检报告 | `docs/安全自检报告-第一轮.md` | 2026-09-19 自检结果 |
| 安全自检清单 | `docs/安全与质量自检清单.md` | 54 项可复用模板 |
| 外包安全检查清单 | `docs/外包安全检查清单.md` | 安全工程师外包检查 |
| 订阅套餐配置 | `src/lib/plans.ts` | 月/季/年 + 多榨包定价 |
| Prisma Schema | `prisma/schema.prisma` | 14 个 model |
| 部署脚本 | `deploy-scripts/01-05*.sh, 20, 30` | 部署与备份 |
| 安全头配置 | `next.config.js` | CSP/HSTS/X-Frame-Options |
| Docker 构建 | `Dockerfile` | node:20-alpine 多阶段非 root |

**外部参考：**
- Prisma migration 工作流：https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production
- 火山引擎 RDS MySQL 文档：https://www.volcengine.com/docs/6412
- DeepSeek API 价格：https://api-docs.deepseek.com/zh-cn/quick_start/pricing/

---

## 十六、不在本次范围内

- 不迁移 Auth.js 到 RDS Auth（第二阶段可选）
- 不建立导师侧页面或导师登录（导师是 AI 分身，无真人账户）
- 不在 P0/P1 提前上线账号注销（P2 实现）
- 不代替商户签约或假设支付费率
- 不上传真实密钥到 Git
- 不启用 RDS RAG 能力（技术成熟度问题，未来评估）
- 不迁旧 PRD 规划的 mentor_agents 三表设计（已废弃，保持 MentorKnowledgeCard 单表）
- 不强制 mentors.ts 静态数据迁库（保留作人格配置兜底）

---

## 十七、变更日志

### v3.0（2026-09-20）

- 全面重写，对齐 2026-09-20 实际代码状态
- 数据库迁移目标从 CloudBase PostgreSQL → 火山引擎 RDS MySQL
- 部署形态从 CloudBase 云托管 → 火山引擎 ECS + Docker
- 导师分身架构从 mentor_agents 三表规划 → 保持 MentorKnowledgeCard 单表
- 新增：渠道归因一期、多榨包加购、职业兴趣测评、会员卡压印名、档案页改版
- 新增：火山引擎 ECS 部署架构、deploy-scripts 脚本体系、每日冷备 crontab
- 新增：安全自检结果（0 FAIL / 37 PASS / 2 暂缓 / 8 待真机）
- P0 阻断项重新校准：新增 P0-10（SQLite 单文件）、P0-11（Mock 支付）、P0-12（8 项真机验证）
- 旧版 v2.0（2026-08-15）和 v1.0 已废弃

### v2.0（2026-08-15，已废弃）

- 旧版基于 CloudBase PostgreSQL 迁移路线
- 旧版规划 mentor_agents 三表设计（已废弃）

### v1.0（已废弃）

- ChatGPT 编写的初始 PRD
