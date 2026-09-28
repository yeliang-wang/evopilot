# Evolution Expert 2.3.0 Host integration

Status: implementation under the approved 2.3.0 successor Target; not released or accepted.

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

For a local Runtime, keep the ordinary MCP adapter at
`http://127.0.0.1:19876`. The private input component can use the
[installation-scoped loopback TLS ingress](../../packages/evolution-expert/host-integration/README.md#local-runtime-and-installation-scoped-tls).
Its setup generates a local certificate and binds the exact public certificate
to the private config; no public HTTPS address or system CA installation is
required. Runtime remains the same authenticated local HTTP service. The
private input window opens only after the scoped TLS and Runtime availability
check succeeds. This does not substitute for real Host permission qualification.

For a managed local EvoPilot Runtime, the explicitly configured `local-token`
mode reuses a registered Runtime credential inside the trusted Host launcher.
The user enters only the Provider API Key in the native form; no Runtime username
or password is requested. This does not change the external Agent's login.
Missing or stale credential registration fails closed and requires connection
repair, not automatic account creation or password fallback. First-install
credential provisioning remains a prerequisite. See the private integration
README's **Managed local Runtime token mode** for trust and pipe contracts.
