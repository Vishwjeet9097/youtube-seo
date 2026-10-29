export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function publicError(error: unknown): AppError {
  if (isAppError(error)) return error;
  if (error instanceof SyntaxError) {
    return new AppError("INVALID_JSON", "This request could not be read. Check it and try again.", 400, false);
  }
  return new AppError("INTERNAL_ERROR", "Something went wrong. Try again.", 500, true);
}
