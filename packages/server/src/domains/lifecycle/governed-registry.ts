import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { FileLifecycleCatalog } from "./catalog.js";
import { parseLifecycleYaml, resolveLifecycleRevision, type LifecycleDefinitionCatalog, type LifecycleSource } from "./core.js";
import { LifecycleActionRegistry, stableJson } from "./registry.js";
import type { LifecycleRevision } from "./types.js";

export const GOVERNED_LIFECYCLE_RECORD_SCHEMA = "evopilot-governed-lifecycle-record/v1" as const;
export const GOVERNED_LIFECYCLE_POINTER_SCHEMA = "evopilot-governed-lifecycle-pointer/v1" as const;
export const GOVERNED_LIFECYCLE_AUDIT_SCHEMA = "evopilot-governed-lifecycle-audit/v1" as const;

export interface LifecycleRegistryScope {
  tenantId: string;
  workspaceId: string;
}

export interface GovernedLifecycleRecord {
  schema: typeof GOVERNED_LIFECYCLE_RECORD_SCHEMA;
  tenantId: string;
  workspaceId: string;
  id: string;
  version: string;
  revisionDigest: string;
  sourceDigest: string;
  sourceRef: string;
  sourceType: "BOOTSTRAP" | "NATIVE" | "PROJECT";
  yaml: string;
  revision: LifecycleRevision;
  registeredAt: string;
  registeredBy: string;
  digest: string;
}

export interface GovernedLifecycleState {
  schema: "evopilot-governed-lifecycle-state/v1";
  id: string;
  version: string;
  revisionDigest: string;
  status: "REGISTERED" | "ACTIVE" | "INACTIVE" | "ARCHIVED";
  tombstone: boolean;
  changedAt: string;
  changedBy: string;
  evidenceRef: string;
  digest: string;
}

export interface GovernedLifecyclePointer {
  schema: typeof GOVERNED_LIFECYCLE_POINTER_SCHEMA;
  id: string;
  active: boolean;
  version?: string;
  revisionDigest?: string;
  previousRevisionDigest?: string;
  changedAt: string;
  changedBy: string;
  evidenceRef: string;
  action: "BOOTSTRAP" | "ACTIVATE" | "DEACTIVATE" | "ROLLBACK";
  digest: string;
}

export interface GovernedLifecycleAudit {
  schema: typeof GOVERNED_LIFECYCLE_AUDIT_SCHEMA;
  id: string;
  tenantId: string;
  workspaceId: string;
  lifecycleId: string;
  version?: string;
  revisionDigest?: string;
  action: "BOOTSTRAP" | "REGISTER" | "ACTIVATE" | "DEACTIVATE" | "ARCHIVE" | "RESTORE" | "ROLLBACK" | "DELETE_DRAFT" | "USE";
  actor: string;
  evidenceRef: string;
  occurredAt: string;
  details: Record<string, unknown>;
  digest: string;
}

export interface GovernedLifecycleUsage {
  schema: "evopilot-governed-lifecycle-usage/v1";
  id: string;
  tenantId: string;
  workspaceId: string;
  lifecycleId: string;
  version: string;
  revisionDigest: string;
  usageType: "PLAN" | "RUN";
  objectId: string;
  bindingDigest: string;
  recordedAt: string;
  digest: string;
}

export interface LifecycleSemanticDiff {
  schema: "evopilot-lifecycle-semantic-diff/v1";
  lifecycleId: string;
  from: { version: string; digest: string };
  to: { version: string; digest: string };
  changes: Array<{ path: string; before: unknown; after: unknown }>;
  compatibility: "COMPATIBLE_SUCCESSOR" | "REVIEW_REQUIRED";
  runningBindingsAffected: false;
  futurePlanningAffected: true;
  rollbackVersion: string;
  digest: string;
}

export class GovernedLifecycleRegistry {
  private readonly root: string;

