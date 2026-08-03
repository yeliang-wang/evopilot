import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createServer } from "../../packages/server/dist/index.js";

test("protected APIs reject unauthenticated requests with requestId diagnostics", async () => {
  const fixture = await startEvoPilot();
  try {
    const response = await fetch(`${fixture.baseUrl}/api/v1/summary`, {
      headers: { "x-request-id": "fr-auth-unauthorized" }
    });
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("x-request-id"), "fr-auth-unauthorized");
    assert.equal(body.error, "UNAUTHORIZED");
  } finally {
    await fixture.close();
  }
});

test("project preflights stop at source credential, DevOps, and explicit LLM blockers", async () => {
  const github = await startFakeGitHub();
  const fixture = await startEvoPilot();
  try {
    const project = await jsonFetch(`${fixture.baseUrl}/api/v1/projects`, {
      method: "POST",
      token: "admin-token",
      body: {
        id: "failure-recovery-github",
        name: "Failure Recovery GitHub",
        repository: {
          provider: "github",
          baseUrl: github.baseUrl,
          owner: "org",
          repo: "repo",
          defaultBranch: "main"
        }
      }
    });
    assert.equal(project.status, 201);
    assert.equal(project.body.data.repository.credentialsConfigured, false);

    const source = await jsonFetch(`${fixture.baseUrl}/api/v1/projects/failure-recovery-github/source-credentials/preflight`, {
      method: "POST",
      token: "operator-token"
    });
    assert.equal(source.status, 409);
    assert.equal(source.body.data.schema, "evopilot-source-credential-readiness/v1");
    assert.equal(source.body.data.status, "READ_ONLY");
    assert.equal(source.body.data.nextAction, "connect-github-account");
    assert.ok(source.body.data.blockers.includes("token-resolution:SOURCE_CREDENTIAL_TOKEN_REQUIRED"));

    const devops = await jsonFetch(`${fixture.baseUrl}/api/v1/projects/failure-recovery-github/devops/preflight`, {
      method: "POST",
      token: "operator-token"
    });
    assert.equal(devops.status, 409);
    assert.equal(devops.body.data.schema, "evopilot-project-devops-readiness/v1");
    assert.equal(devops.body.data.status, "BLOCKED");
    assert.equal(devops.body.data.nextAction, "configure-devops");

    const llm = await jsonFetch(`${fixture.baseUrl}/api/v1/projects`, {
      method: "POST",
      token: "admin-token",
      body: {
        id: "failure-recovery-missing-llm",
        name: "Failure Recovery Missing LLM",
        llmProfileId: "missing-private-profile",
        repository: {
          provider: "github",
          baseUrl: github.baseUrl,
          owner: "org",
          repo: "repo",
          defaultBranch: "main"
        }
      }
    });
    assert.equal(llm.status, 409);
    assert.equal(llm.body.error, "LLM_PROFILE_NOT_READY");
    assert.equal(llm.body.readiness.schema, "evopilot-llm-profile-readiness/v1");
    assert.equal(llm.body.readiness.status, "BLOCKED");
    assert.equal(llm.body.readiness.nextAction, "configure-llm-profile");
  } finally {
    await fixture.close();
    await github.close();
  }
});

test("source closure preflight records repair action instead of claiming release readiness", async () => {
  const github = await startFakeGitHub();
  const fixture = await startEvoPilot();
  try {
    const project = await jsonFetch(`${fixture.baseUrl}/api/v1/projects`, {
      method: "POST",
      token: "admin-token",
      body: {
        id: "failure-recovery-source",
        name: "Failure Recovery Source",
        repository: {
          provider: "github",
          baseUrl: github.baseUrl,
          owner: "org",
          repo: "repo",
          defaultBranch: "main"
        }
      }
    });
    assert.equal(project.status, 201);

    const loop = await jsonFetch(`${fixture.baseUrl}/api/v1/loops`, {
      method: "POST",
      token: "operator-token",
      body: {
        id: "failure-recovery-source-loop",
        projectId: "failure-recovery-source",
        objective: "Preflight source closure before writeback.",
        controlPlaneUrl: fixture.baseUrl,
        sourceClosure: {
          sourceProjectId: "failure-recovery-source",
          repositoryProvider: "github",
          sourceBranch: "main",
          targetVersion: "2.4.0",
          requiredGates: ["code-change", "push", "deploy", "health-ready"]
        }
      }
    });
    assert.equal(loop.status, 201);

    const preflight = await jsonFetch(`${fixture.baseUrl}/api/v1/loops/failure-recovery-source-loop/source-closure/preflight`, {
      method: "POST",
      token: "operator-token"
    });
    assert.equal(preflight.status, 409);
    assert.equal(preflight.body.data.schema, "evopilot-source-closure-preflight/v1");
    assert.equal(preflight.body.data.status, "FAIL");
    assert.equal(preflight.body.data.nextAction, "repair-credentials");
    assert.ok(preflight.body.data.blockers.includes("credentials:SOURCE_CLOSURE_TOKEN_REQUIRED"));
    assert.ok(preflight.body.data.checks.some((check) => check.id === "credentials" && check.status === "FAIL"));

    const storedLoop = await jsonFetch(`${fixture.baseUrl}/api/v1/loops/failure-recovery-source-loop`, {
      token: "viewer-token"
    });
    assert.equal(storedLoop.status, 200);
    assert.ok(storedLoop.body.data.evidenceSets.some((set) =>
      set.validator === "evopilot-source-closure-preflight" &&
      set.status === "FAIL" &&
      set.evidence.some((item) => item.includes("repair-credentials"))
    ));
  } finally {
    await fixture.close();
    await github.close();
  }
});

async function startEvoPilot() {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evopilot-failure-recovery-"));
  const server = createServer({
    dataRoot,
    runtimeMode: "debug",
    tokens: [
      { name: "viewer", token: "viewer-token", role: "viewer" },
      { name: "operator", token: "operator-token", role: "operator" },
      { name: "admin", token: "admin-token", role: "admin" }
    ]
  });
  await listen(server);
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => close(server)
  };
}

async function startFakeGitHub() {
  const server = http.createServer(async (request, response) => {
    if (request.url === "/repos/org/repo/git/trees/main?recursive=1") {
      return json(response, { tree: [{ type: "blob", path: "README.md" }] });
    }
    if (request.url === "/repos/org/repo/git/ref/heads%2Fmain" && request.method === "GET") {
      return json(response, { ref: "refs/heads/main", object: { sha: "base-sha" } });
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "NOT_FOUND" }));
  });
  await listen(server);
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => close(server)
  };
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { "content-type": "application/json" } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const body = await response.json();
  return { status: response.status, body, headers: response.headers };
}

function json(response, body, status = 200) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
