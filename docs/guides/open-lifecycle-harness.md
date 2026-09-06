# Operate an Open Lifecycle

This is the v4 development interface. It does not change the currently released v3 CLI contract and does not authorize a release.

## 1. Inspect available definitions

```bash
evopilot lifecycle list --json
evopilot lifecycle inspect evopilot-harness-oss --version 1.0.0 --json
```

## 2. Prepare human-readable inputs

Use YAML for both ordinary-human review and headless CI. Project facts and Organization defaults can fill known values; the server returns only the next unresolved, conditionally relevant question.

```yaml
lifecycleId: evopilot-harness-oss
projectId: evopilot-harness
goalId: goal-package-readiness
policyDigest: sha256:<64-hex>
runtimeDigest: sha256:<64-hex>
evidenceDigest: sha256:<current-project-evidence-digest>
harnessBundle:
  id: <published-bundle-id>
  version: <published-bundle-version>
  digest: sha256:<published-catalog-entry-digest>
  catalogId: <catalog-id>
executor:
  host: <agent-host>
  provider: <model-provider>
  model: <model-id>
  capabilities: [build.execute, test.execute, goal-loop.execute, release.publish]
answers:
  projectRoot: /workspace/evopilot-harness
  verificationProfile: release
  candidateVersion: 4.5.0
  testSuite: release
  publicationChannel: both
```

Do not place credentials in this file. A lifecycle input with `type: secret-ref` accepts only a value such as `secret://workspace/release`.

Resolve without creating state:

```bash
evopilot lifecycle inputs evopilot-harness-oss --file lifecycle-inputs.yaml --json
```

## 3. Create and review the binding

```bash
evopilot lifecycle start \
  --lifecycle evopilot-harness-oss \
  --project evopilot-harness \
  --goal goal-package-readiness \
  --file lifecycle-inputs.yaml \
  --json
```

If the response is `WAITING_INPUT`, submit one answer at a time with `lifecycle-run answer`. When it is `WAITING_BINDING_REVIEW`, submit the exact policy, runtime, and published Bundle refs with `finalize-binding`. Review `inputBinding.review` and `binding.digest` before any authorization.

## 4. Authorize the bounded plan once

```bash
evopilot lifecycle-run authorize <run-id> \
  --decision APPROVED \
  --binding-digest sha256:<exact-binding-digest> \
  --evidence-ref <human-decision-reference> \
  --json
```

Changing an input changes the binding digest and invalidates the decision. Supplying inputs or invoking `advance` never creates approval.

## 5. Advance to the next real boundary

```bash
evopilot lifecycle-run advance <run-id> --json
```

All safe internal stages run automatically. For `WAITING_EXTERNAL_SIGNAL`, the host executes only `pendingExecution`, then returns its reviewed receipt:

```bash
evopilot lifecycle-run signal <run-id> \
  --request-id <pending-request-id> \
  --status SUCCEEDED \
  --receipt-digest sha256:<result-digest> \
  --file execution-evidence.yaml \
  --json
```

For `WAITING_DECISION`, show the stage, authority, binding digest, evidence, and requested effect to the authorized human. Publication remains a separate action and is never implied by package readiness.

## HTTP and MCP equivalence

The corresponding HTTP resources are `GET /api/v1/lifecycles`, `POST /api/v1/lifecycles/resolve-inputs`, and `/api/v1/lifecycle-runs`. The installable `@evopilot/adapter-mcp` package maps its stdio MCP tools to these same operations; no transport has additional authority.

Coding-Agent execution is a separate boundary from MCP transport. The
installable `@evopilot/adapter-opencode` package implements the first-class
OpenCode runtime profile and execution receipt contract. Bind the exact
OpenCode version and `provider/model` route, keep credentials in the Host
environment, and leave permission prompts Host-managed. EvoPilot never passes
OpenCode automatic permission-bypass flags, and an Adapter result remains
evidence rather than approval.

For a third-party Agent host, install the exact candidate or released adapter tarball and configure its stdio process. Host-specific configuration syntax may differ, but the binding is equivalent to:

```json
{
  "mcpServers": {
    "evopilot": {
      "command": "evopilot-mcp",
      "env": {
        "EVOPILOT_SERVER": "https://evopilot.example.com",
        "EVOPILOT_API_TOKEN": "<host-secret>",
        "EVOPILOT_TENANT": "<tenant-id>",
        "EVOPILOT_WORKSPACE": "<workspace-id>",
        "EVOPILOT_ACTOR": "<human-or-service-actor>"
      }
    }
  }
}
```

Keep `EVOPILOT_API_TOKEN` in the Host's protected secret configuration. The MCP tool arguments contain only the server URL override, Lifecycle/run identifiers, optional idempotency key, version, and JSON payload. Approval-like payloads are decisions for exact server-side binding digests; merely calling a tool, answering an input question, or connecting a Host never authorizes implementation or publication.
