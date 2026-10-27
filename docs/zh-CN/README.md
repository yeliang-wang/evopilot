# EvoPilot 中文文档

[English](../README.md) | 简体中文

本入口说明 v0.8.3 Preview。面向首次使用 Codex 插件、接入项目、评定资产等级和迁移已有工作区的用户。日常使用从已发布发行包开始，源码构建用于贡献者。

| 要完成的任务 | 中文指南 |
|---|---|
| 下载、校验、安装并连接插件 | [安装](installation.md) |
| 初始化 Workspace，开始正向或反向建模 | [首次使用](first-journey.md) |
| 确定用途与 L1/L2/L3，理解授级结果 | [资产内容就绪度 v2](asset-readiness.md) |
| 将 v0.8.0 工作区迁移到 v0.8.1 及后续维护版本 | [迁移与恢复](migration.md) |
| 更新双语首页、命令和术语 | [双语维护规则](documentation-languages.md) |

更深入的内容暂以英文提供：[完整文档目录（英文）](../README.md)、[原生操作（英文）](../native-workflow.md)、[独立资产服务（英文）](../asset-service.md)、[在线 Harness（英文）](../online-harness.md)、[响应联动（英文）](../response.md)、[故障恢复（英文）](../recovery.md)、[源码开发（英文）](../development.md)。

组件入口：[Runtime 中文首页](https://github.com/yeliang-wang/evopilot-runtime/blob/main/README_CN.md)、[Harness 中文首页](https://github.com/yeliang-wang/evopilot-harness/blob/main/README_CN.md)、[Ontology 中文首页](https://github.com/yeliang-wang/evopilot-ontology/blob/main/README_CN.md)。

当前内容等级显式使用 `standardVersion: "v2"`。L3 表示固定范围的重建规格完备；`assetAssessment` 与 `reconstructionVerification` 独立，`L3 / NOT_REQUESTED` 有效。内容授级无需原环境、业务数据库或真实重建。历史 v1 的原始含义保持不变。

中文指南保持与对应英文行为一致，API、模式定义、机器契约和实际实现决定精确行为。尚未翻译的页面标注“英文”。源码页面可以包含发布后的文档改进，既有 Release 归档保持原始字节。
