# 导师访谈龙虾工作台 — 设计评审稿 v1

版本：v1（评审稿）
日期：2026-10-06
拟定子域名：`content.aihr.top`（仅为设计假设，本阶段未注册、未配置、未部署）
状态：评审稿 v1 定稿——第 19 章 12 项问题已全部定案（见第 20 章决定记录）。本文档未修改任何代码、Prisma Schema、数据库、Git 分支、部署配置或域名；进入 P1 开发仍需用户明确批准。

---

## 0. 规则依据、校验记录与优先级

### 0.1 输入文件与校验记录

| 文件 | 角色 | 校验结果 |
|---|---|---|
| `C:\Users\bingw\Documents\trae_projects\squeezer\AGENTS.md` | 工程权威 | 已读全文（71 行当前版） |
| `docs\PRD.md`（v3.2） | 产品事实 | 已读全文 |
| `D:\database\AGENTS.md` | 内容生产业务权威 | 实测 SHA-256 = `55F0A24DAC46B95A38364D4467CD4E9989311D72F16233FFAC82B63570A82BB0`，与任务给定值一致，已读全文 |
| `docs\admin-mentor-system-v1.md`（v1 评审稿） | 后台产品/数据采集/指标口径权威 | 存在，已读全文 |

哈希一致，未发现旧副本，按约定继续设计。

### 0.2 规则分工与优先级

1. **内容与交接**：导师内容生产、飞书操作、Claude/Codex 交接、导师阅览文档、审核清单、Final Handoff 与发布门禁的业务规则，以 `D:\database\AGENTS.md` 为唯一业务权威。
2. **工程与发布**：Next.js、Prisma/MySQL、Git 分支、测试、部署脚本与三库分离，以 squeezer `AGENTS.md`、`docs/PRD.md` 与实际代码为工程权威；文档摘要与代码不一致时以已验证的代码行为为准。
3. **后台与审计**：后台角色、表结构、审计与指标口径，以 `docs/admin-mentor-system-v1.md` 为准；本文档引用其定义，不另立口径。
4. 两份 AGENTS 规则互不覆盖：涉及内容和代码交接的步骤必须同时满足两者；任一方更严格时执行更严格者。
5. 冲突裁决顺序：安全与隐私 > 双方 AGENTS 均确认的硬门禁 > `D:\database\AGENTS.md`（内容事务）> 工程权威（代码事务）> 本文档建议。本文档与两份 AGENTS 冲突时自动失效，以 AGENTS 为准并修订本文档。
6. 禁止事项继承：不得把 D 盘 AGENTS 全文、导师原始材料、Prompt 正文、知识卡内部数据暴露到公开前端；不得虚构未经验证的 API 或实时能力。

---

## 1. 目标与范围

### 1.1 定位

把 `D:\database\AGENTS.md` 已经确定的「导师访谈龙虾」流程，变成一个可执行的人机协作工作台：以云端控制平面（`content.aihr.top`）记录状态、展示证据、执行门禁按钮，以 Windows Local Runner 在本机执行与观测文件、飞书、Claude、Codex 相关动作，人工在关键门禁点点击授权。工作台是流程的「记录仪 + 门禁器 + 驾驶舱」，不是内容生产者。

### 1.2 覆盖的流程范围

- 当前切入点：导师已在飞书群提交第一轮音频和人工文字稿，从查找、下载、归并、命名、D 盘归档开始。
- 未来上游延伸（标记 planned，本设计预留状态位，不承诺能力）：NDA 签署核验 → 发送飞书妙记操作指南 → 发送第一轮访谈大纲 → 等待第一轮回复，最终并入同一条状态链。
- 下游到网站编入：Final Handoff 预检 → pending 归零 → 第一次人工确认集成 main/测试端 → 测试端人工验收 → 第二次按钮发布生产。

### 1.3 本阶段明确不做

1. 不开发任何功能，不改 Prisma Schema、数据库、Git、部署配置、域名与 nginx。
2. 不实现 NDA 核验与自动发送妙记指南/第一轮大纲（仅保留状态位）。
3. 不实现任何未经验证的 Claude/Codex 自动控制，不虚构 API。

---

## 2. 总体架构（含方案对比）

### 2.1 候选方案对比

| 方案 | 结构 | 代码量 | 稳定性 | 执行效率 | 主要风险 |
|---|---|---|---|---|---|
| A. 同容器路由组（推荐） | `content.aihr.top` 经 auth.ts Host 路由 rewrite 到应用内 `/content-ops` 路由组；控制平面 API 在 `/api/content-ops/*`；新增内容运营表族到同一 MySQL | 小（复用鉴权、证书、部署脚本、nginx 模式） | 高（与现有三库分离、部署体系一致） | 高（单进程，无跨服务调用） | 内容运营表与业务表同库，需靠命名与权限隔离 |
| B. 独立服务 | 独立 Node 服务 + 独立域名/证书/部署管线 | 大（新建鉴权、部署、证书、CI） | 中（多一套运维面） | 中（跨服务心跳） | 运维成本翻倍，单人团队不划算 |
| C. 纯本地工具（无云端） | 仅本地 Runner + 本地 Web UI | 中 | 低（无异地审计、无 HA、误删无保护） | 高 | 违背「云端控制平面」要求，审计不可信 |

推荐方案 A，理由：最小代码量复用既有 `admin.aihr.top` 的 Host 路由与登录闭环（`src/auth.ts` 已有 `ADMIN_DOMAIN` rewrite 模式可参照），与既有 `main=staging / master=生产` 发布纪律一致。最终取舍见第 19 章问题 Q1。

### 2.2 推荐架构（方案 A）

```
浏览器（仅 ADMIN_FULL）
   │  HTTPS
   ▼
content.aihr.top（nginx Host 路由 → 同一 xinzang 容器）
   │  auth.ts 新增 CONTENT_DOMAIN 判定，rewrite 到 /content-ops
   ▼
Next.js /content-ops（控制平面 UI）+ /api/content-ops（控制平面 API）
   │  读写同一 MySQL 中的内容运营表族（新建，独立于业务表）
   ▲  出站 HTTPS 轮询/上报（Runner 主动，云端不反向连接内网）
   │
Windows Local Runner（用户本机常驻 Node 进程）
   ├─ 文件观测与哈希：D:\database\mentors\...
   ├─ VPN/连通性探测（Claude/Codex/飞书端点）
   ├─ 飞书 OpenAPI 客户端（needs_validation，失败回退人工）
   ├─ 打开本地应用（Claude 桌面端 / Codex / 导师目录）
   └─ 心跳、事件、产物登记上报；拉取已授权的指令队列
```

关键原则：

1. Runner 只出站、云端不入站，避免在 ECS 上开放用户内网通道。
2. 所有改变外部世界状态的动作（下载归档、飞书发送、Codex 提交、Git 推送、部署）必须先由人工在 Dashboard 点击对应按钮授权，Runner 才从指令队列取得执行权。
3. 控制平面只记录与展示，不生产内容；Prompt、知识卡、分类内容一律由 Codex 在 D 盘 Assembly 产出。

---

## 3. 连接器能力矩阵

评级定义：`verified`（已有代码/脚本证实可用）、`implementable`（常规工程可实现，无外部依赖不确定性）、`needs_validation`（存在 API 或机制但权限/语义/稳定性未验证，接入前必须先做验证任务并回退人工）、`manual_only`（当前只能人工操作，工作台只做提示与登记）。

