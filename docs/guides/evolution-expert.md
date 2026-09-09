# EvoPilot Evolution Expert

The Evolution Expert is an optional, independently versioned conversational entry for EvoPilot. Version `1.0.1` targets Runtime protocol `>=5.0.0 <6.0.0`; it is not tied to the EvoPilot product version.

The same immutable Core generates Codex, WorkBuddy, generic Agent, and generic MCP adapters. Typical conversations are:

- “带我完成一个新项目接入”：the Expert asks only unresolved Project Definition fields, previews the immutable declaration, and registers it through Runtime.
- “为什么选这个 Harness”：it explains ranked candidates, rejections, Bundle closure, and Lifecycle composition returned by Runtime.
- “继续这个 Loop”：it shows binding drift checks, automatic recovery, pending evidence, and the next true authority boundary.
- “这个异常以后自动处理”：Runtime generates a full Automation Rule proposal; the Expert presents one exact decision and cannot activate it from generic confirmation.
- “我该怎么发布”：it explains Candidate-first acceptance and exact-byte promotion, but publication still requires an exact Runtime-bound human authorization.

Headless users can perform every product operation through MCP, CLI, HTTP API, or CI. Removing the Expert changes guidance, not product semantics or state.

Portable artifacts are generated under `packages/evolution-expert/generated/`. Installation into a real Codex or WorkBuddy Host is a separate operation and is not part of source implementation.

## Installed lifecycle

```bash
npm install --global @evopilot/evolution-expert@1.0.1
evopilot-expert version
evopilot-expert doctor codex 5.0.1
evopilot-expert tutorial
```

Use `workbuddy`, `generic-agent`, or `generic-mcp` as the Host name when
appropriate. `doctor` checks exact package, Core, protocol, Adapter, Runtime
range, and Host capability compatibility without mutating Runtime state.

Upgrade, rollback, and removal are ordinary package operations:

```bash
npm install --global @evopilot/evolution-expert@1.0.1
npm install --global @evopilot/evolution-expert@1.0.0
npm uninstall --global @evopilot/evolution-expert
```

After restart, clean reinstall, or Host transfer, resume by reading the
durable Runtime run; never recreate canonical state from chat history. CLI,
API, MCP, and CI remain complete when Expert or one Adapter is absent or
incompatible.

## Third-party Host

Generate an Adapter with `createExpertAdapter(host)`, expose the three declared
Host capabilities, run `assertExpertAdapterConformance`, and emit
`qualifyExpertHostAdapter` evidence. The packaged
`host-adapter-kit/README.md` is the authoring contract. A conformant Host adds
zero Engine source branches and owns no business, Lifecycle, Harness,
recovery, authority, or release semantics.
