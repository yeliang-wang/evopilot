# EvoPilot API

## Agent-Native Lifecycle Control Plane（Runtime 6.3.1）

当前发布为 Runtime 6.3.1 / Expert 2.3.0。语义 Catalog、项目绑定与独立执行接口见[语义消费者技术参考](../architecture/semantic-catalog-consumer.md)和[CLI/MCP 命令映射](../cli/commands.md)；验收范围及未验证项见[发布记录](../releases/current-release.md)。

```text
GET  /api/v1/evolution-project-definitions
POST /api/v1/evolution-project-definitions
POST /api/v1/evolution-project-definitions/discover
GET  /api/v1/evolution-project-definitions/{id}?version=...
GET  /api/v1/evolution-project-definitions/{id}/diff?from=...&to=...
POST /api/v1/evolution-project-definitions/{id}/activate
POST /api/v1/evolution-project-definitions/{id}/rollback
GET  /api/v1/evolution-resources?kind=...
POST /api/v1/evolution-resources
GET  /api/v1/evolution-resources/{kind}/{id}?version=...
GET  /api/v1/evolution-resources/{kind}/{id}/diff?from=...&to=...&runtimeVersion=...
POST /api/v1/evolution-resources/{kind}/{id}/activate
POST /api/v1/evolution-resources/{kind}/{id}/rollback
POST /api/v1/governed-evolution/plan
POST /api/v1/governed-evolution/runs
POST /api/v1/governed-evolution/revalidate
POST /api/v1/governed-evolution/recovery/decide
POST /api/v1/governed-evolution/capability-inventory/validate
POST /api/v1/governed-evolution/action-providers/qualify
GET  /api/v1/governed-evolution/agent-runtimes
POST /api/v1/governed-evolution/agent-runtimes/qualify
POST /api/v1/governed-evolution/governance/evaluate
POST /api/v1/governed-evolution/remediation-campaigns
GET  /api/v1/governed-evolution/remediation-campaigns/{id}
POST /api/v1/governed-evolution/remediation-campaigns/{id}/decide
GET  /api/v1/automation-registry
POST /api/v1/automation-registry/proposals
POST /api/v1/automation-registry/{id}/activate
POST /api/v1/automation-registry/{id}/revoke
POST /api/v1/interactions/render
POST /api/v1/controlled-lifecycle/observations
GET  /api/v1/controlled-lifecycle/observations/{id}
POST /api/v1/controlled-lifecycle/observations/{id}/classify
POST /api/v1/controlled-lifecycle/successors
GET  /api/v1/controlled-lifecycle/successors/{id}
POST /api/v1/controlled-lifecycle/experiments
POST /api/v1/controlled-lifecycle/activation-decisions
POST /api/v1/controlled-lifecycle/monitoring/evaluate
POST /api/v1/controlled-lifecycle/target-proposals
POST /api/v1/lifecycles
GET  /api/v1/lifecycles/{id}?version=...
GET  /api/v1/lifecycles/{id}/diff?from=...&to=...
GET  /api/v1/lifecycles/{id}/dependencies
GET  /api/v1/lifecycles/{id}/usage
GET  /api/v1/lifecycles/{id}/audit
POST /api/v1/lifecycles/{id}/activate
POST /api/v1/lifecycles/{id}/deactivate
POST /api/v1/lifecycles/{id}/archive
POST /api/v1/lifecycles/{id}/restore
POST /api/v1/lifecycles/{id}/rollback
DELETE /api/v1/lifecycles/{id}
```

`plan` 采用 `ProjectDefinition + GoalTarget` 确定性匹配已发布的不可变 `HarnessBundle`，再与开放 Lifecycle 单调组合。匹配歧义、无匹配或 Lifecycle 弱化 Harness 时失败关闭。错误响应中的 `resolution.match.candidates` 提供排序、评分、优先级以及精确 Catalog/Profile/Bundle/Component 摘要；用户审阅项目含义后，可在新的不可变 Project Definition 版本中声明一个 `evopilot.dev/v1 HarnessSelection` 资源。Runtime 仅在完整 Registry/Catalog/Profile/Bundle/Component 摘要闭包仍已发布且符合 eligibility、能力和负向边界时采用该选择，不会用名称或 prompt 绕过校验。

Lifecycle 的执行能力与 Harness 能力采用并集，证据、validator 和 constraint 也采用并集；Lifecycle 请求的 permission 必须属于 Harness 允许集合。因此 Lifecycle 可以增加 Goal Loop 编排能力，但不能扩大执行权限、禁用证据或弱化 Harness 约束。生成的 binding 在 start、resume、retry 和每次 Loop iteration 前重验。

Recovery 默认自动处理可逆 mechanics、相同输入安全重试和 receipt 恢复。未知但可安全复用的情形先生成完整 Automation Rule proposal；只有一次与 proposal digest 精确绑定的人工决定能激活后续自动化。不可逆权限与结果不确定的外部 mutation 不能学习成自动规则。

Evolution Expert 2.3.0 通过 MCP 成为普通用户入口；它与其他 Host adapter 只投影 Runtime 语义，不持有权威状态、源码执行或批准能力。CLI、HTTP、CI、事件和 webhook 是管理员、机器、诊断和恢复接口。资源 API 保留独立版本、来源 Suite 版本/摘要和 Runtime 兼容范围；兼容资源升级无需 Runtime 或 Expert 升级。受控演进 API 将精确观察转为分类、不可变后继、可比实验、活动策略决策、监控回滚或通用 Target 提案；对话、成功测试和推荐都不构成权限。这些接口由已发布基线继承到 Runtime 6.3.0；资源自身的版本和权限保持独立，接口可用不等于具体业务操作已获批准。

对应的管理员和机器 CLI 使用同一 HTTP 语义，但不构成普通用户绕过 Expert 的第二入口：

```text
evopilot project-definition <list|inspect|register>
evopilot evolution <plan|revalidate|recover> --file <request.yaml|json>
evopilot resource <list|inspect|register|diff|activate|rollback>
evopilot provider qualify --file <request.yaml|json>
evopilot remediation <start|inspect|decide>
evopilot automation <list|propose|activate|revoke>
```

Project Definition、执行 binding、Automation proposal/rule 都按认证的 tenant/workspace 隔离。`evolution plan` 可在请求中指定 `projectDefinitionVersion`，从而显式重用旧的不可变声明；不指定时选择最新版本。Project Definition id 必须与 GoalTarget projectId 相同，防止跨项目绑定。
`authorityDigest` 由服务端根据当前认证的 tenant、workspace、actor 与 role 生成，客户端提交的同名字段不会授予或扩大权限。

## Lifecycle Registry And Run Compatibility

该接口执行项目 Lifecycle，不管理或发布 Harness Asset。`POST /api/v1/lifecycle-runs` 必须绑定当前 tenant/workspace 中已注册的项目，以及从只读 Harness Catalog 读取并重新校验的 `published`、不可变 `HarnessBundle`。

```text
GET  /api/v1/lifecycles
POST /api/v1/lifecycles
GET  /api/v1/lifecycles/{lifecycleId}
GET  /api/v1/lifecycles/{lifecycleId}/diff
GET  /api/v1/lifecycles/{lifecycleId}/dependencies
GET  /api/v1/lifecycles/{lifecycleId}/usage
GET  /api/v1/lifecycles/{lifecycleId}/audit
POST /api/v1/lifecycles/{lifecycleId}/activate
POST /api/v1/lifecycles/{lifecycleId}/deactivate
POST /api/v1/lifecycles/{lifecycleId}/archive
POST /api/v1/lifecycles/{lifecycleId}/restore
POST /api/v1/lifecycles/{lifecycleId}/rollback
DELETE /api/v1/lifecycles/{lifecycleId}
POST /api/v1/lifecycles/resolve
POST /api/v1/lifecycles/resolve-inputs
GET  /api/v1/lifecycle-runs
POST /api/v1/lifecycle-runs
GET  /api/v1/lifecycle-runs/{runId}
POST /api/v1/lifecycle-runs/{runId}/answer
POST /api/v1/lifecycle-runs/{runId}/finalize-binding
POST /api/v1/lifecycle-runs/{runId}/authorize
POST /api/v1/lifecycle-runs/{runId}/advance
POST /api/v1/lifecycle-runs/{runId}/decision
POST /api/v1/lifecycle-runs/{runId}/external-result
POST /api/v1/lifecycle-runs/{runId}/feedback
```

配置输入与授权完全分离。`resolve-inputs` / `answer` 只生成带来源的 `LifecycleInputBinding`；只有 `authorize` 或 `decision` 中显式提交、且与当前 `bindingDigest` 完全一致的决定才产生权限。自动阶段会连续执行到外部 Agent 请求或真实人工权限边界。`external-result` 的相同 request/receipt 可幂等重放，冲突回执拒绝，`UNCERTAIN` 结果停在 recovery 决策。

MCP 和 CLI 只是同一服务端语义的适配层。第三方 Agent Runtime 必须先通过独立资格校验，只能执行 `pendingExecution` 中声明的 scope、Lifecycle、Harness、action、capabilities、sandbox、allowed effects、SecretRefs、Runtime profile 和 binding digest；返回结果必须匹配 request/binding/idempotency digest。不能从对话推导批准。`feedback` 仅创建经过显式批准、严格脱敏、不可变且 `PRIVATE` 的反馈包，不会写入 `evopilot-harness` Catalog。

Runtime 6.3.0 提供独立的公开语义执行入口，详见下文。既有 governed `plan` / `runs` 与 Lifecycle run 创建/变更入口仍拒绝 `semanticExecutionBindingDigest`、`semanticExecutionBinding`、`semanticContextSlice`、`semanticContext`、`outcomePlan` 和 `semanticOutcomePlan`（包括空值）：governed 返回 HTTP 400，Lifecycle 返回 HTTP 409，均为 `SEMANTIC_EXECUTION_INTEGRATION_REQUIRED`。不会忽略字段后降级执行，既有 Harness-only 流程不变。

