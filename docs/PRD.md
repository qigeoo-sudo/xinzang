# AI Career Companion — 产品需求文档（PRD）

**版本：** v2.0  
**日期：** 2026-08-15  
**工作截止日期：** 2026-12-01  
**当前状态：** 在校生专用版，开发阶段，尚未上线

---

## 一、产品概述

AI Career Companion 是一个通过 AI 职导访谈 + 行业导师 AI 分身，为高校学生提供求职指导的平台。

- **目标用户：** 高校在校生（大三、大四为主）
- **核心价值：** 通过 AI 职导访谈了解用户背景，推荐匹配的行业导师分身进行深度对话
- **商业模式：** 免费试用 + 会员订阅（月度/季度/年度），支持支付宝 + 微信支付
- **当前版本：** 在校生专用版（v2-student-only），问卷流程直接从学生问题开始

---

## 二、项目时间线

| 里程碑 | 目标日期 | 说明 |
|--------|---------|------|
| 当前阶段 | 2026-08-15 | 核心功能开发完成，在校版问卷流程 + 支付宝支付已实现 |
| 导师内容准备 | 2026-09-30 | 10 个导师分身的 Prompt（Claude fable 撰写 + 人工调教）+ 3 小时访谈文字（约 3 万字/人） |
| 案例持续更新 | 2026-10-01 起 | 每位导师每周提供 1-3 个案例（300-1000 字/篇） |
| 数据库迁移 | 2026-11-15 | SQLite → 腾讯云 CloudBase PostgreSQL |
| 正式上线 | 2026-12-01 | 生产部署完成，所有阻断项修复 |

---

## 三、导师分身规划

### 3.1 第一批：上线的 10 个导师

- 每个 Prompt 由 Claude fable 撰写，并经过人工调教
- 每个导师拥有约 3 小时的访谈文字记录（约 3 万字），作为知识库来源
- 从 2026 年 10 月起，每位导师每周提供 1-3 个案例（300-1000 字/篇），持续更新知识库
- 导师数据从 `src/lib/mentors.ts` 迁移到数据库（见第六章数据库迁移）

### 3.2 第二批：锁定的 10 个导师

- 暂时上锁，不对外展示
- 后续版本推出
- 数据库 schema 预留 `is_active = false` 和 `access_tier` 字段支持

### 3.3 导师分身数据结构

当前导师数据存储在 `src/lib/mentors.ts` 静态文件中，迁移后拆分为三个数据库表：

| 表名 | 用途 | 安全要求 |
|------|------|---------|
| `mentor_agents` | 公开资料（名称、头像、标题、标签、推荐问题） | 可返回浏览器 |
| `mentor_agent_prompt_versions` | 私密系统提示词 | 仅服务端读取，不序列化到客户端 |
| `mentor_knowledge_entries` | 知识库条目（访谈文字、案例） | 仅服务端读取 |

---

## 四、核心业务流程

### 4.1 AI 职导访谈流程（在校版）

当前为在校生专用版，问卷流程直接从学生问题开始，不再有在校/在职/待业分拣环节。

**问卷问题序列：** A1 → A2 → A3 → A4 → A5 → G1 → G2 → G3 → G4 → G5 → G6 → G7 → G8

- 问题定义在 `src/lib/mentors.ts` 的 `personalityPrompt` 中
- 选项题使用 `[CHOICE:type=single|multi|rank]` 标签格式
- AI 回复末尾添加 `[QUESTIONNAIRE_COMPLETED]` 标记表示完成
- 完成后自动调用 `/api/profile/extract` 提取用户档案写入 UserProfile
- 支持断点续传：localStorage 中保存进度，哪里中断就哪里开始

### 4.2 访问控制规则

| 用户类型 | AI 职导 | 行业导师 |
|---------|--------|---------|
| 未登录 | 提示登录 | 提示登录 |
| 非会员（未完成访谈）| 可以对话 | **拦截，跳转到 /chat** |
| 非会员（已完成访谈）| 可以对话 | 免费试用 3 次 |
| 会员 | 无限（每日 50 条上限）| 按套餐配额或无限 |

- 访谈完成判断：`UserProfile.profileSource === 'ai_extracted'` 或 `nickname` 不为空
- 三层检查：服务端页面重定向 → API 拦截 → 客户端跳转

### 4.3 支付

