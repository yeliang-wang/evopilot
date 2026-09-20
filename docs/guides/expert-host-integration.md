# Evolution Expert 2.2.1 Host integration

Status: implementation under approved Target r2; not released or accepted.

The private component belongs to the Expert package, but runs outside its
conversational Core. See the [component reference](../../packages/evolution-expert/host-integration/README.md)
for the exact invocation, local trust prerequisites, supported platform,
cancellation semantics and isolated maintenance commands.

The repository [E2E corpus](../../tests/e2e/expert-host-integration/README.md)
extends RC01–RC05. Local synthetic tests do not satisfy the original actual Host,
Runtime, inherited/cross-product or 5400-second active-soak requirements.

In particular, permission and deployment signatures require trustworthy issuers
with observed evidence. Their existence in a synthetic unit test does not
demonstrate any third-party Host permission integration. All such qualification
remains pending for the exact later Candidate; no current user integration is
installed, modified or imported by this implementation.
