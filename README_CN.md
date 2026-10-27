# EvoPilot · v0.8.3 Preview

[English](README.md) | 简体中文

通过 Codex 中的统一 Expert 构建领域模型、评估资产质量并准备受控执行。EvoPilot 组合三个组件：Ontology 管理语义资产，Harness 管理质量与证据，Runtime 管理项目、执行与审计。

[安装](docs/zh-CN/installation.md) · [首次使用](docs/zh-CN/first-journey.md) · [中文文档](docs/zh-CN/README.md) · [下载](https://github.com/yeliang-wang/evopilot/releases/tag/v0.8.3) · [贡献指南（英文）](CONTRIBUTING.md)

## 可以做什么？

| 需求 | 工作流 | 结果 |
|---|---|---|
| 理解已有项目 | 对授权的固定源码进行反向建模 | 概念、行为、来源与待确认问题 |
| 从需求或文档设计 | 正向建模 | 经审阅的领域定义与实现规格 |
| 复用已有资产 | 组合固定版本的资产 | 明确依赖、解决冲突并定义组合行为 |
| 评估资产完备度 | [内容就绪度 v2](docs/zh-CN/asset-readiness.md) | 目标等级、合格等级、缺口与有效性 |
| 讨论版本或检查证据 | [规划（英文）](docs/planning.md)和[可读报告（英文）](docs/readable-assets.md) | 可审阅的决定与绑定精确版本的证据 |
| 执行已审阅目标 | [原生工作流（英文）](docs/native-workflow.md) | 固定输入、真实回执与恢复状态 |
| 评估选定服务或响应问题 | [在线 Harness（英文）](docs/online-harness.md)和[响应联动（英文）](docs/response.md) | 实测窗口、经审阅的操作与独立恢复证据 |

正式建模前必须确定用途、范围、来源和目标等级。源码事实、设计声明、推断与用户决定分别保留。缺失或过期的必需证据会阻止完成。

## 三个组件，一个入口

| 仓库 | 职责 |
|---|---|
| [EvoPilot](https://github.com/yeliang-wang/evopilot/blob/main/README_CN.md) | 通过公共包组合组件，提供统一 Expert、Workspace 和发行包 |
| [Runtime](https://github.com/yeliang-wang/evopilot-runtime/blob/main/README_CN.md) | 项目、目标、执行声明、状态、决定、回执与审计 |
| [Harness](https://github.com/yeliang-wang/evopilot-harness/blob/main/README_CN.md) | 质量策略、证据评估与不可变质量资产交付 |
| [Ontology](https://github.com/yeliang-wang/evopilot-ontology/blob/main/README_CN.md) | 领域概念、关系、约束与不可变语义资产交付 |

Codex 插件连接到包含三个服务的共享本地守护进程，本身不是第四个产品。显式启用的在线 worker 由 macOS launchd 独立运行，维护前需要停止。参阅[进程架构（英文）](docs/architecture/0002-local-process-topology.md)。

## 安装已发布的发行包

使用 **Node 24.14.0**。从 [v0.8.3 Release](https://github.com/yeliang-wang/evopilot/releases/tag/v0.8.3) 下载 `evopilot-0.8.3-preview.tar.gz` 和 `SHA256SUMS`，先完成[校验与解压](docs/zh-CN/installation.md)。发行包已编译，无需构建源码或运行 npm install。原生验证目前支持 **macOS arm64**，锁定工具链需要显式准备。

选择 Git 目录以外的新规范绝对路径，且父目录必须已经存在：

```sh
preview_bundle="/absolute/path/to/extracted-bundle"
preview_root="/absolute/path/to/new-preview-program"
node "$preview_bundle/app/scripts/manage-preview.mjs" install --bundle "$preview_bundle" --root "$preview_root" --installation-id preview-install
node "$preview_bundle/app/scripts/manage-preview.mjs" doctor --root "$preview_root"
codex plugin marketplace add "$preview_root" --json
codex plugin add evopilot-v01-preview@evopilot-v01-preview-local --json
```

更新本地插件后重启桌面应用。选择 **EvoPilot v0.8.3 Preview**，提出：“检查安装，初始化我的私有 Workspace，然后激活当前会话并展示示例。”核对实际版本、安装根目录与摘要。安装、Workspace 初始化和每个会话的激活是不同步骤。

可编辑项目默认位于 `~/evopilot-workspace`，受保护状态默认位于 `~/.local/share/evopilot/workspaces/<id>`，也可指定其他位置。无需创建私有 GitHub 仓库。服务数据库、凭据和私有证据应保存在源码与发行包之外。检查与指南读取保持被动，普通会话无需使用 EvoPilot。

已有用户先阅读[当前升级入口（英文）](docs/migration.md#current-upgrade-route)和[v2 迁移指南](docs/zh-CN/migration.md)。保留旧安装与经验证的停机备份，先在隔离环境验证恢复，再切换日常使用环境。

## 内容等级与能力边界

当前评定显式使用 `standardVersion: "v2"`：

| 等级 | 内容承诺 |
|---|---|
| L1 | 领域理解：概念、关系、规则与来源 |
| L2 | 在 L1 基础上补足实现行为、接口、状态、错误与依赖 |
| L3 | 在 L2 基础上闭合固定范围的完整重建规格 |

**L3 不要求实际重建软件，也不要求访问原运行环境。** `assetAssessment` 与 `reconstructionVerification` 分别记录；`L3 / NOT_REQUESTED` 是有效结果。内容等级不证明生成软件功能等价、代码相同、生产就绪或获得发布授权。历史 usability v1 记录保留原有含义。

原生语义资产使用 RDF/Turtle 与 SHACL，质量规则使用 Rego、OPA 和 Conftest。验证成功本身不代表领域含义已获批准。独立 Runtime 不提供执行 provider；执行需要已配置的可信适配器和经审阅的输入。不提供任意编码、部署或自主发布能力。Preview 不代表 GA。

## 文档与贡献

- [中文文档入口](docs/zh-CN/README.md)、[能力说明（英文）](docs/capabilities.md)、[原生工作流（英文）](docs/native-workflow.md)、[决定证据（英文）](docs/native-decisions.md)。
- [源码开发（英文）](docs/development.md)、[实现语言政策（英文）](docs/language-policy.md)、[贡献指南（英文）](CONTRIBUTING.md)、[双语维护规则](docs/zh-CN/documentation-languages.md)。
- [变更记录（英文）](CHANGELOG.md)和 [Roadmap（英文）](docs/roadmap.md)说明历史版本与规划。
- [支持（英文）](SUPPORT.md)、[安全政策（英文）](SECURITY.md)、[Apache-2.0 许可证（英文）](LICENSE)、[署名与归属（英文）](NOTICE)。

这些源码文档包含 v0.8.3 发布后的文档改进。既有 tag 归档保留原始文档，后续发行包将包含更新后的页面。