- **支付宝**：`src/lib/alipay.ts`（当前沙箱模式，上线前切换正式配置）
- **微信支付**：当前 Mock 模式（开发环境）
- **订阅套餐**：月度 / 季度 / 年度，配置在 `src/lib/plans.ts`
- **生产要求**：缺配置必须 fail closed，Mock 支付必须显式关闭

---

## 五、技术栈

| 层级 | 当前实现 | 生产目标 |
|------|---------|---------|
| Web 框架 | Next.js 14.2 App Router + React 18 + TypeScript | 保持不变 |
| UI | Tailwind CSS | 保持不变 |
| PWA | manifest.json + sw.js | 修复 P0-6 缓存问题 |
| 认证 | Auth.js v5 + Credentials Provider + JWT | 第一阶段保留 Auth.js |
| ORM | Prisma 5.22 | 保持不变 |
| **数据库** | **SQLite (dev.db)** | **腾讯云 CloudBase PostgreSQL** |
| AI | DeepSeek API (deepseek-chat) | 部署前确认最新模型名 |
| 支付 | 支付宝沙箱 + 微信 Mock | 支付宝正式 + 微信正式 |
| 部署 | 本地 dev server | CloudBase 云托管 (standalone Docker) |

---

## 六、数据库迁移：SQLite → CloudBase PostgreSQL

> 参考文档：`docs/AICCloudBase_PG_v1.1.md`（由 ChatGPT 编写的数据库迁移交接文档）

### 6.1 迁移原则

1. 保留 Next.js、Auth.js、Prisma 和现有 API Routes
2. 仅将 Prisma 数据源从 SQLite 改为 CloudBase PostgreSQL
3. 浏览器不直接访问数据库，所有数据通过 `/api/*` 路由
4. 第一阶段不迁移 CloudBase Auth，保留 Auth.js
5. 导师分身数据从 `src/lib/mentors.ts` 迁入数据库
6. Prompt 只能由服务端读取，不序列化到浏览器

### 6.2 Prisma Schema 变更

将 datasource 改为 PostgreSQL：

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

### 6.3 新增数据库表

| 新增表 | 用途 | 说明 |
|-------|------|------|
| `mentor_agents` | 导师分身公开资料 | 替代 mentors.ts 中的静态数据 |
| `mentor_agent_prompt_versions` | 导师系统提示词版本管理 | 每次修改生成新版本，不覆盖已发布版本 |
| `mentor_knowledge_entries` | 导师知识库（访谈文字 + 案例） | 10 月起每周更新的案例写入此表 |
| `user_profile_revisions` | 用户档案修改历史 | 当前快照 + 追加式历史 |
| `payment_transactions` | 支付渠道流水 | 支持微信/支付宝双渠道 |

### 6.4 类型修订

| 当前字段 | 问题 | PostgreSQL 目标 |
|---------|------|----------------|
| 多个 JSON 数组字符串 | 查询、校验困难 | Prisma `Json` / PostgreSQL `jsonb` |
| `PaymentOrder.amount Float` | 浮点误差 | `amountFen Int`（人民币分） |
| `ChatSession.mentorId String` | 无外键 | `mentorAgentUid` 外键关联 `mentor_agents.uid` |
| `VerificationCode.code String` | 明文验证码 | `codeHash`（哈希存储） |
| 日期时间 | SQLite 语义弱 | `timestamptz(3)` |

### 6.5 迁移步骤

```
阶段 0：建立 staging 数据库（不碰生产数据）
  ↓
阶段 1：Prisma Schema 转 PostgreSQL + 新增表
  ↓
阶段 2：生成可审计 migration（禁止 db push / migrate reset）
  ↓
阶段 3：迁移导师分身数据（mentors.ts → 数据库）
  ↓
阶段 4：决定是否迁移本地 SQLite 数据
  ↓
阶段 5：修改服务端查询（mentors.ts 拆分、chat API 改用数据库）
  ↓
阶段 6：事务与并发优化
```

### 6.6 数据库账号

| 账号 | 用途 | 权限 |
|------|------|------|
| migration role | CI/CD 执行 `prisma migrate deploy` | schema 变更权限 |
| runtime role | Next.js 日常运行 | 仅业务表 SELECT/INSERT/UPDATE/DELETE |

### 6.7 迁移注意事项

- **禁止在生产使用** `prisma db push` 或 `prisma migrate reset`
- 生产只应用已提交、审阅过的 migration：`npx prisma migrate deploy`
- Trae 必须先输出 migration SQL 供人工 review
- 不在聊天、代码、截图或 Git 中传递真实数据库密码
- 云托管与数据库同地域时优先配置 VPC 内网连接

