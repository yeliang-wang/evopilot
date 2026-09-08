import { createHash } from "node:crypto";
import { parseDocument } from "yaml";
import { LifecycleActionRegistry, stableJson } from "./registry.js";
import {
  LIFECYCLE_DEFINITION_SCHEMA,
  LIFECYCLE_INPUT_BINDING_SCHEMA,
  LIFECYCLE_REVISION_SCHEMA,
  type LifecycleDefinition,
  type LifecycleInputBinding,
  type LifecycleInputDefinition,
  type LifecycleInputQuestion,
  type LifecycleInputSource,
  type LifecycleInputSources,
  type LifecycleRevision,
  type LifecycleStageDefinition,
  type LifecycleVisibilityCondition
} from "./types.js";

const ROOT_KEYS = new Set(["schema", "metadata", "imports", "capabilities", "obligations", "inputs", "stages"]);
const METADATA_KEYS = new Set(["id", "name", "version", "description", "labels"]);
const IMPORT_KEYS = new Set(["id", "version"]);
const INPUT_KEYS = new Set(["id", "type", "prompt", "description", "required", "default", "options", "pattern", "minimum", "maximum", "visibleWhen", "sensitive", "review"]);
const CONDITION_KEYS = new Set(["input", "equals", "exists"]);
const STAGE_KEYS = new Set(["id", "name", "needs", "when", "action", "capabilities", "decision", "retry", "timeoutSeconds"]);
const ACTION_KEYS = new Set(["uses", "with"]);
const DECISION_KEYS = new Set(["mode", "authority", "prompt"]);
const RETRY_KEYS = new Set(["maxAttempts"]);
const OBLIGATION_KEYS = new Set(["requiredEvidence", "validators", "constraints", "requestedPermissions", "disabledHarnessEvidence", "disabledHarnessValidators", "weakenedHarnessConstraints"]);
const FORBIDDEN_EXECUTABLE_KEYS = new Set(["run", "script", "shell", "command", "exec", "javascript", "python", "code", "password", "token", "secret", "apikey", "api-key", "privatekey", "private-key", "credential"]);
const INPUT_TYPES = new Set(["string", "integer", "number", "boolean", "enum", "string-array", "secret-ref"]);
const DECISION_MODES = new Set(["AUTO", "POLICY", "HUMAN", "EXTERNAL_SIGNAL", "DISABLED"]);

export interface LifecycleSource {
  sourceRef: string;
  text: string;
}

export interface LifecycleDefinitionCatalog {
  find(id: string, version: string): LifecycleSource | undefined;
}

