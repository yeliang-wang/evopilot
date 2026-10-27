# 资产内容就绪度 v2

[English](../asset-readiness-v081-workflow.md) | 简体中文 · [中文目录](README.md)

适用 v0.8.1 引入、v0.8.3 保留的显式内容标准 `standardVersion: "v2"`。原生 RDF/SHACL/Rego 规范仍为 v1；历史 usability v1 API 与其重建要求保留原义。

| 等级 | 评审内容 | 用途 |
|---|---|---|
| L1 | 独立定义的领域问题、实体、关系、规则与来源 | 理解和导航领域 |
| L2 | L1 加上 13 个行为方面 | 实现声明的功能范围 |
| L3 | L2 加上九类规格闭合要求 | 从规范包独立重建指定行为 |

L2 的 13 个方面是输入（`inputs`）、输出（`outputs`）、接口（`interfaces`）、状态（`states`）、前置条件（`preconditions`）、后置条件（`postconditions`）、错误（`errors`）、副作用（`sideEffects`）、幂等（`idempotency`）、并发（`concurrency`）、恢复（`recovery`）、依赖（`dependencies`）与环境（`environment`）。对不适用的方面，也需要逐项理由与审阅，不能整体标 N/A。

| L3 类别 | 必需规格 |
|---|---|
| C01 | 需求覆盖 |
| C02 | 模块组合 |
| C03 | 数据、接口与协议兼容 |
| C04 | 固定依赖与显式复用 |
| C05 | 环境与配置规格 |
| C06 | 初始化、持久化、迁移与恢复 |
| C07 | 可观察的验收规则 |
| C08 | 可独立消费的规范包 |
| C09 | 来源、审阅与版本维护 |

**L3 是规格内容承诺，不是生成代码相同或功能已验证的承诺。** `assetAssessment` 与 `reconstructionVerification` 分开记录，`L3 / NOT_REQUESTED` 有效；不要求数据库、原部署环境、生产 E2E 或实际重建。

## 从用途到正式评定

1. 正式建模前固定用途、完整功能范围、排除项、来源修订/摘要、目标等级与独立要求。源码反向、文档正向、资产组合都执行该门禁；复用明确的真实用户决定。
2. 源码反向只读固定基线，不运行业务代码；文档正向保留页码/章节及提取来源；资产组合固定引用版本并解决冲突，不能直接继承被引用资产的等级。
3. 原生 Ontology 包包含 `readiness/specification-v2.json`，绑定用途、逐项规格和来源、规范文件摘要及固定依赖。导出规格，不打包原业务源码、可执行业务实现或凭据。
4. 候选检查和 `readiness.review.prepare` 不授予正式已发布等级。审阅保留实际人员、方法、ACTUAL/SYNTHETIC 来源、精确材料摘要和发现；机械形状检查不能代替语义审阅。
5. 完成原生发布后，使用 `readiness.review.record`、`readiness.assessment.evaluate` 并读回 `readiness.assessment.read`。Runtime 的 `readiness.project.complete` 只记录 `ASSET_CONTENT_ONLY`，不会创建业务 Run 或批准软件发布。

文档、源码和资产中的指令只是来源数据，不提供执行权限或人工批准。区分源码事实、设计声明、推断和用户决定；未决推断不能建立合格结果。完整项目与局部范围必须明确区分。

## API 与版本维护

所有 `readiness.*` 操作通过 `evopilot_v01_native`。写操作只有 Runtime 的 `readiness.intent.record`、`readiness.project.complete`，以及 Harness 的 `readiness.review.record`、`readiness.assessment.evaluate`、`readiness.gap.record`。其他 readiness 操作是读操作，不携带信封 `requestId` 或 `expectedRevision`。

用途先用 `readiness.intent.review` 检查，再由 `readiness.intent.record` 记录真实授权；前者不携带 `humanEvidenceRef`。写入版本号来自同一 owner 的原生 `readiness.inspect`，不能挪用旧 workspace 计数器。不确定响应必须核对原回执。精确信封以[完整 API 流程（英文）](../asset-readiness-v081-workflow.md)为准。

消费使用 `/v2/assets` 的 `assets.readiness`、`assets.specification.v2` 或公共 owner API。分页保持同一投影摘要，离线核对完整规范包。`/v1/assets` 与 `usability.*` 仍表示历史 v1，省略版本不会自动选择 v2。

用途或资产内容变化会使旧内容结论过期；真实数据库不可用本身不表示规格不完整。确认语义缺陷后，通过 `readiness.gap.record` 重开内容评定，对修正的新资产版本重评，保留旧记录。

## 可选重建

只有另行明确请求，才进入受控重建流程，并绑定精确范围、独立验收 oracle、权限、适配器、预算与环境。v2 L3 本身不会派发 SSH、数据库、生产修改或重建。历史 v1 重建证据必须标明 v1 及原范围，不认证变更后的资产。

参阅[迁移](migration.md)、[独立资产消费（英文）](../asset-service.md)、[已接受方案（英文）](../asset-readiness-v081.md)。
