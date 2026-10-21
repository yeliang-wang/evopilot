# Response linkage in 0.6.0 Preview

Version 0.6.0 connects retained Harness findings, reviewed operating guidance, a Runtime Goal/Target/Loop, an actual isolated action, independent verification and reviewed asset feedback. Its fixed acceptance inventory is [response-v06.json](../governance/response-v06.json). Implementation status and synthetic test results do not establish installed Host acceptance or publication.

## Responsibilities and evidence

| Owner | Owns | Does not infer |
| --- | --- | --- |
| Ontology | Optional, pinned operations vocabulary; project-specific RDF/Turtle and SHACL assets | Business facts, authenticated evidence ownership or confirmed root cause from graph conformance |
| Harness | Published runbook applicability, problem assessments and dispositions, actual fault/recovery evidence | An executable permission from a warning or an automatically accepted policy change |
| Runtime | Exact source/project/Goal/Target/Loop links, response decisions, durable action admission, verification and owner feedback links | Quality PASS from process exit, cancellation from a request, or software-release authorization |
| Expert | Explains scope and guides the user through public owner APIs | Human decisions, missing measurements or unsupported executors |

The existing native `specifications/v1` remains authoritative. The operations profile is optional project material, instantiated in the project's namespace. It supplies declarations, shapes and source mappings; the project still supplies instances, independent coverage, cases and a concrete domain review. Read [Ontology profile details](../projects/evopilot-ontology/docs/operations-profile.md).

## Conversation and execution

Select EvoPilot, inspect the actual installed version and Workspace, then explicitly activate the current chat. Use `V06-U01` through `V06-U05` from the [Expert catalogue](expert-scenarios.md). Ordinary chats remain passive.

1. Read an actual Harness finding and Runtime repair candidate. Use `response.problem.context` for a bounded selection of findings and the complete retained history's count/digest. Prepare a problem assessment with evidence references, separate observed/suspected/confirmed causes and explicit preventive `followups`. Review pins a precise history checkpoint; subsequent healthy observations remain visible without invalidating it, while a newly appended or late fault requires fresh review. Followups retain declared actor, status and owner evidence; marking one `DONE` requires referenced product results to be PASS and a new exact review. Review the full assessment before storing it.
2. Resolve an admitted runbook from an immutable published Harness native package. Its service, environment, source revision, exact parameters, prerequisite evidence, expiry and stop conditions must match the intended response. A withdrawn, expired or stale runbook cannot start new execution.
3. Bind the existing Runtime Goal and native project to immutable private campaign Target/Loop references. These references explain governance context; they are not operational observations or permission. Prepare and approve the concrete collection independently, then review and decide the response that pins it.
4. Execute once through the existing local collector. This release supports the pinned Node executor in an isolated copied directory and explicitly configured loopback connectivity. The action must have an observable result. It cannot edit protected original source. Java/Maven, remote hosts, production deployment and arbitrary SRE remediation providers are outside this release.
5. Collect separate post-action evidence and dispatch a reviewed native validation Run. Require actual collection success and passing Harness/Ontology results for the exact project and asset references. Compare the earlier actual fault and later recovery from the same immutable online binding. For an Alertmanager incident, retain its authenticated FIRING and RESOLVED findings and link them to a separate native FAIL→PASS regression with `response.recovery.link`; `response.recovery.inspect` resolves the retained correlation. Alert resolution supplies neither the regression's quality result nor its timestamps. This bounded comparison does not prove a cross-deployment recovery or causal attribution.
6. Review each owner's feedback proposal. `REUSE` pins the existing published asset with a rationale; `DELIVER` requires a new package through its ordinary validate/review/decide/publish lifecycle. Final verification must evaluate the exact references accepted by both owners. Preserve failed attempts and previous assets.
7. Review the problem disposition and response closure. Recovery does not upgrade a suspected cause to confirmed. Risk acceptance records actor, rationale, scope and expiry; it does not weaken a rule, turn FAIL into PASS, choose a software version or approve release. Inspect current incident history before describing an old disposition as effective.

All mutations use request IDs and current owner revisions. Detailed public envelopes are in [Runtime response](../projects/evopilot-runtime/docs/response.md) and [Harness response](../projects/evopilot-harness/docs/response.md). The MCP `evopilot_v01_native` tool routes `response.*` envelopes to their owner; the stable tool name does not identify the installed product version.

## Interruption and recovery

Admission is persisted before collection execution. A lost response, timeout or partial output remains visible. Read the original response and collection claim, then reconcile retained evidence; do not redispatch with a new request to clear uncertainty. Use the read-only `response.cancel.review` operation to obtain the exact cancellation subject and digest before recording a decision. Cancellation remains requested until the actual worker receipt confirms interruption. A rollback is a separate reviewed action.

A successful collection prerequisite establishes process success for that exact receipt. A business readiness condition needs a native Run or Harness evaluation whose rules check the condition, or a reviewed collection that fails when it is unmet. JSON presence and exit code zero alone do not establish business readiness.

The first response write advances the Runtime/Harness database marker to **5**. Stop live connections and independent online workers before a consistent supported backup, restore or installation upgrade. Previous owner records and their digests remain intact. A 0.5 reader must reject marker 5; rollback uses the matching preserved pre-upgrade backup and installation. Reading a historical receipt does not imply the action should be repeated.

Decision records bind exact review content and authorization received from the user. Their local file hashes establish integrity, not authenticated identity. Synthetic decisions in E2E tests confer no business authority.

## Validation and limits

The fixed target requires real isolated action and independent validation, forged/stale/wrong-scope rejection, duplicate and lost-response recovery, cancellation, feedback, two distinct synthetic domains, upgrade/recovery, language checks and actual installed Codex journeys. The synthetic domains do not count as a second real project or satisfy the v1.0 adoption target. No test result substitutes for missing Host evidence.

Core implementation uses strict TypeScript. Build/test launchers use JavaScript; the pinned native RDF/SHACL adapter uses Python. See the [language policy](language-policy.md). Normative Rego and Turtle assets stay in their native formats.

The design uses [W3C PROV-O](https://www.w3.org/TR/prov-o/) for provenance references, [Prometheus alerting rules](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/) for the distinction between observations and alert state, and [Google SRE postmortem practice](https://sre.google/sre-book/postmortem-culture/) for retaining evidence, causes and follow-up actions. EvoPilot's bounded response contract is its own versioned contract; it does not claim complete conformance to an industry-wide remediation standard.
