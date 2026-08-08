import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRemoteDeployScript,
  normalizeReleaseVersion,
  parseArgs
} from "../../scripts/immutable-rollback-runbook.mjs";

test("normalizes release versions into tags", () => {
  assert.deepEqual(normalizeReleaseVersion("1.1.2"), { version: "1.1.2", tag: "v1.1.2" });
  assert.deepEqual(normalizeReleaseVersion("v1.1.2"), { version: "1.1.2", tag: "v1.1.2" });
  assert.throws(() => normalizeReleaseVersion("latest"), /invalid release version/);
});

test("parses deploy and rollback drill arguments", () => {
  const deploy = parseArgs(["--version", "1.1.2", "--host", "root@example", "--apply", "--json"]);
  assert.equal(deploy.mode, "deploy");
  assert.equal(deploy.targetVersion, "1.1.2");
  assert.equal(deploy.host, "root@example");
  assert.equal(deploy.apply, true);
  assert.equal(deploy.json, true);

  const drill = parseArgs(["--rollback-version", "1.1.1", "--forward-version", "1.1.2"]);
  assert.equal(drill.mode, "rollback-drill");
  assert.equal(drill.apply, false);
  assert.equal(drill.rollbackVersion, "1.1.1");
  assert.equal(drill.forwardVersion, "1.1.2");
});

test("remote deploy script uses immutable image without rebuilding", () => {
  const script = buildRemoteDeployScript({
    name: "deploy",
    version: "1.1.2",
    image: {
      immutableRef: "ghcr.io/yeliang-wang/evopilot:1.1.2@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      imageDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  }, {
    remotePath: "/opt/evopilot",
    envFile: ".env.production",
    composeFile: "deploy/ecs/compose.immutable.yaml",
    project: "evopilot",
    platform: "linux/amd64",
    apiBaseUrl: "http://127.0.0.1:19876",
    dashboardUrl: "http://127.0.0.1:8080/",
    skipDashboard: false,
    services: ["evopilot-server", "evopilot-loop-worker"],
    syncSource: false,
    expectedCommit: ""
  });

  assert.match(script, /ghcr\.io\/yeliang-wang\/evopilot:1\.1\.2@sha256:aaaaaaaa/);
  assert.match(script, /EVOPILOT_DEPLOY_IMAGE\\t%s/);
  assert.match(script, /docker pull 'ghcr\.io\/yeliang-wang\/evopilot@sha256:aaaaaaaa/);
  assert.match(script, /export EVOPILOT_IMAGE='ghcr\.io\/yeliang-wang\/evopilot@sha256:aaaaaaaa/);
  assert.doesNotMatch(script, /docker pull --platform/);
  assert.match(script, /compose\.immutable\.yaml/);
  assert.match(script, /up -d --no-build --no-deps/);
  assert.doesNotMatch(script, /up -d --build/);
  assert.doesNotMatch(script, /docker compose -f docker-compose\.prod\.yml up -d --build/);
});
