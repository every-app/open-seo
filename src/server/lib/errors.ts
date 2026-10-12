import { isErrorCode, type ErrorCode } from "@/shared/error-codes";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message?: string,
    public readonly details?: Record<string, string>,
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

// The client only ever receives the bare code. Server messages can carry
// internal detail, so the client maps each code to its own copy and the full
// message stays in the server logs.
export function toClientError(error: unknown): Error {
  return new Error(asAppError(error)?.code ?? "INTERNAL_ERROR");
}
