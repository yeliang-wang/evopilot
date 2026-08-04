import {
  EVOPILOT_API_CONTRACT_VERSION,
  EVOPILOT_MINIMUM_CLI_VERSION,
  EVOPILOT_PRODUCT_VERSION_FALLBACK,
  EVOPILOT_SERVER_VERSION_FALLBACK
} from "@evopilot/contracts";

export const EVOPILOT_PRODUCT_VERSION = process.env.EVOPILOT_PRODUCT_VERSION ?? EVOPILOT_PRODUCT_VERSION_FALLBACK;
export const EVOPILOT_SERVER_VERSION = process.env.EVOPILOT_SERVER_VERSION ?? EVOPILOT_SERVER_VERSION_FALLBACK;

export interface PlatformHealthInput {
  profileId: string;
  runtimeMode: string;
  dataRoot: string;
  authRequired: boolean;
}

export interface PlatformReadyInput {
  ready: boolean;
  schemaVersion: number;
}

export interface PlatformVersionInput {
  dashboardEnabled: boolean;
}

export function platformHealthBody(input: PlatformHealthInput): Record<string, unknown> {
  return {
    status: "UP",
    service: "evopilot",
    productVersion: EVOPILOT_PRODUCT_VERSION,
    serverVersion: EVOPILOT_SERVER_VERSION,
    apiContractVersion: EVOPILOT_API_CONTRACT_VERSION,
    profile: input.profileId,
    runtimeMode: input.runtimeMode,
    dataRoot: input.dataRoot,
    authRequired: input.authRequired
  };
}

export function platformReadyBody(input: PlatformReadyInput): Record<string, unknown> {
  return {
    status: input.ready ? "READY" : "NOT_READY",
    schemaVersion: input.schemaVersion
  };
}

export function platformVersionBody(input: PlatformVersionInput): Record<string, unknown> {
  return {
    schema: "evopilot-version/v1",
    service: "evopilot",
    productVersion: EVOPILOT_PRODUCT_VERSION,
    serverVersion: EVOPILOT_SERVER_VERSION,
    apiContractVersion: EVOPILOT_API_CONTRACT_VERSION,
    minimumCliVersion: EVOPILOT_MINIMUM_CLI_VERSION,
    recommendedCliPackage: "@evopilot/cli",
    dashboardMode: input.dashboardEnabled ? "api-server-static-dashboard" : "standalone-api-client"
  };
}