---

## 七、上线前阻断项（P0）

以下问题必须在 12 月 1 日上线前修复。详见 `docs/AICCloudBase_PG_v1.1.md` 第六章。

| 编号 | 问题 | 当前状态 | 修复方案 |
|------|------|---------|---------|
| P0-1 | 导师 Prompt 可能进入浏览器 | **已修复** | 定义 PublicMentorAgentDTO，客户端只接收公开字段 |
| P0-2 | 聊天接口未验证 sessionId 归属 | **已修复** | API 验证 sessionId 属于当前用户且匹配导师 |
| P0-3 | 客户端控制整段模型上下文 | 未修复 | 客户端只提交本轮消息，服务端加载历史 |
| P0-4 | 验证码接口直接返回验证码 | 未修复 | 接入真实短信 Provider 或禁用注册 |
| P0-5 | 支付验签未完成 | 部分完成 | 支付宝沙箱已接入，需切换正式；微信需完成验签 |
| P0-6 | Service Worker 缓存登录后页面 | 未修复 | 只缓存公共页面，私人页面 Network Only |
| P0-7 | 完整聊天内容写入 localStorage | 未修复 | PostgreSQL 成为唯一权威消息源 |
| P0-8 | 隐私承诺与功能不一致 | 未修复 | 同步修改欢迎语和隐私说明 |
| P0-9 | 档案更新未形成可审计事务 | 未修复 | 新增 UserProfileRevision 追加式历史 |

---

## 八、P1 改进项

| 编号 | 问题 | 说明 |
|------|------|------|
| P1-1 | 内存 Map 限流不适用多实例 | 改为 Redis 或数据库原子计数 |
| P1-2 | 免费试用逻辑存在冲突 | 已修复，非会员可使用免费试用次数 |
| P1-3 | seed.ts 含固定测试密码 | 禁止在生产执行 |
| P1-4 | 无 prisma/migrations 目录 | 生产必须使用 migration 而非 db push |
| P1-5 | PWA 图标缺失 | 补充 icon-192.png 和 icon-512.png |
| P1-6 | CSP 含 unsafe-inline | 正式构建后逐步收紧 |
| P1-7 | 导师头像不统一 | 迁移到腾讯云存储 |
| P1-8 | 模型 Key 未配置时不应发送请求 | fail closed |
| P1-9 | 确认 deepseek 模型名 | 部署前改为当前官方模型名 |

---

## 九、云托管部署方案

### 9.1 部署形态

Next.js standalone + Docker 多阶段构建，部署到 CloudBase 云托管。

### 9.2 Dockerfile 要求

- 多阶段构建，复制 `.next/standalone`、`.next/static`、`public/`
- 构建阶段运行 `prisma generate`
- 非 root 用户运行
- 不把 `.env*` COPY 进镜像
- `HOSTNAME=0.0.0.0`，`PORT=3000`

### 9.3 生产环境变量

```
NODE_ENV=production
DATABASE_URL=<runtime connection string>
DIRECT_URL=<migration/direct connection string>
AUTH_SECRET=<strong random secret>
AUTH_TRUST_HOST=true
NEXTAUTH_URL=https://<production-domain>
DEEPSEEK_API_KEY=<server secret>
AI_API_URL=https://api.deepseek.com/v1
AI_MODEL=<确认最新模型名>
FREE_TRIAL_COUNT=3
RATE_LIMIT_PER_MINUTE=10
ALIPAY_APP_ID=<server config>
ALIPAY_PRIVATE_KEY=<server secret>
ALIPAY_PUBLIC_KEY_OR_CERT=<server secret/config>
ALIPAY_NOTIFY_URL=https://<production-domain>/api/payment/alipay/notify
ALIPAY_RETURN_URL=https://<production-domain>/payment/success
WXPAY_APP_ID=<server config>
WXPAY_MCH_ID=<server config>
WXPAY_API_V3_KEY=<server secret>
WXPAY_SERIAL_NO=<server config>
WXPAY_PRIVATE_KEY=<server secret>
WXPAY_NOTIFY_URL=https://<production-domain>/api/payment/notify
WXPAY_H5_RETURN_URL=https://<production-domain>/payment/success
PAYMENT_MOCK_ENABLED=false
```

### 9.4 域名与路由

1. CloudBase 云托管 → 确认默认域名可访问
2. 绑定已备案的正式域名 + SSL 证书
3. DNSPod 添加 CNAME
4. `/*` 路由到 Next.js 云托管服务
5. 验证微信与支付宝异步通知 URL 可被支付平台访问