| 能力 | 评级 | 说明与回退 |
|---|---|---|
| D 盘文件读取/SHA-256/目录监控 | implementable | Runner 本地能力；新增文件只登记，不改写原件 |
| 规范化命名与归并（音频合并/Markdown 规范化） | implementable | 音频合并保持原始顺序并记录源清单；执行前需人工点击批准 |
| VPN/连通性探测 | implementable | 对 Claude/Codex/飞书端点做 TCP/HTTPS 探测并如实显示「探测结果」；不宣称「VPN 已开启」这一推论 |
| 飞书群定位（按导师标识+「榨职机」搜索） | needs_validation | 依赖飞书自建应用与搜索类 scope；验证失败回退人工在 Dashboard 选择群 |
| 飞书消息/文件下载 | needs_validation | 依赖 im 消息与资源下载权限；失败回退人工下载 + Runner 登记哈希 |
| 飞书文件上传 + 固定文案发送 | needs_validation | 发送文案由 AGENTS 模板固定；每次发送需人工点击批准；失败回退人工发送 |
| 打开飞书群会话（deep link） | implementable | 提供群链接按钮，人工跳转 |
| Claude 桌面端任务提交（导师风格摹写对话） | manual_only | 无已验证控制接口；Runner 仅负责探测、打开软件、登记人工提交动作 |
| Claude 产物登记与 `by sonnet` 归档 | implementable | 人工下载后 Runner 校验字节/哈希并归档登记 |
| Codex 专属对话创建/追加触发语 | needs_validation（CLI 非交互模式；用户决定 P1 即接入验证）/ manual_only（桌面端，作为回退） | 「同一导师持续追加」语义、D 盘工作区约定、结构化完成报告需在 P1 验证；失败按 R1-R3 回退人工，Trae 不得代做 |
| Codex 实时心跳/阶段上报 | needs_validation | 无则只显示开始/结束时间与人工确认状态，不得臆测内部进度 |
| Codex 安全中断/继续 | needs_validation | 无则回退「请求停止」按钮记录人工操作 |
| Trae 应用集成执行 | manual_semi | 人工在 Trae IDE 触发集成流程；Runner/服务端核对 Git SHA、测试报告与部署状态 |
| Git 推送 main / master | verified | 既有规则与凭据体系 |
| 部署脚本（03/20/05 系列） | verified | 既有 deploy-scripts |
| 失败告警外呼 | implementable | 飞书群自定义机器人 webhook 推送（Q10 定案）；机器人配置属部署动作，P1 接入 |

---

## 4. 角色与权限矩阵、单写者规则

### 4.1 操作者

| 操作者 | 身份 | 能做 | 不能做 |
|---|---|---|---|
| 用户 | 唯一 ADMIN_FULL，生产发布授权人 | 点击全部门禁按钮、人工处理失败、最终裁决 | —— |
| Trae | 应用集成执行者 | 快照对账、备份、集成、测试、推送 main、执行部署脚本（均需对应门禁） | 修改导师 Prompt、知识卡内容或分类；未经第一次确认动应用仓库；未经第二次确认推 master |
| Codex | 内容生产唯一执行者 | 在 D 盘完成 Assembly、候选更新、pending 卡逐张处置、Final Handoff | 触发飞书发送；修改应用仓库 |
| Claude | 二级分析材料提供者 | 在「导师风格摹写对话」中产出人格 Prompt 初稿 | 其输出不得覆盖人工文字稿与音频，不作为已核实事实 |
| Runner | 本机执行与观测代理 | 文件哈希/归档登记、探测、打开应用、执行已授权的飞书/文件指令 | 无人工授权执行任何写操作或发送 |
| 导师（飞书侧） | 材料与回复来源 | 上传音频/文字稿/审核清单回复 | —— |

Agent 分工硬规则（R1-R3，任何阶段不得豁免，同时适用于 Claude 与 Codex）：

1. **R1 不代做**：Trae 不得替 Claude 或 Codex 执行任何内容生产与分析产出。Claude 的人格 Prompt 初稿只能由 Claude 在「导师风格摹写对话」中产出；Codex 的 Prompt 起草、知识卡构建、覆盖审计等 Assembly 步骤一律由 Codex 完成。Claude 桌面端不可用、Codex CLI 驱动失败或超时时，只能回退人工操作，Trae 不得代做产出，也不得用自己生成的内容顶替。
2. **R2 只做检查与装配**：Trae 在 Claude/Codex 完成后仅负责检查（核验完成报告、产物路径、验证结果、哈希登记）和装配（产物登记、handoff 交接、应用集成），不介入中间过程的内容判断，不补写、不改写任一 Agent 的产出正文。
3. **R3 人工监督**：Claude/Codex 执行期间 Dashboard 实时显示其公开阶段与产物变化（无心跳通道时如实标记 manual_only）；最终判定（Claude 输出是否可归档、Assembly 是否算完成、QC 是否通过）必须人工确认，Trae 不得自行下最终结论。

### 4.2 单写者规则（区域 → 唯一写者）

| 区域 | 唯一写者 | 其余方 |
|---|---|---|
| `D:\database\mentors\<导师>\` 原始素材（audio/word 来源目录） | Runner（仅新增下载件，登记制） | 一律只读；不改名、不覆盖、不删除 |
| `work\<版本>\`（Assembly 内容） | Codex（该导师 Assembly 期间独占） | Trae/Runner 禁写；人工只在 QC 失败时经 Codex 对话要求修订 |
| `… by sonnet.md` 归档件 | Runner（校验哈希后落盘登记） | 不改正文 |
| `knowledge-governance/current` | Codex（按治理规范）；回写同步需人工批准 | Trae 不得反向覆盖较新快照 |
| 应用仓库 `main` | Trae（第一次门禁通过后） | 其他方不推送 |
| `master` 与生产 | Trae 执行 deploy-scripts（第二次门禁通过后，锁定已验收 SHA） | 内容完成不构成发布授权 |
| 飞书群发送 | Runner（逐次批准后）或人工；发送留 dedup 键与证据 | 禁止未批准的自动重发 |
| 控制平面数据（Run/Step/Artifact/Approval 表） | 控制平面 API（Runner 与页面均经 API 写入） | 直连数据库写一律禁止 |

### 4.3 任务合同与 handoff manifest

- 任务合同（task contract）：每个 Run 建立时生成，字段包括 mentorId、事件类型、边界（允许写入的目录白名单）、禁改清单（Prompt/知识卡/分类）、当前责任方、心跳要求、失败升级路径。Runner 与 Codex 交互均携带合同 ID，越界动作直接拒绝并显示。
- handoff manifest：Codex 交付物以 `TRAE_HANDOFF.md` 与 `source_manifest_final.json` 为合同载体（Final Handoff 阶段）；集成前控制平面生成应用侧交接单（目标路径、期望哈希、测试清单、回滚点），集成后回传实际哈希比对结果。

---

## 5. 页面信息架构（content.aihr.top）

```
/                        总览 Dashboard：Runner 心跳、活跃 Run 列表、待人工队列、异常告警
/runs                    全部导师流水线列表（筛选：阶段/责任方/阻塞类型）
/runs/[mentorId]         单导师流水线详情（当前阶段、时间线、门禁按钮、证据链接）
/runs/[mentorId]/agents  四方 Agent 活动面板（飞书/Claude/Codex/Trae 各一栏）
/runs/[mentorId]/artifacts  产物清单（路径、版本、SHA-256、字节、验证状态、审批状态）
/runs/[mentorId]/audit   该导师全部状态变更与人工操作审计
/approvals               跨导师待处理门禁队列（发送批准/集成批准/生产批准/失败处理）
/connectors              连接器状态与能力矩阵（本文件第 3 章的运行时呈现）
/audit                   全局审计时间线（只读）
/settings                Runner 配置、脱敏开关、通知渠道（预留）
```

信息架构原则：所有数据展示均为元数据级（路径、哈希、计数、状态、时间、责任方）；不展示 Prompt 正文、知识卡内容、访谈原文（见第 15 章）。

Run 创建入口（Q13 定案）：

1. 唯一的 Run 创建执行入口是 content.aihr.top 登录后的首页「🦞 新建导师龙虾 Run」按钮，点击走三步向导（选导师 → 确认飞书群 → 环境检查）。
2. Trae 对话框输入「导师龙虾」只做启动器：自动打开系统外部浏览器跳转 `https://content.aihr.top/`（需登录，未登录先到登录门，登录后落首页向导）；对话框侧不直接建 Run、不走第二套创建逻辑。
3. 向导第三步环境检查（Runner 心跳、VPN 端点探测）不通过时**不硬挡**：允许先建 Run 卡片挂 `waiting_runner`（Q14 定案），页面提示去 Windows 启动 Runner；Runner 首次心跳到达后自动接上并继续。飞书群未唯一确认则仍硬挡在第二步。

