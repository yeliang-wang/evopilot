import http from "node:http";

export async function configureTestWorkspaceRuntimeLlm(input) {
  const profileId = input.profileId ?? "test-workspace-runtime";
  const secretRef = `${profileId}-secret`;
  const rawCredential = `${profileId}-credential`;
  const provider = http.createServer(async (request, response) => {
    for await (const _chunk of request) void _chunk;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      id: `${profileId}-preflight`,
      model: "test-runtime-model",
      choices: [{ message: { role: "assistant", content: JSON.stringify(testGoalPlan()) }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
    }));
  });
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
  const address = provider.address();
  const providerBaseUrl = `http://127.0.0.1:${address.port}/v1`;
  try {
    await expectStatus(input.baseUrl, "/api/v1/secrets", 201, input.token, {
      id: secretRef,
      name: `${profileId} test credential`,
      kind: "llm-api-key",
      scope: "workspace",
      value: rawCredential
    });
    await expectStatus(input.baseUrl, "/api/v1/llm-profiles", 201, input.token, {
      id: profileId,
      name: `${profileId} test profile`,
      scope: "workspace",
      providerPreset: "custom",
      provider: "openai-compatible",
      providerName: "test-provider",
      baseUrl: providerBaseUrl,
      modelName: "test-runtime-model",
      apiKeyRef: secretRef,
      maxRetries: 0,
      thinkingType: "disabled"
    });
    await expectStatus(input.baseUrl, `/api/v1/llm-profiles/${encodeURIComponent(profileId)}/preflight`, 200, input.token, {});
    const bound = await expectStatus(input.baseUrl, "/api/v1/runtime-readiness/workspace-default", 200, input.token, {
      profileId,
      reason: "Explicit test workspace Runtime LLM binding."
    });
    return {
      profileId,
      binding: bound.data.binding,
      close: () => new Promise((resolve) => provider.close(resolve))
    };
  } catch (error) {
    await new Promise((resolve) => provider.close(resolve));
    throw error;
  }
}

function testGoalPlan() {
  return {
    summary: "Deterministic governed test plan",
    targets: ["alpha", "beta", "rc", "ga"].flatMap((phase) => ["architecture", "validation", "operations"].map((capability) => ({
      id: `${phase}-${capability}`,
      phase,
      title: `${phase.toUpperCase()} ${capability}`,
      description: `Prove ${phase} ${capability} under the governed test Runtime LLM binding.`,
      layer: phase === "ga" ? "release" : "loop",
      required: true,
      dependencyIds: [],
      acceptanceCriteria: [`${phase} ${capability} evidence is present`],
      requiredEvidence: [`${phase}-${capability}-evidence`],
      reviewCapabilities: [capability === "validation" ? "testing" : capability],
      packageOutputs: [`${phase}-${capability}-package`]
    })))
  };
}

async function expectStatus(baseUrl, pathname, expectedStatus, token, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = JSON.parse(await response.text());
  if (response.status !== expectedStatus) {
    throw new Error(`Runtime LLM fixture failed: ${pathname} status=${response.status} body=${JSON.stringify(payload)}`);
  }
  return payload;
}
