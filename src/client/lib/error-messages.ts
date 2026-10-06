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
    "You've reached the limit of audits running at once. Wait for one to finish or delete it before starting another.",
  VALIDATION_ERROR: "Please check your input and try again.",
  UNKNOWN_LOCATION:
    "We couldn't find that city, county, or region. Pick a location from the list, or clear the field to search the whole country.",
  CRAWL_TARGET_BLOCKED: "This crawl target is blocked by security policy.",
  BACKLINKS_BILLING_ISSUE:
    "The connected DataForSEO account has a billing or balance issue.",
  AI_SEARCH_BILLING_ISSUE:
    "The connected DataForSEO account has a billing or balance issue.",
  DATAFORSEO_AUTH_FAILED:
    "DataForSEO rejected the API key. Check that DATAFORSEO_API_KEY is the base64 of your DataForSEO login:password.",
  DATAFORSEO_ACCOUNT_ISSUE:
    "The connected DataForSEO account needs attention before it can serve data — it may not be verified yet, or its balance may be empty. Check it in the DataForSEO user panel (https://app.dataforseo.com) and try again.",
  RATE_LIMITED: "Too many requests. Please wait and try again.",
  UPSTREAM_UNAVAILABLE:
    "The data provider is temporarily unavailable. Please retry in a moment.",
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
  if (error.message) return error.message;
  return fallback;
}

export function getErrorCode(error: unknown): ErrorCode | null {
  if (!(error instanceof Error)) return null;
  return isErrorCode(error.message) ? error.message : null;
}
