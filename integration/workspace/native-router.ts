import type { NativeProjectContext, ProjectPrepareInput, NativeProjectTrusted } from './native-project.js';
import { createNativeProjectService } from './native-project.js';
import { createLocalCollector } from '../collection/local.js';
import fs from 'node:fs';
import path from 'node:path';
import {inspectNativeToolchain} from '../toolchain/locked.js';
import { nativeExact, nativeBytesDigest, nativeSha256 } from '../compatibility/v1/native.mjs';
import type { NativeIntegrationConfiguration } from '../native-composition.js';
import { readWorkspaceResponseEvidence } from '../response/evidence.js';

/** Fixed method allowlist. Requests cannot register providers or change toolchain bindings. */
export function createNativeProjectRouter(context: NativeProjectContext, trusted: Pick<NativeProjectTrusted, 'readCompletedProject'> = {}) {
  const executable = fs.realpathSync(process.execPath);
  const toolFiles = [{ path: executable, sha256: nativeBytesDigest(fs.readFileSync(executable)).slice(7) }];
  const project = createNativeProjectService(context, { ...trusted, nativeToolchain:()=>inspectNativeToolchain({cacheRoot:path.join(context.stateRoot,'native-toolchain')}), toolchains: { node: { toolchainLockDigest: nativeSha256(toolFiles), toolFiles, readRoots: [] } } });
  const providers: NativeIntegrationConfiguration = {
    resolveNativeAuthoring: project.resolveNativeAuthoring,
    resolveReadinessAuthoring: project.resolveReadinessAuthoring,
    readResponseWorkspaceEvidence: ({scope,reference}) => readWorkspaceResponseEvidence(context,scope,reference),
    inspectSource: project.inspectSource,
    resolveRequirements: project.resolveRequirements,
    verifyProject: project.verifyProject,
    ...createLocalCollector({ resolveExecution: project.resolveExecution }),
  };
  async function request(value: { operation: string; input: unknown }): Promise<unknown> {
    nativeExact(value, ['operation', 'input']);
    switch (value.operation) {
      case 'preflight': return project.preflight(value.input as Parameters<typeof project.preflight>[0]);
      case 'prepare': return project.prepare(value.input as ProjectPrepareInput);
      case 'freeze': return project.freeze(value.input as Parameters<typeof project.freeze>[0]);
      case 'materialize': return project.materialize(value.input as Parameters<typeof project.materialize>[0]);
      case 'review-domain': return project.reviewDomain(value.input as Parameters<typeof project.reviewDomain>[0]);
      case 'inspect': return project.inspect(value.input as Parameters<typeof project.inspect>[0]);
      case 'check-layout': return project.checkLayout(value.input as Parameters<typeof project.checkLayout>[0]);
      case 'candidate-location': return project.candidateLocation(value.input as Parameters<typeof project.candidateLocation>[0]);
      case 'prepare-execution': return project.prepareExecution(value.input as Parameters<typeof project.prepareExecution>[0]);
      case 'promote': return project.promote(value.input as Parameters<typeof project.promote>[0]);
      default: throw Object.assign(new Error('Unknown native project operation'), { code: 'ACTION' });
    }
  }
  return { providers, request };
}
