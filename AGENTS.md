# AI Career Companion — 项目记忆 (AGENTS.md)

> 本文件夹 `D:\xinzang` 是网站建设的主工作区（代码 + GitHub + DeepSeek）。
> 域名注册、ICP 备案、SSL 证书等辅助工作由 `C:\Users\bingw\zeroworld` 负责（火山引擎相关，此处不涉及）。

## GitHub 连接

| 项目 | 值 |
|------|-----|
| 仓库地址 | `https://github.com/qigeoo-sudo/xinzang.git` |
| 远程名 | `origin`（已配置，clone 时自带） |
| 默认分支 | `master`（`origin/HEAD -> origin/master`，另有 `origin/main`） |
| 最新提交 | `7fd074b`（master = main 同步） |

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
npm install          # 安装依赖（含 postinstall: prisma generate）
npx prisma db push   # 同步数据库 schema
npm run dev          # 启动开发服务器 (localhost:3000)
```

### Mock 支付与注册验证码

- Mock 支付：点击"确认支付(模拟)"即可；注册验证码 Mock 模式直接返回

## 项目上下文

完整技术栈、目录结构、业务流程见 `CLAUDE.md`（首次会话请先阅读）。
数据库迁移方案见 `docs/PRD.md` 与 `docs/AICCloudBase_PG_v1.1.md`。
