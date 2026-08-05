import http from "node:http";

interface TargetLoopRoutesContext {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  url: URL;
  auth: any;
  store: any;
  options: { maxBodyBytes?: number };
  deps: Record<string, any>;
}

export async function handleTargetLoopRoutes(context: TargetLoopRoutesContext): Promise<boolean> {
  const { request, response, url, auth, store, options } = context;
  const {
    audit,
    envelope,
    extractImConversationId,
    extractImText,
    hasRole,
    normalizeScenarioMatrix,
    parseConversationCommand,
    proofOpsCore,
    readJson,
    writeJson
  } = context.deps;

  if (request.method === "POST" && (url.pathname === "/api/v1/im/feishu/webhook" || url.pathname === "/api/v1/im/wecom/webhook")) {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const channel = url.pathname.includes("feishu") ? "feishu" : "wecom";
    const command = parseConversationCommand({
      channel,
      conversationId: extractImConversationId(body, channel),
      text: extractImText(body),
      projectId: body.projectId,
      targetId: body.targetId,
      finalGoal: body.finalGoal
    });
    const runtimeLoop = store.createLoop({
      source: "im",
      projectId: command.projectId,
      objective: command.finalGoal ?? `${command.projectId} reaches ${command.targetId.toUpperCase()} through EvoPilot Loop Runtime.`,
      context: { channel, rawWebhookType: body.type ?? body.msgtype ?? body.event?.message?.message_type, conversationId: command.conversationId, text: command.text }
    });
    store.appendAudit(audit(auth, `im.${channel}.loop-created`, runtimeLoop.id, { conversationId: command.conversationId }));
    return writeJson(response, 201, envelope({
      schema: "evopilot-im-webhook-result/v1",
      channel,
      conversationId: command.conversationId,
      message: `Created EvoPilot loop ${runtimeLoop.id} from ${channel} webhook.`,
      loop: runtimeLoop
    }));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/conversations/commands") {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const command = parseConversationCommand(body);
    if (command.kind === "create-target-loop") {
      const runtimeLoop = store.createLoop({
        source: "im",
        projectId: command.projectId,
        objective: command.finalGoal ?? `${command.projectId} reaches ${command.targetId.toUpperCase()} through EvoPilot Loop Runtime.`,
        context: {
          channel: command.channel,
          conversationId: command.conversationId,
          text: command.text,
          targetId: command.targetId
        }
      });
      const loop = store.createTargetLoop({
        projectId: command.projectId,
        targetId: command.targetId,
        finalGoal: command.finalGoal,
        candidate: command.candidate,
        proofOpsCore
      });
      store.appendAudit(audit(auth, "conversation.target-loop-created", loop.id, {
        channel: command.channel,
        conversationId: command.conversationId,
        text: command.text,
        runtimeLoopId: runtimeLoop.id
      }));
      return writeJson(response, 201, envelope({
        schema: "evopilot-conversation-command-result/v1",
        channel: command.channel,
        conversationId: command.conversationId,
        message: `Created EvoPilot loop ${runtimeLoop.id} and target loop ${loop.id}; target plan approval is required before guarded execution.`,
        loop: runtimeLoop,
        targetLoop: loop
      }));
    }
    return writeJson(response, 400, { error: "CONVERSATION_COMMAND_UNSUPPORTED" });
  }
  if (request.method === "GET" && url.pathname === "/api/v1/target-loops") {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    return writeJson(response, 200, envelope(store.listTargetLoops().slice(-50).reverse()));
  }
  if (request.method === "POST" && url.pathname === "/api/v1/target-loops") {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const loop = store.createTargetLoop({
      projectId: body.projectId ? String(body.projectId) : undefined,
      targetId: body.targetId ? String(body.targetId) : undefined,
      finalGoal: body.finalGoal ? String(body.finalGoal) : undefined,
      candidate: body.candidate ? String(body.candidate) : undefined,
      proofOpsCore
    });
    store.appendAudit(audit(auth, "target-loop.created", loop.id, { projectId: loop.projectId, targetId: loop.targetId }));
    return writeJson(response, 201, envelope(loop));
  }
  const targetLoopMatch = url.pathname.match(/^\/api\/v1\/target-loops\/([^/]+)$/);
  if (request.method === "GET" && targetLoopMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const loop = store.readTargetLoop(decodeURIComponent(targetLoopMatch[1]));
    if (!loop) return writeJson(response, 404, { error: "TARGET_LOOP_NOT_FOUND" });
    return writeJson(response, 200, envelope(loop));
  }
  const targetLoopApproveMatch = url.pathname.match(/^\/api\/v1\/target-loops\/([^/]+)\/approve-plan$/);
  if (request.method === "POST" && targetLoopApproveMatch) {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const loop = store.approveTargetLoopPlan(decodeURIComponent(targetLoopApproveMatch[1]), auth.actor);
    if (!loop) return writeJson(response, 404, { error: "TARGET_LOOP_NOT_FOUND" });
    store.appendAudit(audit(auth, "target-loop.plan-approved", loop.id, { targetId: loop.targetId }));
    return writeJson(response, 200, envelope(loop));
  }
  const targetLoopResumeMatch = url.pathname.match(/^\/api\/v1\/target-loops\/([^/]+)\/resume$/);
  if (request.method === "POST" && targetLoopResumeMatch) {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const loop = store.runTargetLoop(decodeURIComponent(targetLoopResumeMatch[1]), {
      scenarioMatrix: normalizeScenarioMatrix(body.scenarioMatrix),
      artifactPaths: Array.isArray(body.artifactPaths) ? body.artifactPaths.map(String) : []
    });
    if (!loop) return writeJson(response, 404, { error: "TARGET_LOOP_NOT_FOUND" });
    store.appendAudit(audit(auth, "target-loop.resumed", loop.id, { status: loop.status, releaseDecision: loop.releaseDecision?.id }));
    return writeJson(response, 200, envelope(loop));
  }
  const targetLoopReportMatch = url.pathname.match(/^\/api\/v1\/target-loops\/([^/]+)\/final-report$/);
  if (request.method === "GET" && targetLoopReportMatch) {
    if (!hasRole(auth, "viewer")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const loop = store.readTargetLoop(decodeURIComponent(targetLoopReportMatch[1]));
    if (!loop) return writeJson(response, 404, { error: "TARGET_LOOP_NOT_FOUND" });
    if (!loop.finalReport) return writeJson(response, 409, { error: "TARGET_LOOP_FINAL_REPORT_PENDING" });
    return writeJson(response, 200, envelope(loop.finalReport));
  }
  const targetLoopReleaseActionMatch = url.pathname.match(/^\/api\/v1\/target-loops\/([^/]+)\/release-actions\/([^/]+)\/approve$/);
  if (request.method === "POST" && targetLoopReleaseActionMatch) {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const loop = store.approveTargetLoopReleaseAction(
      decodeURIComponent(targetLoopReleaseActionMatch[1]),
      decodeURIComponent(targetLoopReleaseActionMatch[2]),
      auth.actor
    );
    if (!loop) return writeJson(response, 404, { error: "TARGET_LOOP_NOT_FOUND" });
    store.appendAudit(audit(auth, "target-loop.release-action-approved", loop.id, { action: targetLoopReleaseActionMatch[2] }));
    return writeJson(response, 200, envelope(loop));
  }
  const targetLoopReleaseExecuteMatch = url.pathname.match(/^\/api\/v1\/target-loops\/([^/]+)\/release-actions\/([^/]+)\/execute$/);
  if (request.method === "POST" && targetLoopReleaseExecuteMatch) {
    if (!hasRole(auth, "admin")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const loop = store.executeTargetLoopReleaseAction(
      decodeURIComponent(targetLoopReleaseExecuteMatch[1]),
      decodeURIComponent(targetLoopReleaseExecuteMatch[2]),
      auth.actor
    );
    if (!loop) return writeJson(response, 404, { error: "TARGET_LOOP_NOT_FOUND" });
    store.appendAudit(audit(auth, "target-loop.release-action-executed", loop.id, { action: targetLoopReleaseExecuteMatch[2] }));
    return writeJson(response, 200, envelope(loop));
  }
  const targetLoopRemediationMatch = url.pathname.match(/^\/api\/v1\/target-loops\/([^/]+)\/route-remediation$/);
  if (request.method === "POST" && targetLoopRemediationMatch) {
    if (!hasRole(auth, "operator")) return writeJson(response, 403, { error: "FORBIDDEN" });
    const body = await readJson(request, options.maxBodyBytes);
    const loop = store.routeTargetLoopRemediation(
      decodeURIComponent(targetLoopRemediationMatch[1]),
      body.blocker ? String(body.blocker) : undefined
    );
    if (!loop) return writeJson(response, 404, { error: "TARGET_LOOP_NOT_FOUND" });
    store.appendAudit(audit(auth, "target-loop.remediation-routed", loop.id, { remediationCount: loop.remediationRequests.length }));
    return writeJson(response, 200, envelope(loop));
  }


  return false;
}
