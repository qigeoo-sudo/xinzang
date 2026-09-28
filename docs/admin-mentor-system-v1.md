# AIHR 后台管理系统与数据采集规范 v1

版本：v1（合并定稿）
日期：2026-09-28
适用域名：`admin.aihr.top`、`mentor.aihr.top`

> 本文档整合自原三份文档（《AIHR 指标字典与埋点清单 v2》、《AIHR Admin 与 Mentor 后台管理系统产品方案 v0.2》、《AIHR Admin 与 Mentor 后台管理系统修订执行方案 v0.2》），是后台管理系统产品定义、数据采集规范和指标口径的唯一依据。
>
> 冲突解决原则：指标字典为最终修订版，其中所有口径、定义、规则以指标字典为准；产品方案提供的产品定义、功能模块、页面交互与导师管理流程作为"产品定义"部分保留；修订执行方案中的过程性审核意见不保留，其最终结论与决定融入相应章节。
>
> 代码里实现任何指标前，必须先在本文件中登记；既有指标定义不得覆盖修改，口径变化时新增 metricKey。

---

## Part I：产品定义

### 1. 系统总览

为 AIHR 建设两套相互关联、权限不同的可视化后台：

- **Admin 后台**（`admin.aihr.top`）：面向平台管理员，查看全平台用户、导师分身、对话、转化、运营和数据质量，并管理真人导师账号。
- **Mentor 后台**（`mentor.aihr.top`）：面向真人导师，让导师了解自己的 AI 分身帮助了哪些类型的用户、对话效果如何、用户最需要什么，以及哪些内容值得后续补充。

首版重点是"看得清、口径一致、权限安全"，不追求一次性做成复杂的数据中台。

#### 1.1 核心对象与统一命名

为避免"真人导师"和"AI 分身"混淆，统一采用以下定义：

| 对象 | 系统名称 | 说明 |
|---|---|---|
| 普通平台用户 | **Student** | 注册、测评、付费、与 AI 分身对话的人 |
| 导师 AI 分身 | **Mentor** | 现有代码中的导师分身业务对象，继续使用 `mentorId`，不改名为 `avatarId` |
| 真人导师登录账号 | **MentorHuman** | 登录 `mentor.aihr.top` 的真人导师，主键为 `mentorHumanId` |
| 后台工作人员 | **AdminHuman** | 登录 Admin 后台的人，按权限查看和处理数据 |
| 头像图片 | **avatar** | 仅表示头像图片，不作为业务对象名称 |

固定关系：

> 第一、二期均保持一个 `MentorHuman` 唯一绑定一个 `Mentor`，一个 `Mentor` 也只绑定一个 `MentorHuman`。首版不支持一名真人导师管理多个分身，也不支持多人共同管理一个分身，以减少对现有代码和内容结构的改动。

`ai-guide` 在现有代码中也使用 `mentorId`，但属于平台 AI 职业顾问，不属于真人导师分身。导师排行榜、导师经营数据和 Mentor 后台统计默认排除平台顾问类对象。排除方式见第 11 章总则与第 21 章用户群组机制：在导师配置中打 `isPlatformAssistant` 标记，汇总时按标记排除，不写死具体 ID。

#### 1.2 数据统计基本原则（产品层面）

1. 每个指标必须标明统计主体，三种主体不混用：Mentor（被推荐、被浏览、产生对话、产生轮次和帮助用户）、Student（注册、付费、做测评、形成档案）、MentorHuman（登录后台、修改展示资料、查看数据和提交内容反馈）。例如"分身对话用户数"属 Mentor 指标，"付费用户数"属 Student 指标，"后台登录次数"属 MentorHuman 指标。
2. MentorHuman 的登录次数只表示经营参与度和安全线索，不作为导师绩效 KPI，也不用于排名。
3. 推荐、浏览和对话分别统计，不能笼统称"浏览"。"推荐曝光"和"进入分身主页"是不同指标。
4. 对话不按固定时间机械切断（详见第 13 章 Mentor 指标说明与对话、问题链、行为会话三概念区分）。
5. 对话时长采用"页面活跃时长"，不用首末消息时间差倒推（详见第 7 章活跃采集规则）。
6. 付费口径必须区分用户状态（从未付费 / 当前付费 / 曾付费已失效）与本次权益来源（免费试用 / 订阅 / 加购 / 赠送或未知），"付费用户数"和"付费权益对话数"不能混为一谈。
7. 满意度与问题解决率必须注明来源，AI 推断类指标页面必须写"AI 推断"字样并附样本量与更新时间，不得表述为用户明确反馈。
8. 语义分析统一采用离线每日批处理，看板读取已加工汇总结果，不在用户打开页面时实时分析全部聊天记录。页面统一展示"数据更新至 YYYY-MM-DD HH:mm"。

---

### 2. Admin Dashboard 功能定义

#### 2.1 全平台概览

展示平台整体规模与核心转化概览：

- 注册用户数和新增用户数（Student）；
- 当前付费用户数、历史付费用户数、流失付费用户数、免费试用使用人数、加榨包余额；
- 分身总数和活跃分身数（Mentor）；
- 推荐、主页访问、有效对话和付费转化概览；
- 全平台有效对话用户数、完成轮次、计费轮次和活跃时长；
- AI 推断问题解决率和满意倾向率（第二期，须标"AI 推断"+样本量+更新时间）；
- 主要未解决问题和高失望主题（第二期）；
- 数据采集异常及语义分析更新时间。

#### 2.2 用户与转化

包含同期批次核心漏斗、渠道经营表现与双阶段旅程回溯，详见第 15、16 章。具体含：

- 注册到首次对话、首次完成问答、首次付费的转化漏斗（同期批次口径）；
- 免费试用到付费的转化；
- 新用户和回访用户；
- 用户使用时段分布、终端分布（iOS/Android/桌面/PWA）、最后停留页面分布；
- 注册来源和渠道；
- 页面活跃时长分布、页面点击与停留（第二期展示）；
- 用户满意度与未解决问题主题（第二期）。

首页、职业测试、行业导师、对话记录、我的档案等页面数据需要统一的前端行为采集，见 Part II。

#### 2.3 导师分身与对话

Admin 可按 Mentor 查看和排序：推荐覆盖用户数、卡片点击、主页访问用户数、帮助用户数、完成轮次（含计费/免费试用/非计费分项）、权益来源分布、页面活跃时长、AI 推断问题解决率（第二期）、高频已解决/未解决问题、满意点和失望点（第二期）。

点击导师名称后，复用该导师的 Mentor 看板，并增加管理员专属信息。由于当前固定一名导师对应一个分身，Admin 不需要设计"一位导师下多个分身"的列表或切换器。

#### 2.4 MentorHuman 账号管理

Admin 可以：

- 创建和停用 MentorHuman 账号；
- 重置密码；
- 将 MentorHuman 唯一绑定到一个 `mentorId`；
- 查看最近登录时间和登录次数；
- 查看展示资料修改申请与审核发布情况；
- 查看导师提交的内容纠错或补充建议；
- 查看必要的安全与操作审计。

首版不把后台登录次数作为导师考核指标，只作为经营参与度和安全排查参考。

#### 2.5 导师经营行为（MentorHuman 经营参与度）

可统计各 MentorHuman：登录后台次数和登录时段、后台有效停留时间、查看各看板模块的次数、展示资料修改次数、内容反馈提交次数。"知识库更新次数"属于平台内容维护行为，不应算作 MentorHuman 自己修改知识库的行为。详见第 14 章 MentorHuman 指标。

