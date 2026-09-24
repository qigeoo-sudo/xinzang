# AI Career Companion — 项目记忆 (AGENTS.md)

> 主工作区为 `C:\Users\bingw\Documents\trae_projects\squeezer`（代码 + GitHub + DeepSeek）。
> 注意：D 盘的 `D:\xinzang`、`D:\xinzang git traecode` 均为已废弃的旧 clone，不要再在其中改代码。
> 导师分身内容生产区（codex/sonnet 产出的 prompt 与知识卡）在 `D:\database\mentors`，经审核后整合进主工作区。
> 域名注册、ICP 备案、SSL 证书等辅助工作由 `C:\Users\bingw\zeroworld` 负责（火山引擎相关，此处不涉及）。

## GitHub 连接

| 项目 | 值 |
|------|-----|
| 仓库地址 | `https://github.com/qigeoo-sudo/xinzang.git` |
| 远程名 | `origin`（已配置，clone 时自带） |
| 默认分支 | `master`（`origin/HEAD -> origin/master`，另有 `origin/main`） |
| 最新提交 | 见 `git log origin/main -1`（避免文档过时，不硬编码提交号） |

### Git 推送规则

- **日常开发与 staging**：只推送到 `main` 分支。`git push origin main`
- **生产发布**：单独确认后，从 main 合并到 master。`git push origin main:master`
- 打标签时同时推送标签：`git push origin "标签名"`
- 凭据走 Windows 凭据管理器（`credential.helper=manager`），无需额外配置
- **分支分工**：`main` = staging 环境（CloudBase 自动部署）；`master` = 生产环境

## DeepSeek API

| 项目 | 值 |
|------|-----|
| Key 变量名 | `DEEPSEEK_API_KEY`（优先）或 `OPENAI_API_KEY`（代码兼容两者） |
| Key 前缀 | `sk-3aeac...`（完整值在生产服务器容器环境变量内，本地开发需在 `.env.local` 填入完整 key） |
| API 地址 | `https://api.deepseek.com/v1`（变量 `AI_API_URL`） |
| 模型 | `deepseek-chat`（变量 `AI_MODEL`，DeepSeek 现自动映射到 `deepseek-v4-flash`） |

- 本地开发配置写入 `.env.local`（已 gitignore，参考 `.env.example`）。
- 未配置 key 时聊天功能降级，页面浏览不受影响。

## 快速启动

```bash
# 1. 启动本地 MySQL（Docker Desktop 已安装）
docker compose -f docker-compose.dev.yml up -d

# 2. 安装依赖 + 同步 schema + 启动
npm install
npx prisma db push   # 同步数据库 schema 到本地 MySQL (xinzang_dev)
npm run dev          # 启动开发服务器 (localhost:3000)
```

### Mock 支付与注册验证码

- Mock 支付：点击"确认支付(模拟)"即可；注册验证码 Mock 模式直接返回

## 数据库架构

数据库已从 SQLite 迁移至火山引擎 RDS MySQL（2026-09-24 完成，方案 A 最小切换）。

| 环境 | 数据库 | 连接方式 |
|------|--------|----------|
| 本地开发 | xinzang_dev（Docker MySQL 容器） | `docker compose -f docker-compose.dev.yml up -d`，DATABASE_URL 指向 localhost |
| 测试（CloudBase） | xinzang_test（RDS 同实例） | 公网 IP 连接，DATABASE_URL 在 CloudBase 控制台配置（不带 SSL 参数） |
| 生产（ECS） | xinzang-mysql（RDS 内网） | 容器通过 RDS 内网地址连接 |

- 迁移细节见 `docs/PRD.md` 第十二章（迁移记录，非计划）。
- User 表新增 `importSource` + `externalId` 可空列（联合唯一索引），用于合作方用户导入与定期回传关联。
- `docs/AICCloudBase_PG_v1.1.md` 已 archived，仅供历史参考。

## 项目上下文

技术栈：Next.js + Prisma + MySQL（火山 RDS）+ Docker（生产 ECS / 本地开发）。
域名：主站 `aihr.top`、渠道后台 `channel.aihr.top`、导师区 `mentor.aihr.top`（待开发）。
完整业务流程与产品需求见 `docs/PRD.md`。
