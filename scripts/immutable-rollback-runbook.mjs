#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const DEFAULT_REPOSITORY = "yeliang-wang/evopilot";
const DEFAULT_REMOTE_PATH = "/opt/evopilot";
const DEFAULT_COMPOSE_FILE = "deploy/ecs/compose.immutable.yaml";
const DEFAULT_ENV_FILE = ".env.production";
const DEFAULT_PROJECT = "evopilot";
const DEFAULT_PLATFORM = "linux/amd64";
const DEFAULT_API_BASE_URL = "http://127.0.0.1:19876";
const DEFAULT_DASHBOARD_URL = "http://127.0.0.1:8080/";
const DEFAULT_SERVICES = ["evopilot-code-upgrader", "evopilot-server", "evopilot-loop-worker"];

export function normalizeReleaseVersion(value) {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error("release version is required");
  const version = raw.startsWith("v") ? raw.slice(1) : raw;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`invalid release version: ${raw}`);
  return { version, tag: `v${version}` };
}

export function parseArgs(argv) {
  const options = {
    apply: false,
    json: false,
    repository: DEFAULT_REPOSITORY,
    host: process.env.EVOPILOT_ECS_HOST || "",
    remotePath: process.env.EVOPILOT_ECS_PATH || DEFAULT_REMOTE_PATH,
    composeFile: DEFAULT_COMPOSE_FILE,
    envFile: DEFAULT_ENV_FILE,
    project: DEFAULT_PROJECT,
    platform: DEFAULT_PLATFORM,
    apiBaseUrl: DEFAULT_API_BASE_URL,
    dashboardUrl: DEFAULT_DASHBOARD_URL,
    skipDashboard: false,
    services: [...DEFAULT_SERVICES],
    syncSource: false,
    expectedCommit: "",
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`${arg} requires a value`);
      return argv[i];
    };

    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--apply") options.apply = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--repo") options.repository = next();
    else if (arg === "--host") options.host = next();
    else if (arg === "--path") options.remotePath = next();
    else if (arg === "--compose-file") options.composeFile = next();
    else if (arg === "--env-file") options.envFile = next();
    else if (arg === "--project") options.project = next();
    else if (arg === "--platform") options.platform = next();
    else if (arg === "--api-base-url") options.apiBaseUrl = next();
    else if (arg === "--dashboard-url") options.dashboardUrl = next();
    else if (arg === "--skip-dashboard") options.skipDashboard = true;
    else if (arg === "--service") options.services = splitList(next());
    else if (arg === "--sync-source") options.syncSource = true;
    else if (arg === "--expected-commit") options.expectedCommit = next();
    else if (arg === "--version" || arg === "--target-version") options.targetVersion = next();
    else if (arg === "--rollback-version") options.rollbackVersion = next();
    else if (arg === "--forward-version") options.forwardVersion = next();
    else throw new Error(`unknown argument: ${arg}`);
  }

  if (options.help) return { ...options, mode: "help" };
  if (!options.repository.includes("/")) throw new Error("--repo must be owner/name");
  if (options.services.length === 0) throw new Error("at least one --service is required");

  const hasDeployTarget = Boolean(options.targetVersion);
  const hasDrillTargets = Boolean(options.rollbackVersion || options.forwardVersion);
  if (hasDeployTarget && hasDrillTargets) throw new Error("use either --version or --rollback-version/--forward-version");
  if (hasDrillTargets && (!options.rollbackVersion || !options.forwardVersion)) {
    throw new Error("rollback drill requires both --rollback-version and --forward-version");
  }
  if (!hasDeployTarget && !hasDrillTargets) throw new Error("provide --version or --rollback-version/--forward-version");
  if (options.apply && !options.host) throw new Error("--host or EVOPILOT_ECS_HOST is required with --apply");

  return {
    ...options,
    mode: hasDrillTargets ? "rollback-drill" : "deploy"
  };
}

