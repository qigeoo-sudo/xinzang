# AIHR 指标字典与埋点清单 v2

版本：v2（修订稿，整合 Codex 审核意见与团队讨论结论）
日期：2026-09-28
配套文档：Admin_Mentor后台管理系统产品方案_v0.2.md、AIHR_Admin_Mentor后台管理系统修订执行方案_v0.2.md
地位：所有看板指标口径的唯一依据。代码里实现任何指标前，必须先在本文件中登记；既有指标定义不得覆盖修改，口径变化时新增 metricKey。

---

## 一、总则

1. 语义化命名：事件名描述业务动作（如 `mentor_card.click`），禁止按页面位置命名（如 `home.card3.click`）。页面改版不改业务动作时，事件名与 props 保持不变，统计口径天然连续。
2. 数据源优先级：业务表已有的数据一律从业务表算，不重复埋点。埋点只补业务表没有的行为数据（曝光、点击、活跃时长、终端）。
3. 看板只读汇总表：所有看板页面查询 DailyMentorStats / DailyPlatformStats / 业务表轻聚合，不实时扫 Event 原始表和 ChatMessage 全表。
4. 三种统计主体不混用：Student（用户）、Mentor（AI 分身）、MentorHuman（真人导师），每个指标必须标明主体。
5. 排除项：当前导师配置中没有平台顾问分身；今后若新增平台顾问类对象，在导师配置中打 isPlatformAssistant 标记，汇总时按标记排除，不写死具体 ID。内测用户、导师本人及自测账号、Admin/运营/QA 账号的数据照常采集，但在汇总时按用户群组排除出正式经营指标和排名。不使用硬编码手机号白名单维护排除名单。
6. 小样本保护：任何分布、排名类指标，分母小于 5 时页面显示「暂无足够样本」，不展示具体数值。
7. 语义指标标注：AI 推断类指标页面必须写「AI 推断」字样 + 样本量 + 更新时间，不得表述为用户明确反馈。
8. 事件幂等：每条事件携带唯一 eventId（crypto.randomUUID）和 pageInstanceId（页面实例级），服务端按 eventId 去重，防止 React 重复渲染和网络重试造成重复计数。
9. 财务实收与自然用户转化分别统计：测试/内测账号的真实付款仍进入财务实收对账，但不进入自然用户付费转化和导师资源分配指标。

---

## 二、数据源总览

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

### 需要给现有表补的字段

1. ChatMessage 增加 `entitlementSource` 列：`FREE_TRIAL | SUBSCRIPTION | CREDIT_PACK | UNKNOWN`，写消息时由服务端按用户当时权益来源盖章。历史无法可靠反推的数据标记为 `UNKNOWN`，不得伪造精确分类。待正式赠送权益台账建成后增加 `GIFT`。
2. User.role 枚举值增加 `MENTOR_HUMAN`；User 增加可空唯一字段 `boundMentorId`（绑定的分身 ID）；User 增加 `userGroup` 字段（`NORMAL | BETA | MENTOR_SELF_TEST | OPS_QA | PENDING_REVIEW`），带 groupMarkedAt / groupMarkedBy / groupReason 记录。
3. 新增表：Event、MessageFeedback、DailyMentorStats、DailyPlatformStats、AuditLog（后台操作审计）、MetricDefinition（指标定义登记表）、Campaign（活动登记）。

### MetricDefinition 表结构

| 字段 | 说明 |
|---|---|
| metricKey | 不可变唯一键，如 `mentor.helped_users`、`student.registration_count` |
| definition | 口径文字描述（冻结后不可修改） |
| subject | Student / Mentor / MentorHuman |
| dataSource | 数据来源说明 |
| status | ACTIVE / RETIRED |
| createdAt | 登记时间 |
| retiredAt | 停用时间（停用后看板不再展示，但历史数据保留可查） |

口径变化时新增 metricKey（如 `mentor.helped_users_v2`），旧 key 标记 RETIRED 但数据不动。计算实现修复或变更时，在汇总表中升级 aggregationVersion 并记录重算范围和结果。

---

## 三、指标字典

每个指标登记时获得不可变 metricKey。以下为首版指标清单。