  constructor(
    dataRoot: string,
    private readonly bootstrapCatalog: FileLifecycleCatalog,
    private readonly actionRegistry: LifecycleActionRegistry
  ) {
    this.root = path.join(dataRoot, "lifecycle-registry");
    fs.mkdirSync(this.root, { recursive: true });
  }

  list(scope: LifecycleRegistryScope): Array<GovernedLifecycleRecord & { state: GovernedLifecycleState; active: boolean }> {
    this.ensureBootstrap(scope);
    return this.records(scope).map((record) => ({
      ...record,
      state: this.readState(record, scope),
      active: this.readPointer(record.id, scope)?.active === true && this.readPointer(record.id, scope)?.revisionDigest === record.revisionDigest
    })).sort((left, right) => `${left.id}@${left.version}`.localeCompare(`${right.id}@${right.version}`, undefined, { numeric: true }));
  }

  register(input: { yaml: string; sourceRef?: string; sourceType?: GovernedLifecycleRecord["sourceType"]; actor: string; evidenceRef: string }, scope: LifecycleRegistryScope): GovernedLifecycleRecord {
    this.ensureBootstrap(scope);
    requireActorEvidence(input.actor, input.evidenceRef);
    const source: LifecycleSource = { sourceRef: input.sourceRef?.trim() || "mcp://lifecycle/register", text: String(input.yaml ?? "") };
    const definition = parseLifecycleYaml(source, this.actionRegistry);
    return this.withLifecycleLock(definition.metadata.id, scope, () => {
      const existing = this.records(scope).filter((item) => item.id === definition.metadata.id);
      const sameVersion = existing.find((item) => item.version === definition.metadata.version);
      const catalog = this.catalog(scope, source);
      const revision = resolveLifecycleRevision(source, catalog, this.actionRegistry);
      if (sameVersion) {
        if (sameVersion.revisionDigest === revision.digest && sameVersion.sourceDigest === digest(source.text)) return sameVersion;
        throw new Error(`LIFECYCLE_REVISION_IMMUTABLE_CONFLICT: ${definition.metadata.id}@${definition.metadata.version}`);
      }
      const latest = existing.sort((left, right) => compareVersions(right.version, left.version))[0];
      if (latest && compareVersions(definition.metadata.version, latest.version) <= 0) throw new Error(`LIFECYCLE_SUCCESSOR_VERSION_REQUIRED: current=${latest.version}`);
      const now = new Date().toISOString();
      const material = {
        schema: GOVERNED_LIFECYCLE_RECORD_SCHEMA,
        tenantId: safe(scope.tenantId),
        workspaceId: safe(scope.workspaceId),
        id: definition.metadata.id,
        version: definition.metadata.version,
        revisionDigest: revision.digest,
        sourceDigest: digest(source.text),
        sourceRef: source.sourceRef,
        sourceType: input.sourceType ?? "PROJECT" as const,
        yaml: source.text,
        revision,
        registeredAt: now,
        registeredBy: input.actor
      };
      const record: GovernedLifecycleRecord = { ...material, digest: digest(material) };
      this.atomicWrite(this.recordPath(record.id, record.version, scope), record, true);
      this.writeState(record, "REGISTERED", input.actor, input.evidenceRef, scope);
      this.appendAudit("REGISTER", record, input.actor, input.evidenceRef, scope, { sourceType: record.sourceType });
      return record;
    });
  }

  inspect(id: string, version: string | undefined, scope: LifecycleRegistryScope): GovernedLifecycleRecord & { state: GovernedLifecycleState; active: boolean; pointer?: GovernedLifecyclePointer } {
    this.ensureBootstrap(scope);
    const record = this.requireRecord(id, version, scope);
    const pointer = this.readPointer(id, scope);
    return { ...record, state: this.readState(record, scope), active: pointer?.active === true && pointer.revisionDigest === record.revisionDigest, ...(pointer ? { pointer } : {}) };
  }

