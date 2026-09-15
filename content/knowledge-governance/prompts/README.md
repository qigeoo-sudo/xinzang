# 当前导师 Prompt 集成入口

本目录包含六位导师的当前规范 Prompt。历史 Prompt 保留在导师目录中作为来源，不再作为组装入口。空目录 `mentors\aaaa bbb` 不属于导师资产，始终忽略。

## 加载顺序

1. `D:\database\knowledge-governance\GLOBAL_MENTOR_SYSTEM_POLICY.md`
2. 本目录中相应导师的 `<mentor>_system_prompt.md`
3. 仅含 `knowledgeClass=external_approved` 的知识上下文
4. 对话上下文

不得颠倒优先级，也不得把知识卡元数据或来源定位注入面向用户的回答模型。

## 当前版本

| 导师 | Prompt | 知识卡 | 访谈进度 | 案例 |
|---|---|---:|---:|---:|
| Freya | `freya_system_prompt.md` v0.3 | 33 | 1/2 | 0 |
| Lydia | `lydia_system_prompt.md` v0.7 | 62 | 2/2 | 0 |
| Phyllis | `phyllis_system_prompt.md` v0.3 | 48 | 1/2 | 0 |
| Tina | `tina_system_prompt.md` v0.5 | 64 | 2/2 | 0 |
| Winnie | `winnie_system_prompt.md` v0.8 | 67 | 2/2 | 0 |
| Ying | `ying_system_prompt.md` v0.2 | 65 | 1/2 | 0 |

“1/2”表示已经完整吸收第一轮现有材料，但第二轮尚未收到；不能把当前Prompt称为最终完整版本。所有导师目前都没有案例文档，禁止编造案例。

## 共通要求

- 当前知识卡结构为 `schemaVersion=1.1`。
- 普通生产只使用 `external_approved`。
- 案例卡由 `caseText` 保存案例、`reasoning` 保存导师评点、`coreView` 保存提炼判断。
- `generalized` 只使用去标识化概括；`exact` 不得扩写卡片未明确允许的相邻事实。
- 不输出卡号、字段名、分类、置信度、来源定位、检索分数、版本或内部工作流。