### 3.1 Student 指标（主体：用户）

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

### 3.2 Mentor 指标（主体：AI 分身；平台顾问类对象按标记排除）

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

说明：产品方案中的「有效访问」定义（注册成功才算）在本字典中落为「主页访问用户数」（漏斗分母）与旅程回溯能力（见 3.5）；分身对订阅的贡献以「付费首聊归因人数」为准。轮次三层为包含关系：完成问答轮次 = 免费试用轮次 + 计费轮次 + 未知来源轮次。

### 3.3 MentorHuman 指标（主体：真人导师，仅作经营参与度与安全参考，不做绩效排名）

| metricKey | 口径 | 数据源 |
|---|---|---|
| mentorhuman.last_login_at | User.lastLoginAt | 实时 |
| mentorhuman.login_count | User.loginCount | 实时 |
| mentorhuman.dashboard_active_time | mentor 子域 page.active_tick 秒数求和 | Event（每日） |
| mentorhuman.profile_edit_submitted | 展示资料修改申请提交次数 | AuditLog |
| mentorhuman.content_feedback_count | 内容纠错或补充建议提交次数 | AuditLog |

### 3.4 漏斗与转化（主体：Student，同期批次口径）

#### 3.4.1 核心漏斗（七阶段）

首次有效落地 → 注册成功 → 引导/档案完成 → 首次导师主页访问 → 首次导师完成问答 → 到达付费页 → 首次真实付费。

| 阶段 | 定义 |
|---|---|
| S1 首次有效落地 | 满足全部条件的最早一条用户侧 page.view：用户群组为 NORMAL 或注册前未标记；ua 非机器人；事件发生时尚未注册（排除已注册回访）；page 非后台路径；属正常页面访问而非技术请求。无法识别来源的正常访问归「自然/未知」，不丢弃 |
| S2 注册成功 | User.createdAt |
| S3 引导/档案完成 | UserProfile.registrationCompletedAt 非空；无该时间戳的老用户，档案存在即视为完成并单独标注口径 |
| S4 首次导师主页访问 | 该用户首个 mentor_profile.view |
| S5 首次导师完成问答 | 该用户首个完成问答轮次（用户发有效消息 + Avatar 成功回复配对） |
| S6 到达付费页 | 该用户首个 paywall.view |
| S7 首次真实付费 | 该用户首个真实付款订单（定义见 3.4.4） |

#### 3.4.2 同期批次规则

1. 批次定义：选取某段时间（如自然周）首次有效落地的全部用户作为一个 cohort，以 S1 时间归属。
2. 观察窗口：7 天、14 天、30 天，记录各用户在窗口内完成到的阶段。
3. 成熟判定：批次落地末日 + 观察窗口 ≤ 任务运行日，该批次该窗口才算成熟；未成熟批次只展示人数，转化率标注「观察中」，不与成熟批次比较。
4. 禁止跨批次相除：不把「本月落地、本月注册、本月付费」直接相除，所有转化率都在同一 cohort 内计算。

#### 3.4.3 漏斗指标

| metricKey | 口径 |
|---|---|
| funnel.stage_users | 各阶段去重用户数，以阶段和观察窗口为维度（统计的是人，不是事件次数） |
| funnel.step_rate | 本阶段人数 ÷ 上一阶段人数 |
| funnel.overall_rate | 本阶段人数 ÷ S1 首次有效落地人数 |
| funnel.free_trial_to_paid_30d | 首次免费试用轮次起 30 天内真实付费的成熟批次转化率：分母只含首次试用时间 +30 天已过的用户，未完整经过观察期的用户不进分母 |
| funnel.paid_at_completed_round | 首次真实付款时刻之前累计完成问答轮次分桶：0 / 1–3 / 4–10 / 11–30 / 30 以上；轮次完成时间必须早于付款时间，不用用户当前总轮次 |
| funnel.channel_performance | 按首次锁定渠道（含自然/未知）比较经营表现，明细见 3.4.5 |

#### 3.4.4 真实付款与订单口径