export async function resolveReleaseImage(repository, value) {
  const { version, tag } = normalizeReleaseVersion(value);
  const release = await githubJson(`https://api.github.com/repos/${repository}/releases/tags/${tag}`);
  const expectedAssetName = `evopilot-${version}-image-metadata.json`;
  const asset = release.assets?.find((item) => item.name === expectedAssetName);
  if (!asset) throw new Error(`missing ${expectedAssetName} in ${tag}`);
  const metadata = await githubJson(asset.url, "application/octet-stream");

  if (metadata.schema !== "evopilot-image-metadata/v1") throw new Error(`${expectedAssetName} has invalid schema`);
  if (metadata.project !== "evopilot") throw new Error(`${expectedAssetName} has invalid project`);
  if (metadata.version !== version) throw new Error(`${expectedAssetName} version mismatch`);
  if (metadata.tag !== tag) throw new Error(`${expectedAssetName} tag mismatch`);
  if (!/^sha256:[a-f0-9]{64}$/.test(metadata.imageDigest || "")) throw new Error(`${expectedAssetName} has invalid imageDigest`);
  if (!metadata.immutableRef?.includes(`@${metadata.imageDigest}`)) throw new Error(`${expectedAssetName} immutableRef mismatch`);

  return {
    version,
    tag,
    releaseUrl: release.html_url,
    draft: release.draft,
    prerelease: release.prerelease,
    assetCount: release.assets?.length ?? 0,
    imageMetadataAsset: {
      name: asset.name,
      size: asset.size,
      digest: asset.digest,
      url: asset.browser_download_url
    },
    imageRef: metadata.imageRef,
    imageDigest: metadata.imageDigest,
    immutableRef: metadata.immutableRef,
    generatedAt: metadata.generatedAt
  };
}

export function buildRemoteDeployScript(step, options) {
  const hostEnvFile = options.envFile.startsWith("/") ? options.envFile : `${options.remotePath}/${options.envFile}`;
  const services = options.services.map(shellQuote).join(" ");
  const containerNames = options.services.map((service) => `${options.project}-${service}-1`).map(shellQuote).join(" ");
  const expectedVersion = normalizeReleaseVersion(step.version).version;

  return `set -eu
cd ${shellQuote(options.remotePath)}
printf "EVOPILOT_IMMUTABLE_ROLLOUT_STEP\\t%s\\n" ${shellQuote(step.name)}
printf "EVOPILOT_IMMUTABLE_IMAGE\\t%s\\n" ${shellQuote(step.image.immutableRef)}
if [ ${shellQuote(options.syncSource ? "1" : "0")} = "1" ]; then
  git fetch --no-tags origin main
  git pull --ff-only --no-tags origin main
  if [ -n ${shellQuote(options.expectedCommit)} ]; then
    test "$(git rev-parse HEAD)" = ${shellQuote(options.expectedCommit)}
  fi
fi
docker pull --platform ${shellQuote(options.platform)} ${shellQuote(step.image.immutableRef)}
docker image inspect ${shellQuote(step.image.immutableRef)} --format "image-ready\\t{{.Id}}\\t{{json .RepoDigests}}"
export EVOPILOT_IMAGE=${shellQuote(step.image.immutableRef)}
export EVOPILOT_ENV_FILE=${shellQuote(hostEnvFile)}
export EVOPILOT_HOST_WORKSPACE=${shellQuote(options.remotePath)}
export EVOPILOT_BASE_URL="http://host.containers.internal:19876"
export EVOPILOT_BASE_URL_FALLBACKS="http://evopilot-server:19876"
docker compose -p ${shellQuote(options.project)} --env-file ${shellQuote(options.envFile)} -f ${shellQuote(options.composeFile)} up -d --no-build --no-deps ${services}
sleep 5
health="$(curl -fsS ${shellQuote(`${options.apiBaseUrl}/health`)})"
ready="$(curl -fsS ${shellQuote(`${options.apiBaseUrl}/ready`)})"
printf "health\\t%s\\n" "$health"
printf "ready\\t%s\\n" "$ready"
case "$health" in *'"status":"UP"'*) ;; *) echo "health did not report UP" >&2; exit 21 ;; esac
case "$health" in *'"productVersion":"${expectedVersion}"'*) ;; *) echo "health productVersion did not match ${expectedVersion}" >&2; exit 22 ;; esac
case "$ready" in *'"status":"READY"'*) ;; *) echo "ready did not report READY" >&2; exit 23 ;; esac
if [ ${shellQuote(options.skipDashboard ? "1" : "0")} = "0" ]; then
  curl -fsSI ${shellQuote(options.dashboardUrl)} | sed -n "1,3p"
fi
docker ps --format "{{.Names}}\\t{{.Image}}\\t{{.Status}}" | sort
for name in ${containerNames}; do
  cid="$(docker ps -q --filter name=^/\${name}$)"
  test -n "$cid"
  image_id="$(docker inspect "$cid" --format "{{.Image}}")"
  status="$(docker inspect "$cid" --format "{{.State.Status}}")"
  started="$(docker inspect "$cid" --format "{{.State.StartedAt}}")"
  printf "container\\t%s\\t%s\\t%s\\t%s\\n" "$name" "$image_id" "$status" "$started"
  docker image inspect "$image_id" --format "container-image-digests\\t{{.Id}}\\t{{json .RepoDigests}}" | grep ${shellQuote(step.image.imageDigest)}
done
find . -maxdepth 2 \\( -name ".env*" -o -name ".evopilot" -o -name "*compose*.yml" -o -name "*compose*.yaml" -o -name "Dockerfile" \\) -exec stat -c "%n\\t%s\\t%Y" {} \\; | sort
`;
}

