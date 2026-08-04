import fs from "node:fs";
import path from "node:path";
import type { LlmTaskClient } from "@evopilot/llm";
import type {
  ExecutorAdapter,
  ExecutorAdapterExecutionInput,
  ExecutorAdapterExecutionOutput,
  ExecutorCoordinationPlan,
  ExecutorNode,
  ExecutorNodeType,
  ExecutorStepResult,
  LoopDecision,
  LoopRun,
  LoopSandboxEnforcement,
  LoopSandboxPolicy
} from "../model.js";
import { safeFileName } from "../storage/json-files.js";

class ExecutorAdapterRegistry {
  private readonly adaptersById = new Map<string, ExecutorAdapter>();
  private readonly adaptersByType = new Map<ExecutorNodeType, ExecutorAdapter>();

  constructor(adapters: ExecutorAdapter[]) {
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter: ExecutorAdapter): void {
    this.adaptersById.set(adapter.id, adapter);
    this.adaptersByType.set(adapter.nodeType, adapter);
  }

  resolve(node: ExecutorNode): ExecutorAdapter {
    const configuredAdapterId = typeof node.config.adapterId === "string" ? node.config.adapterId.trim() : "";
    if (configuredAdapterId) {
      const adapter = this.adaptersById.get(configuredAdapterId);
      if (!adapter) throw new Error(`EXECUTOR_ADAPTER_NOT_FOUND:${configuredAdapterId}`);
      if (adapter.nodeType !== node.type) throw new Error(`EXECUTOR_ADAPTER_TYPE_MISMATCH:${configuredAdapterId}:${node.type}`);
      return adapter;
    }
    const adapter = this.adaptersByType.get(node.type);
    if (!adapter) throw new Error(`EXECUTOR_ADAPTER_TYPE_NOT_REGISTERED:${node.type}`);
    return adapter;
  }
}

function createExecutorAdapterRegistry(): ExecutorAdapterRegistry {
  return new ExecutorAdapterRegistry([
    createLlmContextExecutorAdapter("evopilot.llm-context-adapter"),
    createLlmContextExecutorAdapter("evopilot.target-contract-adapter"),
    createPolicyAwareExecutorAdapter("evopilot.code-upgrader-adapter", "code-upgrader"),
    createPolicyAwareExecutorAdapter("evopilot.ci-adapter", "ci"),
    createPolicyAwareExecutorAdapter("evopilot.validator-adapter", "validator"),
    createPolicyAwareExecutorAdapter("evopilot.discovery-runtime-adapter", "validator"),
    createPolicyAwareExecutorAdapter("evopilot.adversarial-evaluator-adapter", "validator"),
    createPolicyAwareExecutorAdapter("evopilot.approval-adapter", "approval"),
    createPolicyAwareExecutorAdapter("evopilot.release-action-adapter", "release-action"),
    createPolicyAwareExecutorAdapter("evopilot.source-release-adapter", "release-action")
  ]);
}