1. 真实付款：status=PAID，且 transactionId 不以 `mock_tx_` 开头（识别历史 mock 订单）；今后 mock 订单同时在 metadata 写 isMock=true，双标记。
2. 首次付款三分类：首次订阅（paymentType=SUBSCRIPTION）、首次加榨包购买（paymentType=CREDIT_PACK）、全部首次真实付款（任一）；订阅与加榨包分开统计，代表不同经营信号。
3. 内部付款：排除群组账号（OPS_QA 等）的订单不进自然用户转化；财务实收另保留全量。
4. 重复回调：履约只对 PENDING 订单生效，天然幂等；数据质量检查按 transactionId 扫描重复或异常记录并标记，不删除。
5. paymentType=CREDIT_PACK 代码已在使用，prisma schema 的字段注释需同步更新，无结构变更。

#### 3.4.5 渠道经营表现（funnel.channel_performance）

按首次锁定渠道逐行展示：

1. 有效落地用户数；
2. 注册用户数和注册率；
3. 引导/档案完成用户数；
4. 首次导师完成问答用户数；
5. 真实付费用户数，订阅与加榨包分列；
6. 实收金额；
7. 落地到付费的 30 天转化率（成熟批次）。

渠道投放成本录入后，第二期再增加单个注册成本、单个有效对话用户成本、获客成本与投入产出比，不阻塞第一期。

### 3.5 双阶段旅程回溯（主体：Student；ADMIN_FULL 专用，含用户级下钻）

阶段定义：

- 阶段一（获客段）：该用户首条事件（首访）→ 注册成功（User.createdAt），事件以 anonymousId 串联，注册绑定时归属到 userId。
- 阶段二（转化段）：注册成功 → 首次付费成功（首个 PAID 订单 paidAt），事件以 userId 串联。
- 阶段边界时刻（注册成功、付费成功）不埋事件，聚合时从业务表取时间戳插入事件链。

| metricKey | 口径 |
|---|---|
| journey.stage1_duration | 阶段一耗时：首事件 serverTs 到 User.createdAt |
| journey.stage2_duration | 阶段二耗时：User.createdAt 到首个 PAID 订单 paidAt |
| journey.chain | 两阶段各自的完整事件链（按 serverTs 排序），支持用户级逐条查看 |
| journey.top_pages | 阶段内浏览次数最多的页面（page.view 按 page 计数） |
| journey.top_cta | 阶段内点击次数最多的按钮（所有 `*.click` 事件按统一 label 合并排序） |
| journey.dwell_by_page | 阶段内各页面逗留时长（active_tick 按 page 求和） |

人群范围：

1. 完成全部两阶段的用户：分阶段输出上述指标。
2. 只完成阶段一、未完成阶段二的用户（有注册、无 PAID 订单）：输出阶段二窗口（注册后至统计时点）的 top_pages、top_cta、dwell_by_page，用于定位流失前的集中行为。

切分维度：

- 时间段：按注册日或付费日圈定任意区间。
- 活动：按首触活动码圈定人群（User.attributionJson 中，见第六节来源体系）；活动前后对比用同一日期区间规则分别聚合。
- 设备：按首事件 ua 解析桌面 / 安卓 / 苹果。
- 上述维度可叠加。

实现说明：用户级事件链查询走 Event 表（按 userId 或注册绑定的 anonymousId 过滤、serverTs 排序）；回溯窗口受保留期约束——普通用户 90 天，曾付费用户 3 年。聚合榜单与耗时分布由每日汇总任务预算，下钻页面只读汇总加单人事件链，不做全表扫描。全部事件为全站统一采集，首版旅程回溯页面仅 ADMIN_FULL 可见；数据同时为导师端将来的相关视图做好储备，导师端首版仍只展示聚合指标。

### 3.6 第二阶段语义指标（先登记 metricKey，暂不上线）

| metricKey | 说明 |
|---|---|
| mentor.ai_satisfaction_tendency | AI 推断满意倾向率 |
| mentor.ai_resolution_rate | AI 推断问题解决率 |
| mentor.unresolved_themes | 高频未解决主题 |
| mentor.satisfaction_points | 满意点 |
| mentor.disappointment_points | 失望点 |
| mentor.question_chain_count | 问题链数量及轮次分布 |