#### 2.6 运营建议与数据质量（第二期为主）

Admin 可查看推荐后低访问的分身、访问后低对话的分身、免费试用后低付费转化环节、高频未解决问题、高频失望主题、需要人工补充的知识主题建议、缺失或异常的数据采集项、语义分析任务是否按时完成。所有自动建议都应标明为 AI 辅助，不直接触发知识库修改或内容发布。第一期仅保留数据质量看板（采集异常计入）与排除标记能力，自动运营建议留到第二期。

#### 2.7 活动登记管理

Admin 可登记与维护 Campaign（活动），详见 Part IV 来源体系。

#### 2.8 用户群组管理

Admin 可管理五类用户群组标记，详见第 21 章。

#### 2.9 审计与版本记录

查看敏感操作审计、指标口径变更与发布版本变更，详见第 25 章与第 23 章。

---

### 3. Mentor Dashboard 功能定义

Mentor 端首页应简洁、温暖，重点帮助导师理解自己的分身产生了什么影响，不堆砌大量图表。导师端不提供任何用户级数据，不做用户×分身汇总表，所有指标为与该分身有过交互的用户的聚合结果。语义类指标统一在第二期上线。

#### 3.1 首页概览

建议展示：分身累计帮助用户数、近 7 天和近 30 天帮助用户数、被推荐覆盖用户数、分身主页访问用户数、有效对话用户数、免费试用对话用户数、使用付费权益的对话用户数、AI 推断问题解决率及样本量（第二期）、用户正面反馈摘要三条（第二期）、数据更新时间。

"帮助用户"定义为：与该分身完成至少一轮有效问答的去重用户，排除管理员、测试账号、机器人和失败请求。详见第 13 章 `mentor.helped_user_count`。上次登录时间和近 30 天登录次数作为账号信息显示，不作为绩效指标。

#### 3.2 对话效果

提供：对话线程数、有效对话线程数、对话用户数、完整问答轮次、每名用户平均轮次、页面活跃时长及平均活跃时长（第二期展示）、问题链数量和问题链轮次分布（第二期）、高频深度讨论主题（第二期）、AI 推断问题解决率（第二期）、AI 推断满意倾向率（第二期）、未解决问题数量及主题分布（第二期）。免费试用、订阅权益、加购次数应分别统计，不能用"付费/未付费"笼统分类。

#### 3.3 用户画像聚合

只统计与当前分身有过有效对话的用户，并仅展示聚合结果。包括年龄段或学习阶段、当前状态（在校/求职/在职/转行）、学校类型或学校分布、专业 17 分类、当前所在地、希望工作地、主要焦虑主题、希望获得的帮助、想深聊的导师类型、霍兰德职业兴趣六型分布。

霍兰德首屏展示 R、I、A、S、E、C 六型分布；如样本充足，可在详情中展示三字母组合排名。完整画像分布在第二期上线。

#### 3.4 反馈与改进（第二期）

展示最常问的 10 个主题、AI 推断的正面反馈点、AI 推断的主要失望点、高频未解决问题、平台提供的改善建议。改善建议必须尽量附带对应主题、样本量和变化趋势，并标注"AI 辅助分析，仅供参考"。样本不足时显示"暂无足够样本"，不能为填满页面生成结论。

#### 3.5 分身展示资料修改申请

MentorHuman 可提交：头像修改、对外关键词标签修改、对外简介修改。所有修改提交后由 Admin 审核发布，不立即生效（详见第 4 章权限模型）。

导师的关键词标签由系统根据导师提交的访谈和平时案例归纳收集而来。导师可提交修改，但管理员审核：字面修改、排序调整、删除、或在已提交内容范围内的关键词新增可审核通过；不符合上述情形的可能退回，要求给出进一步解释，以防用户按新关键词搜索到该导师后发现分身无相关能力。

#### 3.6 知识状态与内容反馈

导师知识库仍由平台按照现有 JSONL 和知识治理流程维护，MentorHuman 不直接编辑知识卡、Prompt、知识分类或披露级别。Mentor 端提供：已入库知识卡数量、最近更新时间（取自内容发布记录或 manifest，不依赖数据库 seed 产生的 `updatedAt`）、当前主要知识主题概览、Admin 人工发布的"建议补充主题"、内容纠错或补充建议提交入口、浏览用户建议（用词从"用户留言"改为"用户建议"，因为建议不需要回复）。

首版不在 Mentor 页面提供复杂修改记录，必要操作记录保留在 Admin 审计中。

#### 3.7 账号与安全

账号由平台创建并分发。MentorHuman 可以修改自己的密码、退出登录、查看最近一次登录时间，后续可增加"退出其他设备"。MentorHuman 不可以自行修改登录账号、账号角色、绑定的 `mentorId`、数据权限范围，以上变更由 Admin 处理。

---

### 4. 权限模型

#### 4.1 角色

首版两个角色，框架可扩展：

| role 值 | 名称 | 权限范围 |
|---|---|---|
| ADMIN_FULL | 平台管理员 | 全平台数据、MentorHuman 账号管理、用户群组管理、展示资料审核、审计查看 |
| MENTOR_HUMAN | 真人导师 | 仅自己绑定分身的聚合数据、展示资料修改申请（提交审核）、内容反馈提交、修改密码 |

MentorHuman 可在后台提交头像、对外关键词标签、对外简介修改。所有修改提交后由 Admin 审核发布，不立即生效。今后可扩展直接向 dashboard 提交案例分享，经 Trae 转 Codex 生成知识卡。

第一期不建设 Admin 六级预设角色（平台所有者/经营管理员/渠道管理员/用户与导师运营/风控审计管理员/只读观察员），也不做临时提权，仅一个管理员起步。预设角色与临时提权留待第三期再评估。

#### 4.2 服务端校验

- MentorHuman 后台所有接口从登录态反查 `boundMentorId`，不接受前端传参指定 `mentorId`；
- Admin 后台所有接口服务端校验 `role=ADMIN_FULL`；
- 前端隐藏菜单不等于权限控制；
- 所有敏感操作（查看敏感档案、修改群组、审核资料、排除互动）写入 AuditLog。

#### 4.3 MentorHuman 隐私边界

- 只能查看与自己绑定 Mentor 的聚合数据；
- 不能通过多条件筛选缩小到具体 Student；
- 不能查看手机号、精确出生年月、完整聊天；
- 小样本（<5）不展示分布或排名。

敏感信息保护补充：出生年月、学校、所在地、焦虑原文、求职目标和聊天内容可能组合识别到具体用户，因此 Mentor 端优先展示年龄段，不展示精确出生年月；原始聊天和用户原话默认不向 MentorHuman 展示；如未来开放原话片段，必须先去除人名、公司、学校、联系方式、金额和具体日期等信息；敏感 CSV 导出仅限 Admin。

#### 4.4 Admin 调查边界

"不允许多维筛选到个人"只适用于 MentorHuman 和普通经营分析人员。具备风控、投诉、安全或数据核查权限的 AdminHuman，可在填写理由并接受完整审计的前提下，下钻至账号、行为记录和必要聊天片段。敏感画像和语义分布默认样本少于 10 时不展示。一般经营指标可以显示总量，但不得借助组合筛选重新识别个人。

---

## Part II：数据采集

### 5. 事件模型

