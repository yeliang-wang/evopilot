# Versioned authority for composed reconstruction

Status: accepted boundary correction for the v0.8 line; implementation and acceptance remain separate. This ADR supersedes the blanket no-network/process-delegation restriction in ADR 0010 only for explicitly reviewed v2 reconstruction plans. V1 plans, receipts, observations, standards and historical evidence keep their original meaning and bytes.

## Context and decision

Composed software needs internal service communication and bounded child tools. A successful generated-code execution must not report complete network denial when it actually used loopback. Adopt v2 plan/receipt/observation envelopes with an exact execution policy and retained enforcement evidence. External networks, unrelated local peers, original implementation, hidden oracle, prior generated outputs and host credentials remain forbidden. The trusted authentication broker's selected model route remains outside generated-code authority.

The policy fixes `externalNetwork: DENY`, internal transport `NONE` or `OWNED_LOOPBACK`, and child processes `DENY` or `BROKERED_OWNED`. Owned loopback requires brokered processes. Bind the broker configuration/implementation digest and the declared dependency manifest digest. Only a trusted installed provider can enforce or attest this policy; JSON cannot register a provider or grant a process permission.

V2 receipts retain the exact policy, its digest, an enforcement journal digest, actual external/unrelated connection counts and verified closure of all owned processes. Success requires zero external and unrelated connections and complete cleanup. The legacy `networkDenied` field is true only for `NONE`; it is false for owned loopback. It is never used alone to approve the new profile. V2 observations carry the same policy/evidence binding and Runtime seals the original claim and receipt identity. Harness retains the explicit v2 observation instead of laundering it into an offline v1 claim.

The broker must deny raw guest fork and outbound connections. It starts only pinned tools in per-child deny-by-default profiles, tracks detached descendants, and verifies both owned listeners and accepted peers before HTTP data. Narrower collection policies cannot inherit broader HTTP authority. PID/port reuse, uncertain cleanup or missing journal evidence blocks success. Host path metadata visibility remains an explicit limitation, not a credential/source-read permission.

## Normative dependency reuse

An approved project may declare exact frozen compatibility modules as normative dependencies, separately from generic third-party packages. The manifest records identity, purpose, license/access disposition and every byte digest. Its exact digest belongs to the policy and dependency pins. This is an explicit condition of the reconstruction claim; it does not mean all software bytes were regenerated.

Original business engines, source trees, acceptance tests, prior solutions and proxy services executing the original target behavior are forbidden dependencies. Specification export still rejects executable material. A trusted resolver supplies approved dependencies through a distinct read-only path; it never disguises them as prose assets. Frozen native-v1 standard bytes, installed contract digests and retained assets remain unchanged.

## Compatibility and recovery

New validators support exact v1 and v2 envelopes; a v1 envelope cannot contain v2 authority fields. V2 writes advance the relevant Runtime/Harness state marker to 8 so released readers that only support 7 reject it. Reads do not upgrade state. No existing plan, receipt, assessment or decision is rewritten. Backup/restore and relocation must preserve marker 8; rollback requires a verified stopped backup, never a marker downgrade. Daily cutover is separately authorized.

UNKNOWN keeps the original reservation. Reconciliation inspects retained evidence without rerunning generation or tests. Policy, dependency, executor or enforcement drift makes current evidence unusable. Budgets, real semantic decisions, independent oracles and two clean successful reconstructions remain mandatory; this ADR supplies none of those results or approvals.

## Alternatives and validation

Keeping the offline profile supports its existing slices but leaves required service behavior unevaluated. Broad loopback access would expose unrelated services and is rejected. Regenerating frozen contract bytes or changing their digests requires a separate standard migration and is outside this correction.

The [correction Target](../../governance/controlled-execution-v08.json) fixes added positive, negative, compatibility and recovery obligations. Preserve all existing acceptance requirements. Technical demonstrations and synthetic inputs do not establish whole-project L3 or release authority. Revisit this ADR only through a new reviewed trust/compatibility change.
