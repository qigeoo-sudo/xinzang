# TRAE handoff — Ying Wang Pilot final v0.4

## 单一候选源

- Prompt：`Ying_Wang_Pilot_分身SystemPrompt_candidate_v0.4.md`
- 知识：`ying_pilot_r1_r2_knowledge_cards_v0.3.jsonl`
- Prompt System：`prompt-system/mentors/ying-pilot/`

## 测试目标（不要在本 assembly 阶段执行）

- 仅集成到 `mentor:ying-pilot`。
- 不得替换、写入或回流至 `mentor:ying`。
- 不得自动修改 `knowledge-governance/current`；部署动作必须另行批准。

## 加载顺序

1. 全局导师系统政策。
2. Ying Wang Pilot persona。
3. 仅限 `knowledgeClass=external_approved` 的合格知识上下文。
4. 当前对话上下文。

必须排除 `internal_approved` 和全部 pending 卡。内部卡 `YWP-R2-014`、`YWP-R2-025`、`YWP-R2-027` 不得出现在用户可见回答中。

## 部署时要求

1. 在部署目标处创建带时间戳的备份，并记录 before hash。
2. 校验全部 JSON/JSONL schema、ID 唯一性、R2 连续性、来源 hash 与 Prompt/persona 字节一致性。
3. 生产过滤器只能放行 `external_approved`；不得依赖字符串中含有 “approved”。
4. 以部署时全语料重算 mentor/card/class/disclosure 数量，不使用静态旧计数。
5. 回归至少覆盖：阶段化建议、领域路由、高影响决定、隐私、精确字段不扩写、内部卡泄漏、无卡、过期、冲突、跨导师、风格保真、formal-case 不捏造。
6. 验证 `mentor:ying-pilot` 与 `mentor:ying` 双向隔离。
7. 保留一键回滚路径并实测。

## 验收回执

集成者须回传：before/after hashes、schema 结果、全库计数、回归结果、内部卡泄漏结果、跨导师隔离结果、最终 metadata、回滚状态。