Event 表字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | cuid | 主键 |
| eventId | string | 客户端生成的唯一事件 ID（crypto.randomUUID），服务端按此去重 |
| eventName | string | 见第 6 章事件字典 |
| anonymousId | string | 首访种植的 httpOnly cookie（`aid`），有效期 1 年，未登录用户的身份 |
| sessionId | string | 行为会话：30 分钟无事件则切新，仅用于路径分析，与 ChatSession 无关 |
| userId | string? | 登录后由服务端在上报接口补写，前端不传 |
| userGroupSnapshot | string? | 上报时服务端从 User 表补写的用户群组快照（NORMAL / BETA / MENTOR_SELF_TEST / OPS_QA / PENDING_REVIEW） |
| page | string | 语义路由，如 `/mentors`、`/chat`、`/dashboard/subscription`，不含查询参数 |
| target | string? | 元素语义名，如 `mentor_card`、`plan_monthly` |
| props | JSON | 事件参数，见各事件定义 |
| clientTs | datetime | 客户端发生时间 |
| serverTs | datetime | 服务端接收时间（统计口径以此为准） |
| ua | string | User-Agent 原文（尽量解析后保存解析结果，减少长期保留完整原文） |
| schemaVer | string | 事件结构版本，当前 `v1` |
| releaseVersion | string | 产品发布版本（构建时从环境变量注入） |

索引：(eventName, serverTs)、(userId, serverTs)、(anonymousId)、(eventId)。原始事件分层保留：普通用户及未绑定匿名事件 90 天；曾付费用户（含注册绑定的匿名段）3 年；汇总表永久保留。

说明：原始事件从第一天起即具备幂等标识（eventId）、事件结构版本（schemaVer）和发布版本（releaseVersion），防止 React 重复渲染或网络重试造成重复统计。

#### 5.1 幂等机制

每条事件携带唯一 `eventId`（crypto.randomUUID）和 `pageInstanceId`（页面实例级），服务端按 `eventId` 去重。重复上报和重复执行汇总任务不会重复计数。

#### 5.2 隐私与最小化采集

不上报的内容：聊天原文、表单填写内容、手机号、搜索词等任何 PII。点赞/点踩/报错走业务接口直写 MessageFeedback 表，不进 Event。匿名标识、设备标识和行为轨迹属于可关联标识，不能表述为"不含个人信息"，应最小化采集并限制访问。

---

### 6. 事件字典

首版 8 个事件全部采集：

| 事件名 | 触发时机 | props | 备注 |
|---|---|---|---|
| page.view | 路由切换完成（SDK 自动，全站覆盖） | referrer | 所有页面自动有，新页面零成本接入 |
| page.active_tick | 页面前台可见且未进入空闲状态时每 30 秒一条 | seconds=30, mentorId?（聊天页带）, pageInstanceId | 详见第 7 章活跃采集规则 |
| mentor_card.impression | 导师卡进入视口 ≥50% 且停留 ≥0.5 秒 | mentorId, position, sourcePage, label='导师卡片：<导师名>' | IntersectionObserver，每页每卡只报一次 |
| mentor_card.click | 点击导师卡 | mentorId, position, sourcePage, label='导师卡片：<导师名>' | |
| mentor_profile.view | /mentors/[id] 打开 | mentorId, from（card_click/direct/search） | 分身主页访问 |
| paywall.view | 订阅页打开 | from? | |
| subscribe.click | 点击具体套餐 | plan（MONTHLY/QUARTERLY/YEARLY/CREDIT_PACK）, label='订阅：<套餐名>' | |
| cta.click | 点击带 data-track 标记的任意按钮 | label（data-track 值，按钮语义标签），extraProps?（data-track-props 的 JSON） | 见下方标记约定 |

#### 6.1 data-track 标记约定（通用按钮点击，低成本接入）

1. 需要统计的按钮加属性 `data-track="按钮语义标签"`；需要额外参数时加 `data-track-props='{"key":"value"}'`。
2. SDK 在 document 上注册一个委托点击监听，命中带 data-track 的元素（或其最近祖先）即自动上报 cta.click，无需逐个按钮写代码。
3. 首版要求所有与转化相关的关键按钮加标记：注册向导各步按钮、开始/提交测评、开始对话、发送消息以外的聊天操作、资料保存、游戏主按钮等；导航链接可不标（其去向由 page.view 体现）。
4. label 用统一语义文案，不随 UI 措辞变化频繁改动；确需改动时按口径变更处理（新 label）。
5. 统计"点击最多的按钮"时，所有 `*.click` 事件按统一 label 字段合并排序。

---

### 7. 活跃采集规则（page.active_tick）

1. 只在页面处于前台可见状态时计时（Page Visibility API：document.visibilityState === 'visible'）。
2. 页面失焦、切到后台或锁屏时停止上报。
3. 最近 5 分钟没有点击、输入、触摸、滚动等行为后进入空闲状态，停止上报；再次互动后恢复。
4. 每次上报携带唯一 eventId（去重用）和 pageInstanceId（页面实例级，区分同页面多次打开）。
5. 事件批量发送，不每 30 秒单独发起一次网络请求。
6. 只保存语义页面名称，不保存带手机号、搜索词等内容的完整 URL。
7. 聊天页面可以携带 mentorId，但不携带聊天原文或输入内容。
8. 内测、导师自测、Admin 和 QA 账号的数据照常采集，在汇总时按 userGroupSnapshot 单独分组和排除。
9. 30 秒只是活跃采样间隔，不得用于切分 ChatSession 或问题链。
10. 原始事件按既定保留期保存，第一期暂不向 Mentor 展示"精确活跃时长"。

指标全称：页面前台可见且未进入空闲状态的估算活跃时间。第一期采集，看板第二期展示。

---

### 8. 按页面布点表

| 页面 | 事件 |
|---|---|
| 全站所有页面 | page.view、page.active_tick（SDK 自动）、cta.click（带 data-track 的按钮，委托监听自动上报） |
| /mentors、/（含导师卡的页面） | mentor_card.impression、mentor_card.click |
| /mentors/[id] | mentor_profile.view |
| 聊天页 | active_tick 带 props.mentorId |
| /dashboard/subscription | paywall.view、subscribe.click |
| 每条 assistant 消息气泡 | 点赞/点踩/报错组件（写 MessageFeedback） |

点赞/点踩/报错采用类似 Duolingo 的用户现场埋点：用户对某次聊天回复有想法时可选向上翘拇指、向下翘拇指、报告出错；报告出错细分原因：冒犯了我 / 偏题了 / 出现幻觉 / 反复同样回答 / 其他。这些走业务接口直写 MessageFeedback 表，不进 Event。

---

### 9. 身份贯通规则

1. 首访由中间件检查并种植 `aid` cookie（httpOnly，1 年），全站同一值。
2. sessionId 由客户端生成维护：30 分钟无事件后下一个事件换新 sessionId。
3. 上报接口从登录态取 userId 写入，前端传了也不认。
4. 仅注册成功时，汇总任务把同一 anonymousId 近 90 天的匿名事件归到该 userId，完成匿名段与实名段串联。普通登录不自动认领同一设备近 90 天的全部历史。
5. 多端场景：同一 userId 不同 anonymousId 的历史事件，各自保留，按 userId 聚合即可。

---

### 10. 上报机制

- 前端 track() 先入内存队列，满 10 条或 5 秒 flush 一次；页面隐藏/关闭时 navigator.sendBeacon 兜底批量发送。
- 上报接口批量接收，校验登录态后写 Event 表，按 eventId 去重；失败不重试超过 1 次（埋点宁可丢，不可影响主流程）。
- 采集异常（如连续无事件但在线用户正常）计入 Admin 数据质量看板。

