import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  EVOPILOT_AGENT_EXECUTION_RESULT_SCHEMA,
  EVOPILOT_AGENT_RUNTIME_PROFILE_SCHEMA,
  EVOPILOT_LIFECYCLE_EXECUTOR_ADAPTER_SCHEMA,
  executeConformantLifecycleAdapter
} from "../../packages/contracts/dist/index.js";
import {
  EVOPILOT_OPENCODE_ADAPTER_ID,
  createOpenCodeExecutorAdapter,
  createOpenCodeRuntimeProfile
} from "../../packages/adapter-opencode/dist/index.js";

const digest = (value) => `sha256:${createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex")}`;

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function executionRequest(profile, overrides = {}) {
  const executorMaterial = {
    host: profile.host,
    provider: profile.provider,
    model: profile.model,
    capabilities: [...profile.capabilities].sort()
  };
  return {
    schema: "evopilot-agent-execution-request/v1alpha1",
    id: "execution-run-stage-1",
    runId: "run-a",
    stageId: "build",
    action: "build.verify",
    actionVersion: "1",
    bindingDigest: digest("binding"),
    inputs: { projectRoot: "/workspace", profile: "release" },
    capabilities: ["build.execute"],
    executor: { ...executorMaterial, digest: digest(executorMaterial) },
    ...overrides
  };
}

test("OpenCode adapter binds exact runtime/model/capabilities and reuses an immutable receipt", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-opencode-adapter-"));
  const workspaceRoot = path.join(root, "workspace");
  fs.mkdirSync(workspaceRoot);
  const profile = createOpenCodeRuntimeProfile({
    id: "opencode-acceptance",
    runtimeVersion: "1.18.29",
    host: "opencode-local",
    provider: "zhipu",
    model: "GLM-5-Turbo",
    capabilities: ["test.execute", "build.execute"],
    workspaceRoot,
    timeoutMs: 60_000,
    maxOutputBytes: 1024 * 1024
  });
  assert.equal(profile.schema, EVOPILOT_AGENT_RUNTIME_PROFILE_SCHEMA);
  assert.match(profile.digest, /^sha256:[a-f0-9]{64}$/);

  let invocations = 0;
  const adapter = createOpenCodeExecutorAdapter({
    profile,
    receiptStoreDir: path.join(root, "receipts"),
    runner: async (invocation) => {
      invocations += 1;
      assert.equal(invocation.executable, "opencode");
      assert.deepEqual(invocation.args.slice(0, 5), ["run", "--format", "json", "--model", "zhipu/GLM-5-Turbo"]);
      assert.equal(invocation.args.includes("--auto"), false);
      assert.equal(invocation.args.includes("--dangerously-skip-permissions"), false);
      assert.equal(invocation.cwd, workspaceRoot);
      return {
        exitCode: 0,
        signal: null,
        termination: "EXITED",
        stdout: [
          JSON.stringify({ type: "step_finish", sessionID: "session-a", part: { type: "step-finish", cost: 0.12, tokens: { input: 100, output: 25 } } }),
          JSON.stringify({ type: "text", sessionID: "session-a", part: { type: "text", text: "done", time: { end: 1 } } })
        ].join("\n"),
        stderr: ""
      };
    }
  });
  assert.equal(adapter.schema, EVOPILOT_LIFECYCLE_EXECUTOR_ADAPTER_SCHEMA);
  assert.equal(adapter.id, EVOPILOT_OPENCODE_ADAPTER_ID);
  const request = executionRequest(profile);
  const first = await executeConformantLifecycleAdapter(adapter, request);
  const replay = await executeConformantLifecycleAdapter(adapter, request);
  assert.equal(first.status, "SUCCEEDED");
  assert.equal(first.receiptDigest, replay.receiptDigest);
  assert.equal(first.cost.inputTokens, 100);
  assert.equal(first.cost.outputTokens, 25);
  assert.equal(invocations, 1);
  assert.equal(JSON.stringify(first).includes("done"), false, "raw model output must not enter the receipt");
});