  resolveActive(id: string, version: string | undefined, scope: LifecycleRegistryScope): LifecycleRevision {
    const inspected = this.inspect(id, version, scope);
    if (!inspected.pointer?.active) throw new Error(`LIFECYCLE_NOT_ACTIVE: ${id}`);
    if (inspected.pointer.revisionDigest !== inspected.revisionDigest) throw new Error(`LIFECYCLE_REVISION_NOT_ACTIVE: ${id}@${inspected.version}`);
    if (inspected.state.status === "ARCHIVED") throw new Error(`LIFECYCLE_ARCHIVED: ${id}@${inspected.version}`);
    return inspected.revision;
  }

  resolveExact(id: string, version: string, digestValue: string | undefined, scope: LifecycleRegistryScope): LifecycleRevision {
    const inspected = this.inspect(id, version, scope);
    if (digestValue && inspected.revisionDigest !== digestValue) throw new Error(`LIFECYCLE_REVISION_DIGEST_MISMATCH: ${id}@${version}`);
    return inspected.revision;
  }

  select(input: { lifecycleId?: string; lifecycleVersion?: string; labels?: Record<string, string>; goalText?: string }, scope: LifecycleRegistryScope) {
    const available = this.list(scope).filter((item) => item.active && item.state.status === "ACTIVE");
    if (input.lifecycleId) {
      const selected = available.find((item) => item.id === input.lifecycleId && (!input.lifecycleVersion || item.version === input.lifecycleVersion));
      if (!selected) throw new Error(`LIFECYCLE_NOT_ACTIVE: ${input.lifecycleId}${input.lifecycleVersion ? `@${input.lifecycleVersion}` : ""}`);
      return { lifecycle: entry(selected), mode: "explicit" as const, score: Number.MAX_SAFE_INTEGER, reasons: ["explicit active Lifecycle selection"] };
    }
    const labels = input.labels ?? {};
    const goal = String(input.goalText ?? "").toLowerCase();
    const candidates = available.map((candidate) => {
      const candidateLabels = candidate.revision.definition.metadata.labels ?? {};
      const labelReasons = Object.entries(labels).filter(([key, value]) => candidateLabels[key] === value).map(([key, value]) => `label:${key}=${value}`);
      const textReasons = Object.entries(candidateLabels).filter(([, value]) => goal.includes(value.toLowerCase())).map(([key, value]) => `goal:${key}=${value}`);
      return { lifecycle: entry(candidate), mode: "label-match" as const, score: labelReasons.length * 100 + textReasons.length * 10, reasons: [...labelReasons, ...textReasons] };
    }).filter((candidate) => candidate.score > 0).sort((left, right) => right.score - left.score || `${left.lifecycle.id}@${left.lifecycle.version}`.localeCompare(`${right.lifecycle.id}@${right.lifecycle.version}`));
    if (!candidates[0]) throw new Error("LIFECYCLE_SELECTION_UNRESOLVED: provide an active lifecycleId or matching labels");
    return candidates[0];
  }

  diff(id: string, fromVersion: string, toVersion: string, scope: LifecycleRegistryScope): LifecycleSemanticDiff {
    const from = this.requireRecord(id, fromVersion, scope);
    const to = this.requireRecord(id, toVersion, scope);
    if (compareVersions(to.version, from.version) <= 0) throw new Error("LIFECYCLE_DIFF_SUCCESSOR_REQUIRED");
    const changes = semanticChanges(from.revision.definition, to.revision.definition);
    const reviewRequired = changes.some((change) => /(?:decision|capabilities|obligations|action|imports)/.test(change.path));
    const material = {
      schema: "evopilot-lifecycle-semantic-diff/v1" as const,
      lifecycleId: id,
      from: { version: from.version, digest: from.revisionDigest },
      to: { version: to.version, digest: to.revisionDigest },
      changes,
      compatibility: reviewRequired ? "REVIEW_REQUIRED" as const : "COMPATIBLE_SUCCESSOR" as const,
      runningBindingsAffected: false as const,
      futurePlanningAffected: true as const,
      rollbackVersion: from.version
    };
    return { ...material, digest: digest(material) };
  }

