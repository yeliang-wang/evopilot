# Action Provider Reference

Action Providers expose typed external actions; they are not arbitrary command runners. Runtime 6.0 includes definitions for local Git, GitHub, GitLab, npm, Maven, Candidate construction, and artifact verification.

Every action declares an input schema, output schema, immutable receipt, mandatory idempotency key, rollback or compensation behavior, required authorities, and `SecretRef` identifiers. Qualification rejects missing authority, unavailable credential references, raw secret values, duplicate actions, missing schemas, and `arbitraryShell: true`.

```bash
evopilot provider qualify --file provider-qualification.yaml --json
```

The request contains `provider`, `allowedAuthorities`, and `availableCredentialRefs`. A `QUALIFIED` response lists allowed action ids and an immutable digest. A rejected provider cannot be used by a Goal Loop. Qualification never grants authority and never dereferences a secret.

Provider capabilities intersect with Lifecycle, Harness, policy, environment, and owning-human authority. The narrowest allowed result wins; composition may strengthen but cannot weaken Harness obligations.