function createLlmContextExecutorAdapter(id: string): ExecutorAdapter {
  return {
    id,
    nodeType: "llm",
    async execute(input) {
      const policyResult = policyBlockedExecutorResult(id, "llm", input);
      if (policyResult) return policyResult;
      if (!input.llmClient) {
        if (input.requireLlm) {
          return failedExecutorResult(id, "llm", input, "LLM_REQUIRED_FOR_LOOP_EXECUTOR", "LLM provider is not configured for loop executor.");
        }
        return policyAwareExecutorSuccess(id, "llm", input, {
          result: "llm skipped because no provider is configured in debug mode",
          executionMode: "debug-no-provider"
        }, ["llm.executionMode=debug-no-provider"]);
      }
      const started = Date.parse(input.now);
      const response = await input.llmClient.generate({
        caller: "evopilot-loop-runtime",
        intent: "plan.generation",
        outputContract: "markdown_document",
        latencyClass: "batch",
        complexity: "high",
        outputSize: "large",
        metadata: {
          productFlow: "loop-executor",
          loopId: input.loop.id,
          nodeId: input.node.id,
          projectId: input.loop.projectId,
          executorGraphId: input.loop.executorGraphId,
          sourceProjectId: input.loop.sourceClosure.sourceProjectId,
          sourceProvider: input.loop.sourceClosure.repositoryProvider,
          llmSource: input.loop.llm?.source ?? "none",
          llmProfileId: input.loop.llm?.profileId ?? "global-default"
        },
        prompt: loopLlmExecutorPrompt(input)
      });
      const totalTokens = Number(response.usage?.totalTokens ?? 0);
      const costUsd = estimateLlmCostUsd(totalTokens);
      const commonOutput = {
        workspacePath: input.nodeWorkspace,
        executorBoundary: executorBoundaryLabel(input.node.type),
        adapterId: id,
        coordinationMode: input.coordination.mode,
        sandboxRuntime: input.sandbox.runtime,
        credentialScope: input.sandbox.credentialScope,
        network: input.sandbox.network,
        sandboxEnforcement: input.sandboxEnforcement.status,
        sourceClosure: input.loop.sourceClosure,
        provider: response.provider,
        model: response.model,
        totalTokens,
        tokens: totalTokens,
        costUsd,
        durationMs: response.durationMs,
        resolvedIntent: response.resolvedIntent,
        resolvedProfile: response.resolvedProfile,
        llmProfileId: input.loop.llm?.profileId,
        llmSource: input.loop.llm?.source ?? "none",
        llmRequestId: response.requestId,
        finishReason: response.finishReason,
        truncated: response.truncated === true
      };
      if (!response.success) {
        return {
          status: "FAILED",
          completedAt: new Date(started + Math.max(1, response.durationMs ?? 1)).toISOString(),
          output: {
            ...commonOutput,
            reason: response.errorMessage ?? response.errorCode ?? "LLM executor failed",
            errorCode: response.errorCode,
            errorMessage: response.errorMessage
          },
          evidence: [
            ...executorAdapterEvidence(id, "llm", input),
            "llm.executionMode=provider",
            `llm.profile=${input.loop.llm?.profileId ?? "global-default"}`,
            `llm.source=${input.loop.llm?.source ?? "none"}`,
            `llm.provider=${response.provider ?? "unknown"}`,
            `llm.model=${response.model ?? "unknown"}`,
            `llm.totalTokens=${totalTokens}`,
            `llm.costUsd=${costUsd}`,
            "llm.success=false",
            "status=FAILED"
          ],
          failureSignature: `llm:${response.errorCode ?? "provider-failed"}`
        };
      }
      return {
        status: "SUCCEEDED",
        completedAt: new Date(started + Math.max(1, response.durationMs ?? 1)).toISOString(),
        output: {
          ...commonOutput,
          result: "llm provider completed",
          planMarkdown: response.text,
          usage: response.usage
        },
        evidence: [
          ...executorAdapterEvidence(id, "llm", input),
          "llm.executionMode=provider",
          `llm.profile=${input.loop.llm?.profileId ?? "global-default"}`,
          `llm.source=${input.loop.llm?.source ?? "none"}`,
          `llm.provider=${response.provider ?? "unknown"}`,
          `llm.model=${response.model ?? "unknown"}`,
          `llm.totalTokens=${totalTokens}`,
          `llm.costUsd=${costUsd}`,
          "llm.success=true",
          "status=SUCCEEDED"
        ]
      };
    }
  };
}

function policyBlockedExecutorResult(id: string, nodeType: ExecutorNodeType, input: ExecutorAdapterExecutionInput): ExecutorAdapterExecutionOutput | undefined {
  const blockedByCircuit = input.previousFailureCount >= input.loop.retryPolicy.circuitBreakerFailures && input.node.type !== "approval";
  const blockedBySandbox = input.sandboxEnforcement.status === "FAILED" && input.node.type !== "approval";
  const forcedFailure = input.forceDecision === "FAIL" || input.forceDecision === "BLOCK" || input.forceDecision === "REPAIR";
  const waitingApproval = input.node.type === "approval" && input.loop.stopPolicy.requireApprovalForRelease && input.iterationIndex >= input.loop.stopPolicy.maxIterations;
  if (waitingApproval) {
    return {
      status: "WAITING_APPROVAL",
      output: executorOutputBase(id, input, {
        reason: "approval gate reached"
      }),
      evidence: [...executorAdapterEvidence(id, nodeType, input), "status=WAITING_APPROVAL"]
    };
  }
  if (!blockedByCircuit && !blockedBySandbox && !forcedFailure) return undefined;
  return failedExecutorResult(
    id,
    nodeType,
    input,
    blockedBySandbox ? "SANDBOX_ENFORCEMENT_FAILED" : "LOOP_POLICY_BLOCKED",
    blockedBySandbox ? "sandbox enforcement failed" : "loop policy blocked execution",
    blockedBySandbox ? `${input.node.type}:sandbox-enforcement-failed` : `${input.node.type}:policy-or-forced-failure`
  );
}

function failedExecutorResult(
  id: string,
  nodeType: ExecutorNodeType,
  input: ExecutorAdapterExecutionInput,
  errorCode: string,
  reason: string,
  failureSignature = `${input.node.type}:${errorCode.toLowerCase()}`
): ExecutorAdapterExecutionOutput {
  return {
    status: "FAILED",
    completedAt: new Date(Date.parse(input.now) + 1).toISOString(),
    output: executorOutputBase(id, input, { reason, errorCode }),
    evidence: [...executorAdapterEvidence(id, nodeType, input), `errorCode=${errorCode}`, "status=FAILED"],
    failureSignature
  };
}