#### 10.1 事件清理

- 每日清理任务按保留期删除过期原始事件：删除前先查用户付费状态，曾付费用户（含其注册绑定匿名段）保留 3 年；普通用户和未绑定匿名事件 90 天。
- 用户在第 90 天前才完成付费，其事件因清理时的付费检查而自动转为 3 年保留。
- 汇总表、MetricDefinition 与审计记录不清理。

---

## Part III：指标字典

### 11. 总则

1. **语义化命名**：事件名描述业务动作（如 `mentor_card.click`），禁止按页面位置命名（如 `home.card3.click`）。页面改版不改业务动作时，事件名与 props 保持不变，统计口径天然连续。
2. **数据源优先级**：业务表已有的数据一律从业务表算，不重复埋点。埋点只补业务表没有的行为数据（曝光、点击、活跃时长、终端）。
3. **看板只读汇总表**：所有看板页面查询 DailyMentorStats / DailyPlatformStats / 业务表轻聚合，不实时扫 Event 原始表和 ChatMessage 全表。
4. **三种统计主体不混用**：Student（用户）、Mentor（AI 分身）、MentorHuman（真人导师），每个指标必须标明主体。
5. **排除项**：当前导师配置中没有平台顾问分身；今后若新增平台顾问类对象，在导师配置中打 `isPlatformAssistant` 标记，汇总时按标记排除，不写死具体 ID。内测用户、导师本人及自测账号、Admin/运营/QA 账号的数据照常采集，但在汇总时按用户群组排除出正式经营指标和排名。不使用硬编码手机号白名单维护排除名单。
6. **小样本保护**：任何分布、排名类指标，分母小于 5 时页面显示"暂无足够样本"，不展示具体数值。敏感画像和语义分布默认样本少于 10 时不展示。
7. **语义指标标注**：AI 推断类指标页面必须写"AI 推断"字样 + 样本量 + 更新时间，不得表述为用户明确反馈。
8. **事件幂等**：每条事件携带唯一 eventId（crypto.randomUUID）和 pageInstanceId（页面实例级），服务端按 eventId 去重，防止 React 重复渲染和网络重试造成重复计数。
9. **财务实收与自然用户转化分别统计**：测试/内测账号的真实付款仍进入财务实收对账，但不进入自然用户付费转化和导师资源分配指标。

---

### 12. Student 指标（主体：用户）

| metricKey | 口径 | 数据源 | 更新 |
|---|---|---|---|
| student.registration_count | 累计/按日新增，按 userGroup 排除内测/自测/运营账号 | User.createdAt | 实时可查 |
| student.active_paid_count | 统计时点 Subscription.status=ACTIVE 且未过期的去重用户 | Subscription | 每日 |
| student.historical_paid_count | 有任一 PaymentOrder.status=PAID 的去重用户 | PaymentOrder | 每日 |
| student.lapsed_paid_count | 有 PAID 订单但当前无有效订阅 | Subscription+PaymentOrder | 每日 |
| student.free_trial_used_count | freeTrialUsed>0 的去重用户 | User | 每日 |
| student.credit_pack_balance | sum(mentorCredits - mentorCreditsConsumed) | User | 每日 |
| student.new_user_count | 当日注册且当日活跃的用户数（当日新用户） | User+Event | 每日 |
| student.returning_user_count | 注册日在统计日前且当日活跃的用户数（回访用户） | User+Event | 每日 |
| student.active_hour_dist | 按事件 serverTs 小时分桶（0-23） | Event | 每日 |
| student.client_dist | ua 解析 iOS / Android / 桌面；props.client=pwa 标记 PWA | Event | 每日 |
| student.profile_dist | 年龄段、status、学校类型、专业17分类、当前/期望工作地、焦虑主题、霍兰德六型 | UserProfile / InterestAssessment | 每日 |

新用户和回访用户口径：当日注册且当日活跃为当日新用户；注册日在统计日前且当日活跃为回访用户。不采用"注册七天内都算新用户"的口径。

---

### 13. Mentor 指标（主体：AI 分身；平台顾问类对象按标记排除）

| metricKey | 口径 | 数据源 | 更新 |
|---|---|---|---|
| mentor.impression_count | mentor_card.impression 事件计数 | Event | 每日 |
| mentor.impression_user_count | 曝光事件去重 userId∪anonymousId | Event | 每日 |
| mentor.profile_view_count | mentor_profile.view 事件计数 | Event | 每日 |
| mentor.profile_view_user_count | 去重 userId∪anonymousId | Event | 每日 |
| mentor.helped_user_count | 与该分身完成 ≥1 轮完成问答的去重用户，排除导师自测和内部账号 | ChatSession+ChatMessage | 每日 |
| mentor.completed_qa_rounds | user 发有效消息 + assistant 成功回复，配对计 1 轮 | ChatMessage | 每日 |
| mentor.billed_rounds | 计费轮次：由付费权益支撑的完成问答轮次（SUBSCRIPTION + CREDIT_PACK），不含免费试用轮次 | ChatMessage | 每日 |
| mentor.free_trial_rounds | 免费试用轮次：消耗免费试用配额（每人 3 次）的完成问答轮次 | ChatMessage | 每日 |
| mentor.non_billing_replies | 路由门禁、证据不足提示、系统错误等不扣次数的回复数 | ChatMessage | 每日 |
| mentor.paid_first_chat_users | 付费首聊归因人数：用户首次付费后第一场对话发生在本分身的去重付费用户数；付费后尚未开始对话的暂不归因。分身对订阅决策贡献的主口径 | ChatSession+PaymentOrder | 每日 |
| mentor.paid_round_user_count | 与本分身有过计费轮次（SUBSCRIPTION / CREDIT_PACK）的去重用户数 | ChatMessage | 每日 |
| mentor.avg_rounds_per_user | 完成问答轮次 ÷ 帮助用户数 | 计算 | 每日 |
| mentor.rounds_by_entitlement | 按 entitlementSource 分 FREE_TRIAL / SUBSCRIPTION / CREDIT_PACK / UNKNOWN 四桶 | ChatMessage | 每日 |
| mentor.estimated_active_time | 聊天页 page.active_tick 秒数求和（按 props.mentorId 归分身）。指标全称：页面前台可见且未进入空闲状态的估算活跃时间 | Event | 每日（采集第一期，展示第二期） |
| mentor.feedback_like_count | 点赞数 | MessageFeedback | 实时可查 |
| mentor.feedback_dislike_count | 点踩数 | MessageFeedback | 实时可查 |
| mentor.feedback_report_count | 报错数，细分原因（冒犯/偏题/幻觉/反复/其他） | MessageFeedback | 实时可查 |
| mentor.knowledge_card_count | external_approved 卡数 | MentorKnowledgeCard | 每日 |
| mentor.knowledge_last_updated | 从 manifest 或内容发布记录取，不依赖数据库 seed 产生的 updatedAt | 内容管线 | 每日 |

#### 13.1 轮次三分类（包含关系）

完成问答轮次 = 免费试用轮次 + 计费轮次 + 未知来源轮次。