export function parseLifecycleYaml(source: LifecycleSource, registry = new LifecycleActionRegistry()): LifecycleDefinition {
  if (Buffer.byteLength(source.text, "utf8") > 256 * 1024) throw new Error("LIFECYCLE_RESOURCE_LIMIT: YAML exceeds 256 KiB");
  const document = parseDocument(source.text, { uniqueKeys: true });
  if (document.errors.length > 0) throw new Error(`LIFECYCLE_YAML_INVALID: ${document.errors.map((error) => error.message).join("; ")}`);
  const value = document.toJS({ maxAliasCount: 0 });
  assertObject(value, "lifecycle");
  rejectUnknown(value, ROOT_KEYS, "lifecycle");
  rejectExecutableKeys(value, "lifecycle");
  if (value.schema !== LIFECYCLE_DEFINITION_SCHEMA) throw new Error(`LIFECYCLE_SCHEMA_UNSUPPORTED: expected ${LIFECYCLE_DEFINITION_SCHEMA}`);
  assertObject(value.metadata, "metadata");
  rejectUnknown(value.metadata, METADATA_KEYS, "metadata");
  requireString(value.metadata.id, "metadata.id");
  requireString(value.metadata.name, "metadata.name");
  requireString(value.metadata.version, "metadata.version");
  if (value.metadata.labels !== undefined) assertStringMap(value.metadata.labels, "metadata.labels");
  const imports = arrayOfObjects(value.imports, "imports").map((entry, index) => {
    rejectUnknown(entry, IMPORT_KEYS, `imports[${index}]`);
    requireString(entry.id, `imports[${index}].id`);
    requireString(entry.version, `imports[${index}].version`);
    return entry;
  });
  if (imports.length > 32) throw new Error("LIFECYCLE_RESOURCE_LIMIT: at most 32 imports are allowed");
  const inputs = arrayOfObjects(value.inputs, "inputs").map((entry, index) => normalizeInput(entry, index));
  if (inputs.length > 128) throw new Error("LIFECYCLE_RESOURCE_LIMIT: at most 128 inputs are allowed");
  const inputIds = uniqueIds(inputs, "input");
  const stages = arrayOfObjects(value.stages, "stages", true).map((entry, index) => normalizeStage(entry, index, registry));
  if (stages.length > 256) throw new Error("LIFECYCLE_RESOURCE_LIMIT: at most 256 stages are allowed");
  uniqueIds(stages, "stage");
  for (const input of inputs) validateCondition(input.visibleWhen, inputIds, `input ${input.id}`);
  for (const stage of stages) validateCondition(stage.when, inputIds, `stage ${stage.id}`);
  const capabilities = Array.isArray(value.capabilities) ? stringArray(value.capabilities, "capabilities") : [];
  registry.validateCapabilities(capabilities);
  let obligations: LifecycleDefinition["obligations"];
  if (value.obligations !== undefined) {
    assertObject(value.obligations, "obligations");
    rejectUnknown(value.obligations, OBLIGATION_KEYS, "obligations");
    obligations = Object.fromEntries(Object.entries(value.obligations).map(([key, child]) => [key, stringArray(child, `obligations.${key}`)]));
  }
  return {
    schema: LIFECYCLE_DEFINITION_SCHEMA,
    metadata: value.metadata as unknown as LifecycleDefinition["metadata"],
    ...(imports.length > 0 ? { imports: imports as unknown as LifecycleDefinition["imports"] } : {}),
    ...(capabilities.length > 0 ? { capabilities } : {}),
    ...(obligations ? { obligations } : {}),
    ...(inputs.length > 0 ? { inputs } : {}),
    stages
  };
}

export function resolveLifecycleRevision(
  source: LifecycleSource,
  catalog: LifecycleDefinitionCatalog,
  registry = new LifecycleActionRegistry()
): LifecycleRevision {
  const visiting = new Set<string>();
  const visited = new Map<string, { definition: LifecycleDefinition; digest: string }>();
  const resolve = (candidate: LifecycleSource): { definition: LifecycleDefinition; digest: string; sourceDigests: string[] } => {
    const definition = parseLifecycleYaml(candidate, registry);
    const key = `${definition.metadata.id}@${definition.metadata.version}`;
    if (visiting.has(key)) throw new Error(`LIFECYCLE_IMPORT_CYCLE: ${[...visiting, key].join(" -> ")}`);
    const cached = visited.get(key);
    if (cached) return { definition: cached.definition, digest: cached.digest, sourceDigests: [cached.digest] };
    visiting.add(key);
    const imported = (definition.imports ?? []).map((ref) => {
      const found = catalog.find(ref.id, ref.version);
      if (!found) throw new Error(`LIFECYCLE_IMPORT_NOT_FOUND: ${ref.id}@${ref.version}`);
      return resolve(found);
    });
    visiting.delete(key);
    const merged = mergeDefinitions(definition, imported.map((item) => item.definition));
    validateDeclaredCapabilities(merged, registry);
    const digest = sha256(stableJson(merged));
    visited.set(key, { definition: merged, digest });
    return { definition: merged, digest, sourceDigests: unique([sha256(candidate.text), ...imported.flatMap((item) => item.sourceDigests)]) };
  };
  const resolved = resolve(source);
  const graph = lifecycleGraph(resolved.definition.stages);
  return {
    schema: LIFECYCLE_REVISION_SCHEMA,
    ref: { id: resolved.definition.metadata.id, version: resolved.definition.metadata.version },
    digest: resolved.digest,
    sourceDigests: resolved.sourceDigests,
    definition: resolved.definition,
    graph
  };
}