---

## 6. Dashboard 线框结构

### 6.0 全局 VPN 提示条（每个页面顶部，Runner 心跳驱动）

提示内容跟随「下一步要做什么」切换，不是单纯显示 VPN 开关状态：

| 态 | 触发条件 | 展示 | 交互 |
|---|---|---|---|
| 红 | 下一步需要 Claude/Codex/GitHub，端点探测不通 | 「下一步 Sx · xxx —— 需要 VPN，当前探测：未开启」+ 各端点芯片（飞书●/Claude○/GitHub○）+「重新探测」 | 点击展开各端点明细 |
| 绿 | 需要 VPN 且已通 | 收成一行「VPN 已开启且可用」 | 不打扰，不强制确认 |
| 黄 | 下一步是飞书收发文件却探到 VPN 开启 | 「建议关闭 VPN 保持直连」 | **仅提示**（Q16 定案），无需点「知道了」即会随步骤推进自动消失 |
| 灰 | Runner 离线，无探测数据 | 「无法探测：Runner 未启动」 | 附启动指引链接 |

探测端点：飞书、Claude、Codex、GitHub 加一个国内参照点（用于判断 VPN 总开关）；探测结果只表述「端点可达/不可达」，不推论 VPN 软件状态。S3 的正式探测结果写入 Run 时间线留证。

### 6.1 总览页

```
┌──────────────────────────────────────────────────────────────────────┐
│ content.aihr.top   [staging|production 徽标]   Runner: ● 在线 12s 前  │
├──────────────────┬───────────────────────────────────────────────────┤
│ 导师流水线列表     │  待人工处理队列（按紧急度）                          │
│ ─ Echo Huang     │  ┌─────────────────────────────────────────────┐  │
│   ●awaiting_send │  │ Echo Huang · 发送第一轮阅览文件 · [去批准]     │  │
│ ─ Minnie Zhou    │  │ Ying Wang  · 集成批准（Final Handoff v0.4）   │  │
│   ●codex_working │  └─────────────────────────────────────────────┘  │
│ ─ …              │  异常与告警                                        │
│                  │  ┌─────────────────────────────────────────────┐  │
│                  │  │ ⚠ Codex 心跳失联 8 分钟（Minnie Zhou）        │  │
│                  │  │ ⚠ VPN 探测失败（Claude 端点）→ waiting_human │  │
│                  │  └─────────────────────────────────────────────┘  │
└──────────────────┴───────────────────────────────────────────────────┘
```

### 6.2 单导师详情页

```
┌──────────────────────────────────────────────────────────────────────┐
│ Echo Huang · 第一轮素材接收        阶段: round1_docs_qc  责任方: Trae  │
├──────────────────────────────────────────────────────────────────────┤
│ 阶段时间线（横向）： ●材料收到 ─●归档 ─●VPN ─●Claude提交 ─○CodexAssembly │
├───────────────────────────────┬──────────────────────────────────────┤
│ 证据与产物（本阶段）            │ 人工动作面板                          │
│ · echo huang 第一轮访谈音频稿   │  [打开飞书群] [打开导师目录]           │
│   .m4a  sha256:3f9a…  已登记   │  [打开Codex对话] [提交人工补充信息]     │
│ · 文字稿 .md  sha256:81c2…     │  [请求停止/中断] [继续执行]            │
│ · QC 比对报告：4/4 项通过        │  ── 仅当 QC 通过且状态匹配时显示 ──    │
│   vs Ying_Wang 同类参考 v0.1    │  [批准发送：第一轮阅览文件]            │
├───────────────────────────────┴──────────────────────────────────────┤
│ 审计摘要（最近 5 条：时间 · 操作者 · 动作 · 结果）                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.3 生产发布确认页（第二次门禁专用视图）

```
┌──────────────────────────────────────────────────────────────────────┐
│ Ying Wang · 测试端验收                                                │
│ 测试端地址 / 部署版本 / 变更文件 / 前后哈希 / 导师卡数 / 测试结果 / 回滚点  │
│ 当前 main SHA: <sha>   （验收当刻锁定快照）                             │
│ ⚠ 本按钮将执行：以已验收 main 提交为唯一来源推进 master，触发生产部署，   │
│   更新公开域名 aihr.top。main 若在验收后发生变化，本按钮自动失效并要求重验。│
│                                                                      │
│   [ 验收通过并发布生产（main → master → aihr.top） ]                    │
│   [ 返回测试端继续验收 ]   [ 报告问题并退回 ]                            │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.4 单导师详情页的三个工作面板（S4 起按阶段出现/收起）

**面板 A：Claude 人工操作与归档登记卡**（S4 出现，S5 完成后只读折叠）

Claude 永久 manual_only，不做聊天式沟通区（避免暗示系统可驱动 Claude）。卡片内容：

1. 操作入口：「打开 Claude 桌面端」按钮 + 摹写对话名确认；登记开始/完成时间与指令文本备注（可选）。
2. 归档动作：人工下载产物后在卡内选取本地文件，Runner 计算字节数与 SHA-256、套用 `by sonnet` 规范命名、登记模型（Sonnet 5.5 中等），显示正文零修改校验结果。
3. R3 强制勾选：「该产物由 Claude 在导师风格摹写对话中生成，Trae 未代笔、未改写正文」。不勾选则产物不能进入 `claude_output_archived`，S6 不获得合法输入。

**面板 B：Codex 结构化指令区**（S6 起出现）

不做自由聊天框。固定展示该步触发语（如「构建××导师分身。」）+ 可选事实补充输入（只能补事实，不能改任务边界）+「我确认在该导师专属 Codex 对话提交，不新建对话」勾选。两个出口：

- 「复制触发语（人工粘贴）」——P1 即可用的默认路径；
- 「由 Runner 投递」——**含义：Runner 自动把固定触发语发送（投递）进该导师专属 Codex 对话，并回报投递时间与 Codex 开始信号**；属于 needs_validation 能力，P1 期间按钮**置灰可见并标「验证中」**（Q15 定案），验证通过人工确认后才启用。两种出口写同一格式的审计记录。

**面板 C：Trae 合同区**（S20 第一次门禁通过前锁定只读）