- **完成问答轮次**：Student 发一条有效消息，Mentor 成功返回一条正常回答，配对计 1 轮。
- **计费轮次**：完成问答后实际扣减免费试用、订阅或加购权益的一轮（此处指 SUBSCRIPTION + CREDIT_PACK，不含免费试用）。
- **非计费边界回复**：路由门禁、证据不足提示、系统错误等不扣次数的回复。

后台必须分别统计，不能把所有 assistant 消息都当成一轮，也不能把"完成轮次"和"计费轮次"混为一谈。

#### 13.2 权益来源四桶

`entitlementSource`：`FREE_TRIAL | SUBSCRIPTION | CREDIT_PACK | UNKNOWN`。写消息时由服务端按用户当时权益来源盖章。历史无法可靠反推的数据标记为 `UNKNOWN`，不得伪造精确分类。待正式赠送权益台账建成后增加 `GIFT`。

#### 13.3 对话、问题链、行为会话三概念区分

| 概念 | 用途 | 规则 |
|---|---|---|
| ChatSession / 对话线程 | 用户实际看到并持续使用的一组聊天记录 | 可以跨小时、跨天，不因 30 分钟空闲自动切断 |
| 问题链 | 围绕同一目标的语义讨论 | 第二期离线识别，以上下文为主，时间只作辅助 |
| 行为分析会话 | 页面路径分析 | 可使用 30 分钟无行为切分，但不得冒充对话线程 |

用户可能围绕同一问题思考数小时甚至数天再继续回复，因此不能用"超过多少时间"直接判定为一次新对话。问题链根据上下文判断，时间间隔仅作参考；用户明确切换话题、提出独立新目标，或上下文已无延续关系时才可能形成新问题链。问题链识别属于离线语义分析，应标明分析时间、规则或模型版本及可信度，不影响计费、权限或聊天记录归属。

#### 13.4 说明

产品方案中的"有效访问"定义（注册成功才算）在本字典中落为"主页访问用户数"（漏斗分母）与旅程回溯能力（见第 16 章）；分身对订阅的贡献以"付费首聊归因人数"为准。

---

### 14. MentorHuman 指标（主体：真人导师，仅作经营参与度与安全参考，不做绩效排名）

| metricKey | 口径 | 数据源 |
|---|---|---|
| mentorhuman.last_login_at | User.lastLoginAt | 实时 |
| mentorhuman.login_count | User.loginCount | 实时 |
| mentorhuman.dashboard_active_time | mentor 子域 page.active_tick 秒数求和 | Event（每日） |
| mentorhuman.profile_edit_submitted | 展示资料修改申请提交次数 | AuditLog |
| mentorhuman.content_feedback_count | 内容纠错或补充建议提交次数 | AuditLog |

---

### 15. 漏斗与转化（主体：Student，同期批次口径）

#### 15.1 核心漏斗（七阶段）

首次有效落地 → 注册成功 → 引导/档案完成 → 首次导师主页访问 → 首次导师完成问答 → 到达付费页 → 首次真实付费。

| 阶段 | 定义 |
|---|---|
| S1 首次有效落地 | 满足全部条件的最早一条用户侧 page.view：用户群组为 NORMAL 或注册前未标记；ua 非机器人；事件发生时尚未注册（排除已注册回访）；page 非后台路径；属正常页面访问而非技术请求。无法识别来源的正常访问归"自然/未知"，不丢弃 |
| S2 注册成功 | User.createdAt |
| S3 引导/档案完成 | UserProfile.registrationCompletedAt 非空；无该时间戳的老用户，档案存在即视为完成并单独标注口径 |
| S4 首次导师主页访问 | 该用户首个 mentor_profile.view |
| S5 首次导师完成问答 | 该用户首个完成问答轮次（用户发有效消息 + Avatar 成功回复配对） |
| S6 到达付费页 | 该用户首个 paywall.view |
| S7 首次真实付费 | 该用户首个真实付款订单（定义见 15.4） |

#### 15.2 同期批次规则

1. 批次定义：选取某段时间（如自然周）首次有效落地的全部用户作为一个 cohort，以 S1 时间归属。
2. 观察窗口：7 天、14 天、30 天，记录各用户在窗口内完成到的阶段。
3. 成熟判定：批次落地末日 + 观察窗口 ≤ 任务运行日，该批次该窗口才算成熟；未成熟批次只展示人数，转化率标注"观察中"，不与成熟批次比较。
4. 禁止跨批次相除：不把"本月落地、本月注册、本月付费"直接相除，所有转化率都在同一 cohort 内计算。

#### 15.3 漏斗指标

| metricKey | 口径 |
|---|---|
| funnel.stage_users | 各阶段去重用户数，以阶段和观察窗口为维度（统计的是人，不是事件次数） |
| funnel.step_rate | 本阶段人数 ÷ 上一阶段人数 |
| funnel.overall_rate | 本阶段人数 ÷ S1 首次有效落地人数 |
| funnel.free_trial_to_paid_30d | 首次免费试用轮次起 30 天内真实付费的成熟批次转化率：分母只含首次试用时间 +30 天已过的用户，未完整经过观察期的用户不进分母 |
| funnel.paid_at_completed_round | 首次真实付款时刻之前累计完成问答轮次分桶：0 / 1–3 / 4–10 / 11–30 / 30 以上；轮次完成时间必须早于付款时间，不用用户当前总轮次 |
| funnel.channel_performance | 按首次锁定渠道（含自然/未知）比较经营表现，明细见 15.5 |

#### 15.4 真实付款与订单口径

1. 真实付款：status=PAID，且 transactionId 不以 `mock_tx_` 开头（识别历史 mock 订单）；今后 mock 订单同时在 metadata 写 isMock=true，双标记。
2. 首次付款三分类：首次订阅（paymentType=SUBSCRIPTION）、首次加榨包购买（paymentType=CREDIT_PACK）、全部首次真实付款（任一）；订阅与加榨包分开统计，代表不同经营信号。
3. 内部付款：排除群组账号（OPS_QA 等）的订单不进自然用户转化；财务实收另保留全量。
4. 重复回调：履约只对 PENDING 订单生效，天然幂等；数据质量检查按 transactionId 扫描重复或异常记录并标记，不删除。
5. paymentType=CREDIT_PACK 代码已在使用，prisma schema 的字段注释需同步更新，无结构变更。

#### 15.5 渠道经营表现（funnel.channel_performance）

按首次锁定渠道逐行展示：

1. 有效落地用户数；
2. 注册用户数和注册率；
3. 引导/档案完成用户数；
4. 首次导师完成问答用户数；
5. 真实付费用户数，订阅与加榨包分列；
6. 实收金额；
7. 落地到付费的 30 天转化率（成熟批次）。

渠道投放成本录入后，第二期再增加单个注册成本、单个有效对话用户成本、获客成本与投入产出比，不阻塞第一期。

---

### 16. 双阶段旅程回溯（主体：Student；ADMIN_FULL 专用，含用户级下钻）

#### 16.1 阶段定义

- 阶段一（获客段）：该用户首条事件（首访）→ 注册成功（User.createdAt），事件以 anonymousId 串联，注册绑定时归属到 userId。
- 阶段二（转化段）：注册成功 → 首次付费成功（首个 PAID 订单 paidAt），事件以 userId 串联。
- 阶段边界时刻（注册成功、付费成功）不埋事件，聚合时从业务表取时间戳插入事件链。

#### 16.2 旅程指标

