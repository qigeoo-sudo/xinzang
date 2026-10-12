# Ying Wang Pilot v0.5 集成交接

唯一Prompt Ying_Wang_Pilot_分身SystemPrompt_candidate_v0.5.md，唯一知识快照 ying_pilot_r1_r2_knowledge_cards_v0.5.jsonl；不得从审计或原Ying重建。候选目标：D:/database/knowledge-governance/current/ying_pilot_knowledge_cards.jsonl 与 prompts/ying_pilot_system_prompt.md；应用候选目标 C:/Users/bingw/Documents/trae_projects/squeezer/content/knowledge-governance/cards/ying-pilot_knowledge_cards.jsonl 与 prompts/ying-pilot_system_prompt.md。所有目标只为reviewable合同，本次未复制。mentorId=ying-pilot，不能静默改成yingwang或覆盖原Ying；实际路由/注册表映射先由产品确认。

## 前置状态与双快照

baseline v0.4；两侧内容与应用Pilot卡数均0、Prompt未注册。证据deployment-baseline/snapshot_reconciliation.json、application及content快照。应用origin/main锚点47f78642bc89eb203edad2ce0965c548ce14a54c；存在未提交Runner/运营台变更，不触碰。集成当刻重读AGENTS/PRD/Git和两侧快照；有新Pilot资产时必须改用更新基线，禁止回退。

36条回答吸收；6条H仍未勾选；公开平台/地区/语言/用户范围尚未明确。先解决范围与Pilot映射门禁，再取得“确认交给Trae集成至main和测试端”授权。manifest draft不变。

## 加载与过滤

加载全局System Policy → 平台运行规则及导师Prompt → eligible external_approved知识 → 会话。79卡全外部批准（首轮63/二轮16），72泛化/7精确，0pending/internal/案例。普通生产SQL白名单external_approved，internal与pending永不进入普通回答。剥离标题、领域、cardId、分类、source、confidence、版本、日期、分数；保留coreView/reasoning/caseText及必要适用边界。

## 部署与回滚

部署当刻对两侧Prompt、知识、manifest、注册表、seed、导师列表及元数据做时间戳备份和SHA；本包快照不能代替部署当刻备份。改动仅经授权的Pilot路径与注册，不合并未提交应用工作。Schema验证当前1.1与Prompt System JSON；按全库重新统计README、素材覆盖、Prompt README和manifest，不硬编码其他导师数量。seed目前无Pilot且固定exact=5/单案例断言，需改为实际语料统计并验证；检索需验证reviewAfter及未解冲突失败关闭。失败恢复部署当刻快照，复核哈希与全部元数据。

## 必跑应用动态回归

阶段性招聘顺序；制造岗位补齐；管理责任非晋升保证；薪资非成长保证；专业路由；重大不可逆决定不代拍板；精确字段非扩张；第三方与公司内部隐私；internal/pending与元数据不泄漏；无卡/过期/冲突/跨导师；语言充分解释与有效例子；无正式案例不虚构；已删除044047与排除八张R2卡不复活。静态合同通过不代表模型或实际产品已通过。

## 回传验收

集成人员必须回传前后Prompt/卡/manifest SHA、Schema结果、按导师和全库重新统计、各项动态回归结果、内部卡与元数据泄漏扫描、最终元数据、实际修改文件/提交与测试端、时间戳备份和回滚状态。main/test集成后另行人工验收，master/生产发布须第二次独立授权。
