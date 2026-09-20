# Repository Host-integration E2E corpus

`cases.json` is the maintained version-specific RC01–RC05 extension for Expert
2.2.1 / Runtime 6.2.0, approved Target revision 2. It does not replace the Target's
original 10 machine variants, 365 inherited/cross obligations or active soak.

Run local validation with:

```bash
node --test tests/unit/evolution-expert-host-integration.test.mjs tests/functional/evolution-expert-host-integration.test.mjs
```

`synthetic-fixture.mjs` uses generated test-only authority keys and literal
synthetic values, with injected in-memory transport. It does not start Runtime,
execute a real Host, display a window, or count as E2E evidence. Local tests must
leave every corpus/Target acceptance status pending.

Formal execution requires an immutable Candidate binding, freshly installed
exact artifacts, independently qualified Host permission observation, a verified
non-debug isolated Runtime, exact UI/process identity and authorization for the
whole campaign. Bind actual evidence by digest for every named step and observed
surface. Scan controls must demonstrate that each scanner catches a deliberately
leaked **synthetic** sentinel; do not claim unobserved surfaces passed.

WorkBuddy is operated only by the designated human using the complete RC01–RC05
runbooks and closes on a new exact Candidate-bound range declaration. Machines
must not operate/observe it or request per-case artifacts. Independent-Host
evidence cannot substitute for that declaration.
