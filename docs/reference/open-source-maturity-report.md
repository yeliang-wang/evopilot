# Open Source Maturity Report

> Current public maturity assessment for EvoPilot as an AI-agent harness and loop-governance control plane.

## Conclusion

EvoPilot has reached an enterprise open-source productization baseline. The repository now has the product kernel, governance model, documentation, self-hosting path, release process, examples, validation commands, and AI Agent entry points required for serious external evaluation.

It should not claim parity with the most established public AI-agent projects on community trust alone. Stars, forks, issue traffic, third-party users, public case studies, independent integrations, and release cadence still require sustained external adoption.

## Capability Coverage

| Area | Current State | Evidence |
| --- | --- | --- |
| Product kernel | Enterprise control plane for evidence, goals, loops, harness profiles, approvals, source closure, and release decisions. | `README.md`, `docs/architecture/`, `docs/api/openapi.json` |
| Distribution | Docker, Compose, Kubernetes references, Helm chart, npm CLI package boundary, self-host installer, release docs, immutable release archive, SBOM, provenance, checksum, and image digest metadata. | `Dockerfile`, `docker-compose.yml`, `deploy/`, `charts/evopilot/`, `packages/create-evopilot/`, `.github/workflows/release-artifacts.yml`, `docs/operations/distribution.md` |
| Documentation | Reader-oriented docs for users, operators, AI agents, API integrators, and architects. | `docs/README.md`, `AGENTS.md`, `docs/cli/` |
| Release governance | Product-native release decisions plus public release playbook. | `docs/reference/release-package.md`, `docs/operations/release-management.md` |
| Examples | Included demo project, GitHub workflow examples, and source-to-GA scenarios. | `examples/README.md`, `examples/source-to-ga/` |
| Community shell | License, notice, changelog, contribution guide, security policy, code of conduct, issue forms, PR template. | Root governance files and `.github/` |
| AI Agent readiness | Atomic CLI, JSON automation, stop rules, request IDs, WorkBuddy-safe docs. | `AGENTS.md`, `docs/cli/AGENTS.md`, `docs/guides/ai-agent-runbook.md` |
| Code structure | Thin server package entrypoint and compatibility adapter, extracted control-plane runtime boundary, HTTP helpers, focused route modules, storage primitives, server contracts, harness-template domain defaults, and architecture-boundary verification. | `packages/server/src/index.ts`, `packages/server/src/server.ts`, `packages/server/src/runtime/control-plane-runtime.ts`, `packages/server/src/http/`, `packages/server/src/storage/`, `packages/server/src/model.ts`, `packages/server/src/domains/harness-template/defaults.ts`, `scripts/verify-architecture-boundaries.mjs` |

## Top-Tier Gap Assessment

| Dimension | Status | Remaining Work |
| --- | --- | --- |
| Product capability | Strong baseline | Continue hardening through real projects and release evidence. |
| Self-hosting | Documented, containerized, tagged-installer backed, and npm-installer backed | Publish and monitor npm installer usage, then gather external install feedback. |
| Examples | Baseline examples present | Add public case studies from real adopters. |
| Release process | Documented and backed by immutable release artifact workflow | Maintain regular tags, release notes, artifact checksums, SBOM, provenance, and production digest verification. |
| Code structure | Entry, server compatibility adapter, Dashboard shell, HTTP helpers, storage primitives, and runtime boundary are bounded; the control-plane runtime remains a transitional large module | Extract remaining route/application handlers and `FileStore` behind smaller application and infrastructure modules. |
| Community | Governance files present | Build external contributor activity and triage rhythm. |
| Ecosystem | GitHub, GitLab, CI/CD, LLM, logs, evidence surfaces documented | Add partner integrations and published deployment guides as users request them. |

## Maturity Target

The next maturity objective is adoption evidence, not more core feature breadth:

```text
Make EvoPilot understandable, deployable, operable, verifiable, and contributable by external users and AI Agents without private project context.
```

Acceptance signals:

- A new operator can self-host the stack from docs.
- A new operator can generate the stack with tagged `install.sh` or `npx create-evopilot@latest self-host --init-env` after publication.
- An AI Agent can follow `AGENTS.md` and `docs/cli/AGENTS.md` without inventing commands.
- A maintainer can tag a release using `docs/operations/release-management.md`.
- A reviewer can inspect examples and understand project onboarding, harness review, goal loop execution, and release decisions.
- Public claims are tied to commands, evidence packages, or product-native release decisions.
