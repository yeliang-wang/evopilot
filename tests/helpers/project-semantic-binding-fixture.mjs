import fs from "node:fs/promises";
import path from "node:path";
import {semanticConsumerFixture} from "./semantic-consumer-fixture.mjs";
import {createProjectSemanticBindingService} from "../../packages/server/dist/application/project-semantic-binding.js";

export async function projectSemanticBindingFixture(t, compatible = true) {
  const data = typeof compatible === "object" ? compatible : compatible ? JSON.parse(await fs.readFile(new URL("../fixtures/semantic-compatible-catalog-materials.json", import.meta.url), "utf8")) : undefined;
  const f = await semanticConsumerFixture(t, data), scope = f.generation.sets[0].scope;
  const dataRoot = path.join(f.root, "runtime-data"); await fs.mkdir(dataRoot);
  const access = {principal: {id: "reviewer@example.test", role: "operator", tenantId: scope.tenantId, workspaceId: scope.workspaceId},
    project: {id: scope.projectId, tenantId: scope.tenantId, workspaceId: scope.workspaceId, profileId: "synthetic", updatedAt: "2026-09-22T00:00:00Z"}};
  const configuration = {dataRoot, registryConfigPath: path.join(f.root, "registry.yaml"), policyPath: path.join(f.root, "policy.json")};
  const service = createProjectSemanticBindingService(configuration);
  const input = {projectId: scope.projectId, currentAccess: () => access};
  const selection = {catalogId: f.generation.catalogId, artifactSetDigest: f.generation.sets[0].refs.artifactSet,
    bundleDigest: f.generation.entries.find(entry => entry.kind === "HarnessBundle").objectDigest};
  return {...f, scope, access, configuration, service, input, selection};
}