门禁前：显示锁定说明，无任何自由指令输入口（R1 的界面落地，不接受「帮我改 Prompt/知识卡」请求）。门禁后：展示 TRAE_HANDOFF.md 集成合同摘要、八类测试结果、修改文件清单、Git SHA 与回滚点（均只读）。

---

## 7. 完整状态机

### 7.1 状态总表

上游延伸段（全部 planned，能力验证前不得进入执行）：

| 状态 | 含义 |
|---|---|
| nda_verifying | NDA 文件接收与核验中 |
| nda_signed_verified | 已签署且已核验（可审计证据齐备） |
| nda_blocked | 未签/状态不明/文件无法核验，等待人工 |
| guide_sent | 妙记操作指南已发送 |
| round1_outline_sent | 第一轮访谈大纲已发送 |

当前主线段（本期设计核心）：

| 状态 | 含义 |
|---|---|
| waiting_runner | Run 卡片已建（导师与飞书群已确认），但环境检查未通过（Runner 离线等）；Runner 首次心跳到达自动接上，不自动过期 |
| waiting_round1_submission | 等待导师在群内提交第一轮音频+文字稿 |
| round1_material_received | 已定位并确认第一轮提交事件 |
| round1_archiving | 下载、归并、规范化命名、D 盘归档中 |
| round1_archived | 归档完成，来源清单与哈希登记齐备 |
| vpn_check_failed | VPN/连通性探测失败，waiting_human_input |
| claude_manual_step | Claude 人工提交中（manual_only 登记制） |
| claude_output_archived | Claude 产物已归档（by sonnet 命名+哈希） |
| codex_round1_assembly | Codex 第一轮 Assembly 执行中（心跳/阶段上报） |
| round1_docs_qc | 两份阅览文件与 Ying 参考比对中 |
| round1_docs_qc_failed | 格式/职责不一致，等待人工审核与 Codex 修订 |
| awaiting_send_approval_round1_docs | 等待人工批准发送阅览文件 |
| round1_docs_sent | 已发送，登记 dedup 键与证据 |
| waiting_round1_review_reply | 等待第一轮审核清单回复 |
| round1_reply_received | 回复已下载归档（_回复 命名+哈希） |
| codex_round1_absorb | Codex 吸收第一轮回复更新 Prompt/知识卡 |
| awaiting_send_approval_round2_outline | 等待人工批准发送第二轮大纲 |
| round2_outline_sent | 官方第二轮大纲已发送（固定链接） |
| waiting_round2_submission | 等待第二轮音频+文字稿 |
| round2_material_received | 第二轮提交事件确认（含轮次歧义人工确认） |
| codex_round2_update | Codex 第二轮候选更新中 |
| round2_docs_qc / _failed / awaiting_send_approval_round2_docs / round2_docs_sent | 第二轮审核清单比对、批准、发送 |
| waiting_round2_review_reply / round2_reply_received / codex_final_absorb | 第二轮回复接收与最终吸收 |

编入网站段（与 `D:\database\AGENTS.md` 第 22 节状态链逐字一致）：

`final_handoff_discovered → final_handoff_preflight → final_handoff_blocked / ready_for_integration → awaiting_staging_integration_approval → reconciling_snapshots → integration_backup_created → integrating_application → testing_staging → pushing_main → deploying_staging → awaiting_staging_acceptance → production_approval_granted → locking_accepted_main_sha → promoting_main_to_master → deploying_production → verifying_production → completed / production_failed_rolled_back`

干预态（可叠加于任意主线状态）：

`waiting_human_input`（缺材料/需人工选择/需人工确认）、`failed`（可重试）、`interrupted_resumable`（已停在检查点）、`cancelled`（终止并归档）。

### 7.2 迁移规则

1. 每次迁移必须携带：证据指针（产物哈希/消息 ID/命令输出）、时间、责任方、前一状态；失败、中断、重试、回滚追加记录，不覆盖历史。
2. 轮次事件判定严格遵循 AGENTS：第一轮访谈提交 ≠ 第一轮审核清单回复 ≠ 第二轮访谈材料 ≠ 第二轮审核清单回复，四类事件各自独立状态位；语义不明时进入 waiting_human_input，不自动发送给 Codex。
3. `final_handoff_blocked` 时不渲染任何集成按钮；`awaiting_staging_acceptance` 时不渲染生产按钮，直到用户完成测试端验收。

---

## 8. 流程步骤分解（操作者与单写者）

编号 S0–S22；「能力」列引用第 3 章评级。