| metricKey | 口径 |
|---|---|
| journey.stage1_duration | 阶段一耗时：首事件 serverTs 到 User.createdAt |
| journey.stage2_duration | 阶段二耗时：User.createdAt 到首个 PAID 订单 paidAt |
| journey.chain | 两阶段各自的完整事件链（按 serverTs 排序），支持用户级逐条查看 |
| journey.top_pages | 阶段内浏览次数最多的页面（page.view 按 page 计数） |
| journey.top_cta | 阶段内点击次数最多的按钮（所有 `*.click` 事件按统一 label 合并排序） |
| journey.dwell_by_page | 阶段内各页面逗留时长（active_tick 按 page 求和） |

#### 16.3 人群范围

1. 完成全部两阶段的用户：分阶段输出上述指标。
2. 只完成阶段一、未完成阶段二的用户（有注册、无 PAID 订单）：输出阶段二窗口（注册后至统计时点）的 top_pages、top_cta、dwell_by_page，用于定位流失前的集中行为。

#### 16.4 切分维度

- 时间段：按注册日或付费日圈定任意区间；
- 活动：按首触活动码圈定人群（User.attributionJson，见 Part IV 来源体系）；活动前后对比用同一日期区间规则分别聚合；
- 设备：按首事件 ua 解析桌面 / 安卓 / 苹果；
- 上述维度可叠加。

#### 16.5 实现说明

用户级事件链查询走 Event 表（按 userId 或注册绑定的 anonymousId 过滤、serverTs 排序）；回溯窗口受保留期约束——普通用户 90 天，曾付费用户 3 年。聚合榜单与耗时分布由每日汇总任务预算，下钻页面只读汇总加单人事件链，不做全表扫描。全部事件为全站统一采集，首版旅程回溯页面仅 ADMIN_FULL 可见；数据同时为导师端将来的相关视图做好储备，导师端首版仍只展示聚合指标。

---

### 17. 语义指标（第二期，先登记 metricKey）

| metricKey | 说明 |
|---|---|
| mentor.ai_satisfaction_tendency | AI 推断满意倾向率 |
| mentor.ai_resolution_rate | AI 推断问题解决率 |
| mentor.unresolved_themes | 高频未解决主题 |
| mentor.satisfaction_points | 满意点 |
| mentor.disappointment_points | 失望点 |
| mentor.question_chain_count | 问题链数量及轮次分布 |

统一要求：离线每日批处理，结果带 modelVersion、promptVersion、样本量、分析时间；不影响计费与权限。在没有用户明确评分时，页面不能直接写"满意率"，必须写"AI 推断满意倾向率"。语义分析统一采用离线批处理，结果必须带样本量、分析时间、模型版本和 Prompt 版本，并明确标注"AI 推断"。

---

## Part IV：来源体系

### 18. 渠道与活动定义

划分原则：按"是否常态化"区分，不按合作方身份区分。

#### 18.1 渠道（Channel）

持续存在、无固定结束时间的获客通路：

- 自有渠道（OWNED）：官方小红书/公众号/抖音内容、SEO、自有社群、官网，凭自身运营能力持续获客。
- 合作渠道（PARTNER）：有长期导流或分成关系的伙伴，对应现有 Channel 表 partner/shareRate 设计。

现有 Channel 表结构继续使用；渠道码 `/r/{code}` 与 `?ch=` 归因机制不变。

#### 18.2 活动（Campaign）

有明确起止时间的阶段性动作，新增 Campaign 表登记（表结构见第 19 章）。活动类型：EVENT（市场活动：合办 event/直播/线下）、PROMOTION（促销活动：折扣/赠送）、ADS（付费投放）。

规则：

1. 与其他机构合办的一次性 event 记为 EVENT，填 partnerOrg，不建立渠道；该机构转为持续导流关系时，再另建合作渠道。
2. 促销活动记为 PROMOTION，与权益发放台账关联——折扣体现在订单，赠送体现在发放记录。
3. 活动链接 `?cmp={code}`（或 `/e/{code}`）；只有活动在有效期内才写入首触归因，过期或无效码落自然量。

---

### 19. Campaign 表结构

| 字段 | 说明 |
|---|---|
| code | 活动码，唯一 |
| name | 活动名称 |
| type | EVENT / PROMOTION / ADS |
| channelId? | 挂靠的常态渠道（可空） |
| partnerOrg? | 合作机构名称（合办活动） |
| startAt / endAt | 活动有效期 |
| status | ACTIVE / ENDED / DISABLED |
| note | 备注 |

---

### 20. 多活动触点规则

1. 首次触点锁定一个渠道和一个活动（attributionJson），之后不可更改。
2. 用户后来在促销期间下单，促销活动记录在订单 metadata 与权益发放台账中，不覆盖首触归因，两条信息并存。
3. 旅程回溯按首触活动圈人；促销效果按订单关联的 PROMOTION 活动统计。

---

## Part V：工程规范

### 21. 用户群组与排除机制

#### 21.1 用户群组定义

| userGroup | 正式经营指标 | 导师排名 | 单独分析 |
|---|---:|---:|---:|
| NORMAL（普通用户） | 纳入 | 纳入 | 可选 |
| BETA（内测用户） | 默认排除 | 不纳入 | 是 |
| MENTOR_SELF_TEST（导师本人及明确自测账号） | 默认排除 | 不纳入 | 是 |
| OPS_QA（Admin、运营、QA 账号） | 默认排除 | 不纳入 | 是 |
| PENDING_REVIEW（待复核异常账号） | 暂不计入排名 | 冻结 | 是 |

#### 21.2 标记与管理

- 用户群组在 User 表上标记，带 groupMarkedAt / groupMarkedBy / groupReason 字段。
- 手机号只用于首次确认身份，不能把手机号白名单硬编码进统计逻辑；系统把对应 userId 标为用户群组，并记录生效时间、结束时间、标记人和原因。
- 账号由 BETA 转为 NORMAL 后，只排除其处于 BETA 期内的行为。真实付款仍进入财务实收对账，但不进入自然用户付费转化和导师资源分配指标。
- 不使用硬编码手机号维护排除名单。

User 表需新增 `userGroup` 字段（`NORMAL | BETA | MENTOR_SELF_TEST | OPS_QA | PENDING_REVIEW`），带 groupMarkedAt / groupMarkedBy / groupReason 记录。

#### 21.3 排除规则在汇总中的实现

- 汇总任务读取 User.userGroup，在写入 DailyMentorStats / DailyPlatformStats 时按 group 决定是否计入正式指标列。
- 被排除的数据单独写入一列（如 `excluded_helped_user_count`），不删除原始记录。
- Admin 看板可切换"含排除数据 / 仅正式指标"视图。

#### 21.4 反作弊原则

导师本人及明确关联测试账号与自己 Mentor 的对话、点赞和反馈可保留用于自测，但不得计入帮助用户数、导师排名、有效点赞、满意度、推荐曝光和资源分配权重。原始记录不删除，只增加"是否计入经营指标/排名"和排除原因。

第一期只做排除标记 + 原因记录，不做异常互动自动检测页；自刷、异常点赞、设备关联、重复文本、批量覆盖知识领域、系统化追问、索取 Prompt 或知识卡等蒸馏风险信号留待第三期自动检测。任何单一 IP、设备或高频行为都只能作为风险信号，不能自动认定作弊。正式建立资源分配排名前，应采用独立用户门槛、单用户贡献上限、异常账号排除和稳健评分，不能只按对话量或点赞量排序。

---

### 22. 数据源总览

