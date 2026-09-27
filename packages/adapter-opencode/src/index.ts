import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  EVOPILOT_AGENT_EXECUTION_REQUEST_SCHEMA,
  EVOPILOT_AGENT_EXECUTION_RESULT_SCHEMA,
  EVOPILOT_AGENT_RUNTIME_PROFILE_SCHEMA,
  EVOPILOT_LIFECYCLE_EXECUTOR_ADAPTER_SCHEMA,
  assertAgentExecutionRequestV1Alpha1,
  assertAgentExecutionResultV1Alpha1,
  assertAgentProcessObservation,
  type EvoPilotAgentProcessObservationV1,
  type EvoPilotAgentExecutionRequestV1Alpha1,
  type EvoPilotAgentExecutionResultV1Alpha1,
  type EvoPilotAgentRuntimeProfileV1,
  type EvoPilotLifecycleExecutorAdapterV1
} from "@evopilot/contracts";

export const EVOPILOT_OPENCODE_ADAPTER_ID = "evopilot.opencode@1";
export const EVOPILOT_OPENCODE_PROFILE_VERSION = "1.0.0";

export interface OpenCodeRuntimeProfileInput {
  id?: string;
  runtimeVersion: string;
  host: string;
  provider: string;
  model: string;
  capabilities: string[];
  workspaceRoot: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface OpenCodeProcessInvocation {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  maxOutputBytes: number;
}

export interface OpenCodeProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  termination: "EXITED" | "TIMEOUT" | "OUTPUT_LIMIT" | "SPAWN_ERROR";
  stdout: string;
  stderr: string;
}

export type OpenCodeProcessRunner = (invocation: OpenCodeProcessInvocation) => Promise<OpenCodeProcessResult>;

export interface OpenCodeExecutorAdapterOptions {
  profile: EvoPilotAgentRuntimeProfileV1;
  executable?: string;
  receiptStoreDir?: string;
  environment?: NodeJS.ProcessEnv;
  runner?: OpenCodeProcessRunner;
}

export function createOpenCodeRuntimeProfile(input: OpenCodeRuntimeProfileInput): EvoPilotAgentRuntimeProfileV1 {
  const runtimeVersion = required("runtimeVersion", input.runtimeVersion);
  const host = required("host", input.host);
  const provider = required("provider", input.provider);
  const model = required("model", input.model);
  if (!/^[A-Za-z0-9._:@-]+$/.test(provider) || !/^[A-Za-z0-9._:@/-]+$/.test(model)) throw new Error("OPENCODE_PROFILE_MODEL_ROUTE_INVALID");
  const workspaceRoot = path.resolve(required("workspaceRoot", input.workspaceRoot));
  const capabilities = uniqueSorted(input.capabilities);
  if (capabilities.length === 0) throw new Error("OPENCODE_PROFILE_CAPABILITIES_REQUIRED");
  const timeoutMs = boundedInteger("timeoutMs", input.timeoutMs ?? 1_800_000, 1_000, 7_200_000);
  const maxOutputBytes = boundedInteger("maxOutputBytes", input.maxOutputBytes ?? 16 * 1024 * 1024, 1_024, 64 * 1024 * 1024);
  const qualification = {
    status: "QUALIFIED" as const,
    conformanceDigest: digest({ adapterId: EVOPILOT_OPENCODE_ADAPTER_ID, runtime: { name: "opencode", version: runtimeVersion }, capabilities, permissionMode: "HOST_MANAGED_DENY_UNDECLARED" }),
    evidenceRefs: ["contract://evopilot-agent-runtime-conformance/v1"]
  };
  const material: Omit<EvoPilotAgentRuntimeProfileV1, "digest"> = {
    schema: EVOPILOT_AGENT_RUNTIME_PROFILE_SCHEMA,
    id: input.id?.trim() || `opencode-${provider}-${model.replace(/[^A-Za-z0-9._-]+/g, "-")}`,
    version: EVOPILOT_OPENCODE_PROFILE_VERSION,
    adapterId: EVOPILOT_OPENCODE_ADAPTER_ID,
    runtime: { name: "opencode", version: runtimeVersion },
    host,
    provider,
    model,
    capabilities,
    constraints: {
      workspaceRoot,
      permissionMode: "HOST_MANAGED_DENY_UNDECLARED" as const,
      timeoutMs,
      maxOutputBytes
    },
    qualification
  };
  return { ...material, digest: digest(material) };
}

