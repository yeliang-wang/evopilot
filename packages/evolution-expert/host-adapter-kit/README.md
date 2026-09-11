# Evolution Expert Host Adapter Kit

A Host adapter is a projection of the immutable Evolution Expert Core. It does
not implement project, Harness, Lifecycle, recovery, authority, or release
semantics.

## Contract

1. Generate the manifest with `createExpertAdapter("your-host")`.
2. Expose structured tool results, local or remote MCP, exact human-decision presentation, and Runtime-state resume.
3. Run `assertExpertAdapterConformance(manifest)`.
4. Produce `qualifyExpertHostAdapter(host, runtimeVersion, capabilities)` evidence.
5. Test the installed package against an exact Runtime Candidate outside both source checkouts.

A conformant Host Integration Bundle binds one Core digest, one protocol
version, one adapter digest, lifecycle metadata for install, doctor, health,
version, upgrade, rollback, removal, help, and tutorial, plus a compatible
Runtime range. It preserves Runtime-owned state,
never infers approval, and requires zero EvoPilot Engine source changes.

Qualification is compatibility evidence, not Candidate acceptance or Release
authority. Real Host acceptance remains a separately authorized step.