export function resolveLifecycleInputs(revision: LifecycleRevision, sources: LifecycleInputSources): LifecycleInputBinding {
  const values: LifecycleInputBinding["values"] = {};
  const definitions = revision.definition.inputs ?? [];
  const orderedSources: Array<{ source: LifecycleInputSource; sourceRef: string; values: Record<string, unknown> }> = [
    { source: "user", sourceRef: "answers", values: sources.answers ?? {} },
    { source: "project", sourceRef: "project-facts", values: sources.projectFacts ?? {} },
    { source: "organization", sourceRef: "organization-defaults", values: sources.organizationDefaults ?? {} },
    { source: "runtime", sourceRef: "runtime-capabilities", values: sources.runtimeCapabilities ?? {} },
    { source: "deterministic", sourceRef: "deterministic-values", values: sources.deterministicValues ?? {} }
  ];
  for (const definition of definitions) {
    const provided = orderedSources.find((candidate) => Object.prototype.hasOwnProperty.call(candidate.values, definition.id));
    const hasDefault = definition.default !== undefined;
    if (!provided && !hasDefault) continue;
    const raw = provided ? provided.values[definition.id] : definition.default;
    validateInputValue(definition, raw);
    values[definition.id] = {
      id: definition.id,
      value: raw,
      source: provided?.source ?? "default",
      sourceRef: provided?.sourceRef ?? `lifecycle:${revision.ref.id}@${revision.ref.version}`,
      sensitive: definition.type === "secret-ref" || definition.sensitive === true
    };
  }
  const relevant = definitions.filter((definition) => conditionMatches(definition.visibleWhen, values));
  const unresolved = relevant.filter((definition) => definition.required !== false && !values[definition.id]).map((definition) => definition.id);
  const next = relevant.find((definition) => unresolved.includes(definition.id));
  const review = relevant.filter((definition) => values[definition.id]).map((definition) => ({
    id: definition.id,
    displayValue: values[definition.id].sensitive ? "<secret-ref>" : values[definition.id].value,
    source: values[definition.id].source,
    sourceRef: values[definition.id].sourceRef
  }));
  const material = { lifecycleDigest: revision.digest, values, unresolved };
  return {
    schema: LIFECYCLE_INPUT_BINDING_SCHEMA,
    lifecycleDigest: revision.digest,
    digest: sha256(stableJson(material)),
    status: unresolved.length > 0 ? "INCOMPLETE" : "READY_FOR_REVIEW",
    values,
    unresolved,
    review,
    ...(next ? { nextQuestion: questionFromInput(next) } : {})
  };
}

export function interpolateLifecycleValue(value: unknown, binding: LifecycleInputBinding): unknown {
  if (Array.isArray(value)) return value.map((child) => interpolateLifecycleValue(child, binding));
  if (typeof value === "object" && value !== null) return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, interpolateLifecycleValue(child, binding)]));
  if (typeof value !== "string") return value;
  const exact = value.match(/^\$\{inputs\.([A-Za-z0-9._-]+)\}$/);
  if (exact) return binding.values[exact[1]]?.value;
  return value.replace(/\$\{inputs\.([A-Za-z0-9._-]+)\}/g, (_match, id: string) => String(binding.values[id]?.value ?? ""));
}

export function conditionMatches(condition: LifecycleVisibilityCondition | undefined, values: LifecycleInputBinding["values"]): boolean {
  if (!condition) return true;
  const resolved = values[condition.input];
  if (condition.exists !== undefined && Boolean(resolved) !== condition.exists) return false;
  if (condition.equals !== undefined && resolved?.value !== condition.equals) return false;
  return true;
}

