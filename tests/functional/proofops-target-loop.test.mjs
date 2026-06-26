import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createServer } from "../../packages/server/dist/index.js";

test("ProofOps target loop mode creates, approves, runs, reports, and gates release action", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-proofops-loop-"));
  const proofOpsCoreContractPath = path.join(dataRoot, "proofops-core-contract.json");
  fs.writeFileSync(proofOpsCoreContractPath, JSON.stringify({
    schema: "proofops-core-contract/v1",
    version: "1.0.0",
    decisionVocabulary: ["GO", "CONDITIONAL-GO", "NO-GO", "BLOCKED"],
    productionReleaseEvidenceRule: "No mock, fake, stub, simulator, fixture-only, demo-only, smoke-only, or chat-only evidence is counted as production release proof.",
    finalReportSchema: "proofops-final-release-report/v1",
    targets: [
      {
        id: "ga",
        requiredEvidence: ["ProofOps Core GA evidence matrix is consumed by EvoPilot."]
      },
      {
        id: "rc",
        title: "Release Candidate",
        requiredEvidence: ["ProofOps Core RC target can be launched from a conversation command."]
      }
    ]
  }), "utf8");
  const server = createServer({
    dataRoot,
    runtimeMode: "debug",
    proofOpsCoreContractPath,
    tokens: [
      { name: "viewer", token: "viewer-token", role: "viewer" },
      { name: "operator", token: "operator-token", role: "operator" },
      { name: "admin", token: "admin-token", role: "admin" }
    ]
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const created = await jsonFetch(`${baseUrl}/api/v1/target-loops`, {
      method: "POST",
      token: "operator-token",
      body: {
        projectId: "workbuddy",
        targetId: "ga",
        candidate: "workbuddy-ga-target-loop",
        finalGoal: "WorkBuddy reaches GA through ProofOps target-loop evidence."
      }
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.schema, "evopilot-proofops-target-loop/v1");
    assert.equal(created.body.data.mode, "proofops-target-loop");
    assert.equal(created.body.data.status, "PENDING_PLAN_APPROVAL");
    assert.equal(created.body.data.targetPlan.source, "proofops-core-compatible");
    assert.equal(created.body.data.targetPlan.proofOpsCoreVersion, "1.0.0");

    const blockedResume = await fetch(`${baseUrl}/api/v1/target-loops/workbuddy-ga-target-loop/resume`, {
      method: "POST",
      headers: authHeaders("operator-token")
    });
    assert.equal(blockedResume.status, 409);

    const approved = await jsonFetch(`${baseUrl}/api/v1/target-loops/workbuddy-ga-target-loop/approve-plan`, {
      method: "POST",
      token: "operator-token"
    });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.data.targetPlanConfirmation.status, "confirmed");

    const resumed = await jsonFetch(`${baseUrl}/api/v1/target-loops/workbuddy-ga-target-loop/resume`, {
      method: "POST",
      token: "operator-token",
      body: {
        artifactPaths: ["data/proofops/workbuddy/final-report.json"]
      }
    });
    assert.equal(resumed.status, 200);
    assert.equal(resumed.body.data.status, "NO-GO");
    assert.equal(resumed.body.data.finalReport.schema, "proofops-final-release-report/v1");
    assert.equal(resumed.body.data.finalReport.finalTargetSummary.targetReached, false);
    assert.match(resumed.body.data.finalReport.productionReleaseRule, /No mock/);

    const report = await jsonFetch(`${baseUrl}/api/v1/target-loops/workbuddy-ga-target-loop/final-report`, {
      token: "viewer-token"
    });
    assert.equal(report.status, 200);
    assert.equal(report.body.data.lifecycleId, "workbuddy-ga-target-loop");
    assert.ok(report.body.data.coverageMatrix.length > 0);

    const releaseApproval = await fetch(`${baseUrl}/api/v1/target-loops/workbuddy-ga-target-loop/release-actions/tag/approve`, {
      method: "POST",
      headers: authHeaders("admin-token")
    });
    assert.equal(releaseApproval.status, 409);

    const remediation = await jsonFetch(`${baseUrl}/api/v1/target-loops/workbuddy-ga-target-loop/route-remediation`, {
      method: "POST",
      token: "operator-token",
      body: { blocker: "GA criteria require EvoPilot remediation." }
    });
    assert.equal(remediation.status, 200);
    assert.equal(remediation.body.data.remediationRequests[0].status, "ROUTED");
    assert.equal(remediation.body.data.remediationRequests[0].routedTo, "evopilot");

    const target = await jsonFetch(`${baseUrl}/api/v1/release/targets`, {
      method: "POST",
      token: "admin-token",
      body: {
        id: "smoke-ga",
        name: "Smoke GA",
        minConnectedProjects: 0,
        minSucceededSoakSeconds: 0,
        requireActiveSoak: false,
        minSuccessfulRuns: 0,
        minEvaluationDatasets: 0,
        minOpportunities: 0,
        minSuccessfulEvolutionBatches: 0,
        minSuccessfulCodeUpgrades: 0,
        minSuccessfulPipelines: 0,
        requiredScenarioIds: [],
        requireNoHighOpenRisks: false
      }
    });
    assert.equal(target.status, 201);

    const goLoop = await jsonFetch(`${baseUrl}/api/v1/target-loops`, {
      method: "POST",
      token: "operator-token",
      body: {
        projectId: "workbuddy",
        targetId: "smoke-ga",
        candidate: "workbuddy-smoke-go-loop"
      }
    });
    assert.equal(goLoop.status, 201);
    await jsonFetch(`${baseUrl}/api/v1/target-loops/workbuddy-smoke-go-loop/approve-plan`, {
      method: "POST",
      token: "operator-token"
    });
    const goResult = await jsonFetch(`${baseUrl}/api/v1/target-loops/workbuddy-smoke-go-loop/resume`, {
      method: "POST",
      token: "operator-token"
    });
    assert.equal(goResult.status, 200);
    assert.equal(goResult.body.data.status, "GO");

    const executeBeforeApproval = await fetch(`${baseUrl}/api/v1/target-loops/workbuddy-smoke-go-loop/release-actions/tag/execute`, {
      method: "POST",
      headers: authHeaders("admin-token")
    });
    assert.equal(executeBeforeApproval.status, 409);

    const approvedRelease = await jsonFetch(`${baseUrl}/api/v1/target-loops/workbuddy-smoke-go-loop/release-actions/tag/approve`, {
      method: "POST",
      token: "admin-token"
    });
    assert.equal(approvedRelease.status, 200);
    assert.equal(approvedRelease.body.data.releaseActions[0].status, "APPROVED");

    const executedRelease = await jsonFetch(`${baseUrl}/api/v1/target-loops/workbuddy-smoke-go-loop/release-actions/tag/execute`, {
      method: "POST",
      token: "admin-token"
    });
    assert.equal(executedRelease.status, 200);
    assert.equal(executedRelease.body.data.releaseActions[0].status, "EXECUTED");

    const conversation = await jsonFetch(`${baseUrl}/api/v1/conversations/commands`, {
      method: "POST",
      token: "operator-token",
      body: {
        channel: "feishu",
        conversationId: "chat-1",
        text: "对项目 workbuddy 发起 rc target loop",
        projectId: "workbuddy",
        targetId: "rc"
      }
    });
    assert.equal(conversation.status, 201);
    assert.equal(conversation.body.data.schema, "evopilot-conversation-command-result/v1");
    assert.match(conversation.body.data.message, /target plan approval is required/);
    assert.equal(conversation.body.data.targetLoop.targetId, "rc");
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