export function createOpenCodeExecutorAdapter(options: OpenCodeExecutorAdapterOptions): EvoPilotLifecycleExecutorAdapterV1 {
  validateProfile(options.profile);
  const profile = structuredClone(options.profile);
  const executable = options.executable?.trim() || "opencode";
  const runner = options.runner ?? runOpenCodeProcess;
  const origin = options.runner ? "SYNTHETIC_PROCESS_RUNNER" as const : "NATIVE_PROCESS_RUNNER" as const;
  const observations = new Map<string, EvoPilotAgentProcessObservationV1>();
  let receiptStoreDir = options.receiptStoreDir ? path.resolve(options.receiptStoreDir) : undefined;
  if (receiptStoreDir) {
    const inside = (root: string, candidate: string) => {const relative = path.relative(root, candidate); return relative === "" || !relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative);};
    if (origin === "NATIVE_PROCESS_RUNNER" && inside(profile.constraints.workspaceRoot, receiptStoreDir)) throw new Error("OPENCODE_RECEIPT_STORE_INSIDE_AGENT_WORKSPACE");
    fs.mkdirSync(receiptStoreDir, { recursive: true, mode: 0o700 });
    receiptStoreDir = fs.realpathSync(receiptStoreDir);
    if (origin === "NATIVE_PROCESS_RUNNER") {
      const workspace = fs.realpathSync(profile.constraints.workspaceRoot), stat = fs.statSync(receiptStoreDir);
      if (inside(workspace, receiptStoreDir) || (stat.mode & 0o077) !== 0 || process.getuid && stat.uid !== process.getuid()) throw new Error("OPENCODE_RECEIPT_STORE_NOT_PRIVATE");
    }
  }

  return {
    schema: EVOPILOT_LIFECYCLE_EXECUTOR_ADAPTER_SCHEMA,
    id: EVOPILOT_OPENCODE_ADAPTER_ID,
    host: profile.host,
    capabilities: [...profile.capabilities],
    profile,
    semanticContextSchema: "evopilot-semantic-agent-context/v1",
    processObservationSchema: "evopilot-agent-process-observation/v1",
    readProcessObservation(request, result) {
      assertAgentExecutionRequestV1Alpha1(request); assertRequestMatchesProfile(request, profile);
      assertAgentExecutionResultV1Alpha1(result, request);
      const observation = receiptStoreDir ? readStoredReceipt(receiptStoreDir, request.id)?.processObservation : observations.get(request.id);
      if (!observation) return undefined; // Old receipts never acquire invented provenance.
      assertAgentProcessObservation(observation, request, result, profile);
      return structuredClone(observation);
    },
    async execute(request) {
      assertAgentExecutionRequestV1Alpha1(request);
      assertRequestMatchesProfile(request, profile);
      const { requestDigest: claimedRequestDigest, ...requestMaterial } = request;
      const requestDigest = digest(requestMaterial);
      if (claimedRequestDigest !== requestDigest) throw new Error("OPENCODE_REQUEST_DIGEST_MISMATCH");
      const stored = receiptStoreDir ? readStoredReceipt(receiptStoreDir, request.id) : undefined;
      if (stored) {
        if (stored.requestDigest !== requestDigest) throw new Error("OPENCODE_REQUEST_REUSE_CONFLICT");
        assertAgentExecutionResultV1Alpha1(stored.result, request);
        return stored.result;
      }

      const prompt = stableJson({
        schema: "evopilot-opencode-task/v1",
        instruction: "Execute only the exact bounded request. Do not infer approval, expand capabilities, publish, or expose secrets. Return normal OpenCode event output.",
        request
      });
      const route = `${profile.provider}/${profile.model}`;
      const invocation: OpenCodeProcessInvocation = {
        executable,
        args: [
          "run",
          "--format", "json",
          "--model", route,
          "--title", `evopilot:${request.id}`,
          "--dir", profile.constraints.workspaceRoot,
          prompt
        ],
        cwd: profile.constraints.workspaceRoot,
        env: { ...process.env, ...(options.environment ?? {}) },
        timeoutMs: profile.constraints.timeoutMs,
        maxOutputBytes: profile.constraints.maxOutputBytes
      };

      let processResult: OpenCodeProcessResult;
      try {
        processResult = await runner(invocation);
      } catch {
        processResult = { exitCode: null, signal: null, termination: "SPAWN_ERROR", stdout: "", stderr: "" };
      }
      const normalized = normalizeOpenCodeResult(processResult);
      const receiptMaterial = {
        adapterId: EVOPILOT_OPENCODE_ADAPTER_ID,
        profileDigest: profile.digest,
        requestDigest,
        runtime: profile.runtime,
        route,
        origin,
        invocationDigest: digest({executable: invocation.executable, args: invocation.args, cwd: invocation.cwd}),
        termination: processResult.termination,
        exitCode: processResult.exitCode,
        signal: processResult.signal,
        stdoutDigest: digest(processResult.stdout),
        stderrDigest: digest(processResult.stderr),
        sessionIdsDigest: digest(normalized.sessionIds),
        eventCount: normalized.eventCount,
        errorEventCount: normalized.errorEventCount,
        completionEventCount: normalized.completionEventCount,
        parseFailures: normalized.parseFailures,
        cost: normalized.cost,
        usageCoverage: normalized.usageCoverage
      };
      const status = processResult.termination === "TIMEOUT" || processResult.termination === "OUTPUT_LIMIT" || processResult.signal !== null
        ? "UNCERTAIN"
        : processResult.termination === "SPAWN_ERROR" || processResult.exitCode !== 0 || normalized.parseFailures > 0 || normalized.errorEventCount > 0 || normalized.completionEventCount === 0
          ? "FAILED"
          : "SUCCEEDED";
      const result: EvoPilotAgentExecutionResultV1Alpha1 = {
        schema: EVOPILOT_AGENT_EXECUTION_RESULT_SCHEMA,
        requestId: request.id,
        requestDigest,
        bindingDigest: request.bindingDigest,
        idempotencyKey: request.idempotencyKey,
        status,
        receiptDigest: digest(receiptMaterial),
        effects: [],
        evidence: [
          `adapter=${EVOPILOT_OPENCODE_ADAPTER_ID}`,
          `runtime=opencode@${profile.runtime.version}`,
          `model=${route}`,
          `profile=${profile.digest}`,
          `request=${requestDigest}`,
          `events=${normalized.eventsDigest}`,
          `termination=${processResult.termination}`,
          `exitCode=${processResult.exitCode ?? "none"}`
        ],
        cost: normalized.cost,
        artifacts: []
      };
      assertAgentExecutionResultV1Alpha1(result, request);
      const processObservation: EvoPilotAgentProcessObservationV1 = {schema: "evopilot-agent-process-observation/v1", receiptDigest: result.receiptDigest, material: receiptMaterial};
      assertAgentProcessObservation(processObservation, request, result, profile);
      if (receiptStoreDir) writeStoredReceipt(receiptStoreDir, request.id, requestDigest, result, processObservation);
      else {
        if (observations.size >= 128) observations.delete(observations.keys().next().value!);
        observations.set(request.id, structuredClone(processObservation));
      }
      return result;
    }
  };
}