  activate(id: string, version: string, input: { expectedActiveDigest?: string; actor: string; evidenceRef: string; rollback?: boolean }, scope: LifecycleRegistryScope): GovernedLifecyclePointer {
    requireActorEvidence(input.actor, input.evidenceRef);
    return this.withLifecycleLock(id, scope, () => {
      const record = this.requireRecord(id, version, scope);
      if (this.readState(record, scope).status === "ARCHIVED") throw new Error("LIFECYCLE_ARCHIVED");
      const current = this.readPointer(id, scope);
      const action = input.rollback ? "ROLLBACK" as const : "ACTIVATE" as const;
      if (current?.active && current.revisionDigest === record.revisionDigest && current.action === action && current.changedBy === input.actor && current.evidenceRef === input.evidenceRef) return current;
      if (current?.active && !input.expectedActiveDigest) throw new Error("LIFECYCLE_EXPECTED_ACTIVE_DIGEST_REQUIRED");
      if (current?.active && current.revisionDigest !== input.expectedActiveDigest) throw new Error("LIFECYCLE_ACTIVE_POINTER_CONFLICT");
      const pointer = this.writePointer(record, true, action, input.actor, input.evidenceRef, scope, current?.revisionDigest);
      if (current?.revisionDigest && current.revisionDigest !== record.revisionDigest) {
        const previous = this.records(scope).find((item) => item.revisionDigest === current.revisionDigest);
        if (previous && this.readState(previous, scope).status !== "ARCHIVED") this.writeState(previous, "INACTIVE", input.actor, input.evidenceRef, scope);
      }
      this.writeState(record, "ACTIVE", input.actor, input.evidenceRef, scope);
      this.appendAudit(action, record, input.actor, input.evidenceRef, scope, { previousRevisionDigest: current?.revisionDigest });
      return pointer;
    });
  }

  deactivate(id: string, input: { expectedActiveDigest: string; actor: string; evidenceRef: string }, scope: LifecycleRegistryScope): GovernedLifecyclePointer {
    requireActorEvidence(input.actor, input.evidenceRef);
    return this.withLifecycleLock(id, scope, () => {
      const current = this.readPointer(id, scope);
      if (current && !current.active && current.action === "DEACTIVATE" && current.previousRevisionDigest === input.expectedActiveDigest && current.changedBy === input.actor && current.evidenceRef === input.evidenceRef) return current;
      if (!current?.active || current.revisionDigest !== input.expectedActiveDigest) throw new Error("LIFECYCLE_ACTIVE_POINTER_CONFLICT");
      const record = this.requireRecord(id, current.version, scope);
      const pointer = this.writePointer(record, false, "DEACTIVATE", input.actor, input.evidenceRef, scope, current.revisionDigest);
      this.writeState(record, "INACTIVE", input.actor, input.evidenceRef, scope);
      this.appendAudit("DEACTIVATE", record, input.actor, input.evidenceRef, scope, {});
      return pointer;
    });
  }

  archive(id: string, version: string, input: { revisionDigest: string; actor: string; evidenceRef: string }, scope: LifecycleRegistryScope): GovernedLifecycleState {
    requireActorEvidence(input.actor, input.evidenceRef);
    return this.withLifecycleLock(id, scope, () => {
      const record = this.requireRecord(id, version, scope);
      if (record.revisionDigest !== input.revisionDigest) throw new Error("LIFECYCLE_REVISION_DIGEST_MISMATCH");
      const currentState = this.readState(record, scope);
      if (currentState.status === "ARCHIVED" && currentState.changedBy === input.actor && currentState.evidenceRef === input.evidenceRef) return currentState;
      const pointer = this.readPointer(id, scope);
      if (pointer?.active && pointer.revisionDigest === record.revisionDigest) throw new Error("LIFECYCLE_ACTIVE_REVISION_ARCHIVE_FORBIDDEN");
      const state = this.writeState(record, "ARCHIVED", input.actor, input.evidenceRef, scope);
      this.appendAudit("ARCHIVE", record, input.actor, input.evidenceRef, scope, {});
      return state;
    });
  }