---

## 十、发布与回滚

### 发布前

1. 对生产数据库创建平台备份
2. 额外执行逻辑备份：`pg_dump "$DATABASE_URL" --format=custom --no-owner --file=pre_release.dump`
3. 在 staging 完整跑过 migration
4. 检查 migration 是否含 DROP/TRUNCATE/不可逆类型收窄
5. 确认 Mock 验证码和 Mock 支付均不可达

### 发布顺序

```
数据库向后兼容 migration
→ 导入导师分身数据
→ 部署兼容新旧字段的应用版本
→ 数据校验
→ 切换读取新表
→ 观察日志和指标
→ 后续版本再删除旧字段
```

### 回滚原则

- 应用异常：切回上一稳定版本
- migration 已执行：使用向前修复 migration
- 数据损坏：从备份恢复到独立数据库
- Prompt 变更异常：将上一版本重新标记为发布版本

---

## 十一、验收矩阵

### 数据库

- [ ] Prisma 能从云托管连接 CloudBase PostgreSQL
- [ ] 连接使用正确的内网/SSL 配置
- [ ] `prisma migrate status` 无 pending/failed migration
- [ ] runtime 账号不能建表、删表或修改 schema
- [ ] 20 个导师分身（10 个 active + 10 个 locked）及各自 Prompt v1 已迁移
- [ ] `ChatSession.mentorAgentUid` 外键生效
- [ ] 金额统一为整数分
- [ ] JSON 数组能正常读写
- [ ] 用户档案当前快照与历史版本数量一致
- [ ] 支付订单与渠道流水是一对多关系
- [ ] 数据库中不存在外键孤儿

### 导师内容

- [ ] 10 个上线导师拥有 Claude fable 撰写并调教的 Prompt
- [ ] 每个导师拥有约 3 万字访谈文字记录
- [ ] 10 月起每周案例更新机制正常运行
- [ ] 10 个锁定导师 `is_active = false`，不对外展示

### 权限与隐私

- [ ] 用户 A 不能读取用户 B 的数据
- [ ] 修改 sessionId 不能向他人会话写入
- [ ] 客户端 HTML/JS/API 中不存在 system Prompt
- [ ] localStorage 中不存在完整聊天历史
- [ ] Service Worker 不缓存私人页面
- [ ] 日志不包含密码、Key、完整 Prompt 或完整聊天内容

### AI 对话

- [ ] 客户端只发送本轮消息
- [ ] 服务端从数据库加载历史
- [ ] 同一请求重试不会重复扣次数
- [ ] 对话记录了实际使用的 Prompt 版本和模型
- [ ] 免费、付费和套餐配额测试通过

### 认证与支付

- [ ] 生产验证码响应不包含验证码
- [ ] 生产 Mock 支付接口返回 404/403
- [ ] 支付回调使用官方验签
- [ ] 回调重复发送不会重复创建订阅
- [ ] 回调金额与数据库订单金额一致
- [ ] 支付宝异步通知完成官方验签
- [ ] 同一订单换渠道不会重复开通服务

---

## 十二、六个月费用估算

| 费用项 | 六个月估算 | 说明 |
|--------|----------|------|
| CloudBase 标准版 | 1,194 元 | 199 元/月 × 6 |
| 国内短信 1,000 条 | 50 元 | 0.05 元/条 |
| DeepSeek API | 200-600 元 | 随 Token 用量浮动 |
| 超量/日志/流量缓冲 | 300-500 元 | 防止突发 |
| **合计** | **约 2,000-2,400 元** | 不含支付手续费与人力 |

---

## 十三、参考资料

- 数据库迁移详细文档：`docs/AICCloudBase_PG_v1.1.md`
- 项目上下文文档：`CLAUDE.md`
- CloudBase Next.js 部署：https://docs.cloudbase.net/recipes/deploy-nextjs-to-cloudbase-run
- CloudBase PostgreSQL 连接：https://docs.cloudbase.net/database/postgresql/connecting-to-postgresql
- Prisma migration 工作流：https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production
- DeepSeek API 价格：https://api-docs.deepseek.com/zh-cn/quick_start/pricing/

---

## 十四、不在本次范围内

- 不迁移 CloudBase Auth（第二阶段可选）
- 不建立导师侧页面或导师登录
- 不在 P0/P1 提前上线账号注销（P2 实现）
- 不代替商户签约或假设支付费率
- 不上传真实密钥到 Git
