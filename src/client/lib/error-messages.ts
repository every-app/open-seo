import { isErrorCode, type ErrorCode } from "@/shared/error-codes";

const STANDARD_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Please sign in and try again.",
  AUTH_CONFIG_MISSING:
    "OpenSEO auth is not configured. Follow the README setup steps for Cloudflare Access.",
  PAYMENT_REQUIRED:
    "An active hosted subscription is required before you can use OpenSEO.",
  FORBIDDEN: "You do not have access to this resource.",
  NOT_FOUND: "The requested resource was not found.",
  AUDIT_CAPACITY_REACHED:
    "You've reached audit capacity for your account. Delete old audits from your projects to start a new one.",
  VALIDATION_ERROR: "Please check your input and try again.",
  CRAWL_TARGET_BLOCKED: "This crawl target is blocked by security policy.",
  BACKLINKS_NOT_ENABLED:
    "Backlinks is not enabled for the connected DataForSEO account yet.",
  BACKLINKS_BILLING_ISSUE:
    "The connected DataForSEO account has a billing or balance issue.",
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
