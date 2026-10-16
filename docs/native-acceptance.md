# Native candidate acceptance evidence

There are separate checks for upstream tool conformance, owner package validation,
project source/scope coverage, protected execution receipts, actual domain review,
and installed Codex journeys. None can substitute for another. A successful
negative test means the expected rejection occurred; the underlying rejected
asset or failed quality report must remain rejected.

The v0.3 product correction has a frozen target in
[standards-v03.json](../governance/standards-v03.json): 65 criteria, 364 variants,
356 pre-release variants and 8 post-release variants. These are this product
Target's acceptance denominator, not a mandatory list for every future project.
A project's own fixed requirements instead follow the
[project standard](../specifications/project/v1/README.md).

Before running parameterized checks, retain an independent instance plan with
one nonempty instance list for each variant. Do not derive it from passing test
output. Keep the approved catalog, variants, plan, actual results and private
Host receipts outside public source. Bind results to an independently established
exact candidate digest. Each instance result repeats its unchanged expected
outcome and cites the actual evidence file hash and location within that file.

After building, run `scripts/verify-native-acceptance.mjs` with `--catalog`,
`--variants`, `--instance-plan`, `--instance-plan-digest`, `--report`,
`--candidate-digest`, and `--phase PRE_RELEASE` or `POST_RELEASE`. Paths identify
local evidence; digests use `sha256:<64 lowercase hex>`. The CLI uses the shipped
Target and rejects changed catalog/variant bytes, missing or duplicate instances,
orphan results, weakened expected outcomes, stale candidate bindings, changed
files and linked files. Required real Host variants cannot use synthetic or
command-only evidence. Post-release completeness includes all pre-release checks.

A COMPLETE result means only that the evidence ledger is structurally complete
and its referenced bytes match. It returns `acceptance: NOT_EVALUATED`,
`authority: false` and `releaseAuthorized: false`. The verifier does not interpret
whether a log proves the required behavior, authenticate a claimed human
statement, or inspect the current source tree from a caller-supplied digest.
The reviewer must verify those actual sources, receipts, candidate identity and
decisions before acceptance or publication. Synthetic verifier tests intentionally
do not constitute Host evidence.