export async function runOpenCodeProcess(invocation: OpenCodeProcessInvocation): Promise<OpenCodeProcessResult> {
  return new Promise((resolve) => {
    let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let termination: OpenCodeProcessResult["termination"] = "EXITED";
    let settled = false;
    const child = spawn(invocation.executable, invocation.args, {
      cwd: invocation.cwd,
      env: invocation.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const finish = (exitCode: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode, signal, termination, stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8") });
    };
    const collect = (current: Buffer<ArrayBufferLike>, chunk: Buffer<ArrayBufferLike>): Buffer<ArrayBufferLike> => {
      const next = Buffer.concat([current, chunk]);
      if (next.length <= invocation.maxOutputBytes) return next;
      termination = "OUTPUT_LIMIT";
      child.kill("SIGTERM");
      return next.subarray(0, invocation.maxOutputBytes);
    };
    child.stdout.on("data", (chunk: Buffer) => { stdout = collect(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = collect(stderr, chunk); });
    child.once("error", () => { termination = "SPAWN_ERROR"; finish(null, null); });
    child.once("close", (code, signal) => finish(code, signal));
    const timer = setTimeout(() => {
      termination = "TIMEOUT";
      child.kill("SIGTERM");
    }, invocation.timeoutMs);
    timer.unref();
  });
}

function normalizeOpenCodeResult(result: OpenCodeProcessResult) {
  const lines = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const events: Record<string, unknown>[] = [];
  let parseFailures = 0;
  for (const line of lines) {
    try {
      const value = JSON.parse(line);
      if (value && typeof value === "object" && !Array.isArray(value)) events.push(value as Record<string, unknown>);
      else parseFailures += 1;
    } catch {
      parseFailures += 1;
    }
  }
  const sessionIds = uniqueSorted(events.map((event) => String(event.sessionID ?? "")).filter(Boolean));
  let errorEventCount = 0;
  let completionEventCount = 0;
  let amount = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let usageEvents = 0, completeUsageEvents = 0;
  for (const event of events) {
    if (event.type === "error") errorEventCount += 1;
    const part = event.part && typeof event.part === "object" ? event.part as Record<string, unknown> : undefined;
    const state = part?.state && typeof part.state === "object" ? part.state as Record<string, unknown> : undefined;
    if (event.type === "tool_use" && state?.status === "error") errorEventCount += 1;
    if (event.type === "text" || event.type === "step_finish") completionEventCount += 1;
    if (event.type === "step_finish") {
      usageEvents++;
      const t = part?.tokens && typeof part.tokens === "object" ? part.tokens as Record<string, unknown> : undefined;
      if (typeof part?.cost === "number" && Number.isFinite(part.cost) && part.cost >= 0 &&
        [t?.input,t?.output].every(n=>typeof n === "number" && Number.isSafeInteger(n) && n >= 0)) completeUsageEvents++;
    }
    if (event.type === "step_finish" && part) {
      amount += finiteNumber(part.cost);
      const tokens = part.tokens && typeof part.tokens === "object" ? part.tokens as Record<string, unknown> : undefined;
      inputTokens += finiteNumber(tokens?.input);
      outputTokens += finiteNumber(tokens?.output);
    }
  }
  const cost = { amount, currency: "USD", inputTokens, outputTokens };
  const usageCoverage: "COMPLETE" | "PARTIAL" | "UNAVAILABLE" = !completeUsageEvents ? "UNAVAILABLE" :
    completeUsageEvents === usageEvents && parseFailures === 0 && Number.isFinite(amount) &&
    Number.isSafeInteger(inputTokens) && Number.isSafeInteger(outputTokens) ? "COMPLETE" : "PARTIAL";
  return {
    eventCount: events.length,
    errorEventCount,
    completionEventCount,
    parseFailures,
    sessionIds,
    eventsDigest: digest(events),
    cost,
    usageCoverage
  };
}

function assertRequestMatchesProfile(request: EvoPilotAgentExecutionRequestV1Alpha1, profile: EvoPilotAgentRuntimeProfileV1): void {
  if (request.executor.host !== profile.host || request.executor.provider !== profile.provider || request.executor.model !== profile.model) throw new Error("OPENCODE_EXECUTOR_PROFILE_MISMATCH");
  const executorCapabilities = uniqueSorted(request.executor.capabilities);
  const { digest: _executorDigest, ...executorMaterial } = request.executor;
  const expectedExecutorDigest = digest({ ...executorMaterial, capabilities: executorCapabilities, allowedEffects: uniqueSorted(request.executor.allowedEffects), credentialRefs: uniqueSorted(request.executor.credentialRefs) });
  if (request.executor.digest !== expectedExecutorDigest) throw new Error("OPENCODE_EXECUTOR_DIGEST_MISMATCH");
  if (request.executor.agentRuntime.profileDigest !== profile.digest || request.executor.agentRuntime.qualificationDigest !== profile.qualification.conformanceDigest || request.executor.agentRuntime.adapterId !== profile.adapterId) throw new Error("OPENCODE_AGENT_RUNTIME_BINDING_MISMATCH");
  if (path.resolve(request.executor.sandbox.workspaceRef) !== path.resolve(profile.constraints.workspaceRoot) || request.executor.sandbox.permissionMode !== profile.constraints.permissionMode) throw new Error("OPENCODE_SANDBOX_BINDING_MISMATCH");
  const allowed = new Set(profile.capabilities);
  const missing = uniqueSorted(request.capabilities).filter((capability) => !allowed.has(capability) || !executorCapabilities.includes(capability));
  if (missing.length > 0) throw new Error(`OPENCODE_CAPABILITY_MISMATCH: ${missing.join(", ")}`);
}

function validateProfile(profile: EvoPilotAgentRuntimeProfileV1): void {
  if (profile?.schema !== EVOPILOT_AGENT_RUNTIME_PROFILE_SCHEMA || profile.adapterId !== EVOPILOT_OPENCODE_ADAPTER_ID) throw new Error("OPENCODE_PROFILE_SCHEMA_INVALID");
  const { digest: actual, ...material } = profile;
  if (actual !== digest(material)) throw new Error("OPENCODE_PROFILE_DIGEST_MISMATCH");
  if (profile.runtime.name !== "opencode" || !profile.runtime.version.trim()) throw new Error("OPENCODE_RUNTIME_IDENTITY_INVALID");
  if (profile.constraints.permissionMode !== "HOST_MANAGED_DENY_UNDECLARED") throw new Error("OPENCODE_PERMISSION_MODE_UNSAFE");
}

function readStoredReceipt(receiptStoreDir: string, requestId: string): { requestDigest: string; result: EvoPilotAgentExecutionResultV1Alpha1; processObservation?: EvoPilotAgentProcessObservationV1 } | undefined {
  const target = receiptPath(receiptStoreDir, requestId);
  let fd: number;
  try {fd = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);}
  catch (error) {if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error;}
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 65536) throw new Error("OPENCODE_RECEIPT_FILE_INVALID");
    const bytes = Buffer.alloc(stat.size + 1), length = fs.readSync(fd, bytes, 0, bytes.length, 0);
    if (length !== stat.size) throw new Error("OPENCODE_RECEIPT_DRIFT");
    return JSON.parse(bytes.subarray(0, length).toString("utf8"));
  } finally {fs.closeSync(fd);}
}