独立入口为 `GET /api/v1/projects/{projectId}/semantic-execution/capabilities` 和 `POST /api/v1/projects/{projectId}/semantic-execution/{operation}`。有限操作为 `planning`、`draft`、`prepare`、`inspect`、`bind`、`resolve`、`mapping`、`review`、`approveReview`、`dispatch`、`collect`、`evaluate`、`commitStage`、`stageReceipt`、`completeTarget`、`completionReceipt`、`completionStatus`、`completePhase`、`phaseReceipt`、`completeGoal`、`goalReceipt`；实际可用操作仍以当前作用域能力协商为准。所有操作要求当前作用域 operator/admin、生产模式 readiness 和服务端身份重验；不接受 query，POST 仅接受最多 64 KiB 的精确 JSON 字段。响应 no-store，错误脱敏并带 requestId。请求字段见 [CLI 契约](../cli/commands.md#project-semantic-execution-630-source-development)。

固定应用从实际已发布 Catalog、持久化项目/Goal/Target/LLM 元数据、精确 pending Lifecycle、当前治理权限和 executor observation 重新构造状态。它不会补齐缺失批准、跟随新默认模型、解析密钥或替调用方选择 Host。创建服务器时可显式配置 `semanticExecutorAdapter`；默认无适配器，不广告 dispatch。配置存在也不代表资格通过，执行仍须匹配精确 Profile 与已批准业务规则。

`review` 读取实际 Target 的全部业务验收标准并保存映射；`approveReview` 接受精确 reviewDigest 与明确 APPROVE，返回决策本身。不能从准备计划或对话推断批准。派发前持久化不可覆盖 claim，并写入服务端身份审计；审计失败不启动调用，结果审计失败不删除已有回执。CLI/MCP 不自动重试；同一已完成派发的显式精确重试可返回已有回执，未知调用结果仍需核对，禁止盲目重放。

`collect` 仅在服务端显式配置 `semanticEvidenceCollector` 时广告；默认无采集器。请求仅含 `identity` 和 `bindingDigest`，不接受事实、命令、URL 或采集器选择。Runtime 从已批准规则及精确执行回执派生采集请求，校验当前激活 evidence GovernancePack 中的 `semanticCollectorPolicy` 与服务端描述符完全一致，采集前后重验权限、政策和执行绑定。不可变 claim 阻止并发重复调用或失败后的自动重试；返回摘要、种类及来源，不返回原始事实。

公开 `evaluate` 分别报告业务和 Harness 结果，可以读取该采集回执，但自身不会写回完成状态。缺证据为 `INDETERMINATE`，两侧通过最多为 `DUAL_VALIDATED_NOT_COMPLETED`，始终 `eligibleForCompletion=false`。合成来源保持合成，内容摘要与请求关联不是采集真实性证明。已有语义 plan/binding 的运行也不能通过旧 `external-result` 省略语义字段来推进，返回 `LIFECYCLE_SEMANTIC_COMPLETION_REQUIRED`。本地源码、合成 Catalog 与注入适配器测试仅是支持证据；独立的安装版、Codex 与系列验收及其明确排除项见[当前发布记录](../releases/current-release.md)。详见 [实现边界](../architecture/semantic-catalog-consumer.md)。

完成入口需协商 `completionAvailable=true` 和 `completionScope=VALIDATED_TARGET_AND_NON_PHASE_GOAL`。`commitStage` 仅接收 identity/bindingDigest，核验当前策略及双重证据后提交阶段；`stageReceipt` 另需 runId/requestDigest，可在阶段推进后读取历史回执。`completeTarget`、`completionReceipt`、`completionStatus` 仅接收 identity/runId。完成写入重新核验当前权限与各阶段证据，phase Target 还需结构化独立证据包及显式 phaseTargetCompletion 策略；依赖前驱阶段的执行与完成要求验证阶段回执，GA/phase Goal 不因业务 Target 完成而闭合。`completionStatus` 是独立只读报告，targetPercent 是已验证必需 Target 的进度，不是发布进度；release 始终 NOT_EVALUATED。语义 Goal 的既有 GET 单目标、snapshot、evidence-matrix 和 final-report 入口现由当前 operator/admin 读取精确原始 Goal 与验证回执；非阶段 Goal 可返回只读完成报告，不写入 finalReport、不生成发布决定。GA/阶段 Goal 缺少独立最终 Goal 回执，或必需 Target 证据缺失时，final-report 仍为 409。旧证据包生成器不会因原始 DONE、伪造 phase GO 或无关成功 Loop 而通过。`completePhase` / `phaseReceipt` 仅接收 identity、runId、phaseTargetId，需协商 phaseCompletionAvailable=true；当前阶段策略、全部必需 Target 回执、经过策略批准的阶段映射及完整证据/评审/输出验证后，阶段可写入 PASSED/GO 回执。此操作不闭合 GA Goal、不生成发布决定。独立的 `completeGoal` / `goalReceipt` 仅接收 identity/runId，并要求 `goalCompletionAvailable=true`。全部必需 Target、全部声明阶段回执与同一已批准 Goal/计划匹配，且独立的当前 semanticFinalGoalCompletionPolicy 精确授权后，才可原子写入 Goal COMPLETED 和最终回执。GA 终态必须有可信 GA 阶段，ga-maturity-ladder 必须保留四阶段及前驱链；final-report 可投影已验证阶段摘要，但不伪造旧 Target 包、不写入报告、不生成发布决定。列表、图、run-status、targets、phases、timeline 使用同一已验证读取投影。列表保留既有作用域过滤、倒序和最近 50 条窗口；逐 Goal 验证，并非跨 Goal 原子快照，可见语义记录验证失败时整份响应失败。语义 run-status 返回独立 schema `evopilot-semantic-goal-run-status/v1`，包含已验证回执摘要引用，不伪造旧 Loop 链或 Target 包；`llmUsage` 为 `evopilot-semantic-execution-usage/v1`，只汇总已验证完成 Target 的外部执行回执，包含 provider/model/Host、请求及证据摘要；状态为 UNAVAILABLE（totals 为 null）、PARTIAL 或 VERIFIED_COMPLETED_TARGETS。缺失或旧用量完整性标记不当作零；不完整遥测不计入已知小计。排除未完成、失败、不确定执行、内部动作和其他 Goal，不代表供应商完整账单或结算。独立的 dispatchUsage（evopilot-semantic-dispatch-usage/v1）只读汇总当前 Goal 的已知派发请求，包括成功、失败、不确定回执；调用前持久化的精确请求/Profile 关联记录与 claim 摘要共同约束读取，分别验证 Lifecycle 和 Harness 绑定。等待回执、旧关联缺失、观察不可用均明确标识，不重放调用、不清除 claim、不闭合 Target。其小计与 llmUsage 重叠，不能相加。未决写入锁返回 HTTP 409 `SEMANTIC_EXECUTION_RECONCILIATION_REQUIRED`，应核查保留的 claim，不得自动清锁或重放。

政策、Provider、环境、权限角色和证据契约的内部元数据读取现要求精确的当前激活记录，并将资源及激活回执摘要锁入绑定；缺失指针不会自动选择最新版本。这不替代有效权限、Host 资格、环境就绪或结果校验，也不改变上述公共入口拒绝行为。

内部执行器观察适配层进一步校验 Runtime 保存的精确 Host/执行器/资格/环境观察记录：必须显式激活、未过期、未撤销，并匹配当前主体与治理摘要；权限上限只能收窄当前有效权限。该观察校验层本身不运行真实 Host/环境探测；专用采集、审查写入和派发由上文独立入口执行。仅持有观察元数据不能作为生产执行就绪或正式验收声明。

详细流程见 [Lifecycle Registry](../guides/lifecycle-registry.md) 和 [External Agent Runtime](../guides/agent-runtime.md)。

## LLM 调用与 Credits 观测

所有 JSON API 响应都会附带 `meta.llm`，用于让 Dashboard、WorkBuddy、E2E 测试工具判断当前生产环境是否真的发生过 LLM 调用：

```json
{
  "data": {},
  "meta": {
    "llm": {
      "schema": "evopilot-llm-usage-meta/v1",
      "configured": true,
      "provider": "zhipu",
      "model": "glm-5.1",
      "version": "glm-5.1",
      "calls": 1,
      "succeeded": 1,
      "failed": 0,
      "totalTokens": 1024,
      "inputTokens": 768,
      "outputTokens": 256,
      "creditsConsumed": 1024,
      "creditUnit": "token",
      "latest": {
        "requestId": "llm-request-id",
        "caller": "evopilot-loop-runtime",
        "intent": "plan.generation",
        "provider": "zhipu",
        "model": "glm-5.1",
        "version": "glm-5.1",
        "totalTokens": 1024,
        "creditsConsumed": 1024,
        "status": "SUCCEEDED"
      }
    }
  }
}
```

`creditsConsumed` 当前按 `1 token = 1 LLM credit` 计量，`creditUnit` 固定为 `token`。如果 `calls=0` 或 `totalTokens=0`，只能证明 LLM 已配置，不能证明当前场景真的调用了 LLM。具体执行点还会在 `llmTrace`、Loop executor step output/evidence、code-upgrader session 中记录 `provider`、`model/version`、`usage` 和 `creditsConsumed`。

单次生成因输出截断而重试时，LLM 响应和指标中的 token/credit 用量累计所有已返回用量的尝试；后续请求失败也保留此前的已知用量。未返回的供应商用量不会被估算，因此失败请求的已知用量不能作为完整账单。

Goal/Loop 运行接口还会返回业务级 LLM usage summary：

```text
GET /api/v1/goals/{goalId}/run-status -> data.llmUsage
GET /api/v1/loops/{loopId} -> data.trace.llmUsage
GET /api/v1/loops/{loopId}/trace-tree -> executor-step 节点中的 token/cost
```

`llmUsage` 的 schema 是 `evopilot-llm-usage-summary/v1`，包含 `provider`、`model`、`calls`、`inputTokens`、`outputTokens`、`totalTokens`、`creditsConsumed`、`costUsd` 和 `steps[]`。`steps[]` 是 Loop executor 级明细，包含 `loopId`、`iteration`、`nodeId`、`type`、`status`、`provider`、`model`、`totalTokens`、`inputTokens`、`outputTokens` 和 `llmRequestId`。CLI wrapper 的 `llmUsage.summary` 使用该结构作为事实来源。

CLI、WorkBuddy 或 CI 调用 API 时可发送 `x-evopilot-client`、`x-evopilot-client-surface`、`x-evopilot-cli-command`、`x-evopilot-cli-step` 和 `x-evopilot-cli-version`。EvoPilot 结构化 HTTP 日志会在 `metadata.client` 中记录调用来源，并在 `metadata.llmUsage.request` 中记录本请求的 LLM token delta；通过响应 `requestId` 可以把 CLI step 与生产日志对齐。

## Logging Settings

```http
GET /api/v1/settings/logging
PUT /api/v1/settings/logging
POST /api/v1/settings/logging
```

`GET /api/v1/settings/logging` 需要 viewer 权限，返回当前 EvoPilot 结构化日志设置：

```json
{
  "schema": "evopilot-logging-settings/v1",
  "level": "info",
  "format": "json",
  "includeStack": true,
  "source": "control-plane",
  "updatedBy": "tenant-admin",
  "updatedAt": "2026-07-31T00:00:00.000Z"
}
```

`PUT` 和 `POST` 需要 admin 权限，支持 `level=debug|info|warn|error` 和 `includeStack=true|false`。控制面设置会持久化到 `<dataRoot>/settings/logging.json` 并优先于 `EVOPILOT_LOG_LEVEL` / `EVOPILOT_LOG_STACK`。生产默认建议 `info`；排障时可以临时提升到 `debug`，收集同一 `requestId`、`projectId`、`goalId`、`loopId` 或 release id 的 JSON Lines 日志后恢复。

结构化日志使用 `schema=evopilot-log/v1`，包含 `severity`、`category`、`routeGroup`、`outcome`、`errorCode`、`correlation.*`、`diagnosis.*` 和脱敏后的 `metadata`。Harness 相关事件使用 `category=harness`，包括 template 发布、重复版本拒绝、项目 profile 生成、校验失败、应用、激活、升级 DRAFT，以及 goal plan 是否绑定 active profile。

## Runtime LLM Readiness、Profile 与项目绑定

Runtime 6.2 默认没有 provider、model 或 credential，也不会继承 Host LLM、Agent Model 或进程环境的 LLM 配置。生产 Runtime 在 `RuntimeReadiness=READY` 之前只开放健康、认证和 LLM 设置面；其他接口返回 `409 LLM_PROFILE_REQUIRED`。

```http
GET /api/v1/runtime-readiness
GET /api/v1/runtime-readiness/setup-protocol
GET /api/v1/llm-providers
GET /api/v1/runtime-readiness/workspace-default
POST /api/v1/runtime-readiness/workspace-default
POST /api/v1/runtime-readiness/repair
POST /api/v1/runtime-readiness/migrate-v61
```

EvoPilot 支持 workspace 级和 user 级 LLM Profile。Workspace profile 由管理员维护，可作为显式 Runtime workspace default 或项目默认 LLM；user profile 由当前用户维护，只能作为一次 Goal/Loop run override 使用。Profile 用于声明用户选择的 preset 或自定义 OpenAI-compatible provider、base URL、model、timeout、重试和 `apiKeyRef`。真实 API key 仅进入受控 secret store；持久化绑定、API 响应、日志和审计只包含 SecretRef，不回显明文。

```http
GET /api/v1/llm-profiles
POST /api/v1/llm-profiles
GET /api/v1/llm-profiles/{profileId}
GET /api/v1/llm-profiles/{profileId}/preflight
POST /api/v1/llm-profiles/{profileId}/preflight
GET /api/v1/projects/{projectId}/llm
POST /api/v1/projects/{projectId}/llm
PUT /api/v1/projects/{projectId}/llm
DELETE /api/v1/projects/{projectId}/llm
GET /api/v1/projects/{projectId}/llm/preflight
POST /api/v1/projects/{projectId}/llm/preflight
```

创建 profile 前先存储 LLM secret：

```http
POST /api/v1/secrets
Content-Type: application/json

{"id":"LLM_API_KEY_MY_AGENT","kind":"llm-key","scope":"workspace","value":"<raw-llm-key>"}
```

创建或更新 profile：

```http
POST /api/v1/llm-profiles
Content-Type: application/json

{
  "id": "my-agent-llm",
  "scope": "workspace",
  "providerPreset": "custom",
  "provider": "openai-compatible",
  "providerName": "qwen-private",
  "baseUrl": "https://llm.example.com/v1",
  "modelName": "qwen2.5-coder-32b",
  "apiKeyRef": "LLM_API_KEY_MY_AGENT",
  "timeoutSeconds": 60,
  "maxRetries": 2,
  "temperature": 0.2
}
```

内置 preset 是用户明确选择后才应用的字段模板：`glm`、`kimi`、`gemma`；EvoPilot 不会自动选中任何 preset。自定义 provider 使用 `providerPreset=custom` 并显式传入 `baseUrl` 和 `modelName`。

用户自己的 profile 使用 `scope=user`，并且 `apiKeyRef` 必须引用同一用户创建的 user-scope LLM secret：

```http
POST /api/v1/secrets
Content-Type: application/json

{"id":"LLM_API_KEY_MY_DEBUG","kind":"llm-key","scope":"user","value":"<raw-llm-key>"}
```

```http
POST /api/v1/llm-profiles
Content-Type: application/json

{
  "id": "my-debug-kimi",
  "scope": "user",
  "providerPreset": "kimi",
  "apiKeyRef": "LLM_API_KEY_MY_DEBUG"
}
```

`preflight` 会解析 `apiKeyRef` 并向 provider 发起一次最小探测调用，响应 schema 为 `evopilot-llm-profile-readiness/v1`：

```json
{
  "schema": "evopilot-llm-profile-readiness/v1",
  "profileId": "my-agent-llm",
  "source": "profile",
  "status": "READY",
  "provider": "qwen-private",
  "model": "qwen2.5-coder-32b",
  "apiKeyRef": "LLM_API_KEY_MY_AGENT",
  "checks": [],
  "blockers": [],
  "nextAction": "run-loop"
}
```

只有 workspace Profile 处于 ACTIVE、SecretRef 同 scope 且有效、实时 preflight 为 READY 且未过期时，管理员才能通过 `POST /api/v1/runtime-readiness/workspace-default` 将精确 Profile digest 绑定为 Runtime workspace default。Profile 漂移、SecretRef 撤销或 preflight 过期会将 Runtime 降级为 `LLM_BLOCKED`，不会静默切换模型。

绑定项目默认 LLM：

```http
POST /api/v1/projects/my-agent/llm
Content-Type: application/json

{"profileId":"my-agent-llm","required":true}
```

只有 READY 的 workspace profile 可以成为项目默认 LLM。User profile 不能绑定到项目，但可以在 `Goal/Loop` 请求中通过 `llmProfileId` 做一次运行覆盖。

Goal/Loop 创建接口和 `POST /api/v1/loop-orchestration/instantiate` 都接受 `llmProfileId`。服务端解析顺序是：

```text
request.llmProfileId -> project.llm.profileId -> global default LLM from environment
```

如果请求显式传入 `llmProfileId` 但 profile preflight 不可用，服务端返回 `409 LLM_PROFILE_NOT_READY`。如果项目绑定了 `required=true` 且 profile 不可用，Loop 创建和一键 target wrapper 会在执行前停止。对 GitHub/GitLab 企业真实 loop，必须使用显式 READY 的项目 LLM profile 或请求级 `llmProfileId`；全局默认 LLM 只适合本地/debug 或明确非企业真实运行，不能作为远程项目的用户/项目归因依据。Loop、executor output、evidence、trace 和 CLI wrapper `llmUsage` 会记录 `llmProfileId`、`llmSource`、provider、model、token 与 credit 使用量。

## 健康检查

```http
GET /health
```

返回服务状态、当前项目画像、数据目录，以及 API 是否需要鉴权。

## 鉴权

Dashboard 用户应通过独立登录页输入用户名和密码。服务端启动时会确保存在一个持久化平台高级管理员账号：

```text
username: admin
password: admin
platformAdmin: true
mustChangePassword: true
```

该账号用于首次初始化，登录后必须调用改密接口，不能在生产环境长期使用默认密码。EvoPilot 不提供公网自助注册接口；账号开通遵循 `平台高级管理员 -> 租户管理员 -> 租户内用户`：平台高级管理员创建租户、工作区和租户管理员，租户管理员通过用户管理接口创建本租户用户。未登录用户只能访问登录页、公开帮助和健康检查，不能创建租户、创建用户、接入项目或读取租户数据。也可以使用 `EVOPILOT_USERS` 预置租户用户：

```text
EVOPILOT_USERS=tenant-admin:<password>:admin:tenant-production:workspace-agent-products:Tenant Admin
```

登录成功后，后端返回会话 token 和用户身份：

```http
POST /api/v1/auth/login
Content-Type: application/json

{"username":"tenant-admin","password":"<password>"}
```

首次登录默认管理员后改密：

```http
POST /api/v1/auth/change-password
Authorization: Bearer <session-token>
Content-Type: application/json

{"currentPassword":"admin","newPassword":"<new-password>"}
```

改密成功后响应会同时返回更新后的用户信息和新的会话 token。前端应替换本地 token 后再继续读取控制台数据；旧 token 会因为密码哈希变化而失效。

自动化脚本、CLI 或 Dashboard 登录后的后续请求使用 Bearer token：

```text
Authorization: Bearer <token>
```

`/health`、`/ready`、`/api/v1/version` 和控制台静态文件保持公开，用于健康探测、版本握手和本地查看。CLI、Dashboard 和 AI Agent 应使用 `/api/v1/version` 判断 `apiContractVersion`、`serverVersion` 和 `minimumCliVersion`，再决定是否继续执行自动化。

也可以通过 `EVOPILOT_TOKENS` 配置多角色机器 Token：

```text
admin:<token>:admin,operator:<token>:operator,viewer:<token>:viewer
```

角色能力：

- `viewer`：只读访问 API。
- `operator`：创建演进运行，提交评审决策。
- `admin`：注册项目，执行交付。
- `platformAdmin=true`：跨租户创建租户、工作区和租户用户；默认 bootstrap `admin/admin` 属于该类。

多租户 SaaS 请求可以通过 header 指定操作边界：

```text
X-EvoPilot-Tenant: <tenant-id>
X-EvoPilot-Workspace: <workspace-id>
X-EvoPilot-Actor: <member-id>
```

未指定时，服务端使用系统默认 `tenant-production` 和 `workspace-agent-products`。普通 viewer/operator 只能访问自己 tenant/workspace 内的数据；租户管理员只能管理本租户用户；`platformAdmin=true` 的平台高级管理员可跨租户执行开通、用户管理和审计动作。项目、Loop、secret、GitHub App installation、release evidence 和 release decision 均带 `tenantId`、`workspaceId`。

## 汇总

```http
GET /api/v1/summary
```

返回项目数、运行数、机会点数、评审数量、发布数量、发布健康度和近期运行记录。

## SaaS 控制面

```http
GET /api/v1/tenants
POST /api/v1/tenants
GET /api/v1/workspaces
POST /api/v1/workspaces
GET /api/v1/users
POST /api/v1/users
PATCH /api/v1/users/{userId}
POST /api/v1/users/{userId}/reset-password
GET /api/v1/workspaces/{workspaceId}
POST /api/v1/workspaces/{workspaceId}/invitations
PATCH /api/v1/workspaces/{workspaceId}/members/{memberId}
GET /api/v1/workspaces/{workspaceId}/usage
GET /api/v1/secrets
POST /api/v1/secrets
POST /api/v1/secrets/{secretId}/revoke
GET /api/v1/llm-profiles
POST /api/v1/llm-profiles
GET /api/v1/llm-profiles/{profileId}
GET /api/v1/llm-profiles/{profileId}/preflight
POST /api/v1/llm-profiles/{profileId}/preflight
GET /api/v1/github-app/installations
POST /api/v1/github-app/installations
GET /api/v1/github-app/installations/{installationId}
GET /api/v1/github-app/installations/{installationId}/preflight
POST /api/v1/github-app/installations/{installationId}/preflight
POST /api/v1/onboarding/project/checklist
GET /api/v1/projects/{projectId}/onboarding-checklist
GET /api/v1/projects/{projectId}/usage
GET /api/v1/loop-store/readiness
GET /api/v1/saas/observability
```

`POST /api/v1/workspaces` 会优先使用请求体中的 `id` 或 `workspaceId` 作为持久化 workspace id；`name` 仅作为展示名称。`GET /api/v1/workspaces/{workspaceId}` 和 `GET /api/v1/workspaces/{workspaceId}/usage` 返回 workspace 详情、项目数、Loop 数、evidence 容量配额、workspace 级 `llmUsage`、`projectsWithLlmUsage`、`loopsWithLlmUsage`、`topProject` 和 `projectUsage[]`。`projectUsage[]` 按接入项目聚合实际 Loop trace 中的 LLM provider/model、调用次数、input/output/total tokens、credits 和 cost，并同时暴露项目绑定的 `configuredLlm`。`GET /api/v1/projects/{projectId}/usage` 返回单个接入项目的同一用量投影。超过项目或 Loop 配额时，创建接口返回 `429 WORKSPACE_PROJECT_QUOTA_EXCEEDED` 或 `429 WORKSPACE_LOOP_QUOTA_EXCEEDED`。详情和 usage 查询也会解析 name/slug，但新集成应始终使用创建接口返回的 `data.id`。

LLM/token usage 是项目接入与 Loop 执行事实，不是固定重置周期的 LLMOps 配额视图。Dashboard 应使用 `projectUsage[].providerModelUsage[]` 作为主表数据源，一行对应 `projectId + provider + model + profileId`。如果同一接入项目在不同 Loop 中使用了多个 LLM，`projectUsage[].llmUsage.provider` 和 `model` 会返回 `mixed`，而 `providerModelUsage[]` 会分别返回每个组合的 `calls`、`inputTokens`、`outputTokens`、`totalTokens`、`creditsConsumed`、`costUsd`、`latestLoopId`、`latestLoopStatus`、`latestLoopTotalTokens` 和 `requestId`。浏览器端不得自行计算项目或工作区 token 总量。

用户管理接口用于 Dashboard “用户与权限”页。`POST /api/v1/users` 由平台高级管理员或租户管理员调用；平台高级管理员可指定任意 tenant/workspace 并创建 `platformAdmin`，租户管理员只能创建本租户用户且不能授予 `platformAdmin`。`PATCH /api/v1/users/{userId}` 支持修改 displayName、role、tenantId、workspaceId、status、mustChangePassword；`POST /api/v1/users/{userId}/reset-password` 会写入新密码哈希并把 `mustChangePassword` 置为 `true`。所有响应都会隐藏 `passwordHash`。

`POST /api/v1/secrets` 只返回 `secretRef` 和 `valueConfigured`，不会回显明文或加密 payload。GitHub/GitLab source credentials 和项目 DevOps 的 `tokenRef` 解析顺序是：先读 EvoPilot 服务进程环境变量，再读当前 tenant/workspace 下的 EvoPilot secret vault。GitHub App installation readiness 会验证 private key secret、webhook secret、repository selection 和 least-privilege permissions，并且 secret ref 必须属于同一 tenant/workspace 且类型正确。

`GET /api/v1/loop-store/readiness` 返回 `evopilot-loop-store-readiness/v1`。SaaS GA 要求 Postgres-backed loop store；未配置 `EVOPILOT_LOOP_STORE_BACKEND=postgres` 和 DSN 时返回 `BLOCKED / POSTGRES_LOOP_STORE_NOT_CONFIGURED`。

`GET /api/v1/saas/observability` 返回 `evopilot-saas-observability/v1`，从真实 store 汇总 tenants、workspaces、projects、loops、secret refs、GitHub App readiness、worker queue、quota blockers、credential blockers 和 Postgres readiness。`GET /api/v1/metrics` 同时暴露 `evopilot_saas_*` Prometheus 指标。

## 项目画像

```http
GET /api/v1/profiles
```

返回已加载的项目画像。当前 MVP 内置 `domainforge-fabric`。

## 触发规则

```http
GET /api/v1/rules
```

返回 Dashboard 用户视角的自然语言规则，例如“所有链路调用小于 3 秒”。接口不会暴露完整结构化执行条件。

EvoPilot 会把用户规则编译为管理员可审查的 Markdown 执行规则，默认存放在：

```text
<EVOPILOT_DATA_ROOT>/rules/*.md
```

Markdown 中包含用户规则、管理员说明和 `json` 代码块。系统运行时从该代码块读取执行规则，例如把“所有链路调用小于 3 秒”编译为 `durationMs`、`latencyMs` 或 `p95LatencyMs` 大于 `3000` 时触发性能热点演进机会。

生产模式下，`POST /api/v1/rules/compile` 必须调用真实 LLM，且返回规则必须通过语义校验后才会写入 Markdown。校验失败时接口返回错误，不会落盘半成品规则。读取规则时，系统会合并内置默认规则和已落盘用户规则；同 ID 的有效用户规则会覆盖默认规则，无效 Markdown 规则会被跳过。

当前可执行规则字段：

| 字段 | 用途 |
|---|---|
| `type` | 事件类型，例如 `performance.latency`、`eval.failed`、`security.leak`。 |
| `source` | 证据来源，例如 `agent`、`observability`、`ci`、`user`。 |
| `severity` | 严重级别。 |
| `module` | 发生问题的模块。 |
| `attributes.durationMs` / `attributes.latencyMs` / `attributes.p95LatencyMs` | 链路、工具或端到端耗时。 |
| `attributes.costUsd` / `attributes.totalTokens` | LLM 或工具调用成本。 |
| `attributes.ragHit` | RAG 是否命中。 |
| `attributes.score` | 评测或语义质量得分。 |
| `attributes.errorRate` | 错误率。 |
| `attributes.rollbackCount` | 回滚次数。 |
| `attributes.contextTruncated` | 上下文是否被截断或高风险压缩。 |

即使没有用户自定义规则，EvoPilot 仍会启用系统默认自进化规则，覆盖延迟、工具失败、产品缺口、成本、RAG、评测回归、负反馈、安全、发布回滚和上下文治理等主流 AI Agent 生产信号。

## 项目

```http
GET /api/v1/projects
POST /api/v1/projects
```

注册接入 EvoPilot 的 AI Agent 产品。项目必须携带 Git 仓库注册信息并通过连接验证后才会落盘；未验证项目不能进入后续证据策略、机会点和流水线流程。

当前支持的仓库接入方式：

- `local-git`：本地 Git/代码目录，必须提供 `repository.root`。
- `gitlab`：GitLab 项目，提供 `repository.gitUrl`，或提供 `repository.baseUrl` + `repository.projectId`。
- `github`：GitHub 仓库，提供 `repository.gitUrl`，或提供 `repository.owner` + `repository.repo`。

凭据支持：

- `username`
- `password`
- `token`
- `tokenRef`，从 EvoPilot 服务环境变量或当前 workspace secret vault 读取真实 token

读取项目列表时不会回显 `password` 或 `token`，只返回 `credentialsConfigured`、`credentialMode`、`tokenRef` 和 `tokenRefResolved` 等非 secret 状态。

公开 GitHub 仓库可以在无凭据时完成只读项目验证；但源码写回、PR/MR、merge 和一键自动驾驶 source-closure 必须配置可解析的 `token`、`password` 或 `tokenRef`。项目级源码写回凭据控制面用于区分 `READ_ONLY` 和 `READY`，Dashboard 的“配置凭据”表单可让用户绑定服务端 `tokenRef` 或填写 inline token，写回前还可调用 loop source-closure preflight，避免在真实写文件阶段才失败。

远程 GitHub/GitLab 项目还可以声明 DevOps 执行拓扑：

| 字段 | 用途 |
|---|---|
| `repository.executionMode` | `owned-repository`、`read-only-public`、`fork-validated-pr` 或 `upstream-authorized`。 |
| `repository.upstreamRepo` / `repository.upstreamRepository` | 上游仓库，例如开源项目 `apache/skywalking`。 |
| `repository.workingRepo` / `repository.workingRepository` | EvoPilot 实际写代码、推分支、运行 GitHub Actions/GitLab CI 的可写仓库。 |
| `repository.topology.claimBoundary` | 服务端归一化后的声明边界：`working-repo-ci`、`read-only-analysis`、`fork-ci-pr` 或 `upstream-release`。 |

当 `executionMode=fork-validated-pr` 时，项目的工作仓库是 `workingRepo`；上游只作为拓扑证据保存。Dashboard、CLI 和 AI Agent 必须以服务端返回的 `topology` 为准，而不是从仓库 URL 猜测 DevOps 归属。

首次接入项目时，CLI、Dashboard 或企业 AI Agent 应先调用 onboarding checklist，而不是直接写入半成品项目：

```http
POST /api/v1/onboarding/project/checklist
GET /api/v1/projects/{projectId}/onboarding-checklist
```

`POST /api/v1/onboarding/project/checklist` 是无副作用计划接口，接收与项目注册相同的 `repository`、`tokenRef`、`devops`、`llmProfileId` 和业务 `objective` 字段，返回 `evopilot-project-onboarding-checklist/v1`。对 GitHub/GitLab 企业真实 loop，除 `read-only-public` 分析模式外，CLI 入口要求 `executionMode`、可解析的服务端 `tokenRef`、`devopsOwner` 或 namespace、仓库原生 CI 配置、CD 或生产健康边界，以及显式 READY 的项目 LLM profile 或请求级 `llmProfileId`；缺失时会在 CLI 入参层或 checklist 阶段停止。响应包含 `status`、`steps`、`sourceCredentials`、`devops`、`missingInputs`、`blockers`、`commands` 和 `nextAction`，用于告诉 WorkBuddy/Codex/Claude Code 下一条 CLI 命令应该是 `secret set`、`llm profile set`、`project onboard`、`project devops set`、`project onboard verify` 还是 `target plan`。`READY_TO_RUN` 的 `nextAction` 是 `plan-target`，不是直接执行；AI Agent 必须展示并确认 Alpha/Beta/RC/GA phase plan 后才能调用 `target run`。

对于 GitHub/GitLab 写回和仓库原生 DevOps，`nextAction=connect-github-account` 或 `connect-gitlab-account` 表示缺少可解析的用户/组织/服务账号执行主体。第三方开源上游必须由用户或组织自己的账号 fork 到 `workingRepo` 并使用 `fork-validated-pr`，或由维护者凭据使用 `upstream-authorized`。如果没有 GitHub/GitLab 账号或 group，只能使用 `read-only-public`，不能声明 PR、CI/CD、merge、deploy 或 release readiness。EvoPilot 不提供共享官方账号或内置通用 CI/CD runner 作为替代。

`GET /api/v1/projects/{projectId}/onboarding-checklist` 复核已注册项目，会基于持久化项目、source credentials、GitHub Actions/GitLab CI 配置和项目 LLM 绑定生成同一 schema。只有 `READY_TO_RUN` 才表示项目已经具备真实源代码写回、仓库原生 DevOps 和 LLM profile 的前置条件；此时仍必须先进入 `plan-target`，由用户或项目负责人确认 phase plan。`BLOCKED` 或 `WAITING_INPUT` 不能被解释为 GA/RC/alpha 可执行完成。

### Published Harness Catalog

#### 6.3.0 semantic discovery

`GET /api/v1/projects/{projectId}/semantic-capabilities` returns
`data.schema=evopilot-project-semantic-capabilities/v1`, exact `projectId`, the
implemented operations (`capabilities`, `inspect`, `compatibility`, `review`,
`approve`, `binding`, `activation`, `transitionReview`, `transitionApprove`, `onboarding`), and
`executionAvailable=false`, `completionAvailable=false`.
It is authenticated, project-scoped, `no-store`, accepts no query/body and retains
production readiness gates. Advertisement is not a role or Catalog permission grant.
CLI `project semantic ...` and the corresponding finite MCP tools negotiate this
surface before making the selected request; version-only or legacy fallback is
forbidden. See the [CLI command contract](../cli/commands.md#project-semantic-discovery-and-review-630-source-development).

`GET /api/v1/projects/{projectId}/semantic-catalogs/{catalogId}` returns
`data.schema=evopilot-project-semantic-discovery/v1` and
`status=VERIFIED_DISCOVERY_ONLY`. This is not a released capability or a binding
operation. `eligibleForExecution=false` and `bindingCreated=false` always apply.
CLI `project semantic inspect` and MCP `evopilot_project_semantic_inspect` expose this read-only operation.

`GET /api/v1/projects/{projectId}/semantic-catalogs/{catalogId}/onboarding` returns
`evopilot-project-semantic-onboarding/v1` under the same current scope/readiness,
no-query/no-body/no-store rules. It never writes a binding, review, decision or
project. A valid current binding produces `EXISTING_BINDING` with exact head and
binding digests and no search of the requested Catalog. Otherwise a verified single
Catalog supplies at most 64 pairs, without truncation or cross-Catalog ranking:
`REVIEW_REQUIRED`, `SELECTION_REQUIRED`, `EVIDENCE_REQUIRED`,
`NO_COMPATIBLE_MATCH` or `NO_PUBLISHED_CANDIDATE`. Compatible choices recommend
`DUAL_BINDING_REVIEW`, but `selectedCandidate=null`; exact pair selection, review
and separate human approval remain required. Existing binding corruption, permission
loss, cancellation, resource limits and drift are errors, never absence or a legacy
fallback. `businessField` and `productType` remain null until a supported fact source
exists. Readiness, Harness eligibility, execution and Release are not established.

Configure both `EVOPILOT_HARNESS_REGISTRY_CONFIG` and
`EVOPILOT_SEMANTIC_CATALOG_POLICY_PATH` at server startup; the latter references
an independent operator-owned `evopilot-harness-semantic-catalog-policy/v1` JSON
file. Missing policy never enables a legacy-directory fallback. The consumer
does not create grants, publish assets or edit either configuration.

Use a current bearer credential with viewer/operator/admin role in the registered
project's exact tenant/workspace. Platform-admin status does not bypass this
scope check. Anonymous debug access, suspended/stale accounts and forced password
changes are denied. Production setup-only readiness remains enforced. Project
and principal state are rechecked during the read, not cached from request entry.

Both path ids match `[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}`. Query parameters and
request bodies are rejected; only GET exists. The bounded, unpaginated result
contains validated digest references and scope, not source material, Skill prose,
policy grants or filesystem paths. `discoveryDigest` is an evidence digest only.
Responses are `no-store`. Errors return `error`, `requestId` and, for reader
failures, `nextAction`: 400 invalid request; 401 missing/invalid bearer; 403 current
scope/permission denied; 404 configured Catalog/material unavailable; 408 cancelled;
409 unconfigured trust, invalid material, drift or resource failure; 504 timeout.
No partial result is returned. See the [implementation limits and remaining work](../architecture/semantic-catalog-consumer.md).

#### 6.3.0 semantic compatibility

`GET /api/v1/projects/{projectId}/semantic-catalogs/{catalogId}/compatibility`
requires exactly one `artifactSetDigest` and one `bundleDigest` query value, each
matching `sha256:[a-f0-9]{64}`. Select these from discovery's `sets` and each set's
`harnessBundles`. Extra/duplicate/missing query keys and bodies return 400.
All current-auth, registered-project scope, configured-policy, full-material,
production readiness, cancellation and redaction checks from discovery apply.
No request-supplied report, requirements, policy or validator is accepted.

The response is `data.schema=evopilot-project-semantic-compatibility-inspect/v1`,
with a digest-bound `report.status` of `COMPATIBLE`, `INCOMPATIBLE` or
`INDETERMINATE`. Exact Foundation, typed concepts, prohibited ids and explicit
directed relationships are compared. Missing Bundle requirements, unverified
descriptive evidence requirements and external reasoning cannot yield a positive
compatibility claim. Missing selected assets return 404; selection resolving to
multiple complete sets returns 409. Nothing is silently selected or persisted.
`bindingCreated=false` and `eligibleForExecution=false` remain mandatory even
for `COMPATIBLE`; actual review and binding use the separate workflow below.
Compatibility alone supplies neither Harness eligibility nor semantic execution authorization.

`GET /api/v1/projects/{projectId}/semantic-catalogs/{catalogId}/gap` uses the exact
same pair query and scoped Catalog checks. Its `evopilot-project-semantic-gap/v1`
response binds inspection/compatibility/gap digests and routes known findings to
ontology-material, Harness-declaration, cross-contract, evidence or reasoning review.
These are review destinations, not proof of defect ownership. Unverified requirements
remain unresolved. No successor is selected, no producer asset is modified/published,
and no binding/transition is written. Separate published successor compatibility,
binding review, current activation head, explicit MIGRATE preview and exact human
decision remain required; existing run pins stay unchanged.

Pre-plan authoring uses `POST /api/v1/projects/{projectId}/semantic-execution/planning`
with `identity`, `runId`, `requestDigest`, `goalTarget`. It reads exact current criteria,
allowed concepts/relations and the full Harness/Lifecycle obligation union without
selecting business rules. `POST .../semantic-execution/draft` additionally requires
`basisDigest`, explicit `selection`, `business`, `harness` and `selections`. Runtime
derives pins/digests and returns an unpersisted `declaration` for a separate `prepare`
request. Both require current scoped operator/admin and preserve the existing 64 KiB
request ceiling, bounded deadline, no-store response, audit and no-retry contract.
Stale basis, incomplete obligations, unselected concepts and executable predicates
are rejected. Neither operation approves meaning, prepares a review, attests evidence
or invokes an Agent; missing coverage stays empty for subsequent explicit review.

Before creating that pending run, `POST /api/v1/governed-evolution/plan` may
select `semanticGovernedSources`: exactly `policy`, `provider`, `environment`,
`authority` and `evidence`, each an active `{id, version, digest}` resource
reference. Supply the explicit `executor` as well. The server reads the current
scoped resources, intersects the PolicyPack and principal's HumanAuthorityRole
grant with deny-overrides, and derives all five governance digests plus its
installed semantic implementation digest. Omit those raw digest fields; if
supplied, they must match. Missing, stale, foreign or insufficient grants fail
closed. Planning does not qualify the executor or authorize execution.
The same selection and executor are required when revalidating a semantic plan.
Omitting `semanticGovernedSources` preserves ordinary planning's request-authority
context. Explicit Goal plan approval durably marks dependency-ready, unstarted
Targets READY; it does not start a Loop or complete a Target.

`POST /api/v1/projects/{projectId}/semantic-execution/mapping` accepts only
`identity` and `bindingDigest` under the existing scoped operator/admin, readiness,
current source and execution checks. The read-only `evopilot-semantic-outcome-mapping/v1`
response has status `COVERAGE_INPUT_REQUIRED`, actual criteria/concepts, the bound
outcome plan's separate business/Harness rules, empty `coverageInputs` and mappingDigest.
It neither guesses coverage nor prepares/approves a review. Business field/product
type remain null; returned prose is untrusted data. This assists review of an existing
plan, not pre-plan domain authoring. All dispatch/completion/Release authority is false.

#### 6.3.0 reviewed project binding

`POST /api/v1/projects/{projectId}/semantic-binding/reviews` accepts exactly
`catalogId`, `artifactSetDigest`, `bundleDigest` in a JSON body (2 KiB maximum).
A current operator/admin in the project's exact tenant/workspace may prepare a
review after fresh complete material verification and `COMPATIBLE` inspection.
It returns `data.reviewDigest`; it does not create a binding.

`POST /api/v1/projects/{projectId}/semantic-binding/approvals` accepts exactly
`reviewDigest` and `decision: "APPROVE"`. Runtime checks the same review against
current materials, project revision and permissions, then commits its review,
authenticated-principal decision and immutable project binding together. Caller
actor headers, decision objects, scope, paths and authority fields are not accepted.
Exact retries by the same current principal return the original record; another
review/principal cannot replace it. The shared audit is at-least-once, keyed by
the immutable decision digest. The initial record cannot be replaced; explicit
future-plan transitions use the separate endpoints below.

`GET /api/v1/projects/{projectId}/semantic-binding` permits scoped viewer or higher,
rechecks current permission/material pins and returns `data.review`, `data.decision`
and `data.binding`. The binding status is `REVIEWED_NOT_ACTIVATED` with
`eligibleForExecution=false`; no Goal/Loop activation, semantic execution binding
or new-project default is implied. All routes reject query parameters, return
`no-store`, retain bearer authentication and production readiness. Errors include
400 invalid request, 401 no credential, 403 permission denied, 404 missing review,
binding or material, 408 cancellation, 409 non-compatible material, stale review,
immutable conflict, corruption or readiness failure, and 504 read timeout.
See [persistence, retry and execution limitations](../architecture/semantic-catalog-consumer.md).

`GET .../semantic-binding/activation` returns the selected binding, `headDigest`,
bounded transition history and `grantsExecutionAuthority=false`. A scoped viewer
may read it. `POST .../semantic-binding/transition-reviews` requires exactly
`action`, `expectedHeadDigest`, `destinationDigest`: `ACTIVATE` names the initial
binding digest, `MIGRATE` names a fresh compatible review digest, and `ROLLBACK`
names a previously used binding digest. Migration/rollback require initial
activation. The preview contains changed fields and `FUTURE_EXECUTION_PLANS_ONLY`.

`POST .../semantic-binding/transition-approvals` requires exactly
`transitionReviewDigest` and `decision: "APPROVE"`. Current scoped operator/admin
authority and current destination material are rechecked; a stale head never
overwrites another decision. Same-principal retry returns the original receipt,
without reactivating an old destination. The immutable tuple contains review,
destination and authenticated decision; the at-least-once audit event is
`project-semantic-binding.transition-approved`. The chain limit is 64, without
automatic pruning. These endpoints retain the above HTTP/error/readiness rules.
They never mutate published assets or existing execution records. Existing plans
and subsequent stages retain the root plan's project binding; current permission
or project drift still blocks execution. CLI `project semantic activation|transitionReview|transitionApprove`
and MCP tools with the corresponding `evopilot_project_semantic_` suffixes expose
these exact operations. After uncertainty, read activation history and match the
exact transition review digest; neither transport retries automatically.

#### Existing published Harness discovery

`evopilot-harness` owns Harness authoring, lifecycle management, source evolution, review, approval, versioning, and publication. EvoPilot does not expose Harness lifecycle APIs or CLI commands. It only reads a Harness Registry and the published Harness Catalog directories that the server process can see.

```http
GET /api/v1/harness/catalogs
GET /api/v1/harness/catalogs/{catalogId}
```

Configure the Registry at server startup:

```bash
EVOPILOT_HARNESS_REGISTRY_CONFIG=/opt/evopilot-harness/harness-registry.yaml
```

The Registry lists enabled Catalog roots and priority. Legacy `EVOPILOT_HARNESS_CATALOG_DIR(S)` direct directory configuration is still supported only when no Registry is configured.

Each enabled directory must contain a `CATALOG.md` maintained by `evopilot-harness`. A v3 index uses the fenced `yaml evopilot-harness-catalog-v3` block and points to published `HarnessProfile`, `HarnessBundle`, and `HarnessComponent` assets. EvoPilot verifies Catalog and Asset digests plus the Profile/Component reference closure. The older `yaml evopilot-harness-catalog` Template format remains a read-only compatibility path. EvoPilot does not import the Catalog, mutate it, approve drafts, publish assets, or maintain Harness lifecycle records.

The list endpoint returns the current Registry status, configured catalogs, scan status, warnings, loaded published Harness entries, and digests. If a Registry entry or Catalog directory is added, removed, or republished by `evopilot-harness`, EvoPilot observes the change on the next read or goal planning request because the Registry and Catalogs are read dynamically from disk.

When a goal plan is generated, EvoPilot matches stored project metadata and the goal loop target against published Profile classification, positive concepts, negative concepts, and boundaries, then resolves a published immutable Bundle from the same Catalog:

```json
{
  "selectedHarness": {
    "schema": "evopilot-goal-plan-selected-harness-binding/v2",
    "bindingMode": "immutable-bundle",
    "harnessId": "database-product",
    "version": "3.0.0",
    "bundleRef": { "id": "database-product", "version": "3.0.0", "digest": "sha256:..." },
    "profileRef": { "id": "database-product", "version": "3.0.0", "digest": "sha256:..." },
    "resolvedComponents": [
      { "id": "engineering-validation", "version": "1.0.0", "digest": "sha256:...", "required": true }
    ],
    "executionPlan": ["discover-project-commands", "run-approved-validation"],
    "catalogId": "organization",
    "catalogDigest": "sha256:...",
    "entryDigest": "sha256:...",
    "selectionReasons": ["classification=database-product", "positiveConcept=sql-optimizer"]
  }
}
```

Before Goal Loop creation and every Loop iteration, EvoPilot revalidates the Bundle, Profile, Component digests and immutable execution fields. Unrelated additive Catalog entries are allowed; changing or removing a bound Asset returns `409 HARNESS_BUNDLE_DIGEST_MISMATCH` or `HARNESS_BUNDLE_BINDING_INVALID` before executor work starts. Legacy Template bindings use schema v1 and `bindingMode=legacy-template`; they do not claim v3 Bundle compliance.

```http
POST /api/v1/projects/{projectId}/source-credentials
GET /api/v1/projects/{projectId}/source-credentials/preflight
POST /api/v1/projects/{projectId}/source-credentials/preflight
```

`source-credentials` 只更新项目级 GitHub/GitLab 写回凭据元数据，例如 `tokenRef`、`token`、`password`、`username` 或 `defaultBranch`，响应不会回显 secret。`source-credentials/preflight` 不写仓库，只检查项目、provider、credential ref、token 解析、source branch 和写回策略。响应 schema 为 `evopilot-source-credential-readiness/v1`，状态为 `READY`、`READ_ONLY` 或 `BLOCKED`。公开 GitHub/GitLab 无 token 时通常是 `READ_ONLY`，blocker 为 `token-resolution:SOURCE_CREDENTIAL_TOKEN_REQUIRED`，`nextAction` 为 `connect-github-account` 或 `connect-gitlab-account`；`tokenRef` 已配置但环境变量和 secret vault 都未解析时仍为 `READ_ONLY`，也会要求连接/修复对应执行主体；解析成功并能读取分支后为 `READY / nextAction=write-source`。Dashboard 保存凭据后会立即调用同一 readiness contract，因此用户补齐凭据后可以回到 Target Loop Backlog 继续 autopilot。

项目 DevOps 绑定使用仓库原生 CI/CD。GitHub 项目绑定 GitHub Actions，GitLab 项目绑定 GitLab CI：

```http
GET /api/v1/projects/{projectId}/devops
POST /api/v1/projects/{projectId}/devops
PUT /api/v1/projects/{projectId}/devops
DELETE /api/v1/projects/{projectId}/devops
GET /api/v1/projects/{projectId}/devops/preflight
POST /api/v1/projects/{projectId}/devops/preflight
```

`devops` 是项目聚合的一部分。`provider=github-actions` 只能用于 GitHub 项目；`provider=gitlab-ci` 只能用于 GitLab 项目。EvoPilot 使用项目 source credentials 或 `devops.tokenRef` 解析平台 token，响应不回显 secret。`devops/preflight` 返回 `evopilot-project-devops-readiness/v1`，状态为：

- `READY`：provider、token、CI 合同和可选 health/ready 探测均可用。
- `OBSERVABLE`：配置和 token 可用，但当前 CI evidence 不是绿色；不能据此声明发布就绪。
- `BLOCKED`：provider mismatch、token 缺失、CI 合同缺失或项目绑定错误。

DevOps 请求可以显式携带执行边界：

| 字段 | 用途 |
|---|---|
| `executionMode` | 与项目 repository topology 一致。配置 DevOps 时不能使用 `read-only-public`。 |
| `devopsOwner` / `devopsNamespace` | GitHub owner 或 GitLab namespace，必须匹配实际运行 CI/CD 的工作仓库 namespace。 |
| `workingRepo` / `workflowRepo` | CI/CD workflow 所在仓库。 |
| `upstreamRepo` | fork 模式下的上游仓库。 |
| `devopsTokenRef` / `tokenRef` | 可选 DevOps 专用服务端 secret ref；省略时使用项目 source credentials。 |
| `credentialPrincipal` | 可选的 token principal 标签，便于审计和 Agent 排障。 |

`devops/preflight` 响应会返回 `executionMode`、`repositoryOwner`、`devopsOwner`、`workflowRepository`、`credentialRef`、`credentialPrincipal` 和 `claimBoundary`。这些字段是 Dashboard 和 AI Agent 展示/判断端到端能力边界的权威来源。

项目 LLM 绑定是项目聚合的一部分。首次接入或运行 RC/GA target 前可以通过以下接口绑定和验证项目默认 LLM：

```http
GET /api/v1/projects/{projectId}/llm
POST /api/v1/projects/{projectId}/llm
PUT /api/v1/projects/{projectId}/llm
DELETE /api/v1/projects/{projectId}/llm
GET /api/v1/projects/{projectId}/llm/preflight
POST /api/v1/projects/{projectId}/llm/preflight
```

响应会返回 project default selection、profile metadata 和 readiness，不回显 API key。Dashboard 和 AI Agent 必须以服务端返回的 `selection.source`、`profileId`、`provider`、`model` 和 `nextAction` 为准，而不是从 CLI 环境变量推断当前使用哪个模型。

如果 DevOps token 缺失或无法解析，GitHub 项目返回 `nextAction=connect-github-account`，GitLab 项目返回 `nextAction=connect-gitlab-account`。这表示需要先补齐运行 GitHub Actions/GitLab CI 的账号、组织、group、service account、deploy token 或 GitHub App principal，而不是让 Agent 重试同一请求。

GitHub Actions 请求示例：

```json
{
  "provider": "github-actions",
  "executionMode": "owned-repository",
  "devopsOwner": "owner",
  "ci": {
    "workflow": "ci.yml",
    "requiredChecks": ["build", "test"],
    "timeoutSeconds": 1800
  },
  "cd": {
    "workflow": "deploy-prod.yml",
    "environment": "production",
    "healthUrl": "https://my-agent.example.com/health",
    "timeoutSeconds": 1800
  }
}
```

GitLab CI 请求示例：

```json
{
  "provider": "gitlab-ci",
  "executionMode": "owned-repository",
  "devopsOwner": "group",
  "ci": {
    "requiredStages": ["test"],
    "requiredJobs": ["build"]
  },
  "cd": {
    "environment": "production",
    "requiredStages": ["deploy"],
    "readyUrl": "https://my-agent.example.com/ready"
  }
}
```

开源上游 + fork 请求示例：

```json
{
  "provider": "github-actions",
  "executionMode": "fork-validated-pr",
  "upstreamRepo": "apache/skywalking",
  "workingRepo": "my-org/skywalking-fork",
  "devopsOwner": "my-org",
  "tokenRef": "GITHUB_TOKEN_SKYWALKING_FORK",
  "ci": {
    "workflow": "ci.yml",
    "requiredChecks": ["build"]
  }
}
```

成功 preflight 的关键响应示例：

```json
{
  "schema": "evopilot-project-devops-readiness/v1",
  "status": "READY",
  "executionMode": "fork-validated-pr",
  "devopsOwner": "my-org",
  "workflowRepository": "my-org/skywalking-fork",
  "credentialRef": "GITHUB_TOKEN_SKYWALKING_FORK",
  "claimBoundary": "fork-ci-pr",
  "nextAction": "run-devops"
}
```

请求示例：

```json
{
  "id": "agent-prod",
  "name": "Agent Product",
  "profileId": "domainforge-fabric",
  "repository": {
    "provider": "gitlab",
    "gitUrl": "https://gitlab.example.com/group/agent-prod.git",
    "username": "evopilot",
    "token": "<gitlab-token>",
    "defaultBranch": "main"
  }
}
```

响应中的关键字段：

```json
{
  "data": {
    "id": "agent-prod",
    "validation": {
      "status": "VERIFIED",
      "message": "GitLab 项目验证通过",
      "fileCount": 42
    },
    "repository": {
      "provider": "gitlab",
      "gitUrl": "https://gitlab.example.com/group/agent-prod.git",
      "credentialsConfigured": true
    }
  }
}
```

## 部署连接器

```http
GET /api/v1/connectors/deploy
POST /api/v1/connectors/deploy
```

部署连接器用于执行 source closure 的 `deploy` gate。当前内置 `http-webhook` 和 `ecs-docker-compose` 类型：EvoPilot 会向连接器 URL 发送结构化部署请求，或在配置的 ECS 工作目录中执行受限 Docker Compose 发布。连接器返回或生成 `deploymentId`、`deploymentUrl`、`healthUrl`、`readyUrl` 或 `statusUrl` 后，EvoPilot 将部署证据写回 `LoopRun.sourceClosure.gateEvidence.deploy`，再继续执行 health/ready 探测。读取接口会隐藏 `token`，只返回是否已配置。

请求示例：

```json
{
  "id": "prod-webhook",
  "name": "Production Deploy Webhook",
  "url": "https://deploy.example.com/evopilot",
  "tokenRef": "DEPLOY_WEBHOOK_TOKEN",
  "timeoutSeconds": 60,
  "healthPath": "/health",
  "readyPath": "/ready"
}
```

## 创建演进运行

```http
POST /api/v1/runs
```

生产客户端应包含 `X-Idempotency-Key`。

请求示例：

```json
{
  "projectId": "domainforge-fabric",
  "now": "2026-06-02T00:00:00.000Z",
  "events": [
    {
      "id": "e1",
      "type": "performance.latency",
      "source": "agent",
      "timestamp": "2026-06-02T00:00:00.000Z",
      "severity": "HIGH",
      "message": "p95 延迟升高"
    }
  ],
  "files": [
    "src/runtime-performance.ts",
    "test/runtime-performance.test.ts"
  ]
}
```

响应包含：

- 证据包。
- 演进机会。
- 优先级评分。
- 影响面映射。
- 演进计划。
- 评审记录。
- 交付计划。

## 进化证据接入

所有证据接入接口都要求 `operator` 或更高角色。不同接入方式最终都会转换为 `RuntimeEvidenceEvent`，并创建一次演进运行。

### 通用事件接入

```http
POST /api/v1/evidence/events
```

用于轻量 SDK、业务系统或自定义探针直接上报 Agent 运行证据。

请求示例：

```json
{
  "projectId": "domainforge-fabric",
  "events": [
    {
      "type": "agent.step",
      "message": "链路调用超过目标",
      "traceId": "trace-001",
      "attributes": {
        "durationMs": 3500
      }
    }
  ]
}
```

### OpenTelemetry Trace 接入

```http
POST /api/v1/evidence/otlp/v1/traces?projectId=domainforge-fabric
```

接收 OTLP JSON Trace。EvoPilot 会把 span 的耗时、traceId、service.name 和 GenAI 属性转换为进化证据。

### OpenTelemetry Log 接入

```http
POST /api/v1/evidence/otlp/v1/logs?projectId=domainforge-fabric
```

接收 OTLP JSON Log。错误日志会转换为高严重级别证据。

### SkyWalking 接入

```http
POST /api/v1/evidence/skywalking
```

接收 SkyWalking 链路或查询结果转换后的 JSON。EvoPilot 不替代 SkyWalking，只把 APM 信号转换为进化证据。

### 评测结果接入

```http
POST /api/v1/evidence/evaluations
```

用于外部评测系统、语义回归测试或 CI 回归套件上报评测结果。

### 用户反馈接入

```http
POST /api/v1/evidence/feedback
```

用于上报用户差评、投诉、满意度和人工标注，并与 traceId/sessionId 关联。

## 评审决策

```http
POST /api/v1/reviews/{reviewId}/decision
```

可接受的动作：

- `accept`
- `reject`
- `request-changes`
- `observe-only`

### 托管代码升级的精确文件范围（6.3.1）

这是操作人和机器集成使用的既有 HTTP 路径；评审沿用 operator 权限，执行沿用 admin 权限，普通用户仍通过 Expert/MCP 使用产品。托管 CodeUpgrader 的维护任务可以在 `accept` 决策中附带 `codeUpgradeSourceScope`，将代码、测试、文档和治理文件一起纳入明确批准的范围。它不改变 Harness 的所有权，也不授予发布权限。

提交前从 `GET /api/v1/runs/{runId}` 读取所属 `ReviewRecord` 和方案，核对项目源码提交及拟执行的完整 `proposalMarkdown`。请求结构如下，摘要和提交占位符必须替换为当前实际值：

```json
{
  "action": "accept",
  "note": "Approve the reviewed maintenance files for this exact proposal and source",
  "codeUpgradeSourceScope": {
    "schema": "evopilot-code-upgrade-source-scope/v1",
    "expectedReviewDigest": "sha256:<current-review-digest>",
    "sourceCommit": "<current-40-character-git-commit>",
    "proposalDigest": "sha256:<exact-proposal-utf8-digest>",
    "files": ["packages/server/src/example.ts", "tests/unit/example.test.mjs", "docs/guides/example.md"]
  }
}
```

`expectedReviewDigest` 是完整当前评审对象的递归键排序 JSON 摘要：对象键按 JavaScript `localeCompare` 排序，忽略值为 `undefined` 的对象成员，保留数组顺序，使用紧凑 JSON 的 UTF-8 字节计算 SHA-256，并添加 `sha256:` 前缀。`proposalDigest` 则直接散列完整方案字符串的 UTF-8 字节，包括换行。不要把界面中的摘要文本或另一轮评审摘要作为当前输入。

`files` 包含 1–256 个精确仓库相对文件名，每项最多 1,024 字节，总计最多 65,536 字节。目录、通配符、绝对路径、遍历路径、重复或互相包含的路径、受保护路径、符号链接及非普通文件不构成有效范围。新增文件可以尚不存在。Runtime 记录经过验证并排序的文件清单，以及项目、租户、工作区、方案、仓库、源码提交和真实认证操作人；请求中的 `actor` 文本不能替代认证身份。

成功响应的最新决策包含 `codeUpgradeSourceScope.approvalDigest`。下一步向 `POST /api/v1/deliveries/{deliveryId}/code-upgrade` 传递这个值作为 `sourceScopeApprovalDigest`，并使用刚才批准的完整 `proposalMarkdown`。单独提交 `allowedPaths` 不能替代评审批准。源码、方案、仓库绑定或最新评审决策变化后，原批准不再适用；必须先读取当前状态，再形成新的明确决策。未提供显式范围时，保留原有的范围推导行为。

Runtime 在外部执行前验证权限、当前绑定与保护规则，并在接收结果时核对实际改动文件。`CodeUpgradeRun.sourceScope` 保留批准记录。输入错误返回 `400`，项目越权返回 `403`，项目缺失返回 `404`；陈旧源码或评审、失配摘要、缺失批准及受保护路径返回 `409` 和 `CODE_UPGRADE_SCOPE_*` 错误。保存请求 ID 和回执；超时或响应丢失后先读取所属 Run 和 CodeUpgradeRun，不能自动重发升级。

托管提供方的认证 `GET /health` 必须在 `capabilities` 数组中声明 `evopilot-code-upgrade-source-binding/v1`，否则 Runtime 在发送升级请求前返回 `409 / CODE_UPGRADE_SCOPE_PROVIDER_CAPABILITY_REQUIRED` 或 `CODE_UPGRADE_SCOPE_PROVIDER_CAPABILITY_UNAVAILABLE`。外发请求附带 `sourceScopeBinding`，字段为 `schema`、`approvalDigest`、`repositoryDigest`、`sourceCommit`、`filesDigest`；最后一项是排序后的精确文件清单的规范 JSON 摘要。提供方的启动响应和每次状态快照必须原样返回该元组。提供方仍须独立保留真实 Git 基线、目标提交及验证进程回执；回显字段本身不证明执行成功。

`CodeUpgradeRun` 保留 `sourceScopeBinding` 和 `sourceScopeAcknowledgement`（`startMatched`、可选的 `snapshotMatched`、`effectsUncertain`）。若外部已返回会话但缺少或失配确认，Runtime 保留 `conversationId` 并将运行记为 `FAILED / CODE_UPGRADE_SCOPE_PROVIDER_ACK_MISMATCH_UNCERTAIN`、`effectsUncertain=true`。此时应读取已有会话与运行记录核对影响，不能把失败响应视为“未执行”而重发。

## 执行交付

```http
POST /api/v1/deliveries/{deliveryId}/execute
```

当项目策略要求用户确认且评审尚未确认时，交付会被阻断。

默认生产路径是项目 DevOps。项目配置了 `devops.provider=github-actions` 或 `gitlab-ci` 后，请求体可以不传 `executor`，EvoPilot 会在代码升级成功后触发对应平台并生成统一 `pipelineRun`。

GitHub Actions 请求示例：

```json
{
  "parameters": {
    "VERSION": "1.1.0"
  }
}
```

GitLab CI 请求示例：

```json
{
  "executor": "gitlab-ci",
  "parameters": {
    "VERSION": "1.1.0",
    "TARGET_ENV": "production"
  }
}
```

本地执行请求示例：

```json
{
  "version": "1.1.0",
  "ciStatus": "PASSED"
}
```

GitHub Actions 和 GitLab CI 路径都会返回 `202` 和统一的 `pipelineRun`。EvoPilot 会刷新平台状态、stage/job/check evidence、日志摘要和原始链接；当流水线进入终态后，EvoPilot 生成发布报告、学习记录和审计记录。

## 流水线

```http
GET /api/v1/pipelines
GET /api/v1/pipelines/{pipelineRunId}
GET /api/v1/pipelines/{pipelineRunId}/logs
GET /api/v1/pipelines/{pipelineRunId}/artifacts
```

返回 EvoPilot 汇总后的流水线视图。GitHub Actions 会映射 workflow run 和 check runs；GitLab CI 会映射 pipeline 和 jobs。深度排障仍应跳转对应平台原始页面。

## GA Release 目标与发布判定

```http
GET /api/v1/release/targets
GET /api/v1/release/targets/{targetId}
POST /api/v1/release/targets
GET /api/v1/release/decisions
GET /api/v1/release/decisions?current=true
GET /api/v1/release/decisions?targetId=saas-ga
GET /api/v1/release/decisions?targetId=<targetId>&projectId=<projectId>
POST /api/v1/release/evidence
```

EvoPilot 自身定义“什么才算 GA Release”。外部 AI、通用 sub agent、CI/CD 编排器或人工执行验证时，都应先读取发布目标，再按目标执行场景验证 loop，最后生成 release evidence 和 release decision。

SaaS 多租户版本的正式发布状态以 `targetId=saas-ga` 为当前口径。`GET /api/v1/release/decisions?current=true` 只返回当前正式发布判定；历史 `ga` 判定仍保留为审计记录，但不会替代 SaaS 多租户版本的当前发布结论。`GET /api/v1/summary` 同时返回 `currentReleaseDecision` 和 `currentReleaseTargetId`，Dashboard 应优先使用这两个字段。

项目级发布治理使用 `ReleaseTargetProfile` 和项目专属 target。`GET /api/v1/release/targets` 返回服务端 release target profiles，它们是发布证据阈值和场景上下文，不是 CLI 可选择的成熟度模板。CLI、Dashboard 和外部 AI Agent 不通过模板参数选择 Alpha/Beta/RC/GA；用户提交业务 `objective` 后，GlobalGoal 固定生成 Alpha -> Beta -> RC -> GA 递进计划，GA 是终态成熟度。管理员可以提交 `scope: "project"`、`projectId` 和项目专属 target id 创建某个 GitHub/GitLab 项目的 GA target；随后 `POST /api/v1/release/evidence` 传入同一个 `projectId` 和 `releaseTargetId`，EvoPilot 只统计该项目的 pipeline、code upgrade、source release run、风险和场景证据。若 project-scoped target 绑定了 `projectId`，但 evidence 使用其他项目，服务端会返回 `RELEASE_TARGET_PROJECT_MISMATCH`。

项目级 target 示例：

```json
{
  "id": "github-owner-repo-ga",
  "name": "github-owner-repo GA",
  "scope": "project",
  "projectId": "github-owner-repo",
  "templateId": "ga",
  "minConnectedProjects": 1,
  "minSuccessfulCodeUpgrades": 1,
  "minSuccessfulPipelines": 1,
  "requiredScenarioIds": ["normal-evolution-loop", "ci-cd-failure-recovery", "manual-approval"],
  "requireNoHighOpenRisks": true
}
```

项目级 evidence 示例：

```json
{
  "id": "github-owner-repo-ga-evidence",
  "projectId": "github-owner-repo",
  "releaseTargetId": "github-owner-repo-ga",
  "candidate": "github-owner-repo-ga",
  "scenarioMatrix": [
    { "id": "normal-evolution-loop", "name": "Normal Evolution Loop", "status": "PASS", "evidence": ["Alpha/Beta/RC/GA loop passed"], "required": true }
  ]
}
```

查询项目判定：

```http
GET /api/v1/release/decisions?targetId=github-owner-repo-ga&projectId=github-owner-repo
```

默认内置 release target profiles：

| Profile | targetId | 用途 |
|---|---|---|
| Experimental | `experimental` | 早期实验，验证项目接入和最小证据链。 |
| Alpha | `alpha` | 内部试用，要求 smoke、基础运行证据和人工确认。 |
| Beta | `beta` | 有限用户试用，要求核心场景、CI/CD、代码升级和无高危开放风险。 |
| Release Candidate | `rc` | 候选发布，要求源码闭环、部署健康、回滚或修复证据。 |
| GA Release | `ga` | 正式稳定发布，要求完整 Source-to-GA 证据、稳定性和主流 Loop Harness 对齐。 |

这些 profiles 只用于服务端发布证据阈值和 API 级 target 创建。Agent-facing CLI 不暴露成熟度 target template 参数；应使用 `maturity standards list/inspect` 查看 Alpha/Beta/RC/GA 标准，并用 `target plan` / `target run` 处理业务目标。Harness 定义由 `evopilot-harness` 发布；EvoPilot 在规划时只读取 Catalog 并记录 `selectedHarness`，不能解释为跳过或选择 Alpha/Beta/RC/GA 阶段。

默认内置 `ga` 目标：

| 目标项 | 默认门槛 |
|---|---:|
| 最少接入项目数 | 5 |
| 有负载成功持续验证时长 | 5400 秒 |
| 有负载 soak 运行增量 | 5 |
| 有负载 soak 代码升级增量 | 5 |
| 有负载 soak CI/CD 增量 | 5 |
| 成功证据运行数 | 5 |
| 评测集数量 | 10 |
| 机会点数量 | 5 |
| 成功进化批次数 | 5 |
| 成功代码升级数 | 5 |
| 成功 CI/CD 数 | 5 |
| 主流 Loop Harness 对齐证据 | 必须提供 |

默认 `ga` 必跑场景：

- `normal-evolution-loop`
- `ci-cd-failure-recovery`
- `llm-failure-containment`
- `scm-failure-containment`
- `cost-slo-governance`
- `manual-approval`
- `multi-project-isolation`
- `restart-recovery`
- `rollback`
- `data-governance`
- `mainstream-loop-harness-alignment`

`mainstream-loop-harness-alignment` 用于把 GA stable 的外部基线产品化：release evidence 必须说明 EvoPilot 与 GitHub 主流 Agent/Loop Harness 项目的关键能力对齐，包括 durable execution、checkpoint/persistence、human-in-loop、sandbox、multi-executor coordination、streaming trace、guardrails 和 source-to-production closure。没有这项场景证据时，release decision 会生成独立的 `mainstream-loop-harness-alignment` criterion，并返回 `NO-GO`。

对于 `saas-ga` 这类独立 SaaS 发布目标，不属于该目标 `requiredScenarioIds` 的历史 `ga` 场景会在 evidence matrix 中保留为审计行，并标记为 `NOT-APPLICABLE`、`required=false`；它们不再造成当前 SaaS 发布门禁 `NO-GO`。

`POST /api/v1/release/evidence` 默认使用 `releaseTargetId: "ga"`，返回的证据包会包含：

```json
{
  "releaseTargetId": "ga",
  "releaseDecisionId": "decision-rc-1",
  "status": "NO-GO"
}
```

对应判定可从 `GET /api/v1/release/decisions` 查询。每条判定包含 `criteria`，逐项说明实际值、目标值、PASS/FAIL 和证据。若未达到 GA，例如只接入 1 个项目，`min-connected-projects` 会失败，最终为 `NO-GO`。

默认 `ga` 目标要求 `requireActiveSoak=true`。仅健康检查持续存活不计入 GA 稳定性证明；soak 报告必须证明 `runCount`、`codeUpgradeCount` 和 `pipelineCount` 相比基线产生真实活动增量。

## GlobalGoal

```http
GET /api/v1/goals
POST /api/v1/goals
GET /api/v1/goals/{goalId}
POST /api/v1/goals/{goalId}/plan
POST /api/v1/goals/{goalId}/plan/apply
POST /api/v1/goals/{goalId}/approve-plan
GET /api/v1/goals/{goalId}/targets
GET /api/v1/goals/{goalId}/phase-plan
GET /api/v1/goals/{goalId}/phases
GET /api/v1/goals/{goalId}/target-packages
GET /api/v1/goals/{goalId}/target-packages/{targetId}
GET /api/v1/goals/{goalId}/phase-packages
GET /api/v1/goals/{goalId}/phase-packages/{phase}
POST /api/v1/goals/{goalId}/advance
GET /api/v1/goals/{goalId}/snapshot
GET /api/v1/goals/{goalId}/run-status
GET /api/v1/goals/{goalId}/graph
GET /api/v1/goals/{goalId}/timeline
GET /api/v1/goals/{goalId}/evidence-matrix
GET /api/v1/goals/{goalId}/final-report
```

GlobalGoal 是 release target 和 LoopRun 之间的目标规划层。用户提交的是业务目标，例如“让项目具备租户接入、全生命周期 Dashboard 可视化和故障修复引导能力”；不是提交 `alpha`、`beta`、`rc` 或 `ga` 作为终点。EvoPilot 默认终态成熟度为 GA，并固定按 Alpha -> Beta -> RC -> GA 生成递进 phase，每一级都有 GoalTargets、验收标准、所需证据、review capabilities、phase package 和 GO/NO-GO decision。

GoalTarget 的 phase 分解由 EvoPilot 服务端决定，不由 CLI、Dashboard 或外部 AI Agent 在客户端拼接。`ReleaseTargetProfile` 中的 `requiredScenarioIds`、`minSuccessfulRuns`、`minSuccessfulPipelines`、`requireActiveSoak`、`requireNoHighOpenRisks` 等字段作为验收上下文；`objective` 提供业务上下文；maturity standard set 提供 Alpha/Beta/RC/GA 的基线标准。CLI 和 Dashboard 不通过模板参数选择成熟度；GA 是固定终态，Alpha/Beta/RC/GA 必须按序完成。

内置 maturity standard API：

```http
GET /api/v1/maturity/standards
GET /api/v1/maturity/standards/{alpha|beta|rc|ga|standard-id}
```

默认标准集为 `evopilot-default/v1`，对应文件在 `standards/maturity/evopilot-default/v1/`。标准文件是服务端版本化资产，包含 baseline rules、acceptance criteria、required evidence、review capabilities、package outputs、GO/NO-GO rules、planner instructions、target schema、package contract 和 override policy。后续可以通过新增版本演进标准，但 CLI/Dashboard 仍以 API 返回的标准集为准。

创建目标示例：

```json
{
  "id": "my-agent-ga-global-goal",
  "projectId": "my-agent",
  "releaseTargetId": "my-agent-ga",
  "objective": "Enable tenant onboarding, lifecycle workflow visibility, and operator repair guidance for My Agent."
}
```

典型推进顺序：

1. `POST /api/v1/goals` 创建目标，初始状态为 `DRAFT`。
2. `POST /api/v1/goals/{goalId}/plan` 生成 Alpha/Beta/RC/GA phase plan，状态进入 `PLANNED / PENDING_APPROVAL`。
3. `GET /api/v1/goals/{goalId}/phase-plan` 读取用户可审查计划；Dashboard/WorkBuddy 展示 `phases[]`、`targets[]` 和 `editablePlan`。
4. 可选：`POST /api/v1/goals/{goalId}/plan/apply` 应用用户调整后的计划。允许新增项目专属 GoalTargets、强化标准、增加 review；不允许删除 Alpha/Beta/RC/GA、跳级或移除基线标准。
5. `POST /api/v1/goals/{goalId}/approve-plan` 提交真实用户或项目负责人的计划确认并批准计划。请求体必须包含 `confirmedBy` 和 `confirmation`，否则返回 `400 / GOAL_PLAN_CONFIRMATION_REQUIRED`。
6. `GET /api/v1/goals/{goalId}/target-packages/{targetId}` 读取单个 GoalTarget 的 TargetEvidencePackage；只有 `status=GO` 才能视为该 target 通过。
7. `GET /api/v1/goals/{goalId}/phases` 和 `phase-packages/{phase}` 读取每个 phase 的状态、验收、证据、blocker、target package 列表和 GO/NO-GO decision。
8. `GET /api/v1/goals/{goalId}/snapshot`、`run-status`、`graph`、`timeline`、`evidence-matrix` 读取白盒状态。
9. `POST /api/v1/goals/{goalId}/advance` 推进一个服务端治理步骤。
10. 目标终态后读取 `GET /api/v1/goals/{goalId}/final-report`。

非语义 Goal 的 `GET /api/v1/goals/{goalId}/run-status` 是 Dashboard 和 CLI wrapper 共享的白盒投影。它包含 `targetPackages`、`phasePackages`、workflow `chain`、`activeTarget`、`latestLoop`、`blockers`、`evidenceMatrix`、`releaseDecision`、`finalReport` 和 `llmUsage`。Dashboard 不应自己计算 phase 进度或 release verdict。

`TargetEvidencePackage` 返回 schema `evopilot-target-evidence-package/v1`，包含 `targetId`、`phase`、`status`、`acceptanceCriteria`、`requiredEvidence`、`reviewCapabilities`、`packageOutputs`、`loop`、`evidence`、`blockers`、`llmUsage` 和 `decision`。`LoopRun.status=SUCCEEDED` 只是证据之一；如果 source closure、DevOps、部署健康或其他必需 gate 未通过，TargetEvidencePackage 仍为 `NO-GO`，GoalTarget 不会变成 `DONE`。

批准请求示例：

```json
{
  "confirmedBy": "project-owner",
  "confirmation": "Project owner reviewed and approved the Alpha/Beta/RC/GA phase plan"
}
```

`advance` 返回 schema `evopilot-goal-advance/v1`，其中 `nextAction` 是自动化和 Dashboard 的主要路由字段。常见值包括 `plan-goal`、`approve-plan`、`start-target`、`resume-loop`、`human-approval`、`configure-source-credentials`、`repair-project`、`repair-deploy-target`、`policy-review`、`release-decision`、`view-final-report`、`done` 和 `repair`。调用方遇到人工、凭据、部署、策略或 repair 类型动作时应停止自动推进并展示阻塞原因。

非语义 Goal 的 `run-status` 返回 schema `evopilot-goal-run-status/v1`，是 CLI wrapper commands 和 Dashboard 白盒视图共享的聚合投影。它包含 `scope`、`goal`、`snapshot`、`graph`、`timeline`、`evidenceMatrix`、`activeTarget`、`latestLoop`、`releaseDecision`、`finalReport`、`chain`、`blockers`、`nextAction` 和 `llmUsage`。CLI 的 `target run` / `goal run` 会用这个接口打印终端版 workflow 链路和 LLM/token usage，而不是在客户端猜测状态。

Dashboard 的 GlobalGoal Cockpit 直接消费这些投影接口，而不是从多个 LoopRun 拼接状态：

| 接口 | Dashboard 用途 |
|---|---|
| `snapshot` | 状态、进度、active GoalTarget、下一步动作、blockers 和 release decision 摘要。 |
| `run-status` | 非语义 Goal：CLI / Dashboard 共用的聚合运行视图，包含链路、最新 Loop、targetPackages、phasePackages、阻塞项、LLM/token usage 和 release decision。 |
| `phase-plan` | 执行前用户可审查和可调整的 Alpha/Beta/RC/GA plan。 |
| `target-packages` | 每个 GoalTarget 的独立 evidence package、LoopRun/source gate/LLM usage、blockers 和 GO/NO-GO decision。 |
| `phases` / `phase-packages` | 每个成熟度阶段的验收标准、证据、blockers、package outputs、target package 汇总和 GO/NO-GO decision。 |
| `graph` | GoalTarget 依赖图和绑定的 LoopRun。 |
| `timeline` | 目标创建、计划、批准、绑定、推进和完成事件。 |
| `evidence-matrix` | 每个 GoalTarget 的 acceptance criteria、evidence、blocker 和 loopId。 |
| `final-report` | 终态目标报告和 release decision 引用。 |

## Loop Runtime

```http
GET /api/v1/executor-graphs
POST /api/v1/executor-graphs
GET /api/v1/executor-graphs/{graphId}
GET /api/v1/loops
POST /api/v1/loops
GET /api/v1/loops/{loopId}
POST /api/v1/loops/{loopId}/start
POST /api/v1/loops/{loopId}/resume
POST /api/v1/loops/{loopId}/replay
POST /api/v1/loops/{loopId}/approve
POST /api/v1/loops/{loopId}/cancel
GET /api/v1/loops/{loopId}/timeline
GET /api/v1/loops/{loopId}/evidence
GET /api/v1/loops/{loopId}/artifacts
GET /api/v1/loops/{loopId}/trace
GET /api/v1/loops/{loopId}/trace-tree
GET /api/v1/loops/{loopId}/events
GET /api/v1/loops/{loopId}/executor-graph
GET /api/v1/loops/{loopId}/sandbox-proof
POST /api/v1/loops/{loopId}/sandbox-proof/verify
GET /api/v1/loop-store
GET /api/v1/loop-store/readiness
GET /api/v1/loop-observability
GET /api/v1/saas/observability
GET /api/v1/loop-orchestration/presets
GET /api/v1/loop-orchestration/targets
POST /api/v1/loop-orchestration/advance
POST /api/v1/loop-orchestration/autopilot
POST /api/v1/loop-orchestration/instantiate
POST /api/v1/loop-workers/heartbeat
GET /api/v1/loop-workers/leases
GET /api/v1/loop-workers/queue
POST /api/v1/loop-workers/claim
GET /api/v1/loops/{loopId}/checkpoints
POST /api/v1/loops/{loopId}/time-travel/replay
POST /api/v1/loops/watchdog
POST /api/v1/im/feishu/webhook
POST /api/v1/im/wecom/webhook
```

Loop Runtime 是 EvoPilot 的 Loop Engineering 内核。它把 API、Codex、IM、定时任务、运行时信号、release target 和 evolution batch 统一成 `LoopRun`，并通过 `ExecutorGraph` 编排 LLM、code-upgrader、CI、validator、approval 和 release-action 等 executor。

`ExecutorGraph` 节点通过 `ExecutorAdapter` 执行。节点可以在 `config.adapterId` 中固定 adapter；未指定时，EvoPilot 按节点类型解析默认 adapter。adapter 必须返回结构化 `status`、`output`、`evidence` 和可选 `failureSignature`，因此后续 target loop 可以复用同一执行边界，而不是把执行结果写成不可审计的状态文本。

`GET /api/v1/loops/{loopId}/executor-graph` 返回当前 Loop 绑定的 graph contract、coordination plan、validation result、capabilities 和 evidence。Dashboard Loop 执行页的 Source-to-GA 动态本体链路图会把该接口与 project、target runtime、loop、worker queue、trace tree、events、sandbox proof、source-closure plan、source release run、deploy finalizer 和 release decision 数据合并，形成 `SCM/Git Project -> Discovery Candidate -> Target Backlog -> Executor Graph -> Worker + Sandbox -> Human Gate -> Source Closure -> CI/CD + Deploy -> Release Decision -> GA Release` 的运行视图。该视图只解释当前运行边界，不替代 `GET /api/v1/release/decisions` 的 GA verdict。

Dashboard 编排入口通过 `GET /api/v1/loop-orchestration/presets` 返回可用闭环预设，通过 `POST /api/v1/loop-orchestration/instantiate` 创建标准 source-to-production target loop。预设会自动绑定 typed executor graph、`sourceClosure`、Docker sandbox enforcement、worker/watchdog 语义、deploy connector 和 health-ready rollback。

`GET /api/v1/loop-orchestration/targets` 返回按 Sandbox、Context、Harness、Loop 四层组织的 target backlog。每个 target 包含 `status`、`nextAction`、`acceptanceCriteria`、`loopId` 和证据摘要。`POST /api/v1/loop-orchestration/advance` 会选择指定 target 或下一个待推进 target，若没有对应 LoopRun 则创建 Codex-backed target loop；若已有 LoopRun 则根据状态执行 start/resume，遇到 `WAITING_APPROVAL` 时返回 human stop condition，遇到成功但未发布时返回 source-closure next action。

当前 backlog 还包含下一轮 GA 对齐 target loop：`discovery-skill-runtime`、`per-finding-worktree-handoff`、`adversarial-evaluator-agent`、`recurring-loop-scheduler`、`loop-memory-inbox` 和 `budget-and-judgment-guardrails`。这些目标分别覆盖发现技能运行时、单 finding 隔离 worktree handoff、独立对抗评估、周期性 loop 调度、产品记忆 inbox，以及Token、时长和判断护栏。它们复用 `codex-target-loop` preset，因此 Dashboard 的 Target Loop Backlog 可以直接推进或自动驾驶，而不需要用户重新手工复制目标描述。

Target backlog 也承载 EvoPilot 云服务化自进化路径。当前 SaaS ladder 包含 `tenant-workspace-model`、`workspace-rbac-and-invitation`、`github-app-onboarding`、`secret-vault-and-credential-boundary`、`project-workspace-ownership`、`quota-rate-limit-billing-foundation`、`worker-queue-and-postgres-store`、`tenant-aware-release-evidence`、`multi-tenant-security-regression-suite`、`saas-production-observability`、`saas-onboarding-dashboard`、`saas-field-e2e-source-to-ga`、`saas-release-matrix`、`saas-ga-soak-active`、`saas-ga-release-decision` 和 `announce-saas-multi-tenant-ga-stable`。当生产环境已经注册 EvoPilot GitHub 仓库为 `evopilot-github` 时，可通过 `POST /api/v1/loop-orchestration/advance` 指定任一 SaaS `targetId`、`projectId=evopilot-github` 创建或推进对应自进化 loop。

已落地的 SaaS 控制面能力包括 tenant/workspace 默认模型、workspace RBAC/invitation、项目 ownership scope、workspace quota、AES-256-GCM 本地 secret vault、GitHub App installation readiness、tenant-aware release evidence、跨租户功能回归测试和 `/api/v1/saas/observability`。`worker-queue-and-postgres-store` 仍以 `/api/v1/loop-store/readiness` 为准；在 Postgres store 未配置前，该 target 和最终 SaaS GA decision 必须保持阻断。

这些 target 同时暴露为通用产品运行时 API：

```http
GET /api/v1/loop-target-runtime/summary
POST /api/v1/loop-target-runtime/discovery/run
GET /api/v1/loop-target-runtime/discovery/candidates
POST /api/v1/loop-target-runtime/handoffs
GET /api/v1/loop-target-runtime/handoffs
POST /api/v1/loop-target-runtime/adversarial-evaluations
GET /api/v1/loop-target-runtime/adversarial-evaluations
POST /api/v1/loop-target-runtime/schedules
GET /api/v1/loop-target-runtime/schedules
GET /api/v1/loop-target-runtime/memory-inbox
POST /api/v1/loop-target-runtime/memory-inbox/{itemId}/triage
POST /api/v1/loop-target-runtime/guardrails/{loopId}/evaluate
GET /api/v1/loop-target-runtime/guardrails
```

Discovery runtime 会把仓库、trace、evaluation、production 和 manual signals 归一成 `evopilot-discovery-skill-candidate/v1`，并把 provenance 写入 `evopilot-loop-memory-inbox-item/v1`。Handoff API 为单个 finding 分配 workspace、target branch、allowed paths、validation commands 和 rollback ref。Adversarial evaluation 返回 `PASS`、`WARN` 或 `BLOCK`，其中 `BLOCK` 会使用 HTTP 409，表示缺少 source closure、release decision 或其他独立证据。Recurring schedule 记录 cadence、trigger rules、budget、next-run time 和 idempotency key。Guardrail evaluation 对 cost、tokens、duration、changed files、confidence 和 release judgment 给出 `ALLOW`、`HUMAN_REVIEW` 或 `BLOCK`。

`POST /api/v1/loop-orchestration/autopilot` 是管理员级生产自动驾驶入口。请求体可包含 `targetId`、`projectId`、`targetVersion`、`deployConnectorId`、`controlPlaneUrl`、`files`、`maxSteps`、`approveHumanGate`、`autoMerge` 和 `postMergeDeploy`。返回 schema 为 `evopilot-loop-orchestration-autopilot/v1`，包含 `status`、`target`、`loop`、`releaseRun`、`stages`、`nextAction`、可选 `externalBlocker` 和 `evidence`。它会先调用 target advance，在有界步数内 start/resume loop；如果遇到 human gate 且未显式传入 `approveHumanGate=true`，会以 `BLOCKED / nextAction=human-approval` 停止。授权通过后，它会先运行 source closure preflight，再执行 source closure，默认生成 `.evopilot/source-closures/{loopId}.md` 作为可审计变更；随后执行 safe auto-merge 和 post-merge deploy。策略不通过时不会强行合并，而是返回 `BLOCKED / nextAction=policy-review` 并把 blocker 写回 release run。

当 preflight 发现 GitHub/GitLab 写回 token 缺失或 `tokenRef` 未解析时，autopilot 不再把它归类为普通执行失败，而是返回 `BLOCKED / nextAction=configure-source-credentials`，并附带 `evopilot-external-blocker/v1`。该 blocker 包含 `type=source-credential`、`projectId`、`provider`、`blockers`、`recovery.route=project-source-credentials` 和 Dashboard 恢复动作；`GET /api/v1/loop-orchestration/targets` 会从持久化 preflight evidence 中恢复同一个 blocker。用户在 Dashboard “接入项目 -> 配置凭据”保存 `tokenRef` 或 inline token 并达到 `READY` 后，可重新点击 target autopilot 继续 source closure、PR/MR、merge 和部署闭环。

Dashboard 的 Context Time Travel Workbench 使用 `GET /api/v1/loops/{loopId}/checkpoints` 读取每轮 checkpoint。checkpoint 包含 iteration、decision、context snapshot、context patch、executor outputs 和 replayable 标记。`POST /api/v1/loops/{loopId}/time-travel/replay` 接收 `fromIteration`、`contextPatch`、`evidence`、`artifacts` 和可选 `forceDecision`，执行 replay 后返回 `{ loop, checkpoint, replayDiff }`；`replayDiff` 会列出 context changed keys、原 iteration 与 replay iteration 的 executor output 差异和证据摘要。

Dashboard 的 Worker Queue Workbench 使用 `GET /api/v1/loop-workers/queue` 显示可 claim loop、worker lease、过期 lease、下一步动作和 duplicate source-closure side-effect guard。`POST /api/v1/loop-workers/claim` 接收 `workerId`、可选 `loopId` 和 `leaseSeconds`；指定 `loopId` 时优先 claim 该 loop，未指定时 claim 下一条可执行 loop，并返回 `evopilot-loop-worker-claim/v1`、刷新后的 queue 和 claim 证据。

Dashboard 的 Sandbox Boundary Workbench 使用 `GET /api/v1/loops/{loopId}/sandbox-proof` 读取 `evopilot-loop-sandbox-boundary-proof/v1`。Docker loop 会返回可执行 `docker run` 参数，包括 `--read-only`、`--network none|bridge`、CPU/内存/pids 限制、workspace mount、凭据作用域和 probe 脚本；K8s loop 会返回 Job manifest、readonly filesystem、resources 和 namespace。`POST /api/v1/loops/{loopId}/sandbox-proof/verify` 会把 runtime、network、credential、path、resource 五类检查写回 loop context、timeline 和 audit。

Dashboard 的 Streaming Trace Workbench 使用 `GET /api/v1/loops/{loopId}/trace-tree` 读取 trace tree，节点包含 loop、iteration、executor-step、checkpoint、worker-lease、failure-group、replay-diff 和 sandbox-proof。`GET /api/v1/loops/{loopId}/events` 默认返回 JSON event list；请求头包含 `Accept: text/event-stream` 时返回 SSE，每条事件包含 `timeline`、`executor-step`、`checkpoint`、`worker-lease`、`cost`、`failure-group`、`replay-diff` 或 `sandbox-proof` 类型。

`ExecutorGraph.edges` 支持 typed edge：`type=sequence|conditional|fan-out|fan-in`、`condition`、`inputSchemaRef` 和 `outputSchemaRef`。EvoPilot 会在 graph 中写入 `validation.status`、`validation.evidence` 和 `capabilities`，用于判断是否具备 typed edge、条件路由、fan-out/fan-in、nested subgraph 和 schema validation 能力。

每个 target loop 都必须显式形成源码到生产的闭环契约。`POST /api/v1/loops` 支持 `sourceClosure`，未提供时会根据已注册项目仓库自动补齐：

```json
{
  "sourceClosure": {
    "sourceProjectId": "evopilot-github",
    "repositoryProvider": "github",
    "sourceUrl": "https://github.com/yeliang-wang/evopilot.git",
    "sourceBranch": "main",
    "targetVersion": "2.2.0",
    "releaseStrategy": "github-push",
    "requiredGates": ["code-change", "push", "tag", "deploy", "health-ready"],
    "deploymentEnvironment": "production"
  }
}
```

该契约会进入 `LoopRun.sourceClosure`、每个 executor step 的 `input/output.sourceClosure`、独立 `LoopEvidenceSet.evidence` 和 Dashboard Loop 表格。这样任何项目的 target loop 都能追溯“控制面在哪里执行、源码在哪里、目标版本是什么、是否需要 push/tag/deploy/health-ready”，避免只把 loop 状态推进为成功却没有代码回写和生产部署闭环。

GitHub、GitLab 与本地目录项目还支持执行源码闭环：

```http
POST /api/v1/loops/{loopId}/source-closure/execute
```

该接口需要 `admin` 权限。请求体可传入：

```json
{
  "branchName": "evopilot/workbuddy-2.2.0",
  "files": [
    {
      "path": ".evopilot/source-closures/workbuddy.md",
      "content": "release evidence"
    }
  ],
  "commitMessage": "EvoPilot source closure for workbuddy",
  "tagName": "v2.2.0",
  "createReviewRequest": true,
  "deployConnectorId": "prod-webhook",
  "deployParameters": {
    "strategy": "rolling"
  },
  "deploymentUrl": "http://8.153.72.80",
  "healthUrl": "http://8.153.72.80/health",
  "readyUrl": "http://8.153.72.80/ready"
}
```

GitHub 路径会读取 base ref、创建 release branch、通过 Contents API 写入文件、创建 PR，并在需要 `tag` gate 时创建 tag。GitLab 路径会创建 branch、提交 commit actions、创建 MR，并在需要 `tag` gate 时创建 tag。本地目录路径会在注册的 `repository.root` 内创建或切换 release branch、写入文件、提交并在需要时打 tag；默认要求干净工作树，除非请求显式传入 `allowDirtyWorktree=true`。如果传入 `deployConnectorId`，EvoPilot 会调用部署连接器并把连接器返回的部署结果写入 deploy gate。执行后 `LoopRun.sourceClosure` 会包含：

预检接口不会创建分支或写文件，只验证项目绑定、provider、凭据解析、source branch 可读、deploy target 和 health-ready 条件。`POST` 会把预检结果写入 loop evidence 和 timeline：

```http
GET /api/v1/loops/{loopId}/source-closure/preflight
POST /api/v1/loops/{loopId}/source-closure/preflight
```

失败响应为 `409`，响应体 schema 为 `evopilot-source-closure-preflight/v1`，包含 `status`、`blockers`、`checks`、`nextAction` 和 `capabilities`。例如缺少 GitHub/GitLab 写回 token 时，blocker 为 `credentials:SOURCE_CLOSURE_TOKEN_REQUIRED`。

- `closureState`: `PLANNED`、`CODE_CHANGED`、`PUSHED`、`TAGGED`、`DEPLOYED`、`HEALTH_READY`、`HEALTH_FAILED`、`ROLLED_BACK`、`PROMOTED` 或 `FAILED`。
- `gateEvidence`: 每个 required gate 的 `PENDING`、`PASSED`、`FAILED` 或 `SKIPPED` 状态和证据。
- `artifacts`: branch、commitSha、pullRequestUrl、mergeRequestUrl、tag、deploymentConnectorId、deploymentId、deploymentUrl、deployStatusUrl、healthUrl、readyUrl、executedAt、executedBy。

响应体还会附带 `sourceReleaseRun`，schema 为 `evopilot-source-release-closure-run/v1`。该运行记录把源码发布闭环提升为可查询的产品资源，包含 provider、releaseStrategy、sourceRef、targetVersion、stages、review、policy、postMergeDeployment、artifacts、capabilities、nextAction 和 status。查询接口：

```http
GET /api/v1/source-release-runs
GET /api/v1/loops/{loopId}/source-release-runs
GET /api/v1/loops/{loopId}/source-closure/plan
GET /api/v1/source-release-runs/repair-candidates
POST /api/v1/source-release-runs/repair-candidates/repair
```

`source-closure/plan` 会返回该 loop 最新的 release run；如果还没有执行过，则根据当前 `sourceClosure` 生成计划视图。Dashboard 的 Release Closure Runtime 工作台使用这些接口展示阶段、next action、capabilities、source ref 和 artifacts。

`repair-candidates` 会返回需要人工或自动修复的 release run，默认包含 `FAILED`、`HEALTH_FAILED`、`ROLLED_BACK` 等失败或陈旧状态，并排除已经被后续成功运行修复的候选。返回项包含 run、loop、project、provider、source ref、target version、失败 stage、failure signature、next action、capabilities 和推荐 repair request。Dashboard 的 Release Run Auto Repair Workbench 使用该接口展示队列。

修复接口支持单条或批量修复：

```json
{
  "runIds": ["loop-a-source-release-1782645327477"],
  "execute": true,
  "repairRequest": {
    "allowDirtyWorktree": true,
    "files": [
      {
        "path": "docs/release-evidence.md",
        "content": "release evidence"
      }
    ],
    "commitMessage": "Repair source release closure"
  }
}
```

当 `execute=true` 时，EvoPilot 复用同一条 source-closure 执行路径，而不是直接改写状态：重新运行 SCM 写回、deploy connector、health/ready、release policy 和 evidence 写入。成功后会创建新的 `evopilot-source-release-closure-run/v1`，原失败候选不再出现在 repair queue；失败时保留 blocker、stage evidence 和 next action。生产 ECS 演练已验证：一个本地 Git 项目先因 dirty worktree 产生 `FAILED` release run，随后在 Dashboard 点击单行“修复”后生成 `PROMOTED` release run，并从 repair candidates 队列移除。

Release review 决策接口：

```http
POST /api/v1/loops/{loopId}/source-closure/review-decision
```

请求体：

```json
{
  "action": "auto-merge",
  "commitMessage": "Merge EvoPilot release branch",
  "postMergeDeploy": true
}
```

`action` 支持 `approve`、`reject`、`merge` 和 `auto-merge`。`approve` 会把 release run 的 review stage 标记为 `APPROVED`；`reject` 会标记为 `REJECTED` 并停止 merge next action；`merge` 会要求 release 已批准，除非传入 `force=true`。`merge` 和 `auto-merge` 都会先执行 release policy gate，默认要求 required gates 全部通过、没有失败 gate、closure 已 `PROMOTED`、review 已批准、有 source commit，并且 GitHub/GitLab 路径存在 PR/MR artifact；不通过时返回 `409 SOURCE_CLOSURE_RELEASE_POLICY_BLOCKED`，同时把 `policy.status=BLOCKED`、`policy.blockers` 和 evidence 写回同一条 release run。`forcePolicy=true` 只用于管理员显式旁路策略，但仍会记录为非必需 policy check。

GitHub 路径调用 PR merge API，GitLab 路径调用 MR merge API，本地目录路径会在 `repository.root` 中切回 `sourceBranch` 并执行 `git merge --no-ff <releaseBranch>`。合并后会写回 `review.status=MERGED`、`artifacts.mergeCommitSha`、`mergedAt`、`mergedBy` 和独立 evidence set。默认 `postMergeDeploy=true`，当 loop 要求 `deploy` 且存在 deploy connector 时，EvoPilot 会在 merge commit 上再次调用 deploy connector 并探测 health/ready，把 `postMergeDeployment.status`、deploymentId、deploymentUrl、healthUrl、readyUrl 和 rollback evidence 写回 release run；可传入 `postMergeDeploy=false` 跳过该阶段。

没有配置 `deployConnectorId` 时，部署 gate 只记录 `deploymentUrl` 并探测 health/ready URL。配置部署连接器后，deploy gate 必须由连接器真实返回成功才会 `PASSED`。内置连接器类型包括：

- `http-webhook`：调用外部部署系统，由外部系统返回 deployment/probe URL。
- `ecs-docker-compose`：在生产服务器的受限 `workingDir` 中执行 `git rev-parse`、可选 `git pull --ff-only` 和 `docker compose up -d --build`，把部署 commit 和命令输出写入 gate evidence。默认开启部署锁、幂等 stamp 和 compose 失败回滚。若生产机必须保留本地补丁文件，可配置 `preserveLocalPaths`，连接器会在 pull 前 stash 这些路径并在 pull 后恢复。

注册 ECS Docker Compose 连接器示例：

```http
POST /api/v1/connectors/deploy
```

```json
{
  "id": "ecs-prod-compose",
  "name": "ECS production Docker Compose",
  "type": "ecs-docker-compose",
  "workingDir": "/opt/evopilot",
  "composeFile": "docker-compose.prod.yml",
  "serviceName": "evopilot-server",
  "gitRemote": "origin",
  "gitBranch": "main",
  "gitPull": true,
  "preserveLocalPaths": ["Dockerfile"],
  "build": true,
  "skipComposeWhenUnchanged": true,
  "deployLock": true,
  "idempotency": true,
  "rollbackOnFailure": true,
  "rollbackOnHealthFailure": true,
  "url": "http://8.153.72.80",
  "healthPath": "/health",
  "readyPath": "/ready",
  "timeoutSeconds": 120
}
```

执行时可在 `deployParameters.releaseKey` 指定幂等 key；未指定时 EvoPilot 会用 loop、源码 commit、tag 和 target version 生成默认 key。`deployLock=true` 时，同一个 connector 在同一 `workingDir` 中只允许一个部署执行。`skipComposeWhenUnchanged=true` 适用于 EvoPilot 自托管部署：如果 `git pull` 后 commit 没有变化，连接器会记录 `composeSkipped=unchanged` 并交给 health-ready gate 验证，避免控制面在自己的 API 请求中重启自己。`rollbackOnFailure=true` 时，`docker compose up` 失败会触发 `git reset --hard <beforeCommit>` 并重新运行 compose，deploy gate 证据会包含 `rollbackStatus`。`rollbackOnHealthFailure=true` 时，compose 发布成功但 health/ready 探测失败会基于 deploy stamp 回滚到发布前 commit，并把 `rollbackStatus`、`rollbackTargetCommit` 和回滚命令输出写入 `health-ready` gate 证据；此时 `closureState` 为 `ROLLED_BACK`，不会被提升为 `PROMOTED`。

K8s/云发布执行器应接入该 deploy connector contract，而不是在 source closure 里硬编码平台逻辑。

剩余 target loop 对应的能力也属于 Loop Runtime 通用模型：

- `persistent-loop-store`：`GET /api/v1/loop-store` 返回当前 store backend、lock provider 和 idempotent replay 恢复语义。默认是 `file`；生产可通过 `EVOPILOT_LOOP_STORE_BACKEND=sqlite|postgres` 和 `EVOPILOT_LOOP_STORE_DSN` 声明 SQLite/Postgres store contract，DSN 会脱敏返回。
- `postgres-business-store`：`scripts/postgres-business-store.mjs` 提供文件态业务数据到 Postgres 的 `migrate`、`backup`、`restore` 操作。Postgres 表 `evopilot_business_records` 使用 `collection + tenant_id + workspace_id + record_id` 作为幂等主键，并以 JSONB 保存 tenants、workspaces、projects、loops、release evidence、release decisions、source release runs、target loops、audit events 和 idempotency records。发布前先执行 `npm run store:postgres:migrate -- --data-root data/evopilot --dry-run` 核对迁移数量。
- `replay-and-human-edit`：`POST /api/v1/loops/{loopId}/replay` 支持 `fromIteration`、`contextPatch`、`evidence` 和 `artifacts`，会从指定 iteration 重新执行，并把人工编辑写入 loop context、timeline 和 iteration。Dashboard 原生 Context Time Travel Workbench 还通过 `GET /api/v1/loops/{loopId}/checkpoints` 和 `POST /api/v1/loops/{loopId}/time-travel/replay` 暴露 checkpoint inspection、context edit 和 replay diff。
- `durable-worker-queue`：`GET /api/v1/loop-workers/queue` 返回 claimable loops、lease 过期状态、next action 和 duplicate source-closure side-effect guard；`POST /api/v1/loop-workers/claim` 支持 worker claim/renew/failover 和 crash-resume。
- `sandbox-runtime`：创建 loop 时可传 `sandbox.runtime=host|docker|k8s`、`credentialScope`、`network`、`allowedPaths`、`deniedPaths` 和 `resourceLimits`。每个 loop 会返回 `sandboxEnforcement`；Docker/K8s 边界齐备时为 `ENFORCED`，host 为 `POLICY_ONLY`，缺少关键边界时为 `FAILED` 并阻断非审批节点。Sandbox Boundary Workbench 还会生成 Docker/K8s 可执行边界 proof，并把五类边界检查写回 LoopRun。
- `multi-executor-coordination`：`ExecutorGraph.mode=serial|parallel`，LoopRun 会返回 `coordination.nodes[]`，包含每个 executor 的依赖、输入 schema、输出 schema 和共享 context keys；依赖会带上 edge type 与条件路由信息。
- `loop-observability`：`GET /api/v1/loop-observability` 聚合 loop trace；`GET /api/v1/loops/{loopId}/trace` 返回单个 loop 的 executor step 数、worker lease、watchdog、Token 用量和失败签名；`GET /api/v1/loops/{loopId}/trace-tree` 和 `GET /api/v1/loops/{loopId}/events` 支持 trace tree、streaming events、checkpoint/time-travel inspection、per-node cost/tokens、failure grouping 和 replay diff。

每轮 loop 都会生成：

- `LoopIteration`：本轮执行步骤、输入输出、失败签名和决策。
- `LoopEvidenceSet`：由 `evopilot-loop-runtime` 独立生成的证据集合，避免 executor 自证成功。
- `LoopTimelineEvent`：创建、启动、迭代、证据、决策、审批、heartbeat、watchdog 等事件。
- `LoopArtifact`：报告、diff、CI 日志、审批记录等产物索引。

`StopPolicy` 控制最大轮次、最大持续时间、发布审批要求和重复失败阻断；`RetryPolicy` 控制单节点重试、退避时间和 circuit breaker。`/api/v1/loop-workers/heartbeat` 写入 worker lease，`/api/v1/loops/watchdog` 会释放过期 lease 或按 stop policy 阻断超时 loop。

`npm run loop-worker` 启动独立 worker 进程，持续拉取 `PENDING` / `RUNNING` loop、写入 heartbeat lease、推进 start/resume 并交给 watchdog 恢复过期任务。`npm run loop:soak` 默认按 24 小时持续验证 Loop Runtime，可通过 `EVOPILOT_LOOP_SOAK_SECONDS` 缩短本地验证时间。

飞书和企业微信 webhook adapter 使用 `/api/v1/im/feishu/webhook` 与 `/api/v1/im/wecom/webhook` 接收消息并创建 `LoopRun`。生产环境应在 API 网关或 adapter 层增加企业签名校验、消息去重和回调凭据保护。

## ProofOps Target Loop Mode

```http
GET /api/v1/target-loops
POST /api/v1/target-loops
GET /api/v1/target-loops/{loopId}
POST /api/v1/target-loops/{loopId}/approve-plan
POST /api/v1/target-loops/{loopId}/resume
GET /api/v1/target-loops/{loopId}/final-report
POST /api/v1/target-loops/{loopId}/route-remediation
POST /api/v1/target-loops/{loopId}/release-actions/{action}/approve
POST /api/v1/target-loops/{loopId}/release-actions/{action}/execute
POST /api/v1/conversations/commands
```

EvoPilot 内置 ProofOps Mode。ProofOps 不再作为独立 AMP 控制面运行，而是作为目标驱动 release/maturity loop 契约被 EvoPilot 消费。

一次 target loop 的基本流程：

1. 创建 target loop，生成 ProofOps-compatible target plan。
2. 用户或审批策略确认 target plan。
3. EvoPilot 执行或恢复 target loop，聚合 release evidence 并生成 decision chain。
4. 输出 `proofops-final-release-report/v1` 格式的 final report。
5. 若未达成目标，阻塞项可通过 `route-remediation` 路由给 EvoPilot 自演进、代码升级和 CI/CD 复验能力。
6. 若结果为 `GO`，发布、tag、deploy、rollback 等发布动作仍需管理员审批；审批后再执行并写入审计。

Codex、飞书、企业微信等入口应把用户对话转成 `POST /api/v1/conversations/commands`。该接口是统一的 conversation gateway 后端入口，当前支持通过自然语言命令创建 ProofOps target loop；具体 IM webhook 只负责鉴权、签名校验和消息转发。

## 审计

```http
GET /api/v1/audit
GET /api/v1/audit?limit=50&order=desc
GET /api/v1/history
```

返回追加写入的审计记录，包括项目创建、运行创建、评审决策和交付执行。`limit` 是服务端读取限制，必须是正整数，超过 `1000` 会按 `1000` 处理；`order` 可为 `asc` 或 `desc`，默认 `asc`。CLI 的 `evopilot audit list --limit <n>` 会调用 `order=desc`，用于 WorkBuddy 在生产审计日志较大时只读取最新记录。

`GET /api/v1/history` 是 Dashboard “审计/历史详情”的统一产品历史接口，会按当前登录用户的 tenant/workspace 权限聚合 completed run release、source release run、release decision、code upgrade run 和 audit 摘要。支持 `projectId`、`targetId` 和 `limit` 查询参数，用于发布后证据复盘。

### Project definition selection concurrency

The existing `POST /api/v1/evolution-project-definitions/{id}/activate` and
`/rollback` routes accept `version` and `evidenceRef`. Expert 2.3.0 additionally
sends both `definitionDigest` (the reviewed destination) and
`expectedActiveDigest` (the currently selected definition digest). If either
binding field is supplied, Runtime requires both to be SHA-256 digests and
checks them before writing the future-planning pointer. Malformed, changed
candidate and stale-current bindings are rejected. Existing administrator
clients that omit both fields retain their legacy behavior; role and scope
checks apply to both forms. Existing execution bindings are not rewritten.

The public MCP tools are `evopilot_project_definition_activate` and
`evopilot_project_definition_rollback`. Route identity stays at the top level;
version, evidence and concurrency bindings belong under `payload`. An Expert
exact human decision is separate from server authentication and authorization.

### Scoped connected-project reads and writes

`GET /api/v1/projects/{projectId}` returns the same masked project representation
as the list endpoint, under current viewer-or-higher role and scope checks.
Project registration and ownership changes check both destination scope and
existing-project access before repository reads or writes. Platform administrators
retain their explicitly declared cross-workspace authority.

The MCP tools `evopilot_project_list`, `evopilot_project_inspect`,
`evopilot_project_onboarding_plan`, `evopilot_project_register` and
`evopilot_project_readiness` delegate to these Runtime routes and the existing
onboarding checklist. POST bodies use `payload`; project reads take `projectId`.
The Expert distinguishes a versioned declaration from a connected project and
forwards only credential references. Checklist warnings remain visible, including
local projects with unconfigured LLM; no registration result grants execution.


Runtime 6.3.1 的 token 统计和已移除金额门禁见[Token usage](../architecture/token-usage.md)。新任务不要求价格、费用或金额预算；token、时长和权限限制继续生效。