| 数据域 | 来源 | 是否需要埋点 |
|---|---|---|
| 注册、登录、画像、霍兰德 | User / UserProfile / InterestAssessment | 否 |
| 对话会话、轮次、时长内容 | ChatSession / ChatMessage | 否 |
| 订阅、订单、加榨包 | Subscription / PaymentOrder / User.mentorCredits | 否 |
| 渠道归因 | Channel / User.channelId / attributionJson | 否（已有） |
| 点赞、点踩、报错 | MessageFeedback（新业务表） | 否（业务接口直写） |
| 页面浏览、卡片曝光点击、主页访问 | Event（新埋点） | 是 |
| 页面活跃时长 | Event（新埋点） | 是 |
| 终端分布（iOS/Android/桌面/PWA） | Event.ua + props.client | 是 |
| 使用时段、最后停留页面 | Event | 是 |

#### 22.1 需要给现有表补的字段

1. ChatMessage 增加 `entitlementSource` 列：`FREE_TRIAL | SUBSCRIPTION | CREDIT_PACK | UNKNOWN`，写消息时由服务端按用户当时权益来源盖章。历史无法可靠反推的数据标记为 `UNKNOWN`，不得伪造精确分类。待正式赠送权益台账建成后增加 `GIFT`。
2. User.role 枚举值增加 `MENTOR_HUMAN`；User 增加可空唯一字段 `boundMentorId`（绑定的分身 ID）；User 增加 `userGroup` 字段，带 groupMarkedAt / groupMarkedBy / groupReason 记录。
3. 新增表：Event、MessageFeedback、DailyMentorStats、DailyPlatformStats、AuditLog（后台操作审计）、MetricDefinition（指标定义登记表）、Campaign（活动登记）。

导师数量和知识卡数量必须动态读取，不能硬编码进后台。

---

### 23. MetricDefinition 表与指标版本管理

#### 23.1 MetricDefinition 表结构

| 字段 | 说明 |
|---|---|
| metricKey | 不可变唯一键，如 `mentor.helped_users`、`student.registration_count` |
| definition | 口径文字描述（冻结后不可修改） |
| subject | Student / Mentor / MentorHuman |
| dataSource | 数据来源说明 |
| status | ACTIVE / RETIRED |
| createdAt | 登记时间 |
| retiredAt | 停用时间（停用后看板不再展示，但历史数据保留可查） |

#### 23.2 不可变 metricKey

- 每个指标登记时获得不可变 metricKey 和口径定义，登记后不得覆盖修改。
- 业务口径变化时新增 metricKey（如 `mentor.helped_users_v2`），旧 key 标记 RETIRED 但数据不动，历史数据按旧定义永远可解释。
- 看板切换指标时是"停用旧 key、启用新 key"的操作记录，运营人员看到的是时间线，不需要理解版本号。

#### 23.3 aggregationVersion

- 同一 metricKey 下，计算实现修复或变更时升级 aggregationVersion。
- 每次升级记录：重算范围（日期区间）、变更原因、结果状态、执行人。
- 可以重算最近若干天，以处理延迟事件和规则修订。

#### 23.4 版本回溯与回滚

第一期从数据层保存：产品发布版本和实际生效时间、事件结构版本、指标定义版本、聚合计算版本、排名/排除规则版本、导师 Prompt 和知识库版本、修改人/审核人/原因和影响指标、是否重算历史数据及重算范围。Admin 首期只需提供简洁的版本时间线和变更详情，不必立即做复杂可视化对比。

回滚原则：

- 应用版本可以恢复到上一稳定版本；
- 指标口径可以切回上一版本并从原始数据重算；
- 聚合结果可以重建，但原始事件保持不可变；
- 数据库结构优先采用向前修复，不承诺所有字段迁移都能一键逆向回滚。

第二期建设版本前后 7/14/30 天对比、趋势图版本分界线和影响评估；第三期再建设更完整的回滚控制台与审批机制。

---

### 24. 汇总任务

1. 采用北京时间按日汇总。
2. 任务可重复执行而不重复计数（按日期 + metricKey + aggregationVersion 幂等）。
3. 每次重算记录数据范围、计算版本和结果状态。
4. 看板读取汇总数据，不在打开页面时扫描完整聊天表。
5. 可以重算最近若干天，以处理延迟事件和规则修订。
6. 漏斗按同期批次计算：每日任务识别首次有效落地、圈定 cohort、按 7/14/30 天窗口写入各阶段去重人数与成熟状态；免费试用转化仅对成熟分母出率。
7. 旅程回溯的聚合榜单（top_pages / top_cta / dwell_by_page）与阶段耗时分布在每日任务中按 cohort 预算，支持时间段、活动、设备维度叠加。
8. 第一期先手动脚本触发，稳定后挂 cron 每日凌晨执行。

---

### 25. 审计

AuditLog 表记录所有后台敏感操作：

| 字段 | 说明 |
|---|---|
| id | 主键 |
| actorId | 操作者 userId |
| action | 操作类型（profile_update / content_feedback / group_change / data_export / sensitive_view / interaction_exclude 等） |
| targetId | 操作对象 ID |
| reason | 操作原因 |
| metadata | JSON，操作详情 |
| createdAt | 时间 |

所有敏感操作（查看敏感档案、修改群组、审核资料、排除互动、临时权限查看、数据导出等）写入审计日志。

---

### 26. 字段增删流程与改版 checklist

#### 26.1 字段增删

字段采用"新增 → 并行验证 → 标记停用 → 停止新写入 → 保留历史"方式。必须说明空值代表"没有数据"还是"当时没有该字段"。不得直接删除原始历史，导致旧指标无法解释。

#### 26.2 改版 checklist

1. page.view / active_tick 为路由级自动埋点，新页面默认接入，确认 page 语义名是否符合新路由。
2. 涉及导师卡、分身主页、订阅页的改版：事件名与 props 不变，只改 UI。若业务动作本身变了，先在本文件登记新 metricKey 再改代码。
3. 新增指标：先在 MetricDefinition 表登记 metricKey 和口径，再写代码。
4. 每次改版发布前核对：本文件中该页面涉及的事件是否全部仍然触发。

事件不按页面位置命名，可以降低改版影响，但不能保证不同版本数据天然可比。流程、字段、推荐位置、免费额度和统计分母变化，都会改变指标。

---

## Part VI：实施计划

### 27. 第一期范围

#### 27.1 必须完成

1. 修复 admin.aihr.top、mentor.aihr.top 的 SSL 和 Host 路由。
2. User 表加 role=MENTOR_HUMAN + boundMentorId + userGroup 字段；ChatMessage 加 entitlementSource。
3. 新建 Event、MessageFeedback、DailyMentorStats、DailyPlatformStats、AuditLog、MetricDefinition、Campaign 表。
4. 前端 track() SDK + 批量上报接口（含 eventId 去重、pageInstanceId、releaseVersion）。
5. 全站布点 + 点赞/点踩/报错组件（对话页消息级）。
6. 每日汇总脚本（可重复执行、可重算）。
7. Mentor 端看板：首页概览（浏览、聊天、付费三层聚合人数）+ 对话效果 + 用户画像聚合 + 展示资料修改申请 + 知识状态 + 内容反馈 + 修改密码。导师端不提供任何用户级数据，不做用户×分身汇总表。
8. Admin 端看板：平台概览 + 同期批次核心漏斗（含成熟状态、真实付款三分类）+ 渠道经营表现 + 导师列表下钻 + 双阶段旅程回溯（用户级事件链下钻 + 两阶段聚合榜单，支持时间段/活动/设备切分）+ 用户群组管理 + 活动登记管理 + MentorHuman 账号管理 + 排除标记 + 审计。
9. 子域名中间件按 Host 路由 + 角色校验（复用 channel.aihr.top 模式）。