统一要求：离线每日批处理，结果带 modelVersion、promptVersion、样本量、分析时间；不影响计费与权限。

---

## 四、埋点清单

### 4.1 事件模型

Event 表字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | cuid | 主键 |
| eventId | string | 客户端生成的唯一事件 ID（crypto.randomUUID），服务端按此去重 |
| eventName | string | 见 4.2 字典 |
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

### 4.2 事件字典（共 8 个，首版全部）

| 事件名 | 触发时机 | props | 备注 |
|---|---|---|---|
| page.view | 路由切换完成（SDK 自动，全站覆盖） | referrer | 所有页面自动有，新页面零成本接入 |
| page.active_tick | 页面前台可见且未进入空闲状态时每 30 秒一条 | seconds=30, mentorId?（聊天页带）, pageInstanceId | 详见 4.3 活跃采集规则 |
| mentor_card.impression | 导师卡进入视口 ≥50% 且停留 ≥0.5 秒 | mentorId, position, sourcePage, label='导师卡片：<导师名>' | IntersectionObserver，每页每卡只报一次 |
| mentor_card.click | 点击导师卡 | mentorId, position, sourcePage, label='导师卡片：<导师名>' | |
| mentor_profile.view | /mentors/[id] 打开 | mentorId, from（card_click/direct/search） | 分身主页访问 |
| paywall.view | 订阅页打开 | from? | |
| subscribe.click | 点击具体套餐 | plan（MONTHLY/QUARTERLY/YEARLY/CREDIT_PACK）, label='订阅：<套餐名>' | |
| cta.click | 点击带 data-track 标记的任意按钮 | label（data-track 值，按钮语义标签），extraProps?（data-track-props 的 JSON） | 见下方标记约定 |

标记约定（通用按钮点击，低成本接入）：

1. 需要统计的按钮加属性 `data-track="按钮语义标签"`；需要额外参数时加 `data-track-props='{"key":"value"}'`。
2. SDK 在 document 上注册一个委托点击监听，命中带 data-track 的元素（或其最近祖先）即自动上报 cta.click，无需逐个按钮写代码。
3. 首版要求所有与转化相关的关键按钮加标记：注册向导各步按钮、开始/提交测评、开始对话、发送消息以外的聊天操作、资料保存、游戏主按钮等；导航链接可不标（其去向由 page.view 体现）。
4. label 用统一语义文案，不随 UI 措辞变化频繁改动；确需改动时按口径变更处理（新 label）。
5. 统计「点击最多的按钮」时，所有 `*.click` 事件按统一 label 字段合并排序。

不上报的内容：聊天原文、表单填写内容、手机号、搜索词等任何 PII。点赞/点踩/报错走业务接口直写 MessageFeedback 表，不进 Event。

### 4.3 活跃采集规则（page.active_tick）

1. 只在页面处于前台可见状态时计时（Page Visibility API：document.visibilityState === 'visible'）。
2. 页面失焦、切到后台或锁屏时停止上报。
3. 最近 5 分钟没有点击、输入、触摸、滚动等行为后进入空闲状态，停止上报；再次互动后恢复。
4. 每次上报携带唯一 eventId（去重用）和 pageInstanceId（页面实例级，区分同页面多次打开）。
5. 事件批量发送，不每 30 秒单独发起一次网络请求。
6. 只保存语义页面名称，不保存带手机号、搜索词等内容的完整 URL。
7. 聊天页面可以携带 mentorId，但不携带聊天原文或输入内容。
8. 内测、导师自测、Admin 和 QA 账号的数据照常采集，在汇总时按 userGroupSnapshot 单独分组和排除。
9. 30 秒只是活跃采样间隔，不得用于切分 ChatSession 或问题链。
10. 原始事件按既定保留期保存，第一期暂不向 Mentor 展示「精确活跃时长」。

指标全称：页面前台可见且未进入空闲状态的估算活跃时间。

### 4.4 按页面布点表

