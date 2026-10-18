# ADR: bounded online Harness and an independent local worker

Status: implementation within the approved v0.5 Target. Release and acceptance evidence remain external.

The shared Codex connection is insufficient for monitoring that must continue after a chat exits. A new distributed queue/service platform would add operational scope unrelated to the local-first product. The chosen design adds one explicitly started launchd worker per private Workspace, using the existing public Harness and Runtime package APIs and their protected SQLite state.

Harness owns the immutable service/SLO/policy binding, selected schedule, window claims, measurements, native evaluations, incidents and regression comparisons. Runtime accepts trusted Harness findings as reviewable repair candidates. Ontology receives no direct online mutation. The parent owns private provider configuration, bounded HTTP ingress, worker supervision and Expert integration. No owner imports another repository's source.

OpenSLO configuration, actual measurement, native quality result, human semantic decision and software release remain distinct. The supported profile and source provenance are under Harness `specifications/online/v1`; the corrected native v0.3 `specifications/v1` and shared native contract are preserved byte for byte. Parent-generated additive online modules supply common types and validation.

A deterministic window identity binds the reviewed service/policy and end time. A durable pending record precedes collection. Completion commits the immutable observation and finding history together. Repeated read-only collection is allowed only for a retained pending window; retained completed results are never overwritten. Runtime delivery first inspects trusted retained state, so response loss after a commit does not create another repair candidate.

The supervisor label derives from the private Workspace identity. Recorded installation/configuration/plist/executable identities are checked before lifecycle changes. Stop waits for launchd removal and actual child exit. Shared maintenance coordination prevents a live worker from racing a backup or relocation. No service starts on plugin discovery, Workspace initialization or configuration alone.

The worker uses only preconfigured read-only Prometheus requests and authenticated Alertmanager ingress. It has no production deployment, database modification, general command execution or rule approval API. Resource limits produce diagnostic incomplete state. Longer retention, additional supervisors/providers and distributed operation remain Roadmap work.
