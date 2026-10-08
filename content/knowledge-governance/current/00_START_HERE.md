# Ying Wang Pilot final handoff v0.4

## 用途

这是测试包。它以正式 `ying-final-handoff-v0.4` 为唯一内容基线，将第二轮书面审核已吸收后的 Prompt、知识卡与 Prompt System 资产机械克隆到独立的 `ying-pilot` 身份与命名空间。未重新解释或扩写访谈事实。

## 版本与状态

- assembly：`ying-pilot-final-handoff-v0.4`
- Prompt：candidate v0.4
- 知识卡：v0.3
- public profile：v0.1，`testOnly=true`，禁止公开发布
- Prompt System：v0.4.0，`draft`
- production current：保持不变

## 卡片状态

- 总数：92（R1 65；R2 27）
- `external_approved`：89
- `internal_approved`：3
- disclosure：exact 7 / generalized 82 / none 3
- pending：0
- formal case：0

普通用户回答只能检索 `external_approved`；3 张 `internal_approved + none` 卡只用于系统内部控制。

## 来源与音频

- 已登记并哈希校验 8 个独立输入：两份审核回复、三份第二轮人工文字稿、三份第二轮完整音频。
- 第二轮音频总时长：4319.24 秒。
- `review-source/` 中的第二轮回复与 Pilot 根目录原件逐字节一致。
- 音频分析文件按测试要求复用正式 final handoff，不重新分析录音。

## 入口

- Prompt：`Ying_Wang_Pilot_分身SystemPrompt_candidate_v0.4.md`
- 卡片：`ying_pilot_r1_r2_knowledge_cards_v0.3.jsonl`
- 最终审核吸收审计：`Ying_Wang_Pilot_第二轮审核吸收与最终交接审计_v0.3.md`
- 集成交接：`TRAE_HANDOFF.md`
- 验证结果：`VALIDATION_REPORT.md`

## 下一道门

本包只完成测试克隆与最终交接准备，不自动部署。集成前仍需按 `TRAE_HANDOFF.md` 做部署时备份、schema 校验、检索隔离与回归测试。
