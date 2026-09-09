# v5 Completion Assurance

EvoPilot Runtime 5.0.1 and Evolution Expert 1.0.1 are completion-recovery
releases for the original v5 scheme. Completion is not inferred from package
versions, publication, aggregate acceptance, or a human declaration.

## Immutable inputs

`governance/acceptance/v5-completion-contract.json` binds the accepted Roadmap,
the two predecessor Targets, the two completion-recovery Targets, explicit
corrections, audited gaps, deliverables, validators, and terminal journeys.
Regenerate it after an authorized source change and use `--check` everywhere
else:

```bash
npm run completion:contract
npm run completion:contract:check
```

## Closure rule

The aggregator evaluates all 195 current, inherited, and E2E criteria. It may
return `COMPLETE` only when:

- `total = passed`;
- `failed = pending = stale = warning = generic = unmapped = 0`;
- one exact Runtime/Expert Candidate pair is verified;
- impact closure and `NO_REGRESSION` are both `PASS`;
- each PASS comes from the criterion's independent validator and exact
  Candidate binding.

Bulk PASS projection, generic evidence, warnings as PASS, duplicate evidence,
silent exclusions, source-checkout substitutes, wrong-Candidate evidence, and
human statements in place of required machine evidence fail closed.

```bash
npm run verify:v5:completion
EVOPILOT_COMPLETION_EVIDENCE_DIR=/isolated/evidence \
EVOPILOT_COMPLETION_CANDIDATE_PAIR=/isolated/candidate-pair.json \
EVOPILOT_IMPACT_CLOSURE=PASS EVOPILOT_NO_REGRESSION=PASS \
node scripts/verify-v5-completion.mjs --require-complete
```

Without separately authorized Candidate and E2E execution, the expected
result is `INCOMPLETE` with pending criteria. That is a correct gate result,
not a local implementation failure.

## Evidence lifecycle

Each evidence object names exactly one Target, criterion, validator, Candidate
pair, result, freshness, and evidence references. Snapshot or product drift
makes only affected evidence stale. A successor Candidate never inherits PASS
from a predecessor automatically. Designated-human WorkBuddy evidence counts
only for the exact declared WorkBuddy range; it cannot substitute for machine
criteria.

Inspect a criterion-specific contract before execution, then validate the
resulting evidence record against that exact Target and criterion:

```bash
node scripts/run-v5-criterion-validator.mjs \
  --target evopilot-v5.0.1-harness-guided-completion-recovery \
  --criterion FUNC05

node scripts/run-v5-criterion-validator.mjs \
  --target evopilot-v5.0.1-harness-guided-completion-recovery \
  --criterion FUNC05 \
  --evidence /isolated/evidence/FUNC05.json
```

Evidence records follow
`schemas/governed-evolution/criterion-evidence-v1.schema.json` and carry a
canonical `recordDigest`. WorkBuddy criteria additionally require the named
Host, designated actor, authority reference, and declaration digest.

The Cutover of the existing EvoPilot and DataRig Codex Suites is outside this
completion contract. Their real files and defaults stay untouched until a
post-release Cutover Target receives separate authorization.
