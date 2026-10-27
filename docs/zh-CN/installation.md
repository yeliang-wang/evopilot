# 安装 EvoPilot Preview

[English](../installation.md) | 简体中文 · [中文目录](README.md)

适用 v0.8.3 Preview。使用 **Node 24.14.0**，从 [v0.8.3 Release](https://github.com/yeliang-wang/evopilot/releases/tag/v0.8.3) 下载 `evopilot-0.8.3-preview.tar.gz` 与 `SHA256SUMS`。目标是安装经验证的包、注册插件，并读回正确的实际安装身份。源码版本号本身不能证明下载已发布。

发行包包含编译后的 JavaScript，无需 npm install 或源码构建。原生验证平台为 **macOS arm64**，工具链需要显式按锁定版本准备；检查操作不会下载依赖。发行包不包含 Node、凭据、在线配置、业务数据或已配置的执行 provider。[源码开发（英文）](../development.md)是另一条使用路径。

当前 v2 写入采用 **Runtime 8 / Harness 8 / Ontology 5** 状态标记。已有用户先阅读[当前升级入口（英文）](../migration.md#current-upgrade-route)与[迁移指南](migration.md)。备份、恢复、搬迁、工具链维护或卸载前，应停止独立在线 worker，并保留旧安装与已验证的停机备份。

## 校验与解压

在两个下载文件所在目录运行以下命令，只选择发行包对应的校验项；缺失或重复会失败：

```sh
preview_checksum="$(awk '$2 == "evopilot-0.8.3-preview.tar.gz" && length($1) == 64 && $1 !~ /[^0-9a-fA-F]/ { line=$0; count++ } END { if (count != 1) exit 1; print line }' SHA256SUMS)" &&
  printf '%s\n' "$preview_checksum" | shasum -a 256 -c -
```

校验成功后再继续。直接检查整个多文件 `SHA256SUMS` 需要下载其中全部文件。摘要能检测字节变化，不能独立认证发布者。

选择父目录已存在的新解压目录：

```sh
preview_bundle="/absolute/path/to/new-extracted-bundle"
mkdir "$preview_bundle" &&
  tar -xzf evopilot-0.8.3-preview.tar.gz -C "$preview_bundle"
```

## 安装与注册

程序根目录必须是 Git 外的新规范绝对路径，不含符号链接，且与源码、解压目录分离，父目录已存在。Workspace 稍后由 Expert 设置。升级使用新程序目录并保留旧安装。

```sh
preview_root="/absolute/path/to/new-preview-program"
node "$preview_bundle/app/scripts/manage-preview.mjs" install --bundle "$preview_bundle" --root "$preview_root" --installation-id preview-install
node "$preview_bundle/app/scripts/manage-preview.mjs" doctor --root "$preview_root"
codex plugin marketplace add "$preview_root" --json
codex plugin add evopilot-v01-preview@evopilot-v01-preview-local --json
```

安装不会创建 Workspace。程序位于 `preview_root/app`，配置中的 `installationRoot` 指向该目录；后续绑定写在安装旁的 `ROOT.evopilot-binding.json`，不改变不可变安装清单。

安装器验证清单，按当前 Node 路径生成 Codex 配置与本地 marketplace。修改过的字节、额外文件、符号链接或硬链接会使验证失败。`doctor` 检查配置并被动检查连接。安装本身不启动守护进程，也不完成插件注册；后两条 Codex 命令完成注册。

每个安装按规范配置路径生成独立 MCP server 名称。显示名称不能证明实际连接身份。更新本地插件后重启桌面应用，再按[官方插件说明（英文）](https://developers.openai.com/plugins/build/plugins)检查新连接。

选择 **EvoPilot v0.8.3 Preview**，提出：

> 检查安装身份，初始化我的 Workspace，然后激活当前会话并展示示例。

核对版本、安装 ID、根目录和摘要。你可以指定项目/状态路径或使用默认值。初始化不覆盖已占用目录，成功后 Expert 单独激活当前会话。已有数据需使用显式 attach/迁移流程，不能静默切换已绑定工作区。检查与指南保持被动。

## 恢复与卸载

连接过期时先用 `doctor` 核对，再按[恢复指南（英文）](../recovery.md)选择适合诊断结果的命令：

```sh
node "$preview_bundle/app/scripts/manage-preview.mjs" stop --root "$preview_root"
node "$preview_bundle/app/scripts/manage-preview.mjs" recover --root "$preview_root"
```

不要删除控制证据绕过恢复。不确定操作需要检查精确保留回执，不是重新派发。

卸载时先注销插件入口，再从保留的发行包执行：

```sh
codex plugin remove evopilot-v01-preview@evopilot-v01-preview-local --json
codex plugin marketplace remove evopilot-v01-preview-local --json
node "$preview_bundle/app/scripts/manage-preview.mjs" uninstall --root "$preview_root"
```

管理器也位于 `preview_root/app/scripts/manage-preview.mjs`。卸载会校验托管清单，并认证停止自己拥有的健康守护进程；变更或未知文件、失效所有权和活跃操作会阻止卸载。只移除清单中的程序文件与空目录，保留工作区数据、控制证据、审计和其他安装。

隔离 Host 验收可用 `--marketplace-name NAME` 指定唯一小写名称，并在插件 add/remove 与 marketplace remove 中使用相同名称；默认仍为 `evopilot-v01-preview-local`。候选使用独立程序根目录与私有 Workspace/状态，不替换日常入口。

## 首次使用的成功信号

实际连接身份与选定发行包一致，工作区绑定符合选择，当前会话按请求激活。初始化后按[原生工作流（英文）](../native-workflow.md)检查 `toolchain_inspect`，需要时显式执行 `toolchain_prepare`，完成后再激活。普通使用通过 Expert，无需日常重复 CLI 操作。

继续阅读[首次使用](first-journey.md)与[内容等级](asset-readiness.md)。源码文档的新增中文页面不会回写已经发布的 v0.8.3 归档；后续发行包将包含这些页面。