上线前基础条件还包括：完成两个后台的登录回调、Cookie 和退出登录闭环；建立 MentorHuman 与 Mentor 一对一绑定；建立服务端权限校验和基础审计。

#### 27.2 第一期采集但暂不展示

- 页面活跃时长（page.active_tick 数据照常采集，看板第二期展示）。

#### 27.3 第二期

1. 页面活跃时长展示、转化所需时间分布；
2. 问题链识别、AI 推断满意倾向/问题解决率、高频主题、完整画像分布；
3. 旅程 Top 路径聚类；
4. 渠道投放成本与 ROI（单个注册成本、单个有效对话用户成本、获客成本、投入产出比）；
5. 不同用户画像的转化差异、改版前后漏斗对比；
6. 版本前后对比、经脱敏的反馈原话片段；
7. 自动运营改善建议、更完整的数据质量监控和语义任务状态。

#### 27.4 第三期（方向性，未承诺）

自动蒸馏风险识别、关联账号图谱和风险预警；更完善的异常注册、异常点赞、自刷和行为团伙检测；正式导师综合排名、稳健评分和推荐资源分配；排名申诉、人工复核、恢复和观察期机制；自定义角色设计器、多人审批和职责分离；敏感数据导出审批、水印和用途追踪；完整版本回滚控制台、回滚审批和回滚后验证；更复杂的实时告警、数据仓库或物化汇总优化。第三期的自动化结果仍不能代替人工定责：系统可以降低权重、进入观察或提示复核，但冻结账号、认定作弊、认定蒸馏和长期取消资源需要留有证据与人工决定。

#### 27.5 不做

- 一名导师管理多个分身。
- Admin 六级预设角色（首版两角色起步）。
- 临时提权（首版只有一个管理员）。
- 异常互动自动检测页（首版只做排除标记+原因记录）。
- 自动按排名分配推荐资源。
- MentorHuman 编辑 JSONL 知识卡/Prompt/披露级别。
- 实时调用 LLM 扫描全量聊天生成看板。
- 把 AI 分身改名为 avatar，也不大改现有 mentorId 结构。
- 用 MentorHuman 后台登录次数考核导师。
- 用 30 分钟空闲切断 ChatSession 或问题链。
- 让 MentorHuman 查看可识别个人的 Student 资料或完整聊天。
- 删除被排除的测试、自刷或异常原始数据。

---

### 28. 实施顺序

1. 文档冻结与提交（本文件 + PRD 更新同步提交），避免依据孤立、未提交的文档开发。
2. 子域名 SSL 修复 + Host 路由 + 登录回调 + 跨子域 Cookie 策略。
3. 数据库变更（User 表补字段 + 新建 7 张表）。
4. 前端 track() SDK + 上报接口 + eventId 去重。
5. 全站布点（含关键按钮 data-track 标记、活动码 cmp 归因）+ 点赞/点踩/报错组件。
6. 每日汇总脚本（可重复执行、可重算、带计算版本）。
7. Mentor 端看板页面。
8. Admin 端看板页面。
9. 稳定期评估后启动第二期；自动风控和排名留到第三期。

生产发布原则：生产开发仍先进入 main/staging，获得单独确认后才进入 master/生产。在文档、数据库变更和 staging 验收完成前，不直接推进生产发布。

---

### 29. 风险、注意事项与验收标准

#### 29.1 风险与注意事项

1. **子域名证书问题**：`admin.aihr.top`、`mentor.aihr.top` 当前存在证书域名不匹配，浏览器无法正常进入；须先修复 SSL、Host 路由、登录回调和跨子域 Cookie 策略，再开发页面。
2. **认证现状落后**：当前认证主要支持普通用户与单一 ADMIN 角色，尚未为两个子域名完成独立角色与权限闭环；数据库还没有 MentorHuman、细粒度 Admin 权限、事件表、消息反馈表、每日汇总表和完整后台审计表。
3. **PRD 落后**：当前 PRD 仍写"6 个导师、340 张知识卡、不建立导师侧页面"，已落后于实际代码和本次产品决定；当前知识治理清单有 7 个知识导师、合计 399 张知识卡，前端导师配置中另有 Kevin，共 8 个展示导师。导师数量和知识卡数量必须动态读取，不能硬编码。须同步更新 PRD。
4. **文档一致性**：开发前必须将本方案、指标字典和 PRD 放在同一版本中评审并提交，避免依据孤立、未提交的文档开发。
5. **可关联标识风险**：匿名标识、设备标识和行为轨迹属于可关联标识，不能表述为"不含个人信息"；应最小化采集并限制访问。原始 User-Agent 应尽量解析后保存，避免长期保留不必要的完整原文。
6. **事件幂等与版本**：原始事件从第一天起即具备幂等标识、事件版本和发布版本，避免 React 重复触发或网络重试造成重复统计。
7. **汇总不可手工化**：每日汇总从第一期即使用可重复执行的定时任务，不以长期手工执行作为正式方案。
8. **知识更新时间**：Mentor 知识状态不依赖数据库 seed 造成的伪更新时间，须取自内容发布记录、manifest 或内容哈希。
9. **关系稳定性**：即使进入第三期，也不自动改为"一名真人导师管理多个分身"，该关系变更需业务明确需要且单独评审。

#### 29.2 验收标准

1. 普通用户不能访问 Admin 或 Mentor 后台。
2. MentorHuman 只能读取自己绑定的 Mentor 数据，浏览器篡改 mentorId 无效。
3. 一个 MentorHuman 只能绑定一个 Mentor。
4. Admin 权限在接口层生效（首版校验 role=ADMIN_FULL），前端隐藏菜单不等于权限控制。
5. 内测、导师自测、Admin、运营和 QA 数据完整保留，但默认不进入正式经营指标和排名。
6. 财务实收与自然用户转化分别统计。
7. `ai-guide` / 平台顾问类对象不进入真人导师经营指标（按 isPlatformAssistant 标记排除，非硬编码 ID）。
8. 完成轮次、计费轮次和非计费边界回复能够区分。
9. 免费试用、订阅、加购和历史未知权益不混算。
10. 重复上报和重复执行汇总任务不会重复计数。
11. 所有看板显示统计周期、更新时间和当前指标版本。
12. Mentor 知识状态不依赖数据库 seed 造成的伪更新时间。
13. 字段或口径发生变化时，可以查到版本、生效时间、修改原因和影响范围。
14. 无数据时展示引导状态，而不是整页全零；小样本（分布/排名 <5，敏感画像/语义 <10）不展示具体数值。
15. 页面不把 AI 推断结果表述成用户明确反馈；自动运营建议不会直接修改知识库或发布内容。
16. 两个子域名在正式开发验收前通过 HTTPS、登录、退出和权限验证。

---

## 附录：文档关系与合并说明

本文件确认后，应同步完成：

1. 将本文件作为 Admin 与 Mentor 产品范围、数据采集规范和指标口径的主依据；
2. 更新现有 PRD 中导师数量、知识卡数量、导师后台范围和认证现状；
3. 形成第一期开发任务清单、数据迁移方案和验收测试清单；
4. 在文档、数据库变更和 staging 验收完成前，不直接推进生产发布。
