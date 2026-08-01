import { FREE_MAX_AUDIT_PAGES } from "@/shared/audit-limits";
import { isErrorCode, type ErrorCode } from "@/shared/error-codes";

const STANDARD_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Please sign in and try again.",
  AUTH_CONFIG_MISSING:
    "OpenSEO auth is not configured. Follow the README setup steps for Cloudflare Access.",
  PAYMENT_REQUIRED:
    "An active hosted subscription is required before you can use OpenSEO.",
  INSUFFICIENT_CREDITS:
    "You've run out of credits. Add more credits or upgrade your plan to continue.",
  FORBIDDEN: "You do not have access to this resource.",
  NOT_FOUND: "The requested resource was not found.",
  AUDIT_CAPACITY_REACHED:
    "You've reached audit capacity for your account. Delete old audits from your projects to start a new one.",
  AUDIT_PAGE_LIMIT_EXCEEDED: `Free plan audits are limited to ${FREE_MAX_AUDIT_PAGES} pages. Upgrade to run larger audits.`,
  AUDIT_ALREADY_RUNNING:
    "You already have an audit running. Wait for it to finish or delete it before starting another.",
  VALIDATION_ERROR: "Please check your input and try again.",
  CRAWL_TARGET_BLOCKED: "This crawl target is blocked by security policy.",
  BACKLINKS_BILLING_ISSUE:
    "The connected DataForSEO account has a billing or balance issue.",
  AI_SEARCH_BILLING_ISSUE:
    "The connected DataForSEO account has a billing or balance issue.",
  DATAFORSEO_AUTH_FAILED:
    "DataForSEO rejected the API key. Check that DATAFORSEO_API_KEY is the base64 of your DataForSEO login:password.",
  RATE_LIMITED: "Too many requests. Please wait and try again.",
  UPSTREAM_UNAVAILABLE:
    "The data provider is temporarily unavailable. Please retry in a moment.",
  CONFLICT: "This request conflicts with existing data.",
  INTERNAL_ERROR:
    "An unexpected error occurred. Please check server logs and try again.",
};

// Setup errors cross the wire as "CODE: detail" (see toClientError) so the
// user sees the server's specific guidance while code-driven UI (error cards,
// redirects) still keys off the code.
function splitCodedMessage(
  message: string,
): { code: ErrorCode; detail: string } | null {
  const separatorIndex = message.indexOf(": ");
  if (separatorIndex === -1) return null;
  const code = message.slice(0, separatorIndex);
  if (!isErrorCode(code)) return null;
  return { code, detail: message.slice(separatorIndex + 2) };
}

export function getStandardErrorMessage(
  error: unknown,
  fallback: string = STANDARD_MESSAGES.INTERNAL_ERROR,
): string {
  if (!(error instanceof Error)) return fallback;
  if (isErrorCode(error.message)) return STANDARD_MESSAGES[error.message];
  const coded = splitCodedMessage(error.message);
  if (coded) return coded.detail;
  if (error.message) return error.message;
  return fallback;
}

export function getErrorCode(error: unknown): ErrorCode | null {
  if (!(error instanceof Error)) return null;
  if (isErrorCode(error.message)) return error.message;
  return splitCodedMessage(error.message)?.code ?? null;
}
