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
        nodes: [
          { id: "plan", type: "llm", name: "Plan" },
          { id: "upgrade", type: "code-upgrader", name: "Upgrade" },
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

    const created = await jsonFetch(`${baseUrl}/api/v1/loops`, {
      method: "POST",
      token: "operator-token",
      body: {
        id: "workbuddy-long-task",
        source: "api",
        projectId: "workbuddy",
        objective: "Continuously evolve WorkBuddy until release readiness passes.",
        executorGraphId: "product-evolution-dag",
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

    const started = await jsonFetch(`${baseUrl}/api/v1/loops/workbuddy-long-task/start`, {
      method: "POST",
      token: "operator-token"
    });
    assert.equal(started.status, 200);
    assert.equal(started.body.data.status, "RUNNING");
    assert.equal(started.body.data.currentIteration, 1);
    assert.equal(started.body.data.evidenceSets[0].validator, "evopilot-loop-runtime");

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

    const timeline = await jsonFetch(`${baseUrl}/api/v1/loops/workbuddy-long-task/timeline`, {
      token: "viewer-token"
    });
    assert.equal(timeline.status, 200);
    assert.ok(timeline.body.data.some((event) => event.type === "DECISION"));

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
    headers: authHeaders(options.token, Boolean(options.body)),
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
