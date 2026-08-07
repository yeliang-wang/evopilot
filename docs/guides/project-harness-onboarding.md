# Project Harness Onboarding

Use this flow after a project is registered and before governed goal execution.

## 1. Inspect Templates

```bash
evopilot harness template list --json
evopilot harness template inspect python-enterprise-harness --json
evopilot harness template inspect java-ddd-service-harness --json
```

Template inspection is optional during normal onboarding. EvoPilot automatically matches a published template when `harness profile generate` receives the project context and goal loop target. Fresh installs include multiple built-in platform baselines:

```text
python-enterprise-harness
java-ddd-service-harness
node-saas-control-plane-harness
go-middleware-harness
observability-apm-harness
database-product-harness
api-gateway-harness
generic-management-software-harness
```

Each built-in template defines defaults for capabilities, runtime command groups, validation, evidence, failure handling, diagnostics, observability, governance, phase mapping, LLM draft policy, and `sourceReferences[]`. EvoPilot v2 separates domain templates from implementation runtime templates. Domain templates such as `database-product-harness@2.1.0` and `api-gateway-harness@2.1.0` define the product harness first, then include compatibility, architecture, runtime profiles, required project actions, evidence adapters, release blockers, and repository module probes. Language templates such as Python, Java, Node, and Go remain runtime-layer baselines. EvoPilot does not dynamically fetch GitHub at runtime.

For database projects, the domain template evolves the owner's database product. PostgreSQL, MySQL, and similar systems are recorded as compatibility references, corpora, or differential oracles, not as the default product being evolved.

For administrator maintenance, the public templates also exist as human-readable packs under `harness-templates/public/<template-id>/`:

```text
README.md
template.yaml
CHANGELOG.md
examples/default-project-profile.yaml
```

The normal project operator does not open or choose these packs during onboarding. They are for administrators and AI agents maintaining the public knowledge base:

```bash
evopilot harness template pack list harness-templates/public --json
evopilot harness template pack validate harness-templates/public/python-enterprise-harness --json
evopilot harness template pack publish harness-templates/public/python-enterprise-harness --json
```

Administrators can also publish additional template ids or versions for other languages, architecture styles, or software types through a direct YAML/JSON CLI/API channel. Template updates are control-plane changes with changelog management:

```bash
evopilot harness template upgrade \
  --file python-enterprise-harness-1.2.0.yaml \
  --changelog "Add organization-specific runtime and observability defaults." \
  --json
```

Publishing the same `id@version` again is rejected unless `--force` is supplied. Existing active project profiles keep their previous `templateRef`; use `harness profile generate` or `harness profile upgrade` to draft a reviewed project-level revision from a newer template.

When administrators want EvoPilot to evolve a public template from reviewable sources, use the template evolution lifecycle instead of directly editing a pack:

```bash
evopilot harness template evolution create \
  --base-template python-enterprise-harness \
  --target-version 1.1.0 \
  --intent "Add stronger Python exception tracking and AI troubleshooting metadata." \
  --source github=fastapi/fastapi#master \
  --source url=https://opentelemetry.io/docs/languages/python/ \
  --file ./workspace-observability-notes.md \
  --note "Require requestId/traceId/errorCode/nextAction in error logs." \
  --json
evopilot harness template evolution advance <evolution-id> --json
evopilot harness template evolution advance <evolution-id> --json
evopilot harness template evolution advance <evolution-id> --llm-profile platform-harness-llm --json
```

Stop at `REVIEW_REQUIRED`, review `evolution.draft.template`, `evolution.draft.pack`, `validation`, `diffFromBase`, `sourceCoverage`, and `generatedBy`, then approve and publish only with explicit administrator confirmation. Published evolutions report stale active project profiles; they do not silently update project profiles.

## 2. Optional: Inspect Tenant Policies

Tenant/workspace `TenantHarnessPolicy` records are private administrator constraints. Normal onboarding does not require the operator to choose one; active policies are matched and inherited automatically.

```bash
evopilot harness policy list --json
```

Administrators can publish and activate a private policy when every matching project profile must satisfy organization-specific evidence, logging, exception, diagnostics, observability, or governance constraints:

```bash
evopilot harness policy apply \
  --file tenant-harness-policy.yaml \
  --changelog "Add private tenant evidence and structured logging requirements." \
  --json
evopilot harness policy activate default --version <policy-version> --json
```