  restore(id: string, version: string, input: { revisionDigest: string; actor: string; evidenceRef: string }, scope: LifecycleRegistryScope): GovernedLifecycleState {
    requireActorEvidence(input.actor, input.evidenceRef);
    return this.withLifecycleLock(id, scope, () => {
      const record = this.requireRecord(id, version, scope);
      if (record.revisionDigest !== input.revisionDigest) throw new Error("LIFECYCLE_REVISION_DIGEST_MISMATCH");
      const currentState = this.readState(record, scope);
      if (currentState.status === "INACTIVE" && currentState.changedBy === input.actor && currentState.evidenceRef === input.evidenceRef) return currentState;
      if (currentState.status !== "ARCHIVED") throw new Error("LIFECYCLE_REVISION_NOT_ARCHIVED");
      const state = this.writeState(record, "INACTIVE", input.actor, input.evidenceRef, scope);
      this.appendAudit("RESTORE", record, input.actor, input.evidenceRef, scope, {});
      return state;
    });
  }

  deleteUnreferencedDraft(id: string, version: string, input: { revisionDigest: string; actor: string; evidenceRef: string }, scope: LifecycleRegistryScope): void {
    requireActorEvidence(input.actor, input.evidenceRef);
    this.withLifecycleLock(id, scope, () => {
      const record = this.requireRecord(id, version, scope);
      if (record.revisionDigest !== input.revisionDigest) throw new Error("LIFECYCLE_REVISION_DIGEST_MISMATCH");
      if (this.readState(record, scope).status !== "REGISTERED") throw new Error("LIFECYCLE_PHYSICAL_DELETE_REQUIRES_UNREFERENCED_DRAFT");
      if (this.usages(id, version, scope).length) throw new Error("LIFECYCLE_REVISION_REFERENCED");
      const dependency = this.records(scope).find((candidate) => candidate.revision.definition.imports?.some((item) => item.id === id && item.version === version));
      if (dependency) throw new Error(`LIFECYCLE_REVISION_DEPENDENCY_EXISTS: ${dependency.id}@${dependency.version}`);
      const pointer = this.readPointer(id, scope);
      if (pointer?.revisionDigest === record.revisionDigest) throw new Error("LIFECYCLE_REVISION_POINTER_EXISTS");
      fs.unlinkSync(this.recordPath(id, version, scope));
      fs.rmSync(this.statePath(id, version, scope), { force: true });
      this.appendAudit("DELETE_DRAFT", record, input.actor, input.evidenceRef, scope, {});
    });
  }

  dependencies(id: string, version: string | undefined, scope: LifecycleRegistryScope) {
    const record = this.requireRecord(id, version, scope);
    const direct = record.revision.definition.imports ?? [];
    const dependents = this.records(scope).filter((candidate) => candidate.revision.definition.imports?.some((item) => item.id === record.id && item.version === record.version)).map((item) => ({ id: item.id, version: item.version, digest: item.revisionDigest }));
    return { schema: "evopilot-governed-lifecycle-dependencies/v1", lifecycle: { id: record.id, version: record.version, digest: record.revisionDigest }, imports: direct, dependents, digest: digest({ lifecycle: record.revisionDigest, imports: direct, dependents }) };
  }

