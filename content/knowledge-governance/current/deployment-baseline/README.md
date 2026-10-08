测试克隆快照：不得据此自动修改 production current。

# 当前规范知识库入口

本目录是供Trae或其他组装流程读取的规范知识卡快照。导师原始工作文件继续保留用于追溯，但不应直接作为当前集成输入。

六位导师的当前 Prompt 位于 `D:\database\knowledge-governance\current\prompts\`，加载说明见该目录的 `README.md` 与 `manifest.json`。

## 文件

- `freya_knowledge_cards.jsonl`：33张
- `lydia_knowledge_cards.jsonl`：62张
- `phyllis_knowledge_cards.jsonl`：48张
- `tina_knowledge_cards.jsonl`：64张
- `winnie_knowledge_cards.jsonl`：67张
- `ying_knowledge_cards.jsonl`：65张

合计339张，其中338张为 `external_approved`，1张为 `internal_approved`。当前没有 `external_pending` 或 `internal_pending` 卡。

披露模式为333张 `generalized`、5张 `exact`、1张 `none`。5张 `exact` 为4张Lydia已确认公开履历卡与1张Freya已确认公开履历卡；`none` 对应Freya不允许公开展开的医疗AI内部观察。

## 集成规则

- 普通生产回答只允许读取 `knowledgeClass=external_approved`。
- 当前没有待审类卡；新增或被退回修改的卡按用途进入相应待审分类。
- 每张卡必须同时具有 `knowledgeClass` 和 `disclosureMode`；内部类的 `disclosureMode` 必须为 `none`。
- 不再读取旧的独立审核状态和发布范围字段。
- 卡号、分类、置信度、来源定位和其他元数据不得进入面向用户的模型上下文。
- `D:\database\knowledge-governance\GLOBAL_MENTOR_SYSTEM_POLICY.md` 必须由系统层加载，不能作为知识卡检索。

## 结构版本

- 当前结构版本：`1.1`
- JSON Schema：`D:\database\knowledge-governance\knowledge_card.schema.json`
- `caseText` 为可空字段：普通观点卡为 `null`，案例卡保存案例本身。
- 案例卡的 `reasoning` 保存导师评点，`coreView` 保存提炼后的核心判断。
- 不增加 `mentorCommentary`；目前不强制增加 `cardType`。