test("OpenCode adapter fails closed on profile drift, request reuse conflict, hostile output, and uncertain execution", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-opencode-negative-"));
  const profile = createOpenCodeRuntimeProfile({
    runtimeVersion: "1.18.29",
    host: "opencode-local",
    provider: "zhipu",
    model: "GLM-5-Turbo",
    capabilities: ["agent.execute"],
    workspaceRoot: root
  });
  const receipts = path.join(root, "receipts");
  const successRunner = async () => ({
    exitCode: 0,
    signal: null,
    termination: "EXITED",
    stdout: JSON.stringify({ type: "text", sessionID: "session-b", part: { type: "text", text: "ok", time: { end: 1 } } }),
    stderr: ""
  });
  const adapter = createOpenCodeExecutorAdapter({ profile, receiptStoreDir: receipts, runner: successRunner });
  const request = executionRequest(profile, { capabilities: ["agent.execute"] });
  await executeConformantLifecycleAdapter(adapter, request);
  await assert.rejects(() => adapter.execute({ ...request, inputs: { changed: true } }), /OPENCODE_REQUEST_REUSE_CONFLICT/);
  await assert.rejects(() => adapter.execute({ ...request, id: "drift", executor: { ...request.executor, model: "other" } }), /OPENCODE_EXECUTOR_PROFILE_MISMATCH/);
  await assert.rejects(() => adapter.execute({ ...request, id: "capability", capabilities: ["release.publish"] }), /OPENCODE_CAPABILITY_MISMATCH/);

  const uncertain = createOpenCodeExecutorAdapter({
    profile,
    runner: async () => ({ exitCode: null, signal: "SIGTERM", termination: "TIMEOUT", stdout: "", stderr: "" })
  });
  assert.equal((await executeConformantLifecycleAdapter(uncertain, { ...request, id: "timeout" })).status, "UNCERTAIN");

  const hostile = {
    schema: EVOPILOT_LIFECYCLE_EXECUTOR_ADAPTER_SCHEMA,
    id: "independent.hostile@1",
    host: "independent-host",
    capabilities: ["agent.execute"],
    profile: {
      schema: EVOPILOT_AGENT_RUNTIME_PROFILE_SCHEMA,
      id: "hostile",
      version: "1.0.0",
      adapterId: "independent.hostile@1",
      runtime: { name: "fixture", version: "1.0.0" },
      host: "independent-host",
      provider: "fixture",
      model: "fixture",
      capabilities: ["agent.execute"],
      constraints: { workspaceRoot: root, permissionMode: "HOST_MANAGED_DENY_UNDECLARED", timeoutMs: 1000, maxOutputBytes: 1024 },
      digest: digest("profile")
    },
    execute: async (input) => ({
      schema: EVOPILOT_AGENT_EXECUTION_RESULT_SCHEMA,
      requestId: input.id,
      requestDigest: digest(input),
      status: "SUCCEEDED",
      receiptDigest: digest("receipt"),
      evidence: ["apiKey=raw-secret"]
    })
  };
  await assert.rejects(() => executeConformantLifecycleAdapter(hostile, executionRequest(hostile.profile)), /AGENT_EXECUTION_RESULT_EVIDENCE_UNSAFE/);
});

test("an independent adapter satisfies the same public conformance contract", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-independent-adapter-"));
  const profileMaterial = {
    schema: EVOPILOT_AGENT_RUNTIME_PROFILE_SCHEMA,
    id: "independent-reference",
    version: "1.0.0",
    adapterId: "independent.reference@1",
    runtime: { name: "reference-host", version: "1.0.0" },
    host: "independent-host",
    provider: "deterministic",
    model: "no-model",
    capabilities: ["agent.execute"],
    constraints: { workspaceRoot: root, permissionMode: "HOST_MANAGED_DENY_UNDECLARED", timeoutMs: 1000, maxOutputBytes: 1024 }
  };
  const profile = { ...profileMaterial, digest: digest(profileMaterial) };
  const adapter = {
    schema: EVOPILOT_LIFECYCLE_EXECUTOR_ADAPTER_SCHEMA,
    id: profile.adapterId,
    host: profile.host,
    capabilities: [...profile.capabilities],
    profile,
    async execute(request) {
      return {
        schema: EVOPILOT_AGENT_EXECUTION_RESULT_SCHEMA,
        requestId: request.id,
        requestDigest: digest(request),
        status: "SUCCEEDED",
        receiptDigest: digest({ adapter: profile.adapterId, request }),
        evidence: [`adapter=${profile.adapterId}`, `profile=${profile.digest}`],
        cost: { amount: 0, currency: "USD", inputTokens: 0, outputTokens: 0 },
        artifacts: []
      };
    }
  };
  const request = executionRequest(profile, { capabilities: ["agent.execute"] });
  const result = await executeConformantLifecycleAdapter(adapter, request);
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(result.schema, EVOPILOT_AGENT_EXECUTION_RESULT_SCHEMA);
});
