# Your first task: inspect EvoPilot safely

Use this tutorial after [Agent Host installation](agent-host-installation.md). It covers Runtime **6.3.3**, Expert **2.3.1**, and an already connected Host. The outcome is a Runtime-owned readiness report and, when ready, a read-only view of available projects and resources.

Before installing these exact versions, check [current publication and acceptance limits](../releases/current-release.md). Source documentation can precede public package promotion.

## 1. Ask for a bounded connection check

Select the Expert Skill in your Host. In Codex CLI/IDE, send:

```text
$evopilot-evolution-expert-codex
检查已连接的 EvoPilot。先读取 setup protocol 和 Runtime LLM readiness，
报告 Runtime 版本、当前状态、requestId 和 nextAction。
复用现有配置；本次只读，不运行 preflight、不重新绑定、不注册项目、不调用模型。
```

The Host should use these actual Runtime MCP tools with empty inputs on its configured connection:

| Tool | What it establishes |
| --- | --- |
| `evopilot_llm_setup_protocol` | Runtime's installed setup/administration contract and version; no credential submission |
| `evopilot_runtime_readiness_inspect` | Authenticated workspace readiness and its exact next action; no provider probe |

Tool discovery establishes the Host-to-stdio connection. Successful structured responses establish the adapter-to-Runtime connection. Report HTTP/tool errors as failures with their `requestId` when present; do not label them success because the server appears in the tools list.

## 2. Interpret the result

| Runtime state | Meaning and next action |
| --- | --- |
| `READY` | The current workspace has a valid governed binding. Continue with reads below. |
| `SETUP_REQUIRED` | Setup is missing. Explain Runtime's setup contract and the operator's remaining inputs. |
| `PREFLIGHT_REQUIRED` | Runtime requires a successful live check and/or explicit binding before normal work. A provider call is a separate setup action. |
| `LLM_BLOCKED` | Show the exact drift, revoked reference, failed proof or other blocker; follow the named repair path. |

A `READY` result from `evopilot-expert doctor` is a package declaration check and cannot substitute for this MCP result. Runtime 6.3.3 retains valid unchanged bindings after their initial proof ages or Runtime restarts. Do not demand a new key or rerun a paid preflight solely because an old `expiresAt` has passed. Readiness inspection itself does not test current provider availability. See [First-Run LLM Readiness](first-run-llm-readiness.md).

Existing Runtime and provider credentials stay where they are. Expert never asks you to paste a raw key or password into the conversation. New operators use [Self-Hosting](../operations/self-hosting.md) and the [documented setup integration](expert-host-integration.md); package installation alone does not qualify native secure input. This tutorial does not execute setup or repair.

## 3. Discover what is available

Only after Runtime reports `READY`, ask:

```text
列出当前范围的项目定义和已治理资源，解释它们的用途与版本。
本次只读；不要创建、激活或运行任何对象。空列表也请如实报告。
```

The relevant tools are `evopilot_project_definition_list` and `evopilot_resource_list`. Empty arrays are a valid discovery result, not permission to seed sample projects. To learn the concepts without contacting a provider, ask for the Expert's side-effect-free tutorial. An operator can also inspect the packaged tutorial using `evopilot-expert tutorial`; its `sideEffects: false` describes that tutorial, not a full project workflow.

For a prospective project, you can separately ask “Discover project questions from these facts; do not register it,” and supply only facts you know. Expert projects them as `payload` to `evopilot_project_definition_discover`. Runtime returns typed unresolved questions. Discovery is side-effect free; it does not read or run source commands, invent business facts, register a connected project, or grant source access. See [Project Definitions](project-definitions.md).

You have completed this tutorial when you have the Runtime version, readiness state, request IDs and any remaining action; when ready, also record the returned project/resource identities or empty results. This is a successful connection and discovery check, not a completed Goal or a Release verdict.

## Before the first executing Goal

Prepare these separately with the project owner and installation operator:

| Prerequisite | Required evidence or decision |
| --- | --- |
| Connected project | Explicit source location, authorized access, server-side SecretRefs where needed, operational project registration and its readiness results. A declarative ProjectDefinition alone is insufficient. |
| Published Harness and Lifecycle | Configured Registry/Catalog, eligible immutable Bundle with exact digests, resolved Lifecycle and typed inputs. Harness authoring/publication belongs to `evopilot-harness`. |
| Business meaning for semantic work | Explicit project/Catalog selection, Runtime compatibility, reviewed business map/Harness pair, exact binding and activation decisions. Do not infer business field or product type. |
| External execution | A separately qualified Agent Runtime profile/adapter with the exact Host, workspace, capabilities and bounded permission scope, bound to Runtime's pending request. The Host running Expert is not automatically that executor. |
| Evidence and completion | The required collector, policies and independent validators for this workflow. The default server does not configure a semantic executor or business collector; tools being advertised does not make them available. |
| Authority and budget | The concrete plan and exact decisions required by the selected Lifecycle, including token/time limits, bounded execution and permitted effects. Connection success and discovery grant none of these decisions. |

See [External Agent Runtime](agent-runtime.md), [Open Lifecycle Harness](open-lifecycle-harness.md), and [Expert workflow](evolution-expert.md). Continue reversible deterministic work within existing authority; ask only for unresolved fields or a genuine decision boundary. After an uncertain mutation, inspect Runtime's retained receipt instead of replaying it. Report business validation, Harness validation, Target/phase/Goal completion and Release separately.