| # | 步骤 | 触发 | 操作者 | 单写者 | 关键验证 | 失败处理 |
|---|---|---|---|---|---|---|
| S0 | Run 建立：确认导师身份、飞书群候选、环境检查 | Dashboard 首页「新建导师龙虾 Run」向导；Trae 对话框「导师龙虾」仅打开浏览器到 content.aihr.top（Q13） | 用户在向导操作 + Runner 心跳 | 控制平面 | 三步向导：导师目录不区分大小写唯一匹配；群身份唯一确认（不唯一硬挡）；环境检查不通过允许挂 `waiting_runner`（Q14） | Runner 离线 → waiting_runner，心跳到达自动接上；群无法唯一确认 → 停在第二步等待人工 |
| S1 | 第一轮材料定位与下载 | 群内确认提交事件 | Runner（飞书）或人工 | Runner 登记制 | 文件名/时间/上下文轮次判定；不覆盖已有文件 | 轮次不明/缺一类材料 → waiting_human_input |
| S2 | 归并与规范化命名入 D 盘 | S1 完成 | Runner（批准后） | Runner | 合并音频源清单（顺序/大小/SHA-256）；命名符合规范；原件全保留 | 哈希不一致 → failed，显式显示 |
| S3 | VPN/连通性探测 | S2 完成 | Runner | Runner | 对 Claude/Codex/飞书端点探测 | 失败 → vpn_check_failed，通知人工开启 |
| S4 | Claude 人工提交（导师风格摹写对话，Sonnet 5.5 中等） | S3 通过 | 人工（Runner 打开软件并登记） | 人工 | 登记提交时间与指令文本；不代答、不标记完成 | manual_only，全程人工确认点 |
| S5 | Claude 产物下载与 `by sonnet` 归档 | 人工完成 Claude | 人工下载 + Runner 校验归档（面板 A 登记卡） | Runner | 原始名/规范化名/模型/时间/字节/SHA-256 登记；正文零修改；必须勾选 R3「Claude 本人摹写对话生成、Trae 未代笔」才允许进入归档态 | 产物缺失或 R3 未勾 → 停留 claude_manual_step，S6 无合法输入 |
| S6 | Codex 第一轮 Assembly 提交（专属对话：「构建××导师分身。」） | S5 完成 | 人工提交或 Runner 驱动（needs_validation） | Codex 独占 work 目录 | 保存对话/任务稳定标识；不凭进程结束判完成 | 无心跳通道则仅登记开始/结束；中断走人工 |
| S7 | Assembly 完成核验 | Codex 报告完成 | Runner+控制平面 | 控制平面 | 核验完成报告、Assembly 路径、`00_START_HERE.md`、验证结果 | 报告缺失 → failed，人工处理入口 |
| S8 | 第一轮阅览文件定位 + Ying 参考比对 | S7 通过 | Runner 生成比对任务，Trae/控制平面执行 | 控制平面 | 两文件存在且版本以实际文件为准；与 `ying-v0.1` 同类参考比结构/职责/密度/可读性 | 不通过 → round1_docs_qc_failed（显示差异项） |
| S9 | 人工批准 + 发送阅览文件（固定文案） | S8 通过 | 用户批准，Runner 发送（needs_validation）或人工 | Runner/人工发送登记 | dedup 键=群+模板+两文件哈希；发送留证据 | 发送失败 → failed，禁止自动重发 |
| S10 | 第一轮审核清单回复接收归档（`_回复` 命名） | 群内上传事件 | Runner 或人工 | Runner 登记制 | 上传人/消息 ID/时间/字节/SHA-256；不改写回复 | 文件歧义 → waiting_human_input |
| S11 | Codex 吸收第一轮回复（固定触发语） | S10 完成 | 人工/Runner（同 S6 通道） | Codex | 复用同一 Codex 对话标识 | 同 S6 |
| S12 | 人工批准 + 发送第二轮官方大纲（固定链接+固定文案） | S11 完成且验证通过 | 用户批准，Runner/人工发送 | 发送登记 | 链接与文件名 `AI_Career_导师interview_2_v1.0.docx` 固定；禁另写大纲 | 同 S9 |
| S13 | 第二轮材料识别与归档（第二个含音频提交事件） | 群内事件 | Runner 或人工 | Runner 登记制 | 结合文件名/时间/上下文与来源清单；歧义必人工确认 | 误判风险高 → 默认 waiting_human_input |
| S14 | Codex 第二轮候选更新（固定触发语） | S13 完成 | 同 S6 | Codex | 产出第二轮候选包与审核材料 | 同 S6 |
| S15 | 第二轮审核清单比对（vs `ying-v0.3` 参考）+ 批准 + 发送 | S14 验证通过 | 同 S8+S9 | 同上 | 版本以实际文件为准；检查不通过中断 | 同 S8/S9 |
| S16 | 第二轮审核清单回复接收归档 + Codex 最终吸收 | 群内事件 | 同 S10+S11 | 同上 | `_回复` 命名规则（含 Freya 示例勘误口径） | 同 S10 |
| S17 | Final Handoff 发现 | Codex 报告完成 | 控制平面 | 控制平面 | 按 `00_START_HERE.md`/manifests/验证报告定位最新有效不可变包；以 ying-final-handoff-v0.4 为结构参考 | 定位失败 → final_handoff_blocked |
| S18 | Final Handoff 完整预检 | S17 通过 | 控制平面（复用 Codex 校验脚本） | 控制平面 | AGENTS 第 16 节全部核对项逐项显示证据与数值 | 任一失败 → final_handoff_blocked（问题/证据/责任方/入口） |
| S19 | pending 归零处置 | 预检发现 pending | Codex 逐张处置 | Codex | 列出 cardId/分类/阻塞原因/所需依据；四种处置结果之一；Trae 无升级权 | 缺确认的卡保持 pending 并阻塞 |
| S20 | 准备就绪报告 + 第一次人工确认 | 全部通过 | 用户点击「确认交给Trae集成至main和测试端」 | 控制平面 | 显示完整就绪信息与「不触碰 master/生产」声明 | 不通过则停留 blocked |
| S21 | Trae 集成：双快照对账 → 备份 → 集成 → 八类测试 → 推 main → 部署测试端 | S20 点击 | Trae（人工在 IDE 触发，控制平面核对） | Trae（应用侧） | `TRAE_HANDOFF.md` 为合同；时间戳备份记录哈希；任何失败 → staging_failed | 失败显示步骤/日志/文件/回滚状态 |
| S22 | 测试端人工验收 + 第二次按钮 | S21 完成进入 awaiting_staging_acceptance | 用户 | 控制平面 | 锁定已验收 main SHA；SHA 变化自动中止并要求重验 | 生产失败 → production_failed_rolled_back |

需求覆盖对照（27 项 → 章节）：1-2 上游 NDA（§1.2/§7.1）；3 飞书定位下载归并命名归档（S0-S2）；4 VPN（S3）；5-6 Claude（S4-S5）；7-8 Codex 对话与 Assembly（S6-S7）；9 比对（S8）；10 审核清单收发（S9-S11）；11-12 第二轮大纲与材料（S12-S13）；13-14 第二轮候选与审核（S14-S16）；15 Final Handoff（S17-S18）；16 pending 归零（S19）；17 展示（§10/§11）；18-20 两次门禁与 SHA 锁（S20-S22/§9）；21 统一监控（§10）；22 干预恢复（§14）；23 控制平面+Runner（§2）；24 能力矩阵（§3）；25 权限/单写者/合同/manifest（§4）；26 MentorSubmission 与 AuditLog（§12）；27 心跳/失联/幂等/防重发/脱敏（§10/§15/§16）。

---

## 9. 按钮清单（名称、位置、实际权限）

| 按钮（精确文案） | 出现状态 | 实际授权范围 | 后端动作 | 审计 |
|---|---|---|---|---|
| `🦞 新建导师龙虾 Run` | 总览页（登录后常驻） | 仅创建 Run 卡片与执行 S0 三步向导 | 建 Run；环境不过挂 waiting_runner | 记录创建人、导师、群候选与环境结果 |
| `复制触发语（人工粘贴）` | Codex 各提交步骤（S6/S11/S14/S16） | 仅把该步固定触发语复制到剪贴板，不发送任何内容 | 无外部写入；登记复制时间 | 记录复制人、步骤、时间 |
| `由 Runner 投递`（置灰标「验证中」） | 同上 | 验证通过后：授权 Runner 把固定触发语自动投递进该导师专属 Codex 对话一次；P1 置灰不可点（Q15） | 入指令队列，Runner 投递并回报开始信号 | 记录投递指令哈希、时间、Codex 对话标识 |
| `确认归档 Claude 产物`（随面板 A，受 R3 勾选门控） | claude_manual_step | 仅授权 Runner 对本地选取文件做哈希、`by sonnet` 命名与归档登记，不改写正文 | 校验+登记，状态转 claude_output_archived | 记录文件元数据、模型、R3 勾选人 |
| `批准发送：第一轮阅览文件` | awaiting_send_approval_round1_docs | 仅本次发送（两文件+固定文案到已确认群） | 下发 Runner 指令或标记人工已发送 | 记录按钮人、文件哈希、dedup 键 |
| `批准发送：第二轮访谈大纲` | awaiting_send_approval_round2_outline | 仅本次发送（官方链接+固定文案） | 同上 | 同上 |
| `批准发送：第二轮审核清单` | awaiting_send_approval_round2_docs | 仅本次发送 | 同上 | 同上 |
| `确认交给Trae集成至main和测试端` | awaiting_staging_integration_approval | 只授权应用集成、推 main、部署/更新测试端；不授权 master 与生产 | 解锁 S21；生成集成合同 | 记录 Final Handoff 版本与全量哈希 |
| `验收通过并发布生产（main → master → aihr.top）` | awaiting_staging_acceptance | 以已验收 main SHA 为唯一来源推 master、生产部署、更新 aihr.top | 锁 SHA → 校验 → 推进 | 记录锁定 SHA、按钮时间、部署版本 |
| `请求停止/中断` | Codex/Runner 执行中 | 请求在检查点安全停下，不破坏已生成文件 | 记录请求并投递 | 全记录 |
| `提交人工补充信息` | waiting_human_input | 提交文本/文件指针进入 Run 时间线 | 追加证据，触发对应步骤继续 | 全记录 |
| `继续执行` | interrupted_resumable | 从检查点恢复 | 投递恢复指令 | 全记录 |
| `请求重做` | qc_failed / failed | 向该导师 Codex 专属对话发出重做任务（由人工粘贴或 Runner 投递） | 登记重做原因 | 全记录 |
| `重新验证` | blocked 类状态 | 仅重跑验证，不改产物 | 执行验证器 | 全记录 |
| `回滚到检查点` | staging_failed / production_failed_rolled_back | 按既有回滚方案执行 | 执行并复验哈希 | 全记录 |

