# ADR 0004: Correct native v1 standards and project conformance

Status: accepted for implementation by the user in the complete v0.3.0 Preview review. Scope is bound by [the Target](../../governance/standards-v03.json). This records a decision, not completed acceptance.

## Context

The earlier v1 validators could validate submitted rows without proving that a project scope was complete or that supplied observations came from actual execution. A valid schema, successful provider run or aggregate PASS must not certify business completeness. A second custom rule language would retain avoidable semantic and interoperability costs.

## Decision

Correct the current `specifications/v1` directly. Use RDF/Turtle and a declared RDFS/OWL subset with SHACL and pinned pySHACL for Ontology; use native Rego v1 with pinned OPA/Conftest for Harness. EvoPilot specifies only its integration package, source, scope, directory, configuration and evidence contracts. Preserve their distinction from upstream language semantics.

Each owner exposes the actual normative content digest and tool lock. Software, specification and immutable asset-content versions remain distinct. References and execution contracts bind owner-specific standard digests, producer identity and the canonical contract digest. Never dispatch by the v1 string alone.

Project scope and required cases are fixed independently before authoring. Every required result must bind the exact candidate, actual source and current assets. Imported or synthetic observations cannot masquerade as executed evidence. Native reports are retained and independently replayable; execution status, quality result and final project acceptance are separate.

Runtime owns controlled collection decisions/claims/receipts and project completion. Parent implements the trusted local process adapter and composes owner APIs. Bind source, executable/argv, tool identity, sanitized environment and output limits before collection; bind actual retained outputs afterward. A future report digest is not an execution precondition. Unknown outcomes reconcile the original claim without redispatch.

## History and compatibility

Preserve old asset, decision, claim and receipt bytes. Known historical producer/snapshot identities permit readback and necessary recovery, not new validation tasks or inherited current acceptance. Corrected state has an explicit format/producer marker that old clients cannot misread. Rollback restores a coherent old snapshot while retaining new work separately.

This refines ADR 0001's promise to retain pinned old semantics: old semantics remain available for historical reading, not as a parallel active standard for new tasks. All other three-product ownership boundaries remain. Current canonical/vendor contracts change together through the parent generator; old Git commits and published artifacts do not change.

## Alternatives

Keeping a custom profile interpreter was rejected because it duplicates standard semantics and still requires independent completeness and execution proof. Introducing a v2 merely to avoid correcting v1 was rejected by the user. Adopting full ontology/build/SRE platforms now was rejected as outside product scope; bounded future adapters are recorded in the owning Roadmaps.

## Validation and delivery

First prove the fixed upstream tools, restricted features, positive/negative cases and minimal actual collection/run/recovery flow. Then implement owned interfaces, source-based re-extraction and installed user journeys. The fixed 65 criteria and all required variants govern completion. All pre-release variants precede conditional Preview publication; published download/install readback and closure follow. No test result alone grants domain or release authority.

## Consequences

This is an incompatible v0.x correction despite retaining the specifications/v1 directory. Installation must carry the toolchain and honest support matrix. User projects use one discoverable editable layout and retain private evidence outside source. Further standards versions require a separately reviewed need, compatibility plan and acceptance. No full OWL reasoner, CI platform, online monitoring service, WorkBuddy adapter or automatic background mutation is introduced.
