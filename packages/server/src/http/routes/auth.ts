import http from "node:http";

interface PublicAuthRouteContext {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  url: URL;
  requestId: string;
  options: { maxBodyBytes?: number; users?: unknown[] };
  tokens: unknown[];
  runtime: unknown;
  store: any;
  setRequestErrorCode: (code: string) => void;
  deps: {
    readJson: (request: http.IncomingMessage, maxBodyBytes?: number) => Promise<any>;
    writeJson: (response: http.ServerResponse, statusCode: number, body: unknown) => void;
    envelope: <T>(data: T) => unknown;
    optionalTrimmedString: (value: unknown) => string | undefined;
    normalizeUsers: (options: any, tokens: any[], runtime: any, store: any) => any[];
    verifyPassword: (input: string, stored: string) => boolean;
    logInfo: (event: string, record?: any) => void;
    logWarn: (event: string, record?: any) => void;
    publicUser: (user: any) => unknown;
    userSessionToken: (user: any) => string;
  };
}

interface ProtectedAuthRouteContext {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  url: URL;
  auth: any;
  options: { maxBodyBytes?: number };
  store: any;
  deps: {
    readJson: (request: http.IncomingMessage, maxBodyBytes?: number) => Promise<any>;
    writeJson: (response: http.ServerResponse, statusCode: number, body: unknown) => void;
    envelope: <T>(data: T) => unknown;
    verifyPassword: (input: string, stored: string) => boolean;
    hashPassword: (password: string) => string;
    audit: (context: any, action: string, target: string, metadata?: Record<string, unknown>) => unknown;
    authUserFromRecord: (user: any) => any;
    publicUser: (user: any) => unknown;
    userSessionToken: (user: any) => string;
  };
}

export async function handlePublicAuthRoute(context: PublicAuthRouteContext): Promise<boolean> {
  const { request, response, url, deps } = context;

  if (request.method === "GET" && url.pathname === "/api/v1/auth/bootstrap") {
    deps.writeJson(response, 200, deps.envelope({
      initialized: context.store.listUsers(undefined, true).some((user: any) => user.platformAdmin),
      defaultAdminRequiresPasswordChange: Boolean(context.store.readUser("admin")?.mustChangePassword)
    }));
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/v1/auth/login") {
    const body = await deps.readJson(request, context.options.maxBodyBytes) as Record<string, unknown>;
    const username = deps.optionalTrimmedString(body.username);
    const password = body.password === undefined || body.password === null ? "" : String(body.password);
    const liveUsers = deps.normalizeUsers(context.options, context.tokens, context.runtime, context.store);
    const matched = liveUsers.find((user) => user.username === username && deps.verifyPassword(password, user.password));
    if (!matched) {
      context.setRequestErrorCode("INVALID_CREDENTIALS");
      deps.logWarn("auth.login.rejected", {
        requestId: context.requestId,
        category: "auth",
        outcome: "rejected",
        errorCode: "INVALID_CREDENTIALS",
        error: "INVALID_CREDENTIALS",
        metadata: { username: username ?? "" }
      });
      deps.writeJson(response, 401, { error: "INVALID_CREDENTIALS", detail: "用户名或密码错误" });
      return true;
    }
    if (matched.status === "SUSPENDED") {
      context.setRequestErrorCode("USER_SUSPENDED");
      deps.writeJson(response, 403, { error: "USER_SUSPENDED", detail: "账号已停用，请联系管理员" });
      return true;
    }
    const persisted = context.store.readUser(matched.username);
    if (persisted) {
      context.store.writeUser({ ...persisted, lastLoginAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    deps.logInfo("auth.login.succeeded", {
      requestId: context.requestId,
      category: "auth",
      tenantId: matched.tenantId,
      workspaceId: matched.workspaceId,
      actor: matched.username,
      role: matched.role
    });
    deps.writeJson(response, 200, deps.envelope({
      token: deps.userSessionToken(matched),
      user: deps.publicUser(matched)
    }));
    return true;
  }

  return false;
}

export async function handleProtectedAuthRoute(context: ProtectedAuthRouteContext): Promise<boolean> {
  const { request, response, url, auth, deps } = context;

  if (request.method === "POST" && url.pathname === "/api/v1/auth/change-password") {
    const user = context.store.readUser(auth.actor);
    if (!user) {
      deps.writeJson(response, 404, { error: "USER_NOT_FOUND" });
      return true;
    }
    const body = await deps.readJson(request, context.options.maxBodyBytes) as Record<string, unknown>;
    const currentPassword = body.currentPassword === undefined || body.currentPassword === null ? "" : String(body.currentPassword);
    const nextPassword = body.newPassword === undefined || body.newPassword === null ? "" : String(body.newPassword);
    if (!deps.verifyPassword(currentPassword, user.passwordHash)) {
      deps.writeJson(response, 403, { error: "CURRENT_PASSWORD_INVALID" });
      return true;
    }
    if (nextPassword.trim().length < 4) {
      deps.writeJson(response, 400, { error: "PASSWORD_TOO_SHORT" });
      return true;
    }
    if (user.username === "admin" && nextPassword === "admin") {
      deps.writeJson(response, 400, { error: "DEFAULT_ADMIN_PASSWORD_FORBIDDEN" });
      return true;
    }
    const updated = context.store.writeUser({ ...user, passwordHash: deps.hashPassword(nextPassword), mustChangePassword: false, updatedAt: new Date().toISOString() });
    context.store.appendAudit(deps.audit(auth, "user.password.changed", updated.id, { selfService: true }));
    const nextUser = deps.authUserFromRecord(updated);
    const safeUser = deps.publicUser(nextUser);
    deps.writeJson(response, 200, deps.envelope({ ...safeUser as object, user: safeUser, token: deps.userSessionToken(nextUser) }));
    return true;
  }

  return false;
}
