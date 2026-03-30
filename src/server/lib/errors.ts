import { isErrorCode, type ErrorCode } from "@/shared/error-codes";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "AppError";
  }
}

export function asAppError(error: unknown): AppError | null {
  if (error instanceof AppError) return error;
  if (error instanceof Error && isErrorCode(error.message)) {
    return new AppError(error.message, error.message);
  }
  return null;
}

function toErrorCode(error: unknown): ErrorCode {
  return asAppError(error)?.code ?? "INTERNAL_ERROR";
}

export function toClientError(error: unknown): Error {
  const appError = asAppError(error);
  return new Error(appError?.code ?? toErrorCode(error));
}
