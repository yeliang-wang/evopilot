# EvoPilot Evolution Expert

Evolution Expert is the independently versioned ordinary-human entry for EvoPilot. This guide covers Expert `2.3.0` and Runtime `6.3.2`, accepted and published with [verified distribution and explicit acceptance limits](../releases/current-release.md). The approved successor includes the retained public CLI and secure-input recovery work; there is no standalone Expert 2.2.1 delivery. Expert uses MCP exclusively. Explicit Runtime 6.2.0 compatibility remains available for legacy non-semantic operations; semantic operations require Runtime 6.3 capability negotiation. Runtime and declarative resource versions remain independent.

One immutable Core generates Host Integration Bundles for Codex, Claude Code, designated-human WorkBuddy, generic Agent, and generic MCP. Each bundle contains the same Core and Adapter digests plus install, doctor, health, version, upgrade, rollback, removal, help, and tutorial lifecycle metadata.

## Conversation model

Users can start without knowing commands:

- “检查连接，然后带我走一遍无副作用教程。”
- “帮我接入这个新项目，并创建第一条 Pipeline。”
- “列出 Lifecycle，解释当前激活版本和依赖。”
- “创建 1.1.0 successor，先给我看差异，不要激活。”
- “为什么选择这个 HarnessBundle？它对 Pipeline 增加了哪些约束？”
- “继续 Goal Target Loop，并解释外部 Agent Runtime 的待执行请求。”
- “这个异常能否自动恢复？真正需要我决定的是什么？”
- “记录这次 Pipeline 问题，生成不可变后继版本并展示完整差异。”
- “比较 Champion 和 Challenger；上下文不一致时不要混合证据。”
- “当前策略是否允许自动激活？激活后如何监控和回滚？”
- “验收还差哪些逐项证据？现在是否允许发布？”
- “检查 Runtime LLM readiness；如果还没配置，请一步一步引导我。”
- “不要让我把密钥发进对话，使用 Host 的安全输入完成 Profile 配置。”

The Expert classifies intent, asks only unresolved Runtime schema fields, calls the matching MCP tool, and renders Runtime-owned facts or exact decision frames. Ordinary parameter input is never approval. An exact human decision must bind the object digest, authority, consequence, actor, and evidence reference.

## Ownership boundary

The Agent Host owns conversation and displays decisions. Expert owns guidance and presentation. Runtime owns every project, Lifecycle, Harness binding, Goal, Target, Loop, recovery, acceptance, and release object. A separately qualified external Agent Runtime performs bounded source work from an exact `pendingExecution`.

Expert never:

- stores canonical state in chat;
- selects, authors, approves, or publishes Harness assets;
- executes source work itself;
- collects raw credentials instead of SecretRefs;
- infers approval or publication authority;
- falls back to direct ordinary-human CLI or HTTP operation.

On first run, Expert inspects `RuntimeReadiness` before any project operation. In `SETUP_REQUIRED`, `PREFLIGHT_REQUIRED`, or `LLM_BLOCKED`, it limits itself to the setup protocol: provider discovery, governed Profile inspection or creation, Host-native secure credential input, live preflight, explicit workspace-default binding, and repair. It refuses credential-looking text in conversation. Only `READY` permits normal project and Goal Target Loop operations. The Host LLM remains the Host's concern and never satisfies Runtime readiness; see [First-Run LLM Readiness](first-run-llm-readiness.md).

CLI, HTTP, CI, events, and webhooks remain available to administrators and machines for diagnostics and recovery. Their availability does not create a second ordinary-human product path.

## Package and Host lifecycle

Expert 2.3.0 is published and verified. Administrators may use the following
package-only diagnostic commands. Installing a package does not by itself
activate a Host integration or establish live Host qualification.

```bash
npm install --global @evopilot/evolution-expert@2.3.0
evopilot-expert version
evopilot-expert doctor codex 6.3.2
evopilot-expert tutorial
```

Use `claude-code`, `workbuddy`, `generic-agent`, or `generic-mcp` for other generated bundles. Upgrade, rollback, and removal affect only the Expert installation. They must not mutate Runtime bytes or durable Runtime objects. After restart or Host transfer, the Expert reloads the current object from Runtime instead of reconstructing state from conversation history.

For an explicit legacy declaration check, use `evopilot-expert doctor codex 6.2.0`; this does not establish support for semantic operations.

CLI `doctor` and `compatibility` default to Runtime `6.3.0` and check declared
adapter capabilities, not observed Host capabilities or live Runtime readiness.
Their `READY`/`CONFORMANT` result grants no operational or release authority.
Malformed or incompatible stable versions and unknown packaged Hosts fail with
a nonzero exit status. The SDK remains extensible to independently qualified Hosts.

## Source verification and release acceptance

The checked-in SDK, generated adapters and local synthetic tests can verify guidance, finite MCP projections and refusal behavior. They do not prove installed-package or real-Host acceptance. The exact Runtime 6.3.0 / Expert 2.3.0 artifacts separately passed their approved installed acceptance and were published after release authorization. The later published Runtime 6.3.1 was independently accepted with the unchanged Expert 2.3.0 package; its 409-criterion/9-case scope does not rewrite the original Expert acceptance. Real Host acceptance is Codex-only; native credential interaction and a new 90-minute soak remain skipped, not passed. WorkBuddy and other live Host acceptance are not claimed for this delivery.

For maintained source-level runner scope and case definitions, see the [versioned acceptance corpus](../../tests/e2e/versions/README.md). Historical [Runtime 6 / Expert 2 acceptance](../operations/v6-acceptance.md) describes the immutable 6.0.0 / 2.0.0 baseline, not a PASS for the current pair.

## Third-party Host

An integration author generates an Adapter and Host Integration Bundle from the public Core, exposes structured tool results, MCP, human-decision presentation, Runtime-state resume and Host-native secure secret input, then passes conformance without changing Runtime or Expert Core source. Host qualification is evidence only; it is not Candidate acceptance or Release authorization.

Runtime **6.3.2** independently verifies LLM readiness continuity with this unchanged public Expert 2.3.0 package. Its patch-specific acceptance preserves the earlier Expert and Runtime 6.3.1 evidence; it does not rerun or relabel their original campaigns. See [current publication and limits](../releases/current-release.md).
