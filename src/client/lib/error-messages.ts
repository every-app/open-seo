import { isErrorCode, type ErrorCode } from "@/shared/error-codes";

const STANDARD_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Please sign in and try again.",
  AUTH_CONFIG_MISSING:
    "OpenSEO auth is not configured. Follow the README setup steps for Cloudflare Access.",
  FORBIDDEN: "You do not have access to this resource.",
  NOT_FOUND: "The requested resource was not found.",
  VALIDATION_ERROR: "Please check your input and try again.",
  CRAWL_TARGET_BLOCKED: "This crawl target is blocked by security policy.",
  RATE_LIMITED: "Too many requests. Please wait and try again.",
  CONFLICT: "This request conflicts with existing data.",
  INTERNAL_ERROR:
    "An unexpected error occurred. Please check server logs and try again.",
};

export function getStandardErrorMessage(
  error: unknown,
  fallback: string = STANDARD_MESSAGES.INTERNAL_ERROR,
): string {
  if (!(error instanceof Error)) return fallback;
  if (isErrorCode(error.message)) return STANDARD_MESSAGES[error.message];
  return fallback;
}

export function getErrorCode(error: unknown): ErrorCode | null {
  if (!(error instanceof Error)) return null;
  return isErrorCode(error.message) ? error.message : null;
}