function normalizeInput(value: Record<string, unknown>, index: number): LifecycleInputDefinition {
  rejectUnknown(value, INPUT_KEYS, `inputs[${index}]`);
  requireString(value.id, `inputs[${index}].id`);
  requireString(value.type, `inputs[${index}].type`);
  requireString(value.prompt, `inputs[${index}].prompt`);
  if (!INPUT_TYPES.has(value.type)) throw new Error(`LIFECYCLE_INPUT_TYPE_UNSUPPORTED: ${value.type}`);
  if (value.visibleWhen !== undefined) {
    assertObject(value.visibleWhen, `inputs[${index}].visibleWhen`);
    rejectUnknown(value.visibleWhen, CONDITION_KEYS, `inputs[${index}].visibleWhen`);
  }
  const normalized = value as unknown as LifecycleInputDefinition;
  if (/(?:password|token|secret|api.?key|private.?key|credential)/i.test(normalized.id) && normalized.type !== "secret-ref") throw new Error(`LIFECYCLE_RAW_SENSITIVE_INPUT_FORBIDDEN: ${normalized.id} must use type=secret-ref`);
  if (normalized.type === "secret-ref" && normalized.default !== undefined) throw new Error(`LIFECYCLE_SECRET_DEFAULT_FORBIDDEN: ${normalized.id}`);
  if (normalized.sensitive && normalized.type !== "secret-ref") throw new Error(`LIFECYCLE_RAW_SENSITIVE_INPUT_FORBIDDEN: ${normalized.id} must use type=secret-ref`);
  if (normalized.default !== undefined) validateInputValue(normalized, normalized.default);
  if (normalized.pattern && (normalized.pattern.length > 128 || /\\[1-9]|\(\?[=!<]/.test(normalized.pattern))) throw new Error(`LIFECYCLE_INPUT_PATTERN_UNSAFE: ${normalized.id}`);
  return normalized;
}

function normalizeStage(value: Record<string, unknown>, index: number, registry: LifecycleActionRegistry): LifecycleStageDefinition {
  rejectUnknown(value, STAGE_KEYS, `stages[${index}]`);
  requireString(value.id, `stages[${index}].id`);
  requireString(value.name, `stages[${index}].name`);
  assertObject(value.action, `stages[${index}].action`);
  rejectUnknown(value.action, ACTION_KEYS, `stages[${index}].action`);
  requireString(value.action.uses, `stages[${index}].action.uses`);
  if (value.action.with !== undefined) assertObject(value.action.with, `stages[${index}].action.with`);
  registry.validateParameters(value.action.uses, (value.action.with ?? {}) as Record<string, unknown>);
  assertObject(value.decision, `stages[${index}].decision`);
  rejectUnknown(value.decision, DECISION_KEYS, `stages[${index}].decision`);
  requireString(value.decision.mode, `stages[${index}].decision.mode`);
  if (!DECISION_MODES.has(value.decision.mode)) throw new Error(`LIFECYCLE_DECISION_MODE_UNSUPPORTED: ${value.decision.mode}`);
  const action = registry.resolve(value.action.uses)!;
  const capabilities = value.capabilities === undefined ? [...action.capabilities] : stringArray(value.capabilities, `stages[${index}].capabilities`);
  const unavailable = capabilities.filter((capability) => !action.capabilities.includes(capability));
  if (unavailable.length > 0) throw new Error(`LIFECYCLE_ACTION_CAPABILITY_MISMATCH: ${value.id} requests ${unavailable.join(", ")}`);
  if ((action.effect === "IRREVERSIBLE" || action.effect === "EXTERNAL") && !["HUMAN", "EXTERNAL_SIGNAL", "DISABLED"].includes(String(value.decision.mode))) {
    throw new Error(`LIFECYCLE_UNSAFE_AUTOMATION: ${value.id} uses ${action.effect} action ${value.action.uses}`);
  }
  if (value.when !== undefined) {
    assertObject(value.when, `stages[${index}].when`);
    rejectUnknown(value.when, CONDITION_KEYS, `stages[${index}].when`);
  }
  if (value.retry !== undefined) {
    assertObject(value.retry, `stages[${index}].retry`);
    rejectUnknown(value.retry, RETRY_KEYS, `stages[${index}].retry`);
    if (!Number.isInteger(value.retry.maxAttempts) || Number(value.retry.maxAttempts) < 1 || Number(value.retry.maxAttempts) > 10) throw new Error(`LIFECYCLE_RETRY_LIMIT_INVALID: ${value.id}`);
  }
  if (value.timeoutSeconds !== undefined && (!Number.isInteger(value.timeoutSeconds) || Number(value.timeoutSeconds) < 1 || Number(value.timeoutSeconds) > 86400)) throw new Error(`LIFECYCLE_TIMEOUT_INVALID: ${value.id}`);
  return { ...(value as unknown as LifecycleStageDefinition), capabilities };
}

function mergeDefinitions(root: LifecycleDefinition, imports: LifecycleDefinition[]): LifecycleDefinition {
  const inputs = [...imports.flatMap((item) => item.inputs ?? []), ...(root.inputs ?? [])];
  const stages = [...imports.flatMap((item) => item.stages), ...root.stages];
  uniqueIds(inputs, "input");
  uniqueIds(stages, "stage");
  const obligations = [
    ...imports.map((item) => item.obligations ?? {}),
    root.obligations ?? {}
  ].reduce<NonNullable<LifecycleDefinition["obligations"]>>((result, item) => ({
    requiredEvidence: unique([...(result.requiredEvidence ?? []), ...(item.requiredEvidence ?? [])]),
    validators: unique([...(result.validators ?? []), ...(item.validators ?? [])]),
    constraints: unique([...(result.constraints ?? []), ...(item.constraints ?? [])]),
    requestedPermissions: unique([...(result.requestedPermissions ?? []), ...(item.requestedPermissions ?? [])]),
    disabledHarnessEvidence: unique([...(result.disabledHarnessEvidence ?? []), ...(item.disabledHarnessEvidence ?? [])]),
    disabledHarnessValidators: unique([...(result.disabledHarnessValidators ?? []), ...(item.disabledHarnessValidators ?? [])]),
    weakenedHarnessConstraints: unique([...(result.weakenedHarnessConstraints ?? []), ...(item.weakenedHarnessConstraints ?? [])])
  }), {});
  return {
    ...root,
    imports: root.imports,
    capabilities: unique([...imports.flatMap((item) => item.capabilities ?? []), ...(root.capabilities ?? [])]),
    obligations,
    inputs,
    stages
  };
}

function validateDeclaredCapabilities(definition: LifecycleDefinition, registry: LifecycleActionRegistry): void {
  const declared = new Set(definition.capabilities ?? []);
  registry.validateCapabilities([...declared]);
  for (const stage of definition.stages) {
    const missing = (stage.capabilities ?? []).filter((capability) => !declared.has(capability));
    if (missing.length > 0) throw new Error(`LIFECYCLE_CAPABILITY_NOT_DECLARED: stage ${stage.id} requires ${missing.join(", ")}`);
  }
}

function lifecycleGraph(stages: LifecycleStageDefinition[]): LifecycleRevision["graph"] {
  const ids = new Set(stages.map((stage) => stage.id));
  const edges = stages.flatMap((stage) => (stage.needs ?? []).map((dependency) => {
    if (!ids.has(dependency)) throw new Error(`LIFECYCLE_STAGE_DEPENDENCY_NOT_FOUND: ${stage.id} needs ${dependency}`);
    return { from: dependency, to: stage.id };
  }));
  const indegree = new Map([...ids].map((id) => [id, 0]));
  for (const edge of edges) indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  const order: string[] = [];
  const ready = stages.map((stage) => stage.id).filter((id) => indegree.get(id) === 0);
  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(id);
    for (const edge of edges.filter((candidate) => candidate.from === id)) {
      indegree.set(edge.to, (indegree.get(edge.to) ?? 1) - 1);
      if (indegree.get(edge.to) === 0) ready.push(edge.to);
    }
  }
  if (order.length !== stages.length) throw new Error("LIFECYCLE_STAGE_CYCLE");
  return { order, edges };
}

