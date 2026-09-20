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

// Codes whose server-side message is safe and useful to show the user.
// Setup errors only: their messages are static guidance ("TEAM_DOMAIN must be
// a full https URL…") that self-hosters need to fix their deployment, and the
// alternative is a generic card that makes every misconfiguration look the
// same. Everything else stays stripped to its bare code.
//
// DATAFORSEO_AUTH_FAILED is the same shape of problem one layer out: the
// account behind DATAFORSEO_API_KEY cannot call the API yet, and DataForSEO's
// own status_message names the fix ("Please verify your account before using
// the API…"). The static fallback in error-messages.ts only guesses at a
// malformed key, so a message here is strictly better guidance. Provider
// status text, not user input or internal state.
const CLIENT_DETAIL_ERROR_CODES = new Set<ErrorCode>([
  "AUTH_CONFIG_MISSING",
  "DATAFORSEO_AUTH_FAILED",
]);

export function toClientError(error: unknown): Error {
  const appError = asAppError(error);
  if (
    appError &&
    CLIENT_DETAIL_ERROR_CODES.has(appError.code) &&
    appError.message !== appError.code
  ) {
    return new Error(`${appError.code}: ${appError.message}`);
  }
  return new Error(appError?.code ?? "INTERNAL_ERROR");
}