| 页面 | 事件 |
|---|---|
| 全站所有页面 | page.view、page.active_tick（SDK 自动）、cta.click（带 data-track 的按钮，委托监听自动上报） |
| /mentors、/（含导师卡的页面） | mentor_card.impression、mentor_card.click |
| /mentors/[id] | mentor_profile.view |
| 聊天页 | active_tick 带 props.mentorId |
| /dashboard/subscription | paywall.view、subscribe.click |
| 每条 assistant 消息气泡 | 点赞/点踩/报错组件（写 MessageFeedback） |

### 4.5 身份贯通规则

1. 首访由中间件检查并种植 `aid` cookie（httpOnly，1 年），全站同一值。
2. sessionId 由客户端生成维护：30 分钟无事件后下一个事件换新 sessionId。
3. 上报接口从登录态取 userId 写入，前端传了也不认。
4. 仅注册成功时，汇总任务把同一 anonymousId 近 90 天的匿名事件归到该 userId，完成匿名段与实名段串联。普通登录不自动认领同一设备近 90 天的全部历史。
5. 多端场景：同一 userId 不同 anonymousId 的历史事件，各自保留，按 userId 聚合即可。

### 4.6 上报机制

- 前端 track() 先入内存队列，满 10 条或 5 秒 flush 一次；页面隐藏/关闭时 navigator.sendBeacon 兜底批量发送。
- 上报接口批量接收，校验登录态后写 Event 表，按 eventId 去重；失败不重试超过 1 次（埋点宁可丢，不可影响主流程）。
- 采集异常（如连续无事件但在线用户正常）计入 Admin 数据质量看板。

### 4.7 事件清理

- 每日清理任务按保留期删除过期原始事件：删除前先查用户付费状态，曾付费用户（含其注册绑定匿名段）保留 3 年；普通用户和未绑定匿名事件 90 天。
- 用户在第 90 天前才完成付费，其事件因清理时的付费检查而自动转为 3 年保留。
- 汇总表、MetricDefinition 与审计记录不清理。

---

## 五、用户群组与排除机制

### 5.1 用户群组定义

| userGroup | 正式经营指标 | 导师排名 | 单独分析 |
|---|---:|---:|---:|
| NORMAL（普通用户） | 纳入 | 纳入 | 可选 |
| BETA（内测用户） | 默认排除 | 不纳入 | 是 |
| MENTOR_SELF_TEST（导师本人及明确自测账号） | 默认排除 | 不纳入 | 是 |
| OPS_QA（Admin、运营、QA 账号） | 默认排除 | 不纳入 | 是 |
| PENDING_REVIEW（待复核异常账号） | 暂不计入排名 | 冻结 | 是 |

### 5.2 标记与管理

- 用户群组在 User 表上标记，带 groupMarkedAt / groupMarkedBy / groupReason 字段。
- 账号由 BETA 转为 NORMAL 后，只排除其处于 BETA 期内的行为。真实付款仍进入财务实收对账，但不进入自然用户付费转化和导师资源分配指标。
- 不使用硬编码手机号维护排除名单。

### 5.3 排除规则在汇总中的实现

- 汇总任务读取 User.userGroup，在写入 DailyMentorStats / DailyPlatformStats 时按 group 决定是否计入正式指标列。
- 被排除的数据单独写入一列（如 `excluded_helped_user_count`），不删除原始记录。
- Admin 看板可切换"含排除数据 / 仅正式指标"视图。

---

## 六、来源体系：渠道与活动

划分原则：按「是否常态化」区分，不按合作方身份区分。

### 6.1 渠道（Channel）

持续存在、无固定结束时间的获客通路：

- 自有渠道（OWNED）：官方小红书/公众号/抖音内容、SEO、自有社群、官网，凭自身运营能力持续获客。
- 合作渠道（PARTNER）：有长期导流或分成关系的伙伴，对应现有 Channel 表 partner/shareRate 设计。

现有 Channel 表结构继续使用；渠道码 `/r/{code}` 与 `?ch=` 归因机制不变。

### 6.2 活动（Campaign）

有明确起止时间的阶段性动作，新增 Campaign 表登记：

