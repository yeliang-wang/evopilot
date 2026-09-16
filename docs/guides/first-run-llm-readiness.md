# First-Run LLM Readiness

EvoPilot Runtime 6.2.0 has no bundled, developer-owned, Host-inherited, or environment-selected LLM. A production installation may start without a configured provider so an administrator can reach the setup surfaces, but normal project, Harness, Goal, Target, Loop, and release operations remain fail-closed until Runtime readiness is `READY`.

## The three model identities

| Identity | Owner | Purpose | May satisfy Runtime readiness? |
| --- | --- | --- | --- |
| Host LLM | Codex, Claude Code, WorkBuddy, or another Agent Host | Conversation and tool selection | No |
| Runtime LLM | EvoPilot workspace governed Profile | Runtime reasoning within governed loops | Yes, after live preflight and explicit binding |
| Agent Model | Qualified external Agent Runtime | Bounded project execution | No |

None is copied or inferred from another. EvoPilot never defaults to the developer's GLM profile, the Agent Host's selected model, a convenient environment variable, or the first Profile it finds.

## State machine

```text
SETUP_REQUIRED
  -> PREFLIGHT_REQUIRED     Profile exists but is not explicitly bound with fresh proof
  -> READY                  exact Profile digest + active SecretRef + fresh live preflight + explicit workspace binding
  -> LLM_BLOCKED            binding drift, revoked SecretRef, disabled Profile, or stale/failed preflight
  -> READY                  explicit repair and revalidation
```

The Runtime persists `RuntimeReadiness` and `WorkspaceLlmDefaultBinding` as digest-bound records. A binding pins tenant, workspace, Profile ID and digest, provider, model, SecretRef, preflight evidence, actor, reason, and previous binding digest. Cross-tenant or cross-workspace reuse is rejected.

## Ordinary-human setup through Evolution Expert

Open Evolution Expert 2.2.0 in a supported Host and say:

> 检查 EvoPilot LLM readiness，并引导我安全完成首次配置。

The Expert then:

1. calls the MCP readiness and provider-discovery tools;
2. asks the Runtime schema questions needed to select a provider, endpoint, and model;
3. delegates the raw credential to Host-native secure input and receives only a `SecretRef`;
4. creates or updates a governed workspace Profile;
5. runs a real provider preflight and presents the result;
6. asks for an explicit workspace-default binding decision bound to the Profile digest;
7. re-reads `RuntimeReadiness` and reports `READY` before continuing normal work.

If a user pastes credential-like text into the conversation, Expert refuses it and discards the payload. It never echoes, transforms, logs, persists, or forwards raw credentials.

## Administrator and headless surfaces

The corresponding MCP tools are:

- `runtime_readiness_inspect`
- `llm_provider_discover`
- `llm_profile_list`
- `llm_profile_inspect`
- `llm_profile_upsert`
- `llm_profile_preflight`
- `llm_workspace_default_bind`
- `runtime_readiness_repair`

The administrator CLI exposes `evopilot runtime readiness`, `evopilot llm providers`, `evopilot llm workspace-default inspect`, `evopilot llm workspace-default bind`, and the explicit `evopilot llm migrate-v61` migration helper. CLI and HTTP remain diagnostic and automation surfaces; Evolution Expert over MCP is the ordinary-human entry.

Setup-only HTTP paths include health/readiness, authentication, LLM provider discovery, Profile and SecretRef administration, runtime readiness, workspace-default binding, and the explicit v6.1 migration endpoint. Other production requests receive `409 LLM_PROFILE_REQUIRED` until readiness is `READY`.

## Degradation and repair

Runtime reconciles readiness before normal operations. Profile drift, disabled or deleted Profiles, missing or revoked SecretRefs, stale preflight evidence, and binding mismatch produce `LLM_BLOCKED`. Running work is not silently switched to another model. The Expert explains the exact failed evidence, guides repair, performs a new live preflight, and requires an explicit replacement binding when the Profile digest changes.

## Upgrade from 6.1

Upgrade never imports a hidden global default. An administrator must explicitly choose the existing workspace Profile. If exactly one eligible Profile exists, `migrate-v61` may propose it; zero or multiple candidates stop as ambiguous. The selected Profile still needs an active SecretRef and fresh live preflight before an explicit binding can make Runtime `READY`.

Debug mode retains developer-only compatibility behavior and is not production readiness evidence.
