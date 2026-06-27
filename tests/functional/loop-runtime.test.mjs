import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createServer } from "../../packages/server/dist/index.js";

test("EvoPilot Loop Runtime supports long-task loop engineering controls", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-loop-runtime-"));
  const server = createServer({
    dataRoot,
    runtimeMode: "debug",
    tokens: [
      { name: "viewer", token: "viewer-token", role: "viewer" },
      { name: "operator", token: "operator-token", role: "operator" }
    ]
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const graph = await jsonFetch(`${baseUrl}/api/v1/executor-graphs`, {
      method: "POST",
      token: "operator-token",
      body: {
        id: "product-evolution-dag",
        name: "Product Evolution DAG",
        mode: "parallel",
        nodes: [
          { id: "plan", type: "llm", name: "Plan", config: { adapterId: "evopilot.llm-context-adapter" } },
          { id: "upgrade", type: "code-upgrader", name: "Upgrade", config: { adapterId: "evopilot.code-upgrader-adapter" } },
          { id: "validate", type: "validator", name: "Validate" },
          { id: "approve", type: "approval", name: "Approve" }
        ],
        edges: [
          { from: "plan", to: "upgrade" },
          { from: "upgrade", to: "validate" },
          { from: "validate", to: "approve" }
        ]
      }
    });
    assert.equal(graph.status, 201);
    assert.equal(graph.body.data.schema, "evopilot-executor-graph/v1");
    assert.equal(graph.body.data.nodes.length, 4);
    assert.equal(graph.body.data.mode, "parallel");

    const storeRuntime = await jsonFetch(`${baseUrl}/api/v1/loop-store`, {
      token: "viewer-token"
    });
    assert.equal(storeRuntime.status, 200);
    assert.equal(storeRuntime.body.data.backend, "file");
    assert.equal(storeRuntime.body.data.recovery, "idempotent-replay");

    const created = await jsonFetch(`${baseUrl}/api/v1/loops`, {
      method: "POST",
      token: "operator-token",
      idempotencyKey: "create-workbuddy-loop",
      body: {
        id: "workbuddy-long-task",
        source: "api",
        projectId: "workbuddy",
        objective: "Continuously evolve WorkBuddy until release readiness passes.",
        executorGraphId: "product-evolution-dag",
        controlPlaneUrl: "http://8.153.72.80",
        sourceClosure: {
          sourceProjectId: "workbuddy",
          repositoryProvider: "github",
          sourceUrl: "https://github.com/example/workbuddy.git",
          sourceBranch: "main",
          targetVersion: "2.0.0",
          releaseStrategy: "github-push",
          requiredGates: ["code-change", "push", "tag", "deploy", "health-ready"],
          deploymentEnvironment: "production"
        },
        sandbox: {
          runtime: "docker",
          image: "ghcr.io/all-hands-ai/runtime:0.59-nikolaik",
          credentialScope: "loop",
          network: "restricted",
          allowedPaths: ["src", "test"],
          deniedPaths: [".env", ".git"]
        },
        stopPolicy: {
          maxIterations: 2,
          maxDurationSeconds: 86400,
          requireApprovalForRelease: true,
          stopOnRepeatedFailure: 2
        },
        retryPolicy: {
          maxAttemptsPerNode: 2,
          backoffSeconds: 1,
          circuitBreakerFailures: 2
        },
        context: { entry: "codex" }
      }
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.schema, "evopilot-loop-run/v1");
    assert.equal(created.body.data.status, "PENDING");
    assert.equal(created.body.data.executorGraphId, "product-evolution-dag");
    assert.equal(created.body.data.controlPlaneUrl, "http://8.153.72.80");
    assert.equal(created.body.data.sourceClosure.repositoryProvider, "github");
    assert.equal(created.body.data.sourceClosure.sourceUrl, "https://github.com/example/workbuddy.git");
    assert.equal(created.body.data.sourceClosure.targetVersion, "2.0.0");
    assert.deepEqual(created.body.data.sourceClosure.requiredGates, ["code-change", "push", "tag", "deploy", "health-ready"]);
    assert.equal(created.body.data.sandbox.runtime, "docker");
    assert.equal(created.body.data.coordination.mode, "parallel");
    assert.equal(created.body.data.trace.executorStepCount, 0);

    const createdAgain = await jsonFetch(`${baseUrl}/api/v1/loops`, {
      method: "POST",
      token: "operator-token",
      idempotencyKey: "create-workbuddy-loop",
      body: {
        id: "workbuddy-long-task-ignored",
        objective: "Idempotency should return original loop."
      }
    });
    assert.equal(createdAgain.status, 200);
    assert.equal(createdAgain.body.data.id, "workbuddy-long-task");

    const started = await jsonFetch(`${baseUrl}/api/v1/loops/workbuddy-long-task/start`, {
      method: "POST",
      token: "operator-token",
      idempotencyKey: "start-workbuddy-loop"
    });
    assert.equal(started.status, 200);
    assert.equal(started.body.data.status, "RUNNING");
    assert.equal(started.body.data.currentIteration, 1);
    assert.equal(started.body.data.evidenceSets[0].validator, "evopilot-loop-runtime");
    assert.ok(started.body.data.iterations[0].executorSteps.every((step) => step.input.adapterId));
    assert.equal(started.body.data.iterations[0].executorSteps[0].input.adapterId, "evopilot.llm-context-adapter");
    assert.equal(started.body.data.iterations[0].executorSteps[1].output.adapterId, "evopilot.code-upgrader-adapter");
    assert.ok(started.body.data.evidenceSets[0].evidence.some((item) => item === "adapter=evopilot.llm-context-adapter"));
    assert.ok(started.body.data.evidenceSets[0].evidence.some((item) => item === "adapter=evopilot.code-upgrader-adapter"));
    assert.ok(started.body.data.evidenceSets[0].evidence.some((item) => item.includes("executorBoundary=OpenHands/code-upgrader runtime boundary")));
    assert.ok(started.body.data.evidenceSets[0].evidence.some((item) => item === "coordinationMode=parallel"));
    assert.ok(started.body.data.evidenceSets[0].evidence.some((item) => item === "sandboxRuntime=docker"));
    assert.ok(started.body.data.evidenceSets[0].evidence.some((item) => item === "sourceClosure.provider=github"));
    assert.ok(started.body.data.evidenceSets[0].evidence.some((item) => item === "sourceClosure.targetVersion=2.0.0"));
    assert.ok(started.body.data.evidenceSets[0].evidence.some((item) => item === "sourceClosure.requiredGates=code-change,push,tag,deploy,health-ready"));
    assert.equal(started.body.data.iterations[0].executorSteps[0].input.sourceClosure.repositoryProvider, "github");
    assert.equal(started.body.data.iterations[0].executorSteps[1].output.sourceClosure.releaseStrategy, "github-push");
    assert.equal(started.body.data.iterations[0].executorSteps[0].input.sandbox.runtime, "docker");
    assert.equal(started.body.data.trace.executorStepCount, 4);

    const trace = await jsonFetch(`${baseUrl}/api/v1/loops/workbuddy-long-task/trace`, {
      token: "viewer-token"
    });
    assert.equal(trace.status, 200);
    assert.equal(trace.body.data.loopId, "workbuddy-long-task");
    assert.equal(trace.body.data.executorStepCount, 4);

    const observability = await jsonFetch(`${baseUrl}/api/v1/loop-observability`, {
      token: "viewer-token"
    });
    assert.equal(observability.status, 200);
    assert.ok(observability.body.data.some((item) => item.loopId === "workbuddy-long-task"));

    const waiting = await jsonFetch(`${baseUrl}/api/v1/loops/workbuddy-long-task/resume`, {
      method: "POST",
      token: "operator-token",
      body: { evidence: ["real validation evidence collected"] }
    });
    assert.equal(waiting.status, 200);
    assert.equal(waiting.body.data.status, "WAITING_APPROVAL");
    assert.equal(waiting.body.data.approvals[0].status, "PENDING");

    const blockedResume = await fetch(`${baseUrl}/api/v1/loops/workbuddy-long-task/resume`, {
      method: "POST",
      headers: authHeaders("operator-token", true),
      body: JSON.stringify({})
    });
    assert.equal(blockedResume.status, 409);

    const approved = await jsonFetch(`${baseUrl}/api/v1/loops/workbuddy-long-task/approve`, {
      method: "POST",
      token: "operator-token",
      body: { approvalId: waiting.body.data.approvals[0].id }
    });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.data.approvals[0].status, "APPROVED");

    const replayed = await jsonFetch(`${baseUrl}/api/v1/loops/workbuddy-long-task/replay`, {
      method: "POST",
      token: "operator-token",
      body: {
        fromIteration: 2,
        contextPatch: { humanEdit: "tighten target loop scope", priority: "persistent-loop-store" },
        evidence: ["human edited context before replay"]
      }
    });
    assert.equal(replayed.status, 200);
    assert.equal(replayed.body.data.currentIteration, 2);
    assert.equal(replayed.body.data.iterations[1].replayOfIterationId, "workbuddy-long-task-iter-2");
    assert.equal(replayed.body.data.iterations[1].contextPatch.humanEdit, "tighten target loop scope");
    assert.equal(replayed.body.data.context.humanEdit, "tighten target loop scope");

    const timeline = await jsonFetch(`${baseUrl}/api/v1/loops/workbuddy-long-task/timeline`, {
      token: "viewer-token"
    });
    assert.equal(timeline.status, 200);
    assert.ok(timeline.body.data.some((event) => event.type === "DECISION"));
    assert.ok(timeline.body.data.some((event) => event.type === "REPLAY"));

    const evidence = await jsonFetch(`${baseUrl}/api/v1/loops/workbuddy-long-task/evidence`, {
      token: "viewer-token"
    });
    assert.equal(evidence.status, 200);
    assert.equal(evidence.body.data.length, 2);

    const artifacts = await jsonFetch(`${baseUrl}/api/v1/loops/workbuddy-long-task/artifacts`, {
      token: "viewer-token"
    });
    assert.equal(artifacts.status, 200);
    assert.ok(artifacts.body.data.length >= 2);

    const heartbeat = await jsonFetch(`${baseUrl}/api/v1/loop-workers/heartbeat`, {
      method: "POST",
      token: "operator-token",
      body: { loopId: "workbuddy-long-task", workerId: "worker-a", leaseSeconds: 1 }
    });
    assert.equal(heartbeat.status, 200);
    assert.equal(heartbeat.body.data.workerId, "worker-a");

    await new Promise((resolve) => setTimeout(resolve, 1100));
    const watchdog = await jsonFetch(`${baseUrl}/api/v1/loops/watchdog`, {
      method: "POST",
      token: "operator-token",
      body: {}
    });
    assert.equal(watchdog.status, 200);
    assert.ok(Array.isArray(watchdog.body.data.recovered));

    const failureLoop = await jsonFetch(`${baseUrl}/api/v1/loops`, {
      method: "POST",
      token: "operator-token",
      body: {
        id: "repeat-failure-loop",
        objective: "Prove repeated failure circuit breaker.",
        stopPolicy: { maxIterations: 5, stopOnRepeatedFailure: 2, requireApprovalForRelease: false },
        retryPolicy: { circuitBreakerFailures: 1 }
      }
    });
    assert.equal(failureLoop.status, 201);
    const repair = await jsonFetch(`${baseUrl}/api/v1/loops/repeat-failure-loop/start`, {
      method: "POST",
      token: "operator-token",
      body: { forceDecision: "REPAIR" }
    });
    assert.equal(repair.status, 200);
    const blocked = await jsonFetch(`${baseUrl}/api/v1/loops/repeat-failure-loop/resume`, {
      method: "POST",
      token: "operator-token",
      body: { forceDecision: "REPAIR" }
    });
    assert.equal(blocked.status, 200);
    assert.equal(blocked.body.data.status, "BLOCKED");

    const conversation = await jsonFetch(`${baseUrl}/api/v1/conversations/commands`, {
      method: "POST",
      token: "operator-token",
      body: {
        channel: "wecom",
        conversationId: "chat-1",
        text: "项目 workbuddy 持续推进 GA",
        projectId: "workbuddy",
        targetId: "ga"
      }
    });
    assert.equal(conversation.status, 201);
    assert.equal(conversation.body.data.loop.schema, "evopilot-loop-run/v1");
    assert.equal(conversation.body.data.loop.source, "im");

    const feishu = await jsonFetch(`${baseUrl}/api/v1/im/feishu/webhook`, {
      method: "POST",
      token: "operator-token",
      body: {
        event: {
          message: {
            chat_id: "feishu-chat-1",
            content: JSON.stringify({ text: "项目 workbuddy 持续推进 GA" })
          }
        },
        projectId: "workbuddy",
        targetId: "ga"
      }
    });
    assert.equal(feishu.status, 201);
    assert.equal(feishu.body.data.schema, "evopilot-im-webhook-result/v1");
    assert.equal(feishu.body.data.loop.source, "im");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      ...authHeaders(options.token, Boolean(options.body)),
      ...(options.idempotencyKey ? { "x-idempotency-key": options.idempotencyKey } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const body = await response.json();
  return { status: response.status, body };
}

function authHeaders(token, json = false) {
  return {
    authorization: `Bearer ${token}`,
    ...(json ? { "content-type": "application/json" } : {})
  };
}
