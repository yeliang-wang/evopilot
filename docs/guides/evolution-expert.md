# EvoPilot Evolution Expert

Evolution Expert is the independently versioned ordinary-human entry for EvoPilot. Expert `2.2.0` speaks Human Interaction Protocol `2.2` to Runtime `>=6.2.0 <7.0.0` exclusively through MCP. Runtime and declarative resource versions remain independent.

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

Source implementation may verify the package without installing it into a real Host:

```bash
npm install --global @evopilot/evolution-expert@2.2.0
evopilot-expert version
evopilot-expert doctor codex 6.2.0
evopilot-expert tutorial
```

Use `claude-code`, `workbuddy`, `generic-agent`, or `generic-mcp` for other generated bundles. Upgrade, rollback, and removal affect only the Expert installation. They must not mutate Runtime bytes or durable Runtime objects. After restart or Host transfer, the Expert reloads the current object from Runtime instead of reconstructing state from conversation history.

## Third-party Host

An integration author generates an Adapter and Host Integration Bundle from the public Core, exposes structured tool results, MCP, human-decision presentation, and Runtime-state resume, then passes conformance without changing Runtime or Expert Core source. Host qualification is evidence only; it is not Candidate acceptance or Release authorization.