  recordUsage(input: Omit<GovernedLifecycleUsage, "schema" | "tenantId" | "workspaceId" | "recordedAt" | "digest">, scope: LifecycleRegistryScope): GovernedLifecycleUsage {
    const record = this.requireRecord(input.lifecycleId, input.version, scope);
    if (record.revisionDigest !== input.revisionDigest) throw new Error("LIFECYCLE_REVISION_DIGEST_MISMATCH");
    const existing = this.usages(input.lifecycleId, input.version, scope).find((item) => item.id === input.id);
    const material = { schema: "evopilot-governed-lifecycle-usage/v1" as const, tenantId: safe(scope.tenantId), workspaceId: safe(scope.workspaceId), ...input, recordedAt: new Date().toISOString() };
    const usage: GovernedLifecycleUsage = { ...material, digest: digest(material) };
    if (existing) {
      if (existing.bindingDigest === usage.bindingDigest && existing.objectId === usage.objectId && existing.usageType === usage.usageType) return existing;
      throw new Error("LIFECYCLE_USAGE_IDEMPOTENCY_CONFLICT");
    }
    this.atomicWrite(path.join(this.scopeRoot(scope), "usage", `${safe(input.id)}.json`), usage, true);
    this.appendAudit("USE", record, "runtime", `usage://${input.id}`, scope, { usageType: input.usageType, objectId: input.objectId, bindingDigest: input.bindingDigest });
    return usage;
  }

  usages(id: string, version: string | undefined, scope: LifecycleRegistryScope): GovernedLifecycleUsage[] {
    return readJsonDirectory<GovernedLifecycleUsage>(path.join(this.scopeRoot(scope), "usage")).filter((item) => item.lifecycleId === id && (!version || item.version === version));
  }

  audit(id: string, scope: LifecycleRegistryScope): GovernedLifecycleAudit[] {
    return readJsonDirectory<GovernedLifecycleAudit>(path.join(this.scopeRoot(scope), "audit")).filter((item) => item.lifecycleId === id).sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  }

  private ensureBootstrap(scope: LifecycleRegistryScope): void {
    const marker = path.join(this.scopeRoot(scope), "bootstrap.json");
    if (fs.existsSync(marker)) return;
    const entries = this.bootstrapCatalog.list();
    for (const item of entries) {
      const source: LifecycleSource = { sourceRef: item.sourceRef, text: fs.readFileSync(item.sourceRef, "utf8") };
      const revision = resolveLifecycleRevision(source, this.bootstrapCatalog, this.actionRegistry);
      const now = new Date().toISOString();
      const material = { schema: GOVERNED_LIFECYCLE_RECORD_SCHEMA, tenantId: safe(scope.tenantId), workspaceId: safe(scope.workspaceId), id: item.id, version: item.version, revisionDigest: revision.digest, sourceDigest: digest(source.text), sourceRef: item.sourceRef, sourceType: "BOOTSTRAP" as const, yaml: source.text, revision, registeredAt: now, registeredBy: "runtime-bootstrap" };
      const record: GovernedLifecycleRecord = { ...material, digest: digest(material) };
      const target = this.recordPath(record.id, record.version, scope);
      if (!fs.existsSync(target)) {
        this.atomicWrite(target, record, true);
        this.writeState(record, "INACTIVE", "runtime-bootstrap", "bootstrap-import", scope);
        this.appendAudit("BOOTSTRAP", record, "runtime-bootstrap", "bootstrap-import", scope, { sourceRef: item.sourceRef });
      }
    }
    const ids = [...new Set(entries.map((item) => item.id))];
    for (const id of ids) {
      if (this.readPointer(id, scope)) continue;
      const latest = this.records(scope).filter((item) => item.id === id).sort((left, right) => compareVersions(right.version, left.version))[0];
      if (!latest) continue;
      this.writePointer(latest, true, "BOOTSTRAP", "runtime-bootstrap", "bootstrap-import", scope);
      this.writeState(latest, "ACTIVE", "runtime-bootstrap", "bootstrap-import", scope);
    }
    this.atomicWrite(marker, { schema: "evopilot-lifecycle-registry-bootstrap/v1", completedAt: new Date().toISOString(), sourceCount: entries.length, digest: digest(entries) }, true);
  }