| 字段 | 说明 |
|---|---|
| code | 活动码，唯一 |
| name | 活动名称 |
| type | EVENT（市场活动：合办 event/直播/线下）、PROMOTION（促销活动：折扣/赠送）、ADS（付费投放） |
| channelId? | 挂靠的常态渠道（可空） |
| partnerOrg? | 合作机构名称（合办活动） |
| startAt / endAt | 活动有效期 |
| status | ACTIVE / ENDED / DISABLED |
| note | 备注 |

规则：

1. 与其他机构合办的一次性 event 记为 EVENT，填 partnerOrg，不建立渠道；该机构转为持续导流关系时，再另建合作渠道。
2. 促销活动记为 PROMOTION，与权益发放台账关联——折扣体现在订单，赠送体现在发放记录。
3. 活动链接 `?cmp={code}`（或 `/e/{code}`）；只有活动在有效期内才写入首触归因，过期或无效码落自然量。

### 6.3 多活动触点

1. 首次触点锁定一个渠道和一个活动（attributionJson），之后不可更改。
2. 用户后来在促销期间下单，促销活动记录在订单 metadata 与权益发放台账中，不覆盖首触归因，两条信息并存。
3. 旅程回溯按首触活动圈人；促销效果按订单关联的 PROMOTION 活动统计。

---

## 七、权限模型

### 7.1 角色

首版两个角色，框架可扩展：

| role 值 | 名称 | 权限范围 |
|---|---|---|
| ADMIN_FULL | 平台管理员 | 全平台数据、MentorHuman 账号管理、用户群组管理、展示资料审核、审计查看 |
| MENTOR_HUMAN | 真人导师 | 仅自己绑定分身的聚合数据、展示资料修改申请（提交审核）、内容反馈提交、修改密码 |

MentorHuman 可在后台提交：头像修改、对外关键词标签修改、对外简介修改。所有修改提交后由 Admin 审核发布，不立即生效。今后可扩展直接向 dashboard 提交案例分享，经 Trae 转 Codex 生成知识卡。

### 7.2 服务端校验

- MentorHuman 后台所有接口从登录态反查 boundMentorId，不接受前端传参指定 mentorId。
- Admin 后台所有接口服务端校验 role=ADMIN_FULL。
- 前端隐藏菜单不等于权限控制。
- 所有敏感操作（查看敏感档案、修改群组、审核资料、排除互动）写入 AuditLog。

### 7.3 MentorHuman 隐私边界

- 只能查看与自己绑定 Mentor 的聚合数据。
- 不能通过多条件筛选缩小到具体 Student。
- 不能查看手机号、精确出生年月、完整聊天。
- 小样本（<5）不展示分布或排名。

### 7.4 Admin 调查边界

- 具备风控、投诉、安全或数据核查权限的 AdminHuman，可在填写理由并接受完整审计的前提下，下钻至账号、行为记录和必要聊天片段。
- 敏感画像和语义分布默认样本少于 10 时不展示。

---

## 八、改版与指标版本管理

### 8.1 不可变 metricKey

- 每个指标登记时获得不可变 metricKey 和口径定义，登记后不得覆盖修改。
- 业务口径变化时新增 metricKey（如 `mentor.helped_users_v2`），旧 key 标记 RETIRED 但数据不动，历史数据按旧定义永远可解释。
- 看板切换指标时是"停用旧 key、启用新 key"的操作记录，运营人员看到的是时间线，不需要理解版本号。

### 8.2 aggregationVersion

- 同一 metricKey 下，计算实现修复或变更时升级 aggregationVersion。
- 每次升级记录：重算范围（日期区间）、变更原因、结果状态、执行人。
- 可以重算最近若干天，以处理延迟事件和规则修订。

### 8.3 字段增删

字段采用"新增 → 并行验证 → 标记停用 → 停止新写入 → 保留历史"方式。必须说明空值代表"没有数据"还是"当时没有该字段"。不得直接删除原始历史。

### 8.4 改版 checklist

1. page.view / active_tick 为路由级自动埋点，新页面默认接入，确认 page 语义名是否符合新路由。
2. 涉及导师卡、分身主页、订阅页的改版：事件名与 props 不变，只改 UI。若业务动作本身变了，先在本文件登记新 metricKey 再改代码。
3. 新增指标：先在 MetricDefinition 表登记 metricKey 和口径，再写代码。
4. 每次改版发布前核对：本文件中该页面涉及的事件是否全部仍然触发。

