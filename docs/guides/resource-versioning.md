# Governed Resource Versioning

Audience: project maintainers. Prerequisite: an EvoPilot 5.1.0 server and an admin token. Goal: register, inspect, activate, diff, and roll back a human-readable resource without rebuilding Runtime or Expert.

Every resource contains:

- `apiVersion`: schema line, currently `evopilot.io/v1`;
- `kind`: `CapabilityPack`, `LifecycleModule`, `PolicyPack`, `GovernancePack`, `ActionProviderDefinition`, `EnvironmentBinding`, `ReleaseChannelBinding`, `SecretRef`, or `HumanAuthorityRole`;
- `metadata.version`: this resource's independent SemVer;
- `provenance`: immutable source type, id, version, digest, and optional reference;
- `compatibility.runtime`: supported Runtime range;
- `capabilityRefs`, `spec`, and computed immutable `digest`.

Register and inspect:

```bash
evopilot resource register --file examples/governed-resources/oss-governance-pack.json --json
evopilot resource inspect GovernancePack oss-github --version 1.0.0 --json
```

Compare a successor before activation:

```bash
evopilot resource diff GovernancePack oss-github \
  --from 1.0.0 --to 1.1.0 --runtime-version 5.1.0 --json
```

`COMPATIBLE_RESOURCE_REVISION` means Runtime and Expert bytes and versions remain unchanged. `RUNTIME_CHANGE_REQUIRED` blocks independent activation until a compatible Runtime exists.

Activation and rollback are exact mutations and require evidence:

```bash
evopilot resource activate GovernancePack oss-github --version 1.1.0 --evidence-ref decision://resource-upgrade --json
evopilot resource rollback GovernancePack oss-github --version 1.0.0 --evidence-ref decision://resource-rollback --json
```

Success is an activation record containing the selected version, resource digest, actor, evidence reference, timestamp, and activation digest. Old revisions remain immutable. Raw secrets are rejected; use `SecretRef` identifiers such as `secret://github/actions`.
