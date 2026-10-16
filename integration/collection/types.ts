import type { CollectionClaim } from '@evopilot-next/runtime/service';
export interface CollectionFilePin { path: string; sha256: string }
/** Created from retained project scope and a reviewed local tool environment, not from request JSON. */
export interface CollectionExecutionBinding {
  cwd: string;
  sourceFiles: CollectionFilePin[];
  toolchainLockDigest: string;
  toolFiles: CollectionFilePin[];
  readRoots: string[];
}
export interface CollectionWorkerRequest {
  schema: 'evopilot-collection-worker/v1';
  claim: CollectionClaim;
  artifactRoot: string;
  binding: CollectionExecutionBinding;
}
