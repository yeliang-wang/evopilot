import type { JSONValue, Reference, MaterialOwner, Scope } from '../../types.js';
export type { JSONValue, Reference } from '../../types.js';
export const CONTRACT_REVISION: '1.0.0';
export function assertJSON(value: unknown, ancestors?: Set<object>): asserts value is JSONValue;
export function stableSerialize(value: unknown): string;
export function sha256(value: unknown): `sha256:${string}`;
/** JSON validation precedes cloning; the returned data is recursively frozen at runtime. */
export function frozenClone<T>(value: T): T;
export function exactFields(value: unknown, required: readonly string[], optional?: readonly string[]): asserts value is Record<string, unknown>;
export function textField(value: unknown): asserts value is string;
export const SOURCE_STATUSES: readonly ['design-proposed', 'design-confirmed', 'source-observed', 'inferred', 'runtime-observed', 'human-reviewed', 'synthetic'];
export const ENVELOPE_FIELDS: readonly ['id', 'version', 'product', 'specVersion', 'visibility', 'provenance', 'extensions', 'dependencies'];
export function validateEnvelope(asset: unknown): { extensions: { namespace: string; version: string; status: 'VALID' | 'NOT_EVALUATED' }[]; authority: false };
export interface ReferenceOptions { product?: MaterialOwner; visibility?: Scope['visibility'] }
export function validateReference(value: unknown, options?: ReferenceOptions): Readonly<Reference>;
export function inspectReference(ref: unknown, observed: unknown, options?: ReferenceOptions): Readonly<{ reference: Readonly<Reference>; exactMatch: true; authority: false }>;