function policyAwareExecutorSuccess(
  id: string,
  nodeType: ExecutorNodeType,
  input: ExecutorAdapterExecutionInput,
  extraOutput: Record<string, unknown> = {},
  extraEvidence: string[] = []
): ExecutorAdapterExecutionOutput {
  return {
    status: "SUCCEEDED",
    completedAt: new Date(Date.parse(input.now) + 1).toISOString(),
    output: executorOutputBase(id, input, {
      result: `${input.node.type} completed`,
      ...extraOutput
    }),
    evidence: [...executorAdapterEvidence(id, nodeType, input), ...extraEvidence, "status=SUCCEEDED"]
  };
}

function executorOutputBase(id: string, input: ExecutorAdapterExecutionInput, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...extra,
    workspacePath: input.nodeWorkspace,
    executorBoundary: executorBoundaryLabel(input.node.type),
    adapterId: id,
    coordinationMode: input.coordination.mode,
    sandboxRuntime: input.sandbox.runtime,
    credentialScope: input.sandbox.credentialScope,
    network: input.sandbox.network,
    sandboxEnforcement: input.sandboxEnforcement.status,
    llm: input.loop.llm,
    sourceClosure: input.loop.sourceClosure
  };
}

function executorAdapterEvidence(id: string, nodeType: ExecutorNodeType, input: ExecutorAdapterExecutionInput): string[] {
  return [
    `adapter=${id}`,
    `adapterNodeType=${nodeType}`,
    `executorBoundary=${executorBoundaryLabel(input.node.type)}`,
    `coordinationMode=${input.coordination.mode}`,
    `sandboxRuntime=${input.sandbox.runtime}`,
    `sandboxNetwork=${input.sandbox.network}`,
    `sandboxEnforcement=${input.sandboxEnforcement.status}`,
    `llm.source=${input.loop.llm?.source ?? "none"}`,
    `llm.profile=${input.loop.llm?.profileId ?? "global-default"}`,
    `llm.provider=${input.loop.llm?.provider ?? "runtime-default"}`,
    `llm.model=${input.loop.llm?.model ?? "runtime-default"}`,
    `credentialScope=${input.sandbox.credentialScope}`,
    `sourceProjectId=${input.loop.sourceClosure.sourceProjectId}`,
    `sourceProvider=${input.loop.sourceClosure.repositoryProvider}`,
    `sourceRef=${input.loop.sourceClosure.sourceUrl ?? input.loop.sourceClosure.sourceRoot ?? "unknown"}`,
    `sourceBranch=${input.loop.sourceClosure.sourceBranch}`,
    `releaseStrategy=${input.loop.sourceClosure.releaseStrategy}`,
    `requiredGates=${input.loop.sourceClosure.requiredGates.join(",")}`,
    `targetVersion=${input.loop.sourceClosure.targetVersion ?? "unspecified"}`,
    `deploymentEnvironment=${input.loop.sourceClosure.deploymentEnvironment ?? "production"}`
  ];
}

function createPolicyAwareExecutorAdapter(id: string, nodeType: ExecutorNodeType): ExecutorAdapter {
  return {
    id,
    nodeType,
    execute(input) {
      return policyBlockedExecutorResult(id, nodeType, input) ?? policyAwareExecutorSuccess(id, nodeType, input);
    }
  };
}

function loopLlmExecutorPrompt(input: ExecutorAdapterExecutionInput): string {
  return [
    "# EvoPilot Loop Executor Plan",
    "",
    "You are the real LLM executor for an EvoPilot production loop. Produce a concise Markdown plan that can be audited by the control plane.",
    "",
    "## Loop",
    `- loopId: ${input.loop.id}`,
    `- projectId: ${input.loop.projectId}`,
    `- objective: ${input.loop.objective}`,
    `- currentIteration: ${input.iterationIndex}`,
    `- executorGraphId: ${input.loop.executorGraphId}`,
    "",
    "## Source Closure",
    `- sourceProjectId: ${input.loop.sourceClosure.sourceProjectId}`,
    `- provider: ${input.loop.sourceClosure.repositoryProvider}`,
    `- sourceRef: ${input.loop.sourceClosure.sourceUrl ?? input.loop.sourceClosure.sourceRoot ?? "unknown"}`,
    `- branch: ${input.loop.sourceClosure.sourceBranch}`,
    `- targetVersion: ${input.loop.sourceClosure.targetVersion ?? "unspecified"}`,
    `- requiredGates: ${input.loop.sourceClosure.requiredGates.join(", ")}`,
    `- releaseStrategy: ${input.loop.sourceClosure.releaseStrategy}`,
    "",
    "## Runtime Boundary",
    `- sandboxRuntime: ${input.sandbox.runtime}`,
    `- sandboxNetwork: ${input.sandbox.network}`,
    `- credentialScope: ${input.sandbox.credentialScope}`,
    `- sandboxEnforcement: ${input.sandboxEnforcement.status}`,
    `- llmSource: ${input.loop.llm?.source ?? "none"}`,
    `- llmProfileId: ${input.loop.llm?.profileId ?? "global-default"}`,
    `- llmProvider: ${input.loop.llm?.provider ?? "runtime-default"}`,
    `- llmModel: ${input.loop.llm?.model ?? "runtime-default"}`,
    "",
    "## Required Output",
    "- Current code/product facts implied by the loop context.",
    "- Execution plan for this iteration.",
    "- Expected code, validation, release, and evidence gates.",
    "- Risks, blockers, and required human approval points.",
    "- Keep it actionable and specific; do not claim that code was changed unless a downstream executor actually changes it.",
    "",
    "## Context",
    JSON.stringify(input.loop.context ?? {}, null, 2)
  ].join("\n");
}

