export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    readonly detail?: string
  ) {
    super(code);
  }
}

export function httpError(statusCode: number, code: string, detail?: string): HttpError {
  return new HttpError(statusCode, code, detail);
}

export function optionalPositiveIntegerQuery(value: string | null, name: string, max: number): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  if (!/^\d+$/.test(value.trim())) {
    throw httpError(400, `${name.toUpperCase()}_INVALID`, `${name} must be a positive integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw httpError(400, `${name.toUpperCase()}_INVALID`, `${name} must be a positive integer.`);
  }
  return Math.min(parsed, max);
}

export function auditListOrder(value: string | null): "asc" | "desc" {
  if (value === null || value.trim() === "") return "asc";
  const normalized = value.trim().toLowerCase();
  if (normalized === "asc" || normalized === "desc") return normalized;
  throw httpError(400, "AUDIT_ORDER_INVALID", "order must be asc or desc.");
}

export function isHttpError(error: unknown): error is HttpError {
  if (error instanceof HttpError) return true;
  return Boolean(
    error &&
    typeof error === "object" &&
    typeof (error as { statusCode?: unknown }).statusCode === "number" &&
    typeof (error as { code?: unknown }).code === "string"
  );
}