export function printUsage() {
  return `Usage:
  node scripts/immutable-rollback-runbook.mjs --version 1.1.8 --host root@host --apply --json
  node scripts/immutable-rollback-runbook.mjs --rollback-version 1.1.2 --forward-version 1.1.8 --host root@host --apply --json

Options:
  --version <semver>             Deploy one release image digest.
  --rollback-version <semver>    Roll back to this release digest during a drill.
  --forward-version <semver>     Forward again to this release digest during a drill.
  --host <ssh-target>            ECS SSH target. Can also use EVOPILOT_ECS_HOST.
  --path <remote-path>           Remote checkout path. Default: /opt/evopilot.
  --apply                        Execute SSH deployment. Omit for resolve/plan only.
  --sync-source                  Fast-forward origin/main before deploying.
  --expected-commit <sha>        Assert remote HEAD after --sync-source.
  --json                         Emit machine-readable evidence JSON.
`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.mode === "help") {
    console.log(printUsage());
    return;
  }

  const versions = options.mode === "rollback-drill"
    ? [
        { name: "rollback", version: options.rollbackVersion },
        { name: "forward", version: options.forwardVersion }
      ]
    : [{ name: "deploy", version: options.targetVersion }];

  const steps = [];
  for (const item of versions) {
    const image = await resolveReleaseImage(options.repository, item.version);
    steps.push({ ...item, image });
  }

  const evidence = {
    schema: "evopilot-immutable-rollback-runbook/v1",
    mode: options.mode,
    apply: options.apply,
    repository: options.repository,
    host: options.apply ? options.host : null,
    remotePath: options.remotePath,
    generatedAt: new Date().toISOString(),
    steps: steps.map((step) => ({
      name: step.name,
      version: normalizeReleaseVersion(step.version).version,
      tag: step.image.tag,
      releaseUrl: step.image.releaseUrl,
      immutableRef: step.image.immutableRef,
      imageDigest: step.image.imageDigest,
      assetDigest: step.image.imageMetadataAsset.digest,
      status: "PLANNED"
    }))
  };

  if (options.apply) {
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      const script = buildRemoteDeployScript(step, options);
      const output = runSsh(options.host, script);
      evidence.steps[index].status = "APPLIED";
      evidence.steps[index].sshOutput = output;
    }
  }

  if (options.json) {
    console.log(JSON.stringify(evidence, null, 2));
  } else {
    for (const step of evidence.steps) {
      console.log(`${step.status}\t${step.name}\t${step.tag}\t${step.immutableRef}`);
    }
  }
}

async function githubJson(url, accept = "application/vnd.github+json") {
  const response = await fetch(url, {
    headers: {
      Accept: accept,
      "User-Agent": "evopilot-immutable-rollback-runbook"
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

function runSsh(host, script) {
  return execFileSync("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", host, "bash", "-s"], {
    input: script,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
    stdio: ["pipe", "pipe", "pipe"]
  });
}

function splitList(value) {
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