function writeStoredReceipt(receiptStoreDir: string, requestId: string, requestDigest: string, result: EvoPilotAgentExecutionResultV1Alpha1, processObservation: EvoPilotAgentProcessObservationV1): void {
  const target = receiptPath(receiptStoreDir, requestId);
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  const bytes = JSON.stringify({ schema: "evopilot-opencode-receipt/v1", requestDigest, result, processObservation }) + "\n";
  if (Buffer.byteLength(bytes) > 65536) throw new Error("OPENCODE_RECEIPT_FILE_INVALID");
  const fd = fs.openSync(temporary, "wx", 0o600);
  try {
    fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); fs.closeSync(fd);
    try {fs.linkSync(temporary, target);} catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const prior = readStoredReceipt(receiptStoreDir, requestId);
      if (!prior || prior.requestDigest !== requestDigest || digest(prior.result) !== digest(result) || digest(prior.processObservation) !== digest(processObservation)) throw new Error("OPENCODE_RECEIPT_CONFLICT");
    }
    fs.unlinkSync(temporary);
    const parent = fs.openSync(receiptStoreDir, fs.constants.O_RDONLY);
    try {fs.fsyncSync(parent);} finally {fs.closeSync(parent);}
  } finally {
    try {fs.closeSync(fd);} catch { /* already closed */ }
    try {fs.unlinkSync(temporary);} catch (error) {if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;}
  }
}

function receiptPath(receiptStoreDir: string, requestId: string): string {
  const safe = requestId.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!safe) throw new Error("OPENCODE_REQUEST_ID_INVALID");
  return path.join(receiptStoreDir, `${safe}.json`);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  const bytes = typeof value === "string" ? value : stableJson(value);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))].sort();
}

function required(name: string, value: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`OPENCODE_PROFILE_${name.toUpperCase()}_REQUIRED`);
  return normalized;
}

function boundedInteger(name: string, value: number, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`OPENCODE_PROFILE_${name.toUpperCase()}_INVALID`);
  return value;
}

function finiteNumber(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export type {
  EvoPilotAgentExecutionRequestV1Alpha1,
  EvoPilotAgentExecutionResultV1Alpha1,
  EvoPilotAgentRuntimeProfileV1,
  EvoPilotLifecycleExecutorAdapterV1
};
