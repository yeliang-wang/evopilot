import { createComposition, aggregateEvaluation } from '../../integration/composition.js';
import { getGuide } from '../../expert/core/guide.js';
import { installationIdentity } from '../../integration/connection/config.js';
import { validateReference } from '../../integration/compatibility/v1/reference.mjs';
import type { ProductAPIs, Options, Scope, Reference, Receipt, EvaluationReport, ConnectionConfig, ControlRecord, ExternalRequest, MCPMessage } from '../../integration/types.js';

// Compile against source with --noEmit; after build, run the same consumer with
// these relative imports rooted at dist to check emitted declaration contracts.
declare const apis: ProductAPIs;
declare const options: Options;
declare const config: ConnectionConfig;
declare const record: ControlRecord;
const scope: Scope = { visibility: 'private', projectId: 'example' };
const composition = createComposition(options, apis);
const inspection = composition.request('runtime', { operation: 'workspace.inspect', scope, input: {} });
const revision: number = inspection.revision;
const asset = composition.request('ontology', { operation: 'asset.inspect', scope, input: { id: 'model', version: '1.0.0' } });
const modelId: string = asset.model.id;
const receipt: Receipt<{ report: EvaluationReport }> = composition.request('harness', { operation: 'evaluation.inspect', scope, input: { requestId: 'evaluate' } });
const pin: Reference = validateReference(receipt.result.report.reference);
const guide: string = getGuide('recovery').installedReferences[0];
const identityVersion: '0.1.1' = installationIdentity(config).version;
const pid: number = record.pid;
const args: ExternalRequest = { scope, id: 'run', requestId: 'dispatch', expectedRevision: revision };
void composition.dispatch(args);
const message: MCPMessage = { jsonrpc: '2.0', id: 1, method: 'ping' };
aggregateEvaluation({ status: 'PASS', valid: true }, { status: 'PASS' });
// @ts-expect-error Unknown product owner.
composition.inspect('other', scope);
// @ts-expect-error Revisions are numeric retained CAS values.
composition.dispatch({ ...args, expectedRevision: 'latest' });
// @ts-expect-error Workspace results do not masquerade as evaluation receipts.
inspection.result.report;
// @ts-expect-error Model identity is a string.
const invalidModelId: number = asset.model.id;
// @ts-expect-error Receipt reports expose the declared reference, not arbitrary fields.
receipt.result.report.reference.missing;
// @ts-expect-error Control records have an explicit lifecycle union.
record.state = 'stopped';
// @ts-expect-error MCP IDs cannot be objects.
message.id = {};
// @ts-expect-error Common references only identify material owners.
const invalidPin: Reference = { ...pin, product: 'runtime' };
void [modelId, guide, identityVersion, pid, invalidModelId, invalidPin];
