# Expert 2.2.1 recovery acceptance

Audience: acceptance coordinators and the designated human WorkBuddy operator.
Status: **prepared, not authorized to execute; no Candidate is bound yet**.

Authoritative definitions are the [approved Target](../../governance/targets/evopilot-evolution-expert-v2.2.1-public-cli-completion-recovery.json)
and [item-level plan](../../governance/acceptance/expert-2.2.1-recovery-plan.json).
This guide does not grant implementation, Host, commit or publication authority.

## Local verification (not counted acceptance)

From an isolated checkout with Node 22 or newer and npm:

```bash
npm ci --ignore-scripts --no-audit --no-fund
node scripts/materialize-expert-runtime-contract.mjs /absolute/path/to/evopilot-contracts-6.2.0.tgz
node scripts/materialize-expert-runtime-fixtures.mjs /absolute/path/to/evopilot-6.2.0-container-image.tar
npm run build:expert-only -w @evopilot/evolution-expert
node packages/evolution-expert/scripts/generate-adapters.mjs --check
node scripts/verify-expert-recovery-plan.mjs
node --test tests/unit/evolution-expert*.test.mjs tests/unit/roadmap-gate.test.mjs tests/unit/release-pipeline*.test.mjs tests/unit/v62-release-state.test.mjs
```

Both materializers reject digest drift. With no archive argument they fetch
only the pinned public 6.2.0 artifact. Image fixture extraction is offline:
it neither runs Docker nor starts or installs a Runtime integration.
Package archives produced by unit fixtures are disposable test inputs, not a
frozen Candidate or public-install evidence. Do not run `npm run check` for
this recovery: it rebuilds Runtime. Run its applicable static/tests directly
against these unchanged compiled fixtures instead.

## Before any counted run

1. Obtain exact commit/Candidate authority; build one Expert release set via
   `.github/workflows/evolution-expert-release-candidate.yml`. Do not dispatch
   the workflow merely because this guide exists.
2. Verify its commit, workflow/run/attempt, complete four-file release set,
   checksums, SBOM, provenance, channel retention and immutable handoff.
3. Create an append-only Candidate binding with exact Expert tarball, Core,
   Adapter and installed digests plus unchanged Runtime 6.2.0 identity.
   Keep the approved Target and prepared plan Candidate-neutral.
4. Fresh-install outside the source checkout. The Candidate uses its local
   exact tarball; never request unpublished `@evopilot/evolution-expert@2.2.1`
   from npm. Do not modify current Host/MCP integrations, use real user secrets
   or access production systems. Synthetic isolated fixtures only.
5. Qualify each independent automated Host transport and freeze the complete
   machine matrix and human runbook against that binding. Obtain the separate
   exact campaign authorization. Without a binding/qualification, stop before
   the first counted case; local CLI success is not transport qualification.

## RC01–RC05 portfolio

Machine operators retain exact installed identities, criterion-specific tool
receipts, observed state, expected assertions and stop reasons. Every inherited
id maps to a journey in the plan; missing or generic aggregate evidence fails.

