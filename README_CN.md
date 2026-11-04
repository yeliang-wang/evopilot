# EvoPilot

[English](README.md) | 简体中文

EvoPilot 是三个独立演进组件的入口：Runtime 管理软件生命周期，Ontology 管理本体资产，Harness 管理质量规则与证据。请根据任务选择对应组件。

| 组件 | 职责 | 文档 | 发行版本 |
|---|---|---|---|
| [Runtime](https://github.com/yeliang-wang/evopilot-runtime) | Project Lifecycle YAML、发布者维护的 Base 规则、执行门禁、回执、审计和生命周期 Dashboard | [中文使用指南](https://github.com/yeliang-wang/evopilot-runtime/blob/main/docs/zh-CN/runtime-v090.md) | [Runtime 下载](https://github.com/yeliang-wang/evopilot-runtime/releases) |
| [Ontology](https://github.com/yeliang-wang/evopilot-ontology) | 领域概念、关系、约束和版本化语义资产 | [Ontology 文档](https://github.com/yeliang-wang/evopilot-ontology/blob/main/docs/README.md) | [Ontology 下载](https://github.com/yeliang-wang/evopilot-ontology/releases) |
| [Harness](https://github.com/yeliang-wang/evopilot-harness) | 质量规则、原生验证、证据和版本化 Harness 资产 | [Harness 文档](https://github.com/yeliang-wang/evopilot-harness/blob/main/docs/README.md) | [Harness 下载](https://github.com/yeliang-wang/evopilot-harness/releases) |

从 Runtime 0.9 开始，各组件独立管理版本和发布。父仓库仅提供首页、索引和导航，不再引入新的父项目产品版本。Ontology 与 Harness 在各自后续版本演进之前，继续使用现有已发布接口与安装入口。

Runtime 独立服务保存配置并执行生命周期约束；Codex 通过 Runtime Expert 和 HTTP MCP 插件提供推理与编码。资产编写和发布仍属于对应组件。调整现有安装前，请阅读所选组件的安装、兼容与迁移说明。

## 现有安装与历史文档

[v0.8.3 发行包](https://github.com/yeliang-wang/evopilot/releases/tag/v0.8.3)、[对应版本中文首页](https://github.com/yeliang-wang/evopilot/blob/v0.8.3/README_CN.md)、[安装指南](https://github.com/yeliang-wang/evopilot/blob/v0.8.3/docs/installation.md)和[历史文档](https://github.com/yeliang-wang/evopilot/blob/v0.8.3/docs/README.md)继续保留，它们描述当时的组合安装。沿组件支持的迁移路径操作时，应保留现有数据、凭据和审计证据。

历史组合源码、统一 Expert/plugin 和 daemon、构建脚本及共享契约生成仍为已有版本保留，因此仓库当前仍含可执行的历史材料。Runtime 0.9 的独立安装不依赖父项目源码或 daemon；Ontology/Harness 的进一步拆分由各自后续 Target 推进。

版本是否已发布、制品摘要和验收结果，以各组件的真实发布记录为准。导航链接不代表安装完成或项目验收通过。

[文档索引](docs/zh-CN/README.md) · [贡献指南](CONTRIBUTING.md) · [安全](SECURITY.md) · [Apache-2.0 许可证](LICENSE)
