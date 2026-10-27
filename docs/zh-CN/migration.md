# v0.8.0 到 v0.8.1 及后续维护版本的迁移

[English](../migration-v080-v081.md) | 简体中文 · [中文目录](README.md)

适用目标版本 v0.8.3 Preview。先从[通用迁移入口（英文）](../migration.md#current-upgrade-route)选择与你的起始版本匹配的路线。v0.8.1 引入显式内容标准 v2，后续维护版本沿用该状态语义。

原生 RDF/SHACL/Rego v1 标准、不可变资产、决定、请求回执与历史 usability v1 评定保留原始字节和含义。安装升级不会自动升级资产，也不会将旧 L3 重新标为 v2。

## 切换前

核对四个精确提交、组件锁、Release 摘要与安装清单。使用受支持维护流程停止共享 Workspace 连接和独立 worker；停用一个会话并不等于停止它们。对完整非空 Workspace 状态及身份/配置建立停机备份并验证，记录旧安装路径和身份。不要复制活跃 SQLite 数据库或用合成测试状态覆盖真实数据。

先在备份的隔离副本执行升级与恢复演练。升级前后对照旧资产、决定、回执和 v1 评定摘要；执行明确的 v2 内容流程，并验证旧写入器拒绝新状态。恢复匹配的升级前备份，确认旧安装能读取原记录。失败候选状态单独保留，回滚不删除新审计证据。

## 状态与客户端兼容

当前状态标记是 **Runtime 8 / Harness 8 / Ontology 5**。Runtime/Harness 的新 readiness 写入将 SQLite user-version 推进至 8；包含 `readiness/specification-v2.json` 的 Ontology 原生写入推进至 5。旧 v0.8.0 写入器不能接受该新状态，新读取器理解旧标记。不要手工降低标记。

旧 `usability.*` 和 `/v1/assets` 保留 v1 语义。新 owner `readiness.*` 显式使用 `standardVersion: "v2"`，HTTP 使用 `/v2/assets` 与 `assets.readiness` 或 `assets.specification.v2`；缺失或未知版本应失败，不能悄悄改变解释。

每个项目分别记录 v2 建模用途和新资产版本，保留旧来源、资产引用、已审阅决定和真实重建历史。旧 v1 L3 不等于完整项目的 v2 L3，需要审阅所选完整范围。`assetAssessment` 与 `reconstructionVerification` 分开；`L3 / NOT_REQUESTED` 有效。历史重建证据只适用于绑定的精确资产摘要，内容授级不启动重建。

## 安装与验证

候选检查完成后，将经校验的公开下载安装到新的版本化目录，通过受支持维护绑定已有 Workspace，重新连接 Codex，检查实际插件、三个组件版本、安装根目录和摘要。更新本地插件后重启桌面应用，不能只依赖显示名称。

通过实际安装的 Host 读回 v2 标准、内容评定与独立重建状态；切换证据完整前保留旧安装与已验证备份。成功信号是新身份正确、原记录可读且摘要保持、v2 状态明确、恢复路线已实际验证。

回滚时先停止新服务，将匹配的升级前备份恢复为受支持的原身份，再连接旧安装。禁止旧写入器打开 marker-8/marker-5 状态、手工改回执或重放不确定业务请求。

参阅[安装](installation.md)、[内容等级](asset-readiness.md)、[维护与备份（英文）](../preflight-maintenance.md)、[恢复（英文）](../recovery.md)。
