import { FREE_MAX_AUDIT_PAGES } from "@/shared/audit-limits";
import { GATEWAY_RENDERING_NOT_SET_UP_MESSAGE } from "@/shared/audit-rendering";
import { isErrorCode, type ErrorCode } from "@/shared/error-codes";
import {
  isEveryAppClientAuthMode,
  isHostedClientAuthMode,
} from "@/lib/auth-mode";

/**
 * Copy for an error we did not expect. Hosted users cannot read our logs, so
 * they get support; a self-hoster runs the server and can.
 */
export const UNEXPECTED_ERROR_MESSAGE = isHostedClientAuthMode()
  ? "Something went wrong on our end. Try again, and contact support if it keeps happening."
  : "Something went wrong. Try again, or check the server logs for details.";

const STANDARD_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Sign in and try again.",
  AUTH_CONFIG_MISSING: isEveryAppClientAuthMode()
    ? "OpenSEO can't reach your Every App gateway for this right now. An owner or admin can check its setup with pnpm everyapp status."
    : "OpenSEO auth is not configured. Follow the README setup steps for Cloudflare Access.",
  PAYMENT_REQUIRED:
    "An active hosted subscription is required before you can use OpenSEO.",
  INSUFFICIENT_CREDITS:
    "You don't have enough credits for this. Upgrade your plan or buy more credits to keep going.",
  AUDIT_RENDERING_UNAVAILABLE: isEveryAppClientAuthMode()
    ? GATEWAY_RENDERING_NOT_SET_UP_MESSAGE
    : "JavaScript rendering is not configured on this deployment. Ask your administrator to enable a renderer.",
  FORBIDDEN: "You do not have access to this resource.",
  NOT_FOUND: "The requested resource was not found.",
  AUDIT_CAPACITY_REACHED:
    "You've reached audit capacity for your account. Delete old audits from your projects to start a new one.",
  AUDIT_PAGE_LIMIT_EXCEEDED: `Free plan audits are limited to ${FREE_MAX_AUDIT_PAGES} pages. Upgrade to run larger audits.`,
  AUDIT_ALREADY_RUNNING:
    "You've reached the limit of audits running at once. Wait for one to finish or delete it before starting another.",
  VALIDATION_ERROR: "Check your input and try again.",
  UNKNOWN_LOCATION:
    "We couldn't find that city, county, or region. Pick a location from the list, or clear the field to search the whole country.",
  CRAWL_TARGET_BLOCKED: "This crawl target is blocked by security policy.",
  BACKLINKS_BILLING_ISSUE:
    "The connected DataForSEO account has a billing or balance issue.",
  AI_SEARCH_BILLING_ISSUE:
    "The connected DataForSEO account has a billing or balance issue.",
  AI_VISIBILITY_ERROR:
    "The AI visibility request could not be completed. Review the tracking settings and try again.",
  DATAFORSEO_AUTH_FAILED: isEveryAppClientAuthMode()
    ? "DataForSEO isn't set up on your Every App gateway yet, or rejected the key it holds. An owner or admin sets it with pnpm everyapp secret set DATAFORSEO_API_KEY."
    : "DataForSEO rejected the API key. Check that DATAFORSEO_API_KEY is the base64 of your DataForSEO login:password.",
  RATE_LIMITED: "Too many requests. Try again in a moment.",
  UPSTREAM_UNAVAILABLE:
    "The data provider is temporarily unavailable. Try again in a moment.",
  CONFLICT: "This request conflicts with existing data.",
  INTERNAL_ERROR: UNEXPECTED_ERROR_MESSAGE,
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