| Case | Start and action | Required terminal state |
| --- | --- | --- |
| RC01 | Fresh bound package; run both CLI self-checks for all five packaged adapters with explicit/omitted Runtime, unsupported/malformed versions, unknown Host and deficient observed-capability API inputs. | Positive declarations match generated contracts; every negative fails closed; no claim of actual Host or Runtime readiness. |
| RC02 | Read the installed Core v3, canonical digest, portable Skill and all adapters; compare every packaged file with accepted bytes. Run isolated verifier tamper/schema/version negatives. | Correct bytes pass; altered bytes/schema/version/digest fail. Runtime and predecessor artifacts are unchanged. |
| RC03 | In qualified isolated Codex, Claude Code, independent Host and generic MCP/headless fixtures, exercise fresh setup-only start, secure synthetic SecretRef input, explicit workspace choice, preflight, failure/repair and cross-Host resume. | Runtime remains sole truth; no raw secret in conversation, fallback, inferred approval or imported current Host configuration; all 10 original cross rows satisfy their own evidence requirements. |
| RC04 | Evaluate each of 355 historical criteria and 10 cross rows; freshly rerun every Expert/cross criterion. For each Runtime item prove exact unchanged implementation and all inputs or rerun it. Execute required active soak. | All current/inherited/cross rows have independently checkable PASS; 5400-second soak obligation satisfied; zero stale/unmapped/failed/pending/prohibited counts, impact closure and NO_REGRESSION. |
| RC05 | Rehearse public verifier with local fixtures, inspect all authority stops, then remove only campaign-owned temporary resources. Do not publish. | Distinct Candidate/public stages demonstrated, no publication or current integration mutation, retained evidence and clean isolation boundary. Actual public verification remains pending Release authorization. |

Version-specific historical release facts are preserved as history, not
rewritten to say 2.2.1. Their retained safety obligations are proved on the
successor. Reuse requires item-level SHA validation and unchanged-input proof;
a Runtime version match alone is insufficient. If soak includes changed Expert
inputs, run a fresh combined-pair soak. A failure returns to implementation and
its full declared impact/regression matrix, not a warning-only PASS.

## Designated-human WorkBuddy runbook

The coordinator first supplies the exact Candidate-bound installation and
isolated Runtime setup instructions after campaign approval. Until those
concrete prerequisites exist, **do not execute this runbook**. WorkBuddy is
operated independently by the designated human, never by Codex; no UI
observation, screenshots, execution logs or per-case reports are requested.

For that one bound installation, the human performs these representative
journeys through the Expert-over-MCP entry, using only synthetic fixtures:

1. **RC01:** Ask “Check the installed Expert version and explain package
   compatibility versus actual Host capability and Runtime readiness.” Confirm
   the Expert reports 2.2.1, consumes Runtime facts and does not equate its own
   model or a package doctor result with Runtime readiness.
2. **RC02:** Ask “Show which Expert Core and adapter this installation uses,
   and explain what to do if the installation binding is incompatible.”
   Confirm the supplied Candidate identity matches and drift stops rather than
   silently installing or activating another package.
3. **RC03:** Ask “Guide first-run Runtime LLM setup.” Choose only the isolated
   synthetic provider/profile; enter its synthetic secret only through the
   approved secure-input surface. Exercise preflight failure, explicit repair
   and resume. Confirm no raw secret is solicited in chat, no provider/default
   is silently chosen, and only Runtime evidence controls readiness.
4. **RC04:** Resume the same governed fixture journey after interruption.
   Ask “Explain the current state, evidence and remaining acceptance blockers.”
   Confirm Runtime is the source of truth and missing machine matrix/soak
   evidence is not described as passed. The independent machine campaign, not
   the human declaration, is responsible for proving the exhaustive matrix.
5. **RC05:** Ask “Is this release authorized? What still needs approval?”
   Confirm no release/publication is inferred, then end the isolated journey
   without changing current integrations or published packages.

The WorkBuddy leg closes only when the human declares `RC01～RC05 已完成`
for the active exact binding. Historical declarations do not transfer. A
machine Host result never substitutes for this human declaration, and the
declaration never substitutes for machine/inheritance evidence.

## After separate Release authorization

Promote the accepted tarball without rebuilding. Independently verify npm
integrity equals that tarball, Registry provenance and `npm audit signatures`,
then install the public version in a new empty directory. Run:

```bash
node scripts/verify-expert-public-install.mjs /absolute/fresh-public-install 2.2.1 /absolute/accepted-tarball.tgz
```

This command checks installed bytes and declared contracts; the release
workflow owns the preceding public Registry/provenance/signature checks.
Record public-stage impact closure and NO_REGRESSION separately; never reuse
the Candidate installation as public-install evidence.
