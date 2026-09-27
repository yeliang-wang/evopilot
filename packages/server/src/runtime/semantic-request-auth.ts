import type http from "node:http";
import type {AuthToken, EvoPilotServerOptions, RuntimeConfig, UserRecord} from "../model.js";
import {authorize, mergeUserTokens, normalizeUsers} from "./runtime-auth.js";

/** Re-resolve the bearer principal on every semantic read boundary. The actor
 * header is an audit label, never an identity or account-status lookup key.
 * This stricter semantic entry does not enable debug anonymous access.
 */
export function resolveSemanticRequestPrincipal(input: {
  request: http.IncomingMessage; options: EvoPilotServerOptions; tokens: AuthToken[]; runtime: RuntimeConfig;
  store: {listUsers(tenantId?: string, includeSuspended?: boolean): UserRecord[]};
}) {
  const {request, options, tokens, runtime, store} = input;
  const header = request.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return undefined;
  const users = normalizeUsers(options, tokens, runtime, store);
  const candidates = mergeUserTokens(tokens, users.filter(user => user.status === "ACTIVE"));
  const matched = candidates.find(candidate => candidate.token === header.slice(7));
  if (!matched) return undefined;
  const declared = users.find(user => user.username === matched.name);
  const configured = options.users?.find(user => user.username === matched.name);
  const persisted = store.listUsers(undefined, true).find(user => user.username === matched.name);
  if ([declared, configured, persisted].some(user => user?.status === "SUSPENDED" || user?.mustChangePassword)) return undefined;
  const auth = authorize(request, [matched], {...runtime, allowAnonymousAdmin: false});
  if (!auth || auth.mustChangePassword || declared?.mustChangePassword || persisted?.mustChangePassword) return undefined;
  // A persisted change must not be hidden by a configured token or debug-user
  // projection. The client must obtain a credential matching current authority.
  if ([configured, persisted].some(user => user && (user.role !== auth.role || user.tenantId !== auth.tenantId || user.workspaceId !== auth.workspaceId))) return undefined;
  return Object.freeze({id: matched.name, role: auth.role, tenantId: auth.tenantId, workspaceId: auth.workspaceId});
}