function validateInputValue(definition: LifecycleInputDefinition, value: unknown): void {
  const fail = (detail: string): never => { throw new Error(`LIFECYCLE_INPUT_INVALID: ${definition.id} ${detail}`); };
  if (definition.type === "string" && typeof value !== "string") fail("must be a string");
  if (definition.type === "integer" && !Number.isInteger(value)) fail("must be an integer");
  if (definition.type === "number" && typeof value !== "number") fail("must be a number");
  if (definition.type === "boolean" && typeof value !== "boolean") fail("must be a boolean");
  if (definition.type === "string-array" && (!Array.isArray(value) || value.some((item) => typeof item !== "string"))) fail("must be a string array");
  if (definition.type === "enum" && !(definition.options ?? []).includes(value as never)) fail("must be one of the declared options");
  if (definition.type === "secret-ref" && (typeof value !== "string" || !/^secret:\/\/[A-Za-z0-9._/-]+$/.test(value))) fail("must be a SecretRef such as secret://scope/name");
  if (typeof value === "string" && definition.pattern && !new RegExp(definition.pattern).test(value)) fail("does not match pattern");
  if (typeof value === "number" && definition.minimum !== undefined && value < definition.minimum) fail(`must be >= ${definition.minimum}`);
  if (typeof value === "number" && definition.maximum !== undefined && value > definition.maximum) fail(`must be <= ${definition.maximum}`);
}

