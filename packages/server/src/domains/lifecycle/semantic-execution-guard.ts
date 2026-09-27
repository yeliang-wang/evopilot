/** Until live context/result validation is composed, an explicit semantic
 * execution request must not fall through to the legacy Harness-only path.
 * This is a fail-closed integration boundary, not an execution permission.
 */
export function assertNoUnintegratedSemanticExecution(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (["semanticExecutionBindingDigest", "semanticExecutionBinding", "semanticContextSlice", "semanticContext", "outcomePlan", "semanticOutcomePlan"].some(key => Object.hasOwn(value, key))) {
    throw new Error("SEMANTIC_EXECUTION_INTEGRATION_REQUIRED");
  }
}