  private catalog(scope: LifecycleRegistryScope, additional?: LifecycleSource): LifecycleDefinitionCatalog {
    const additionalDefinition = additional ? parseLifecycleYaml(additional, this.actionRegistry) : undefined;
    return {
      find: (id, version) => {
        if (additionalDefinition?.metadata.id === id && additionalDefinition.metadata.version === version) return additional;
        const record = this.records(scope).find((item) => item.id === id && item.version === version);
        return record ? { sourceRef: record.sourceRef, text: record.yaml } : this.bootstrapCatalog.find(id, version);
      }
    };
  }

  private records(scope: LifecycleRegistryScope): GovernedLifecycleRecord[] {
    return readJsonDirectory<GovernedLifecycleRecord>(path.join(this.scopeRoot(scope), "revisions"));
  }

  private requireRecord(id: string, version: string | undefined, scope: LifecycleRegistryScope): GovernedLifecycleRecord {
    this.ensureBootstrap(scope);
    const candidates = this.records(scope).filter((item) => item.id === id);
    if (version) {
      const exact = candidates.find((item) => item.version === version);
      if (exact) return exact;
      throw new Error(`LIFECYCLE_NOT_FOUND: ${id}@${version}`);
    }
    const pointer = this.readPointer(id, scope);
    const selected = pointer?.version ? candidates.find((item) => item.version === pointer.version && item.revisionDigest === pointer.revisionDigest) : undefined;
    if (selected) return selected;
    const latest = candidates.sort((left, right) => compareVersions(right.version, left.version))[0];
    if (!latest) throw new Error(`LIFECYCLE_NOT_FOUND: ${id}`);
    return latest;
  }

