# Project Definitions

`evopilot-evolution-project-definition/v1` is the DDD aggregate for project variation. It declares source provider, ecosystem, delivery model, environments, policy/Lifecycle references, SecretRefs, preferred Hosts and runtimes, evidence sources, and project-owned declarative resources.

Definitions are immutable by `(id, version)`. Adjustment creates a new version. YAML is the human editing form; Runtime normalizes it and computes a canonical digest at registration. Credentials must be references such as `secret://github/project`, never values.

Start with [the generic template](../../examples/projects/new-project.yaml) or inspect the three reference instances in the same directory. None receives special Runtime behavior.

## Discover and register

Discovery is side-effect free. It preserves whether a value was detected,
defaulted, or still needs an answer and rejects raw secret-shaped fields.

```bash
evopilot project-definition discover --file detected-facts.yaml --json
evopilot project-definition register --file project.yaml --json
```

The same operations are available through HTTP and MCP. Conversation is only
an input surface: Runtime returns typed unresolved questions, and registration
creates the canonical digest-bound object.

Project resources use stable identities and canonical digests. Their content
is declarative; credentials remain `secret://`, `env://`, or `vault://`
references. An existing `(id, version)` cannot be overwritten.

## Resolve an ambiguous Harness match

When deterministic ranking returns `HARNESS_MATCH_AMBIGUOUS`, review the
machine-readable ranked candidates and create a new immutable Project
Definition version with one `HarnessSelection` resource. Do not use a label or
free-form prompt as a selector.

```yaml
resources:
  - apiVersion: evopilot.dev/v1
    kind: HarnessSelection
    metadata: { id: primary, version: 1.0.0 }
    spec:
      registryDigest: sha256:<registry-digest>
      catalogRef: { id: builtin, digest: sha256:<catalog-digest> }
      profileRef: { id: node-saas-control-plane, version: 1.2.0, digest: sha256:<profile-digest> }
      bundleRef:
        id: node-saas-control-plane
        version: 1.2.0
        digest: sha256:<bundle-digest>
        componentDigests: [sha256:<component-digest>]
      decisionEvidenceRef: decision://project-owner/harness-selection
```

The selection binds the complete published Registry/Catalog/Profile/Bundle/
Component closure. Runtime still enforces publication, eligibility, required
capabilities, negative boundaries, labels, and every digest. A stale,
unpublished, ineligible, or incomplete selection abstains instead of falling
back to a similarly named candidate. Only one selection resource may be active
in a Project Definition version.

Planning errors return `resolution.match.candidates` with stable rank, score,
priority, exact Catalog/Profile/Bundle/Component digests, eligibility reasons,
and whether a candidate matched the declaration. This is the input for the
project-meaning decision and the next immutable Project Definition version.

Harness obligations and Lifecycle orchestration are then composed
monotonically: evidence, validators, constraints, and capabilities are unioned;
requested permissions remain limited to the Harness permission set. A
Lifecycle cannot disable or weaken a Harness obligation.

## Adjust, inspect impact, and roll back

An adjustment creates a new immutable version. Review its semantic impact
before changing the active pointer:

```bash
evopilot project-definition diff <id> --from 1.0.0 --to 1.1.0 --json
evopilot project-definition activate <id> --version 1.1.0 --evidence-ref decision://project-owner/42 --json
evopilot project-definition rollback <id> --version 1.0.0 --evidence-ref decision://rollback/43 --json
```

Activation affects future planning only. A running Goal Target Loop retains
the exact Project Definition digest in its HarnessExecutionBinding. Changed
facts selectively stale affected evidence and require revalidation; unrelated
evidence remains usable.

## CI contract

CI uses the same JSON request/response shapes as CLI, API, and MCP. It must
store the definition digest, impact digest, active-version record, and later
the exact HarnessExecutionBinding digest. A CI success signal is evidence, not
project authority, acceptance, or Release authorization.
