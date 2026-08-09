import http from "node:http";
import { handleHarnessCatalogRoutes } from "./harness-catalog.js";

interface HarnessRoutesContext {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  url: URL;
  auth: any;
  store: any;
  options: { maxBodyBytes?: number };
  requestId: string;
  traceId?: string;
  parentRequestId?: string;
  setRequestErrorCode: (code: string) => void;
  deps: Record<string, any>;
}

export async function handleHarnessRoutes(context: HarnessRoutesContext): Promise<boolean> {
  if (await handleHarnessCatalogRoutes(context)) return true;
  return false;
}
