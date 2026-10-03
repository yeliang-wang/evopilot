// Default GA needs fourteen evidence/output kinds plus Target and phase
// packages. Keep collection and evaluation finite and consistent, reserving
// one observation for the Runtime-owned process evidence.
export const MAX_SEMANTIC_OUTCOME_OBSERVATIONS = 32;
export const MAX_SEMANTIC_COLLECTED_OBSERVATIONS = MAX_SEMANTIC_OUTCOME_OBSERVATIONS - 1;