  private readState(record: GovernedLifecycleRecord, scope: LifecycleRegistryScope): GovernedLifecycleState {
    const target = this.statePath(record.id, record.version, scope);
    return fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, "utf8")) as GovernedLifecycleState : this.writeState(record, "REGISTERED", "runtime", "state-recovery", scope);
  }

  private writeState(record: GovernedLifecycleRecord, status: GovernedLifecycleState["status"], actor: string, evidenceRef: string, scope: LifecycleRegistryScope): GovernedLifecycleState {
    const material = { schema: "evopilot-governed-lifecycle-state/v1" as const, id: record.id, version: record.version, revisionDigest: record.revisionDigest, status, tombstone: status === "ARCHIVED", changedAt: new Date().toISOString(), changedBy: actor, evidenceRef };
    const state = { ...material, digest: digest(material) };
    this.atomicWrite(this.statePath(record.id, record.version, scope), state);
    return state;
  }

  private readPointer(id: string, scope: LifecycleRegistryScope): GovernedLifecyclePointer | undefined {
    const target = this.pointerPath(id, scope);
    return fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, "utf8")) as GovernedLifecyclePointer : undefined;
  }

  private writePointer(record: GovernedLifecycleRecord, active: boolean, action: GovernedLifecyclePointer["action"], actor: string, evidenceRef: string, scope: LifecycleRegistryScope, previousRevisionDigest?: string): GovernedLifecyclePointer {
    const material = { schema: GOVERNED_LIFECYCLE_POINTER_SCHEMA, id: record.id, active, ...(active ? { version: record.version, revisionDigest: record.revisionDigest } : {}), ...(previousRevisionDigest ? { previousRevisionDigest } : {}), changedAt: new Date().toISOString(), changedBy: actor, evidenceRef, action };
    const pointer = { ...material, digest: digest(material) };
    this.atomicWrite(this.pointerPath(record.id, scope), pointer);
    return pointer;
  }

  private appendAudit(action: GovernedLifecycleAudit["action"], record: GovernedLifecycleRecord, actor: string, evidenceRef: string, scope: LifecycleRegistryScope, details: Record<string, unknown>): void {
    const material = { schema: GOVERNED_LIFECYCLE_AUDIT_SCHEMA, id: `lifecycle-audit-${randomUUID()}`, tenantId: safe(scope.tenantId), workspaceId: safe(scope.workspaceId), lifecycleId: record.id, version: record.version, revisionDigest: record.revisionDigest, action, actor, evidenceRef, occurredAt: new Date().toISOString(), details };
    const audit = { ...material, digest: digest(material) };
    this.atomicWrite(path.join(this.scopeRoot(scope), "audit", `${safe(audit.id)}.json`), audit, true);
  }

  private scopeRoot(scope: LifecycleRegistryScope): string {
    const target = path.join(this.root, safe(scope.tenantId), safe(scope.workspaceId));
    for (const directory of [target, path.join(target, "revisions"), path.join(target, "states"), path.join(target, "active"), path.join(target, "audit"), path.join(target, "usage"), path.join(target, "locks")]) fs.mkdirSync(directory, { recursive: true });
    return target;
  }

  private withLifecycleLock<T>(id: string, scope: LifecycleRegistryScope, operation: () => T): T {
    const lock = path.join(this.scopeRoot(scope), "locks", `${safe(id)}.lock`);
    let acquired = false;
    try {
      try {
        fs.writeFileSync(lock, `${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })}\n`, { mode: 0o600, flag: "wx" });
        acquired = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const ageMs = Date.now() - fs.statSync(lock).mtimeMs;
        if (ageMs <= 300_000) throw new Error("LIFECYCLE_MUTATION_IN_PROGRESS");
        fs.unlinkSync(lock);
        fs.writeFileSync(lock, `${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString(), recoveredStaleLock: true })}\n`, { mode: 0o600, flag: "wx" });
        acquired = true;
      }
      return operation();
    } finally {
      if (acquired) fs.rmSync(lock, { force: true });
    }
  }

  private recordPath(id: string, version: string, scope: LifecycleRegistryScope): string { return path.join(this.scopeRoot(scope), "revisions", `${safe(id)}--${safe(version)}.json`); }
  private statePath(id: string, version: string, scope: LifecycleRegistryScope): string { return path.join(this.scopeRoot(scope), "states", `${safe(id)}--${safe(version)}.json`); }
  private pointerPath(id: string, scope: LifecycleRegistryScope): string { return path.join(this.scopeRoot(scope), "active", `${safe(id)}.json`); }

  private atomicWrite(target: string, value: unknown, exclusive = false): void {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (exclusive) {
      fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
      return;
    }
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, target);
  }
}

function entry(record: GovernedLifecycleRecord) {
  return { id: record.id, version: record.version, name: record.revision.definition.metadata.name, description: record.revision.definition.metadata.description, sourceRef: `registry://${record.tenantId}/${record.workspaceId}/${record.id}@${record.version}`, digest: record.revisionDigest };
}

function semanticChanges(before: unknown, after: unknown, prefix = "$"): Array<{ path: string; before: unknown; after: unknown }> {
  if (stableJson(before) === stableJson(after)) return [];
  if (!isRecord(before) || !isRecord(after)) return [{ path: prefix, before, after }];
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return keys.flatMap((key) => semanticChanges(before[key], after[key], `${prefix}.${key}`));
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function requireActorEvidence(actor: string, evidenceRef: string): void { if (!actor?.trim() || !evidenceRef?.trim()) throw new Error("LIFECYCLE_MUTATION_EVIDENCE_REQUIRED"); }
function safe(value: string): string { const normalized = String(value).trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, ""); if (!normalized) throw new Error("LIFECYCLE_ID_INVALID"); return normalized; }
function digest(value: unknown): string { return `sha256:${createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex")}`; }
function compareVersions(left: string, right: string): number { return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }); }
function readJsonDirectory<T>(directory: string): T[] { if (!fs.existsSync(directory)) return []; return fs.readdirSync(directory).filter((file) => file.endsWith(".json")).sort().map((file) => JSON.parse(fs.readFileSync(path.join(directory, file), "utf8")) as T); }
