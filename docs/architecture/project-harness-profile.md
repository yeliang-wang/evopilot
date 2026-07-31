# Project Harness Profile

`ProjectHarnessProfile` is EvoPilot's project-level harness control-plane definition. It is long-lived, versioned, scoped to one tenant/workspace/project, and activated explicitly before it influences goal planning.

It answers a different question from a goal loop target:

| Concept | Question it answers |
|---|---|
| Goal loop target | What outcome should this project reach now? |
| ReleaseTargetProfile | What release thresholds and scenario evidence define the target? |
| Maturity Standards | What Alpha/Beta/RC/GA baseline must every governed goal keep? |
| ProjectHarnessProfile | What project-specific capabilities, commands, evidence, failure handling, diagnostics, observability, and governance rules must every goal use? |

## Lifecycle

```mermaid
flowchart LR
  Admin["Admin template apply/update"] --> Template["HarnessTemplate"]
  Template["HarnessTemplate"] --> Generate["Generate DRAFT"]
  Project["StoredProject + runtime/devops/llm"] --> Generate
  Goal["Goal loop target"] --> Generate
  Previous["Previous active profile"] --> Generate
  Generate --> Validate["Validate + compile + digest"]
  Validate --> Apply["Write VALIDATED version"]
  Apply --> Activate["Admin activate"]
  Activate --> Plan["GoalPlan.projectHarness binding"]
  Plan --> Gap["Profile gap found"]
  Gap --> Revision["New DRAFT revision suggestion"]
```

Fresh installs include multiple built-in `HarnessTemplate` baselines for Python enterprise projects, Java DDD services, Node SaaS control planes, Go middleware, observability/APM systems, and generic management software. Project onboarding automatically matches a published template from runtime/repository context and the goal loop target; an explicit template id is an administrator or advanced override. Administrators can publish more template ids and versions for language, architecture, or software-type baselines through an independent template maintenance channel. Template files are YAML/JSON control-plane inputs with `id`, `version`, template sections, `sourceReferences[]`, and a current-version changelog. Reusing the same `id@version` requires explicit force; normal changes should publish a new version.

Generated profiles are `DRAFT`. EvoPilot can use an LLM to draft them when a READY LLM profile exists; in debug mode without LLM it can create a deterministic template draft. Production `requireLlm=true` blocks generation if no READY LLM is configured.

Activation is the governance point. The server stores a profile version only after validation, and `activate` records the selected version as `ACTIVE` while marking the old active version `SUPERSEDED`.

## Storage

The control plane is authoritative. Repository files are import sources only.

Current file-store path:

```text
<dataRoot>/project-harness-profiles/<tenantId>/<workspaceId>/<projectId>/<profileId>/versions/v<version>.json
```

The stored version contains:

- `sourceContent`: the YAML/JSON source profile normalized by the server.
- `sourceDigest`: digest of the source profile.
- `compiledContent`: template defaults plus project overrides.
- `compiledDigest`: digest used by goal plans.
- `templateRef`: `templateId`, `version`, and `digest`.
- `validation`: checks, blockers, warnings.
- `diffFromActive`: changed sections against the previous active version.
- `generatedBy`: `user`, `llm`, or `deterministic-template`.

## Module Mapping

Admins can call:

```bash
evopilot harness profile explain default --project <project-id> --json
```

The explain projection maps profile sections to EvoPilot modules:

| Module | Profile sections |
|---|---|
| Project onboarding | `tenantId`, `workspaceId`, `projectId`, `templateRef` |
| Goal target planner | `capabilities`, `validation`, `phaseMapping`, `governance` |
| Executor and runtime | `runtime`, `rules` |
| Evidence contract | `evidence`, `validation` |
| Failure handling and diagnostics | `failureHandling`, `diagnostics` |
| Observability | `observability` |
| Release governance | `governance`, `phaseMapping`, `llmDraftPolicy` |

Users should not need to inspect scattered feature configuration files to understand the harness. The profile is the reviewable control-plane surface; module-specific code consumes the compiled profile.

## Goal Planning Binding

When a profile is active, `POST /api/v1/goals/{goalId}/plan` binds it into the generated plan:

```json
{
  "projectHarness": {
    "schema": "evopilot-goal-plan-project-harness-binding/v1",
    "profileId": "default",
    "version": 1,
    "templateRef": {
      "templateId": "python-enterprise-harness",
      "version": "1.0.0",
      "digest": "sha256:..."
    },
    "sourceDigest": "sha256:...",
    "compiledDigest": "sha256:...",
    "capabilities": ["source-boundary", "python-runtime", "release-governance"]
  }
}
```

This makes the plan reproducible. A later profile activation does not rewrite the already generated plan; a new goal plan must be generated to bind the new profile digest.

## Governance Rules

Project profiles may strengthen or bind real project commands, but they cannot weaken template mandatory gates:

- `tenantWorkspaceScopeRequired`
- `targetPlanRequiresApproval`
- `profileActivationRequiresApproval`
- `promotionRequiresReleaseDecision`
- `sourceClosureRequired`
- `noSilentProfileMutation`

If a goal execution reveals a missing harness capability, EvoPilot should create a revision suggestion or DRAFT profile version. It must not silently mutate the active profile.
