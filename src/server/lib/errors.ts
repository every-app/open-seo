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

/**
 * The error's name, message and code, then its causes, for a log line.
 * Workers Logs render an Error passed to `console.error` as its stack frames
 * alone, so a log keeps the message only when it is written out like this.
 * An error the Workflows engine threw over RPC is marked remote.
 */
export function describeError(error: unknown, depth = 0): string {
  if (!(error instanceof Error)) return String(error);
  const code = asAppError(error)?.code;
  const parts = [`${error.name}: ${error.message}`];
  if (code && code !== error.message) parts.push(`(${code})`);
  if ("remote" in error && error.remote === true) parts.push("(remote)");
  if (error.cause !== undefined && depth < 4)
    parts.push(`<- ${describeError(error.cause, depth + 1)}`);
  return parts.join(" ");
}
