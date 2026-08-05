#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const chartDir = path.join(root, "charts", "evopilot");

const requiredFiles = [
  "Chart.yaml",
  "values.yaml",
  "values.production.example.yaml",
  "templates/_helpers.tpl",
  "templates/secret.yaml",
  "templates/pvc.yaml",
  "templates/postgres-statefulset.yaml",
  "templates/control-plane-deployment.yaml",
  "templates/dashboard-deployment.yaml",
  "templates/services.yaml",
  "templates/ingress.yaml",
  "templates/NOTES.txt"
];

assert.ok(fs.existsSync(chartDir), "charts/evopilot must exist");
for (const relativePath of requiredFiles) {
  const filePath = path.join(chartDir, relativePath);
  assert.ok(fs.existsSync(filePath), `${relativePath} is required`);
  assert.ok(fs.statSync(filePath).size > 0, `${relativePath} must not be empty`);
}

const chartYaml = fs.readFileSync(path.join(chartDir, "Chart.yaml"), "utf8");
assert.match(chartYaml, /^apiVersion: v2$/m);
assert.match(chartYaml, /^name: evopilot$/m);
assert.match(chartYaml, new RegExp(`^version: ${escapeRegExp(packageJson.version)}$`, "m"));
assert.match(chartYaml, new RegExp(`^appVersion: "${escapeRegExp(packageJson.version)}"$`, "m"));

const valuesYaml = fs.readFileSync(path.join(chartDir, "values.yaml"), "utf8");
for (const phrase of [
  "ghcr.io/yeliang-wang/evopilot",
  "ghcr.io/yeliang-wang/evopilot-dashboard",
  "EVOPILOT_TOKENS",
  "existingSecret",
  "externalDsn",
  "extraPorts",
  "ingress:"
]) {
  assert.ok(valuesYaml.includes(phrase), `values.yaml must include ${phrase}`);
}

const productionValuesYaml = fs.readFileSync(path.join(chartDir, "values.production.example.yaml"), "utf8");
assert.ok(productionValuesYaml.includes("existingSecret: evopilot-prod-secrets"), "production values must use an existing secret");
assert.ok(productionValuesYaml.includes(`tag: "${packageJson.version}"`), "production values must pin the EvoPilot release tag");
assert.ok(productionValuesYaml.includes('tag: "1.0.9"'), "production values must pin the compatible Dashboard tag");
for (const forbidden of ["change-me", "replace-with", "server-side-secret"]) {
  assert.ok(!productionValuesYaml.includes(forbidden), `production values must not include ${forbidden}`);
}

const controlPlaneTemplate = fs.readFileSync(path.join(chartDir, "templates/control-plane-deployment.yaml"), "utf8");
assert.ok(controlPlaneTemplate.includes("emptyDir: {}"), "control plane deployment must support persistence.enabled=false");
assert.ok(controlPlaneTemplate.includes("EVOPILOT_LOOP_STORE_DSN"), "control plane deployment must configure the loop store DSN");
assert.ok(controlPlaneTemplate.includes(".Values.postgres.enabled"), "control plane deployment must branch between bundled and external Postgres");

const secretTemplate = fs.readFileSync(path.join(chartDir, "templates/secret.yaml"), "utf8");
assert.ok(secretTemplate.includes("postgres.externalDsn is required"), "secret template must require an external DSN when bundled Postgres is disabled");

const servicesTemplate = fs.readFileSync(path.join(chartDir, "templates/services.yaml"), "utf8");
assert.ok(servicesTemplate.includes(".Values.service.extraPorts"), "API service must render service.extraPorts");
assert.ok(servicesTemplate.includes(".Values.dashboard.service.extraPorts"), "Dashboard service must render dashboard.service.extraPorts");

const helm = spawnSync("helm", ["lint", chartDir], { cwd: root, encoding: "utf8" });
if (helm.error && helm.error.code === "ENOENT") {
  console.log("Helm CLI not found; static chart verification passed.");
} else {
  if (helm.status !== 0) {
    process.stderr.write(helm.stdout || "");
    process.stderr.write(helm.stderr || "");
  }
  assert.equal(helm.status, 0, "helm lint must pass");
  const rendered = spawnSync("helm", [
    "template",
    "evopilot",
    chartDir,
    "--set",
    "service.extraPorts[0].name=metrics",
    "--set",
    "service.extraPorts[0].port=9090",
    "--set",
    "service.extraPorts[0].targetPort=http",
    "--set",
    "dashboard.service.extraPorts[0].name=preview",
    "--set",
    "dashboard.service.extraPorts[0].port=18080",
    "--set",
    "dashboard.service.extraPorts[0].targetPort=http"
  ], { cwd: root, encoding: "utf8" });
  if (rendered.status !== 0) {
    process.stderr.write(rendered.stdout || "");
    process.stderr.write(rendered.stderr || "");
  }
  assert.equal(rendered.status, 0, "helm template must pass");
  assert.match(rendered.stdout, /name: metrics/);
  assert.match(rendered.stdout, /port: 9090/);
  assert.match(rendered.stdout, /name: preview/);
  assert.match(rendered.stdout, /port: 18080/);
  console.log("Helm chart verification passed.");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
