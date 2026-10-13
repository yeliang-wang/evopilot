# Local product composition — v0.1.1 Preview

`dist/integration/composition.js` connects three independent 0.1.1 public product APIs and owns no business state. `loadInstalledProducts()` imports only the bare `@evopilot-next/runtime`, `@evopilot-next/harness`, `@evopilot-next/ontology` packages and their `/service` exports. Missing packages fail explicitly; there is no source-tree, historical installation or global provider fallback.

```js
import { createComposition, loadInstalledProducts } from '../dist/integration/composition.js';
const composition = createComposition(
  { workspaceRoot, workspaceId },
  await loadInstalledProducts(),
  trustedOntologyProviders, // Optional SDK code configuration; defaults to {}.
);
composition.capabilities(); // Discovery does not initialize storage.
const status = composition.inspect('runtime', scope);
const receipt = composition.request('runtime', callerEnvelope);
const classification = await composition.request('ontology', classificationEnvelope);
await composition.dispatch(callerDispatchArguments);
await composition.reconcile(callerReconcileArguments);
composition.close(); // Retains workspace data and receipts.
```

Options contain exactly `workspaceRoot` and `workspaceId`. Construction copies configuration without initializing storage. Discovery may construct owning services, whose factories validate their contracts, but does not initialize them. Explicit operations initialize only the owners they use.

The parent configures Runtime with its built-in deterministic validation, pinned-material resolution, execution and reconciliation providers. Execution routes evaluation through Harness and checks business validity through Ontology. Standalone Runtime still reports missing callbacks when its caller has not supplied these providers; discovering a provider is not acceptance.

## Requests and trusted SDK providers

`request(owner, envelope)` forwards the exact caller envelope to Runtime, Harness or Ontology. Only Ontology's `classification.start` and `classification.reanalyze` route to async `service.classify(envelope)`; await their results. All other requests retain synchronous `service.execute(envelope)` behavior. A transport can await either result. `dispatch(args)` and `reconcile(args)` remain asynchronous Runtime operations. Errors preserve their owning codes.

The optional third argument is trusted SDK host code. It preserves Ontology's `resolveClassificationSource`, `classificationModel`, `classificationAdvisor` and `resolveLegacyHarness` provider contracts; the real Ontology factory validates them. `classificationModel` is exactly `{providerId, modelId, revision, timeoutMs}` with slug identities and timeout 1–180000 ms. The other three keys are callbacks. Unknown keys, including source/model/advisor aliases, are rejected by the owner. The composition copies data descriptors, preserves callback identities and rejects getters and proxies without invoking them. It never interprets JSON callbacks or loads module paths. Providers cannot be supplied through workspace options or user request envelopes. Neither the CLI nor the default plugin configures these providers.

Capabilities list each provider as CONFIGURED or UNCONFIGURED alongside actual owning service capabilities, with `authority: false`. Configuration means only that trusted code was supplied and accepted by the owning factory. It does not establish source/model readiness, material integrity, approval or publication authority. Without configured providers, dependent operations retain the owner's explicit unavailable result. There are no fake defaults or legacy fallbacks. Historical Harness labels do not establish current authority.

Runtime project/goal creation, preparation, human decision, dispatch and reconciliation remain separate explicit owner operations. Ontology and Harness authoring/import, review, decision, publication and evaluation also use their own envelopes. Every mutation carries the caller's exact scope, requestId and expectedRevision. The root adds no automatic approval, latest-pin selection, CAS refresh, retry or business store.

## Material, execution and recovery

Resolution compares all six reference fields with actual owning `asset.inspect` deliveries and public `verifyDelivery` validators. Private material stays in its exact private project; public material may resolve in the consuming project's public scope or `public/shared`. Public callers cannot consume private material. Conflicting or ambiguous candidates fail closed. Published status comes from the owning delivery. Runtime descriptors hash the full immutable delivery and, for Harness, its dependency resolution, binding actual scope and workspace identity.

Execution verifies the retained Runtime claim and input, resolves pinned Ontology and Harness deliveries, and submits one Harness `asset.evaluate` request. Its stable request id derives from the claim. The receipt must match the operation, scope, input digest and reference. Native AbortSignal transport data is validated separately from the frozen JSON claim and never enters a digest or receipt. Cancellation is checked before owner access, between queries and immediately before evaluation. Extra, missing or changed claim data fails correlation.

Business validity and Harness quality remain separate. ERROR takes priority; business invalidity or quality FAIL stays FAIL; missing evidence stays INDETERMINATE; N/A never becomes PASS. Runtime SUCCEEDED means execution completed, independently of the business result.

After an uncertain response, reconciliation reads `evaluation.inspect` without another evaluation. It re-reads the original Runtime claim and immutable pins, repeats deterministic instance validation and reconstructs the evidence digest. Missing or changed evidence leaves Runtime UNKNOWN. Exact retained request receipts govern recovery; uncertainty does not authorize redispatch.

## Package fixtures and verification

All three current packages have their own CLI bins. Metadata fixtures use valid synthetic public entries and assert PRESENT for every owner; M4 rejects every missing bin. Foreign bins, exports and dependencies remain rejected. Source graph checks permit only `process.getuid` in each owner's `src/state.ts` and `process.stdin/stdout/argv/exitCode` in its `src/cli.ts`. The exact legacy Catalog PID and `kill(owner.pid, 0)` exceptions remain confined to the original file. Ambient environment, cwd/chdir, computed/global access, private paths and foreign internal imports remain forbidden. Read-only imports expect actual owned M2 business operations while retaining authority false, pure discovery and parent-read denial.

The detached real-product test assembly resolves public installed packages with `import.meta.resolve`, copies their own package files as regular bytes, and recursively resolves installed dependencies against pinned lock records. It supports local npm package bindings and regular artifact installations with sibling or nested dependencies. Generated .bin/.cache links, hidden state, Git and tests are omitted; package identities and dependency metadata are preserved. Missing packages or dependencies fail. There are no source or .local imports. Production no-symlink configuration checks and exact authenticated fixture cleanup remain unchanged.

Historical v0.1.0 evidence remains immutable and does not establish results for the current v0.1.1 candidate. Retain actual command results against the exact compiled candidate.

The default daemon does not configure classification callbacks or foreign Catalog resolution. The native core journey remains available. Current Harness Catalog and retained Ontology Catalog formats are distinct; historical labels never supply current approval.

Populated source verification requires child dependencies and parent bare-package bindings as documented in development.md. Actual tests are integration/e2e/composition-products.test.mjs and integration/e2e/connection-products.test.mjs; protocol and distribution fixtures remain separate. Current candidate/Host verification must include full E03/E10 and E01–E19 acceptance, using the exact candidate evidence. No production readiness or acceptance is inferred. The existing conditional release authorization applies only once its acceptance conditions are met.
