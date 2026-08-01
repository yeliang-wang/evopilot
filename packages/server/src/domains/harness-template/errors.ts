export class HarnessTemplateDomainError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    readonly detail?: string
  ) {
    super(code);
  }
}

export function harnessTemplateDomainError(statusCode: number, code: string, detail?: string): HarnessTemplateDomainError {
  return new HarnessTemplateDomainError(statusCode, code, detail);
}

export function isHarnessTemplateDomainError(error: unknown): error is HarnessTemplateDomainError {
  return error instanceof HarnessTemplateDomainError;
}
