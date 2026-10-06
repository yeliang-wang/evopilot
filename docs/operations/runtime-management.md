# EvoPilot Runtime 与执行器运行管理

## 定位

先区分控制面和执行器：**EvoPilot Runtime** 保存项目、Goal、Loop、凭据引用、证据和决策；**外部 Agent Runtime** 执行一个已绑定且具备资格的请求。Expert 是加载到 Host 的指引适配器，Harness 是独立的资产产品。它们不是三个同类的后台 Runtime。

本地 Agent Host 的连接通常是：

```text
Host + Evolution Expert → MCP stdio → evopilot-mcp → HTTP → EvoPilot Runtime
Host + Harness Digital Expert → MCP stdio → evopilot-harness
```

本地 Runtime 常用地址为 `http://127.0.0.1:19876`。Host 的 stdio 连接不要求为本地 Runtime 配置一个远程 HTTPS 服务。已有部署应复用其服务管理器、数据目录和私有连接配置；用户正常使用不需要重复创建账号、输入凭据或启动另一套服务。安装步骤见[组合安装](../guides/agent-host-installation.md)。

执行器按项目单独绑定。Runtime 不内置通用编码 Agent；原生 Agent 执行路径见[外部 Agent Runtime](../guides/agent-runtime.md)。默认服务器没有语义执行适配器或业务证据收集器，管理员必须配置与项目范围匹配的实现，且通过实际资格与证据校验。

下文的 **Code Upgrader** 是现有自托管 Compose/K8s/Helm 提供的托管执行选项，其部署和镜像锁检查适用于选择这条路径的环境；它不是所有本地 stdio 安装都必须再启动的组件。该托管形态为：

```text
EvoPilot 产品套件
├── evopilot-server
└── evopilot-code-upgrader  EvoPilot 托管代码升级运行时
```

代码升级运行时由 EvoPilot 的 `docker-compose.yml`、K8s YAML 或 Helm 包统一部署、统一配置、统一健康检查和统一治理。Dashboard 独立为 `evopilot-dashboard` 服务，通过 EvoPilot API 接入。GitHub Actions 和 GitLab CI 属于项目仓库自身的 DevOps 边界，不随 EvoPilot 打包部署，不进入运行时锁；EvoPilot 只通过项目 DevOps API 触发并记录真实 CI/CD 证据。

## 运行时锁定

运行时锁定文件：

```text
runtimes/runtime-lock.json
```

该文件记录：

- 运行时 ID。
- 运行时职责。
- 实现名称。
- 版本。
- 镜像。
- 镜像 Digest。
- SBOM。
- 许可证报告。
- 漏洞扫描报告。
- 健康检查地址。

生产强校验：

```bash
npm run verify:runtime-lock:strict
```

该命令要求所有必需运行时都满足：

- 镜像 Digest 已锁定。
- 如果存在沙箱 runtime 镜像，沙箱镜像 Digest 也已锁定。
- SBOM 文件存在。
- 许可证报告存在。
- 漏洞扫描报告状态为 `PASSED`。
- 健康端点是明确的 HTTP/HTTPS 地址。

选择该托管部署路径时，任何一项不满足，都不能声明该部署的运行时锁验证完成。外部 Agent Runtime 路径使用自身的精确版本、资格、范围和回执验证，不能拿另一条路径的镜像锁结果替代。

## 项目 DevOps

新项目优先使用项目 DevOps 配置：

```text
/api/v1/projects/{projectId}/devops
/api/v1/projects/{projectId}/devops/preflight
```

支持：

- GitHub 项目：`provider=github-actions`，触发 workflow dispatch，读取 workflow runs 和 check runs。
- GitLab 项目：`provider=gitlab-ci`，触发 pipeline，读取 pipeline jobs。

项目 DevOps 使用项目 source credentials 或 `devops.tokenRef` 解析平台 token。token 必须由 EvoPilot 服务端运行环境变量或同一 tenant/workspace 的 EvoPilot secret vault 提供，不能依赖 WorkBuddy/Codex 本机环境变量。

每个远程项目必须有清晰的 DevOps 执行边界：

- `owned-repository`：源码写回和 GitHub Actions/GitLab CI 都发生在同一个 owner/namespace 的工作仓库。
- `read-only-public`：公开仓库只读分析，不能声明 PR、merge、CI/CD 或 release readiness。
- `fork-validated-pr`：EvoPilot 写入 fork/working repo，并只声明 fork CI 与 upstream PR readiness。
- `upstream-authorized`：EvoPilot 使用 maintainer token 写入 upstream，并在 preflight READY 后才可声明 upstream release readiness。

`project.devops.updated` 和 `project.devops.preflight` 日志会输出 `executionMode`、`devopsOwner`、`workflowRepository`、`claimBoundary` 和 blockers。排障时优先用这些字段确认“哪个 GitHub/GitLab 账号运行了项目 DevOps”。

## Code Upgrader 运行时

Code Upgrader 作为 EvoPilot 代码升级运行时，不以 jar 依赖进入 EvoPilot 主进程，但作为 EvoPilot 产品套件内的托管运行时部署。

EvoPilot 通过 `packages/adapter-code-upgrader` 调用 Code Upgrader HTTP API，并传入：

- 进化方案 Markdown。
- Git 仓库信息。
- 源分支和升级分支。
- 提交信息。
- 验证命令。
- 受保护路径。

Code Upgrader 必须以真实进程运行，不能使用 fake、mock、stub、simulator 或内部模拟进程冒充。

## 部署入口

Docker Compose：

```bash
docker compose up -d
```

K8s：

```bash
kubectl apply -f deploy/k8s/
```

生产验证前必须确认：

```bash
npm run verify:runtime-lock:strict
```

对于所选容器部署，缺少 Docker、镜像、SBOM 或漏洞扫描时应报告该部署验证受阻，不能降级为 mock E2E。这不表示已配置的本地 Runtime 与 stdio Host 连接也必须改用 Docker。

## Runtime 6.3.2 的 LLM 就绪状态

首次或显式替换工作区默认绑定时，成功预检必须在 15 分钟内。已批准且未变化的配置可以持续使用，重启不会仅因预检变旧而要求重新输入凭据。Profile、SecretRef 或预检证据变化，以及明确预检失败，仍需要按 Runtime 返回的原因修复并显式重绑。普通 readiness 查询不触发模型调用或后台刷新。详见[首次 LLM 就绪说明](../guides/first-run-llm-readiness.md)。