Policy versions are stored under `<dataRoot>/tenant-harness-policies/<tenantId>/<workspaceId>/<policyId>/versions/v<version>.json`. Existing active project profiles are not silently rewritten; if a policy is upgraded, generate or apply a reviewed project profile revision.

## 3. Generate A Draft

```bash
evopilot harness profile generate \
  --project my-agent \
  --goal-loop-target "Define the project harness for this project" \
  --llm-profile my-agent-llm \
  --json
```

The generated version is `DRAFT`. It is not active and does not control goal planning yet.

For first onboarding, EvoPilot matches the template automatically from domain signals, runtime language, repository hints, DevOps context, software-type signals, and the goal loop target. Strong product-domain signals select a vertical template first; runtime language then becomes the implementation layer inside the generated profile. It also includes active tenant/workspace policies whose `appliesTo` rules match the project. `generatedBy.evidence[]` reports the template result as `templateSelection=auto-match` and includes selection reasons such as `domain=database-product`, `domainSignal=api gateway`, runtime language, or matched template signals. When policies are active, `generatedBy.evidence[]` also includes `tenantPolicy=<policy>@v<version>`. `--from-template` is only an explicit administrator or advanced override.

For second onboarding or project evolution, EvoPilot reuses the previous active profile's template unless an administrator explicitly overrides it, reads the previous active profile, and produces a diff-aware draft instead of creating an unrelated profile.

## 4. Review Or Edit YAML

You can export or write a YAML source profile and then validate/apply it:

```yaml
schema: evopilot-project-harness-profile/v1
profileId: default
projectId: my-agent
name: My Agent Python Harness
template:
  templateId: python-enterprise-harness
runtime:
  language: python
  installCommands:
    - pip install -e .
  lintCommands:
    - ruff check .
  typecheckCommands:
    - mypy .
  unitCommands:
    - pytest
  smokeCommands:
    - pytest -q tests
validation:
  commands:
    - installCommands
    - lintCommands
    - typecheckCommands
    - unitCommands
    - smokeCommands
evidence:
  requiredArtifacts:
    - target-evidence-package
    - phase-package
    - goal-completion-report
governance:
  tenantWorkspaceScopeRequired: true
  targetPlanRequiresApproval: true
  profileActivationRequiresApproval: true
  promotionRequiresReleaseDecision: true
  sourceClosureRequired: true
  noSilentProfileMutation: true
```

Repository files such as `.evopilot/project.harness.yaml` are optional import sources. The server-side control plane remains authoritative.

## 5. Validate, Diff, Apply

```bash
evopilot harness profile validate --project my-agent --file profile.yaml --json
evopilot harness profile diff --project my-agent --file profile.yaml --json
evopilot harness profile apply --project my-agent --file profile.yaml --json
```

`validate` does not write. `apply` writes a new `VALIDATED` version when checks pass. If an active policy requires a field or governance boolean that the profile weakens, validation fails and returns `tenant-harness-policy-compliance` blockers.

## 6. Activate

```bash
evopilot harness profile activate default --project my-agent --version 1 --json
```

Activation requires admin permission. It makes exactly one version active for that project/profile and supersedes the previous active version. If the active tenant/workspace policy changed after this profile was compiled, activation fails with `PROJECT_HARNESS_PROFILE_POLICY_STALE`; generate or apply a new profile revision first.

## 7. Plan Goals

```bash
evopilot target plan \
  --project my-agent \
  --objective "Ship the first production-ready Python agent workflow" \
  --json
```

The generated plan includes `phasePlan.projectHarness` or `plan.projectHarness` with the active profile version, template reference, policy references, and digest. Review that binding before approving the plan. If goal planning returns `PROJECT_HARNESS_PROFILE_POLICY_STALE`, regenerate or apply a reviewed profile revision before planning again.

## 8. Evolve The Harness

When a goal reveals missing harness coverage, create a new draft or upgrade candidate:

```bash
evopilot harness profile generate \
  --project my-agent \
  --goal-loop-target "Add performance diagnostics and rollout monitoring to the project harness" \
  --json

evopilot harness profile upgrade default \
  --project my-agent \
  --from-template python-enterprise-harness \
  --from-template-version 1.1.0 \
  --json
```

Do not edit the active profile silently. Create a new version, validate, diff, and activate after review.