---

## 九、汇总任务

1. 采用北京时间按日汇总。
2. 任务可重复执行而不重复计数（按日期 + metricKey + aggregationVersion 幂等）。
3. 每次重算记录数据范围、计算版本和结果状态。
4. 看板读取汇总数据，不在打开页面时扫描完整聊天表。
5. 可以重算最近若干天，以处理延迟事件和规则修订。
6. 漏斗按同期批次计算：每日任务识别首次有效落地、圈定 cohort、按 7/14/30 天窗口写入各阶段去重人数与成熟状态；免费试用转化仅对成熟分母出率。
7. 旅程回溯的聚合榜单（top_pages / top_cta / dwell_by_page）与阶段耗时分布在每日任务中按 cohort 预算，支持时间段、活动、设备维度叠加。
8. 第一期先手动脚本触发，稳定后挂 cron 每日凌晨执行。

---

## 十、审计

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

---

## 十一、第一期范围

### 必须完成

1. 修复 admin.aihr.top、mentor.aihr.top 的 SSL 和 Host 路由。
2. User 表加 role=MENTOR_HUMAN + boundMentorId + userGroup 字段；ChatMessage 加 entitlementSource。
3. 新建 Event、MessageFeedback、DailyMentorStats、DailyPlatformStats、AuditLog、MetricDefinition、Campaign 表。
4. 前端 track() SDK + 批量上报接口（含 eventId 去重、pageInstanceId、releaseVersion）。
5. 全站布点 + 点赞/点踩/报错组件（对话页消息级）。
6. 每日汇总脚本（可重复执行、可重算）。
7. Mentor 端看板：首页概览（浏览、聊天、付费三层聚合人数）+ 对话效果 + 用户画像聚合 + 展示资料修改申请 + 知识状态 + 内容反馈 + 修改密码。导师端不提供任何用户级数据，不做用户×分身汇总表。
8. Admin 端看板：平台概览 + 同期批次核心漏斗（含成熟状态、真实付款三分类）+ 渠道经营表现 + 导师列表下钻 + 双阶段旅程回溯（用户级事件链下钻 + 两阶段聚合榜单，支持时间段/活动/设备切分）+ 用户群组管理 + 活动登记管理 + MentorHuman 账号管理 + 排除标记 + 审计。
9. 子域名中间件按 Host 路由 + 角色校验（复用 channel.aihr.top 模式）。

### 第一期采集但暂不展示

- 页面活跃时长（page.active_tick 数据照常采集，看板第二期展示）。

### 第二期

1. 页面活跃时长展示、转化所需时间分布；
2. 问题链识别、AI 推断满意倾向/问题解决率、高频主题、完整画像分布；
3. 旅程 Top 路径聚类；
4. 渠道投放成本与 ROI（单个注册成本、单个有效对话用户成本、获客成本、投入产出比）；
5. 不同用户画像的转化差异、改版前后漏斗对比；
6. 版本前后对比、经脱敏的反馈原话片段。

### 不做

- 一名导师管理多个分身。
- Admin 六级预设角色（首版两角色起步）。
- 临时提权（首版只有一个管理员）。
- 异常互动自动检测页（首版只做排除标记+原因记录）。
- 自动按排名分配推荐资源。
- MentorHuman 编辑 JSONL 知识卡/Prompt/披露级别。
- 实时调用 LLM 扫描全量聊天生成看板。

---

## 十二、实施顺序

1. 文档冻结与提交（本文件 + 修订执行方案 + PRD 更新同步提交）。
2. 子域名 SSL 修复 + Host 路由 + 登录回调。
3. 数据库变更（User 表补字段 + 新建 7 张表）。
4. 前端 track() SDK + 上报接口 + eventId 去重。
5. 全站布点（含关键按钮 data-track 标记、活动码 cmp 归因）+ 点赞/点踩/报错组件。
6. 每日汇总脚本。
7. Mentor 端看板页面。
8. Admin 端看板页面。
9. 稳定期评估后启动第二期。