按钮渲染规则：状态不匹配的按钮一律不渲染（置灰也不允许），防止误点；每个按钮旁固定显示其影响范围声明。例外仅一处：`由 Runner 投递` 在能力验证期置灰可见（Q15），用于明示规划能力与当前回退路径。

审批点勾选规则：发送类与集成类门禁按钮上方固定一组「证据核对勾」（如：文件已通读且版本一致、QC 各项通过、目标群已确认、固定文案未改动），勾的是证据核对动作而非空泛同意；未全部勾选时批准按钮不可点。Claude 归档的 R3 勾选同属此类门控。

---

## 10. Agent 监控字段

统一原则：Dashboard 只展示各 Agent 主动报告的阶段、心跳、工具活动、产物和验证结果；不要求、不展示、不推断模型私有思维链；心跳缺失只显示「失联」，不臆测内部进度。

| Agent | 监控字段 |
|---|---|
| Runner | 在线状态与最近心跳、版本、当前执行指令、队列深度；心跳载荷携带端点探测结果（飞书/Claude/Codex/GitHub/国内参照点各自可达性与探测时间），供 §6.0 VPN 提示条按「下一步步骤」渲染红/绿/黄/灰四态；Runner 离线时提示条显式显示「无法探测」，不使用旧数据冒充 |
| 飞书 | 目标群、最近相关消息（仅元数据：时间/类型/文件名）、发送与下载记录、消息状态、失败原因 |
| Claude | VPN/连通性探测结果、目标对话名（导师风格摹写对话）、所用模型（Sonnet 5.5 中等）、上传文件哈希、人工提交时间、R3 人工确认记录与确认人、输出文件哈希 |
| Codex | 对话/任务稳定标识、心跳、公开阶段（来源定位/来源核验/音频分析/Claude侧描对照/Prompt起草/知识卡构建/覆盖审计/审核文档生成/Assembly验证/最终位置验证/已完成/等待人工输入/失败）、最近一条状态更新、当前读写目录、已生成产物、验证状态、阻塞原因、中断入口 |
| Trae | 快照对账结果、备份记录、修改文件清单、测试结果、Git 状态、main/master SHA、测试端部署与生产部署状态、健康检查 |
| 产物 | 来源路径、Final Handoff 路径、版本、大小、SHA-256、验证与审批状态 |
| 人工动作 | 打开飞书群/Claude/Codex/Trae 项目/导师目录/Final Handoff/测试端/生产端的入口按钮与点击记录 |

心跳与失联：Codex 心跳通道未验证前（needs_validation），该栏显示 `manual_only：以人工确认为准`；Runner 心跳 30 秒上报，>3 分钟未上报标记失联并在总览页告警。

---

## 11. 文件与产物模型

### 11.1 产物登记模型（控制平面 Artifact）

| 字段 | 说明 |
|---|---|
| artifactId / runId | 主键 / 所属流水线 |
| kind | source_audio / source_transcript / merged_audio / normalized_md / claude_output / codex_work_package / review_doc / review_reply / final_handoff / app_integration_backup / deployment_record |
| path / displayPath | 绝对路径 / 展示用相对路径 |
| sha256 / bytes / version | 哈希、大小、版本号（以实际文件与 `00_START_HERE.md` 为准，不硬编码） |
| sourceType | primary（人工文字稿/音频）/ secondary（Claude 输出等二级分析材料）/ generated |
| provenance | 原始名、上传人、消息 ID、下载时间、合并源清单 |
| validationStatus / approvalStatus | 验证结果 / 审批状态 |
| immutable | 原始材料与已发布 Final Handoff 为 true，禁止覆盖 |

### 11.2 D 盘侧目录约定

完全遵循 `D:\database\AGENTS.md` 第 4 节目录结构与第 3 节命名规范，本文档不复述全文，仅声明：工作台在建目录前执行不区分大小写导师目录匹配，禁止因大小写/空格/昵称差异重复建目录；`aaaa bbb` 忽略、`z-others` 与 `D:\database\xinzang` 只读。

### 11.3 Final Handoff 核对清单（预检基线）

预检逐项核对 AGENTS 第 16 节所列内容（核心文件、baseline/deployment-baseline/review-source/audio-analysis/Prompt System 快照、Schema 解析、cardId 唯一性与轮次连续性、分类与披露合法组合、来源哈希与音频覆盖、未吸收回复与隐私冲突、`TRAE_HANDOFF.md` 完整性、双快照对账），Dashboard 逐项显示状态、证据路径与实际数值，不显示笼统「通过」。

### 11.4 双快照对账模型

baseline 同时保存内容生产侧快照（D 盘 `knowledge-governance/current`）与应用集成侧快照（`content/knowledge-governance/`，manifest + cards + prompts），按导师、cardId、Prompt 版本、SHA-256 逐项对账；两侧不一致时列出差异、选用依据与防回退验证，禁止从较旧快照重新生成覆盖较新快照（遵循 AGENTS「与Trae主项目对齐」第 2 节）。

---

## 12. 数据模型草案（仅设计，不改 Schema）

新建内容运营表族（MySQL 同库，`content_ops_` 前缀隔离）：

| 表 | 职责 |
|---|---|
| ContentOpsRun | 一位导师一次端到端流水线实例（mentorDir、事件类型、状态、当前责任方、任务合同 JSON） |
| ContentOpsStep | 步骤记录（runId、步骤号、状态、操作者、开始/结束时间、幂等键、失败原因、证据指针） |
| ContentOpsArtifact | 第 11.1 节产物登记 |
| ContentOpsAgentEvent | Agent 事件流（心跳、公开阶段、状态更新、来源 Agent、原始报告 JSON） |
| ContentOpsApproval | 门禁点击记录（按钮名、授权范围、锁定 SHA、点击人、时间、关联证据） |
| ContentOpsFeishuMessage | 发送与下载登记（dedup 键唯一索引、群 ID、模板 ID、文件哈希、消息 ID、状态） |
| ContentOpsRunner | Runner 注册与心跳（机器标识、公钥、版本、最后心跳） |

与既有表的关系：

1. **AuditLog**：沿用 `docs/admin-mentor-system-v1.md` 第 25 章定义与结构，本工作台扩展 `action` 枚举（`content_ops.approve_send`、`content_ops.integration_approve`、`content_ops.production_approve`、`content_ops.runner_command` 等），只承担过程审计，不承担业务计数职能。工作台所有按钮点击、Runner 指令下发、敏感查看均写入。
2. **MentorSubmission**：仍是 mentor.aihr.top 面向导师的资料修改与内容反馈业务表（PROFILE_EDIT / CONTENT_CORRECTION / CONTENT_SUPPLEMENT），工作台不向其写入任何数据，两者无外键关系。未来若开放导师在 dashboard 直接提交案例分享，由该表记录业务申请，经人工评审后另建 ContentOpsRun（事件类型 = 案例加工），该扩展需单独评审，不在本稿承诺。
3. 分工口径：MentorSubmission = 业务申请单（谁申请了什么），ContentOpsRun/Step = 流水线状态（活干到哪一步），AuditLog = 过程审计（谁在何时授权/操作了什么）。三表互不代写。