function questionFromInput(input: LifecycleInputDefinition): LifecycleInputQuestion {
  return {
    id: input.id,
    type: input.type,
    prompt: input.prompt,
    description: input.description,
    required: input.required !== false,
    default: input.default,
    options: input.options,
    pattern: input.pattern,
    minimum: input.minimum,
    maximum: input.maximum,
    sensitive: input.type === "secret-ref" || input.sensitive === true
  };
}

function validateCondition(condition: LifecycleVisibilityCondition | undefined, inputIds: Set<string>, owner: string): void {
  if (condition && !inputIds.has(condition.input)) throw new Error(`LIFECYCLE_CONDITION_INPUT_NOT_FOUND: ${owner} references ${condition.input}`);
}

function rejectExecutableKeys(value: unknown, path: string): void {
  if (Array.isArray(value)) return value.forEach((child, index) => rejectExecutableKeys(child, `${path}[${index}]`));
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_EXECUTABLE_KEYS.has(key.toLowerCase())) throw new Error(`LIFECYCLE_EXECUTABLE_FIELD_FORBIDDEN: ${path}.${key}`);
    rejectExecutableKeys(child, `${path}.${key}`);
  }
}

function rejectUnknown(value: Record<string, unknown>, allowed: Set<string>, path: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`LIFECYCLE_UNKNOWN_FIELD: ${path}.${unknown[0]}`);
}

function arrayOfObjects(value: unknown, path: string, required = false): Record<string, unknown>[] {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || (required && value.length === 0)) throw new Error(`LIFECYCLE_FIELD_INVALID: ${path} must be ${required ? "a non-empty" : "an"} array`);
  return value.map((child, index) => { assertObject(child, `${path}[${index}]`); return child; });
}

function uniqueIds<T extends { id: string }>(items: T[], kind: string): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`LIFECYCLE_DUPLICATE_${kind.toUpperCase()}_ID: ${item.id}`);
    ids.add(item.id);
  }
  return ids;
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) throw new Error(`LIFECYCLE_FIELD_INVALID: ${path} must contain strings`);
  return value as string[];
}

function assertStringMap(value: unknown, path: string): void {
  assertObject(value, path);
  if (Object.values(value).some((child) => typeof child !== "string")) throw new Error(`LIFECYCLE_FIELD_INVALID: ${path} must contain string values`);
}

function assertObject(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`LIFECYCLE_FIELD_INVALID: ${path} must be an object`);
}

function requireString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`LIFECYCLE_FIELD_REQUIRED: ${path}`);
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