function estimateLlmCostUsd(totalTokens: number): number {
  const pricePerThousand = Number(process.env.EVOPILOT_LLM_COST_PER_1K_TOKENS_USD ?? "0");
  if (!Number.isFinite(pricePerThousand) || pricePerThousand <= 0 || totalTokens <= 0) return 0;
  return Number(((totalTokens / 1000) * pricePerThousand).toFixed(6));
}

function executorBoundaryLabel(type: ExecutorNodeType): string {
  return ({
    llm: "EvoPilot LLM gateway boundary",
    "code-upgrader": "EvoPilot code-upgrader runtime boundary",
    ci: "repository-native CI/CD boundary",
    validator: "independent validation boundary",
    approval: "human approval boundary",
    "release-action": "guarded release action boundary"
  })[type];
}

export async function executeLoopNode(args: {
  node: ExecutorNode;
  loop: LoopRun;
  iterationIndex: number;
  attempt: number;
  previousFailureCount: number;
  forceDecision?: LoopDecision;
  workspaceRoot: string;
  coordination: ExecutorCoordinationPlan;
  sandbox: LoopSandboxPolicy;
  sandboxEnforcement: LoopSandboxEnforcement;
  now: string;
  llmClient?: LlmTaskClient;
  requireLlm: boolean;
}): Promise<ExecutorStepResult> {
  const workspacePath = path.join(args.workspaceRoot, safeFileName(args.node.id));
  fs.mkdirSync(workspacePath, { recursive: true });
  const nodeCoordination = args.coordination.nodes.find((node) => node.nodeId === args.node.id);
  const baseEvidence = [
    `node=${args.node.id}`,
    `type=${args.node.type}`,
    `attempt=${args.attempt}`,
    `objective=${args.loop.objective}`,
    `executorGraph=${args.loop.executorGraphId}`,
    `coordinationMode=${args.coordination.mode}`,
    `workspace=${workspacePath}`,
    `dependsOn=${nodeCoordination?.dependsOn.join(",") ?? ""}`,
    `inputSchema=${JSON.stringify(nodeCoordination?.inputSchema ?? {})}`,
    `outputSchema=${JSON.stringify(nodeCoordination?.outputSchema ?? {})}`,
    `allowedPaths=${args.sandbox.allowedPaths.join(",")}`,
    `deniedPaths=${args.sandbox.deniedPaths.join(",")}`
  ];
  const adapter = createExecutorAdapterRegistry().resolve(args.node);
  const adapterResult = await adapter.execute({
    node: args.node,
    loop: args.loop,
    iterationIndex: args.iterationIndex,
    attempt: args.attempt,
    previousFailureCount: args.previousFailureCount,
    forceDecision: args.forceDecision,
    workspaceRoot: args.workspaceRoot,
    nodeWorkspace: workspacePath,
    coordination: args.coordination,
    sandbox: args.sandbox,
    sandboxEnforcement: args.sandboxEnforcement,
    now: args.now,
    llmClient: args.llmClient,
    requireLlm: args.requireLlm
  });
  return {
    nodeId: args.node.id,
    type: args.node.type,
    status: adapterResult.status,
    startedAt: args.now,
    completedAt: adapterResult.completedAt,
    attempt: args.attempt,
    input: {
      loopId: args.loop.id,
      iteration: args.iterationIndex,
      adapterId: adapter.id,
      nodeConfig: args.node.config,
      schema: nodeCoordination?.inputSchema,
      dependsOn: nodeCoordination?.dependsOn ?? [],
      sharedContextKeys: args.coordination.sharedContextKeys,
      sandbox: args.sandbox,
      sandboxEnforcement: args.sandboxEnforcement,
      sourceClosure: args.loop.sourceClosure
    },
    output: adapterResult.output,
    evidence: [...baseEvidence, ...adapterResult.evidence],
    failureSignature: adapterResult.failureSignature
  };
}