---

## 13. 人工审批点汇总

| # | 门禁 | 位置 | 通过条件 | 失败路径 |
|---|---|---|---|---|
| G1 | 发送第一轮阅览文件 | S9 | QC 全项通过 + 状态匹配 | qc_failed → 人工在 Codex 对话要求修订 |
| G2 | 发送第二轮大纲 | S12 | Codex 第一轮吸收完成并验证 | blocked → 人工处理 |
| G3 | 发送第二轮审核清单 | S15 | 第二轮比对通过 | qc_failed → 人工 |
| G4 | 第一次集成确认 | S20 | Final Handoff 预检全过 + pending 归零（非 Trae 批量升级） | final_handoff_blocked |
| G5 | 测试端验收 + 生产发布 | S22 | 用户在测试端亲自验收 + SHA 未变 | SHA 变化自动中止，要求重测重验 |
| G6 | Codex 中断/继续/重做 | 执行期任意点 | 用户主动 | 记录并保持检查点 |
| G7 | 回滚确认 | staging_failed / 生产失败 | 用户主动 | 执行既有回滚方案并复验 |
| G8 | 敏感查看 | artifacts/audit 页 | 每次查看敏感登记写审计 | —— |

---

## 14. 失败恢复

| 情形 | 行为 |
|---|---|
| 材料缺失/轮次不明/群不唯一 | 进入 waiting_human_input，Dashboard 列出缺失项与候选证据，提供「提交人工补充信息」 |
| VPN/端点不可达 | vpn_check_failed，通知人工开启；恢复后从 S3 续跑，已归档材料不重下 |
| Claude 步骤人工中断 | claude_manual_step 可长期停留；重新提交登记新时间，不覆盖旧登记 |
| Codex 中断 | 「请求停止/中断」请求安全停在检查点；「继续执行」从检查点恢复；重新执行不覆盖上一版本（版本递增） |
| Codex 失联 | 心跳失联告警；显示最后已知状态与「打开Codex对话」入口；人工确认实际进度后登记，不臆测 |
| QC 不通过 | 流程在发送前中断；显示差异项；人工在同一 Codex 对话说明错误要求修订；Trae 不代改文档 |
| 飞书发送失败 | 显式 failed + 失败原因；禁止自动重发；重新发送必须再次人工批准（dedup 键防重） |
| 集成/测试/推送失败 | staging_failed：显示失败步骤、日志摘要、受影响文件、回滚状态与人工入口；不得继续生产 |
| 生产失败 | 停止后续动作，按既有回滚方案执行；不得因 Git 推送成功而报告生产成功 |
| 任何失败 | 一律不得静默跳过；Dashboard 显示失败步骤、证据、责任方与人工处理入口 |

---

## 15. 安全边界与脱敏

1. 鉴权：`content.aihr.top` 可访问角色为 ADMIN_FULL（唯一管理员，全部门禁按钮）与只读观察账号（仅查看，所有按钮不渲染）（Q5 定案）；Runner 与云端使用双向令牌（Runner 注册公钥，指令签名下发）；复用既有 `.aihr.top` Cookie 域策略与登录回调白名单模式。
2. 展示脱敏：不显示 Prompt 正文、知识卡内容与内部元数据、访谈原文、导师回复原文、令牌、Cookie、数据库连接串；产物路径默认显示相对路径+哈希前 8 位，点击展开完整路径与完整哈希（Q8 定案）；另有字节数、计数、状态与时间。
3. 卡号与审核元数据不上屏（沿用知识卡不可见规则）；面向用户的泄露防护不因工作台存在而放松。
4. 日志脱敏：控制平面日志与 Agent 事件落库前执行脱敏扫描（正则匹配密钥/连接串/手机号模式），命中即掩码并告警。
5. 网络边界：Runner 仅出站 HTTPS 到控制平面与必要端点；ECS 不持有访问用户内网的凭据；D 盘路径不进入任何公开前端。
6. 写保护：原始材料与已发布 Final Handoff 标记 immutable；控制平面 API 拒绝任何对 immutable 产物的修改请求。
7. 全审计：按钮、指令、文件写入、发送、查看全部落 AuditLog，失败也留痕。

---

## 16. 心跳、失联、幂等与防重复发送

1. 心跳：Runner 30 秒上报；Agent 心跳按各通道能力（Codex needs_validation）；失联显示为 `unknown/失联`，不推内部进度。
2. 步骤幂等：每个步骤定义幂等键（如 `mentorId:step:S2:sourceSha`），重复执行先查已有证据，命中即返回既有结果并显示，不重复落盘。
3. 防重复发送：ContentOpsFeishuMessage 对 dedup 键（群 ID + 模板 ID + 文件哈希集合 + 目标事件）建唯一索引；发送前查重，重复请求直接拒绝并展示首次发送证据；按钮点击后进入 60 秒执行锁，执行中按钮不可再点。
4. 事件幂等：Agent 事件带 eventId，服务端去重，重试不产生重复时间线。
5. 状态迁移幂等：同一状态迁移带前置状态校验，非法迁移拒绝并告警。
6. 通知（Q10 定案）：门禁等待与失败告警通过飞书群自定义机器人 webhook 推送；推送内容仅含导师代号、阶段名、失败摘要与按钮指引，不含 Prompt、知识卡、访谈原文等敏感数据。

---

## 17. 当前可实现能力与需要验证的能力

### 17.1 现在即可实现（implementable / verified）

1. 控制平面 UI、表族、审计、按钮与状态机（纯工程）。
2. Runner 文件哈希、规范化归档登记、目录匹配、打开应用/目录、VPN 端点探测。
3. `by sonnet` 归档登记与 immutable 保护。
4. Final Handoff 预检脚本（复用 Codex 既有校验器）与双快照对账脚本。
5. Git/部署脚本执行与 SHA 锁定校验（复用 deploy-scripts）。

### 17.2 需要先验证才能自动化的能力（needs_validation）

1. 飞书自建应用：所需 scope（群搜索、消息读取、资源下载、文件上传、消息发送）、租户管理员审批、限流与稳定性。
2. Codex：非交互驱动方式、同导师专属对话持续追加语义、D 盘工作区约定生效、结构化完成报告、心跳通道、安全中断。
3. 失败外呼通知渠道。

验证方式：每个能力先做独立验证任务，输出验证报告（成功样例、失败样例、回退方案），人工确认后才允许接入自动化；验证未过一律 manual_only。

---

## 18. 分阶段开发计划

| 阶段 | 范围 | 前置 | 验证标准 | 发布边界 |
|---|---|---|---|---|
| P0 | 本评审稿人工评审、问题清单定稿（Q1-Q17 已全部定案） | —— | 用户批准设计 | 仅文档 |
| P1 | 最小工作台：表族、Run/Step/Artifact/Approval、新建 Run 三步向导与 waiting_runner、总览与详情页（含 VPN 提示条、面板 A/B/C、证据核对勾门禁）、Runner（文件哈希+端点探测+心跳，按需手动启动）、Codex CLI 驱动验证（「由 Runner 投递」置灰，R1-R3 与人工监督，Claude 全程人工+登记卡）、飞书操作人工执行+登记 | P0 批准（待用户批准开工） | `lydia chen pilot` 副本走完 S0-S7（含 CLI 驱动验证）；审计完整 | 只推 main + 测试端 |
| P2 | 飞书连接器验证与接入（定位/下载/上传发送），含回退 | P1 验收 | 验证报告 + 真实导师 S1/S9/S12 全链路 | 同上 |
| P3 | Codex 连接器验证（驱动/心跳/中断），含回退 | P1 验收 | 验证报告 + S6-S7/S11/S14 自动化可用 | 同上 |
| P4 | 集成与发布门禁自动化：预检脚本、双快照对账、八类冒烟测试触发、SHA 锁定、两次按钮落地 | P1-P3 | 端到端演练（Ying 或新导师） | 同上 |
| P5 | 上游延伸：NDA 核验、妙记指南与第一轮大纲发送 | P2 完成 + NDA 数据来源定案 | 单独验收 | 同上 |

每阶段完成后需用户明确验收才进入下一阶段；生产发布始终按第二次门禁单独执行。

---

## 19. 待用户确认的问题

> 评审结果：以下 12 项问题已全部定案，逐项决定见第 20 章评审决定记录。本节保留原始问题清单供追溯。

1. **Q1 部署形态**：控制平面采用方案 A（同容器 `/content-ops` 路由组，推荐）还是方案 B（独立服务）？若选 A，是否同意后续以 `CONTENT_DOMAIN=content.aihr.top` 环境变量接入 auth.ts 既有 Host 路由模式？
2. **Q2 飞书接入路径**：飞书能力验证采用哪种主体？可选项：新建企业自建应用（需申请 scope 与管理员审批）/ 使用 lark-cli 已有凭据试点 / 两者都试再定。
3. **Q3 Codex 控制取舍**：Codex 驱动优先验证 CLI 非交互模式，还是先接受桌面端人工 + 登记制跑通 P1，再验证 CLI？
4. **Q4 Runner 形态**：Runner 做成常驻后台进程（开机自启、断网重连），还是按需手动启动的脚本？断网期间本地登记如何补偿（本地队列重放是否可接受）？
5. **Q5 Dashboard 账号**：是否确认仅现有唯一 ADMIN_FULL 账号可访问 content.aihr.top，不新增角色？
6. **Q6 首位试点导师**：P1 端到端演练用哪位导师的真实材料？候选：尚未建目录的 Minnie Zhou（周敏君）/ 已有增量需求的 Freya Ren（第二轮未完成）/ 新导师。
7. **Q7 AuditLog 合并**：内容运营审计与 admin-mentor-system-v1 的 AuditLog 合用一张表（扩展 action 枚举），还是独立 content_ops 审计表？
8. **Q8 脱敏粒度**：产物路径与哈希在页面上默认显示到什么粒度（完整路径可展开 / 仅相对路径 / 仅哈希+代号）？
9. **Q9 SHA 锁定窗口**：测试端验收后，main SHA 锁定不设过期；若长期不点生产按钮但 main 已前进，自动失效并要求重验——是否符合预期？是否需要额外提醒机制？
10. **Q10 失败通知**：门禁等待与失败告警的外呼渠道选哪种：飞书机器人推送 / 邮件 / 仅页面徽标（登录才可见）？
11. **Q11 pending 处置入口**：pending 卡处置一律由人工在「打开Codex对话」发起整改任务，工作台只列清单——是否需要额外的结构化「整改任务单」记录（每次整改生成一条可追踪记录）？
12. **Q12 NDA 数据来源**：P5 的 NDA 签署状态以什么为权威证据（飞书签收文件 + 人工核验登记 / 未来法务系统 / 其他）？在来源定案前 P5 保持 planned。

---

## 20. 评审决定记录

| 问题 | 决定 | 日期 |
|---|---|---|
| Q1 部署形态 | 方案 A：同容器 `/content-ops` 路由组，后续以 `CONTENT_DOMAIN=content.aihr.top` 接入 auth.ts 既有 Host 路由模式 | 2026-10-06 |
| Q2 飞书接入 | 先用 lark-cli 试点（此前已在 Trae 环境跑通，凭据可用）；试点验证通过后，再尝试新建飞书自建应用申请 scope | 2026-10-06 |
| Q3 Codex 控制 | P1 直接走 CLI 驱动。此前失败原因：未写死「Trae 不替 Codex 干活」、最终判定归属不清。现规定：Trae 只做最后一步的检查和装配，全程人工介入监督（详见 §4.1 硬规则 R1-R3） | 2026-10-06 |
| Q4 Runner 形态 | 按需手动启动（P1 节奏人工参与度高，常驻后台留待自动化成熟后再评估） | 2026-10-06 |
| Q6 试点导师 | 用 Lydia Chen 数据造副本跑通 P1；副本目录名 `lydia chen pilot`（与真实 `lydia chen` 明显区分，满足"不重复建目录"规则）；跑完后由用户手工删除副本目录与控制平面登记；真实 Lydia 的材料、已上线分身与知识卡一律不碰 | 2026-10-06 |
| Q9 SHA 锁定 | 同意：测试端验收后锁定 main SHA 不设过期；main 前进即自动失效并要求重新测试和验收 | 2026-10-06 |
| Q5 Dashboard 账号 | ADMIN_FULL 唯一管理员 + 一个只读观察账号（仅查看，所有按钮不渲染） | 2026-10-06 |
| Q7 审计表 | 合用一张 AuditLog，扩展 action 枚举（`content_ops.*` 前缀），不另建独立审计表 | 2026-10-06 |
| Q8 脱敏粒度 | 产物路径默认显示相对路径 + 哈希前 8 位，点击展开完整路径与完整哈希 | 2026-10-06 |
| Q10 通知渠道 | 飞书群自定义机器人 webhook 推送门禁等待与失败告警 | 2026-10-06 |
| Q11 pending 整改 | 不建结构化整改任务单：Dashboard 只列 cardId/分类/阻塞原因清单，整改由人工在 Codex 对话发起，处置过程以 Run 时间线记录 | 2026-10-06 |
| Q12 NDA 来源 | 暂不定，P5 启动前专项讨论；在此之前 P5 保持 planned | 2026-10-06 |
| Q13 Run 创建入口 | 唯一创建执行入口是 content.aihr.top 首页「新建导师龙虾 Run」三步向导；Trae 对话框输入「导师龙虾」仅作启动器，自动打开外部浏览器到该子域（需登录），不在对话框侧建 Run | 2026-10-07 |
| Q14 环境检查不通过 | 不硬挡：允许先建 Run 卡片挂 waiting_runner，Runner 首次心跳到达自动接上；飞书群未唯一确认仍硬挡在向导第二步 | 2026-10-07 |
| Q15 Runner 投递按钮 | 「由 Runner 投递」=Runner 自动把固定触发语投递进该导师专属 Codex 对话；P1 期间置灰可见标「验证中」，默认路径为「复制触发语（人工粘贴）」；验证经人工确认后启用 | 2026-10-07 |
| Q16 VPN 黄态交互 | 「建议关闭 VPN 保持直连」仅提示，不要求点击确认，随步骤推进自动消失 | 2026-10-07 |
| Q17 Claude 工作面板 | 不做聊天式沟通区：S4-S5 使用「人工操作与归档登记卡」（打开桌面端、时间/备注登记、本地产物选取、哈希与 by sonnet 归档、R3 未代笔强制勾选），归档后只读折叠 | 2026-10-07 |

第 19 章问题清单至此全部定案。

---

## 21. 本阶段承诺

1. 本阶段仅新增本文档 `docs/mentor-content-operations-v1.md`，未修改任何代码、Prisma Schema、数据库、Git 分支、部署配置或域名。
2. 未开始 P1 及之后任何开发；所有待确认问题以第 19 章为准，等待人工评审结论后再启动。
