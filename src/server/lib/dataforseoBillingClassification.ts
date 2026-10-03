import { AppError } from "@/server/lib/errors";
import type { ErrorCode } from "@/shared/error-codes";

const BILLING_SIGNALS = [
  "insufficient funds",
  "balance is too low",
  "payment required",
  "billing",
  "balance",
  "problem billing",
  "recharged",
];

const BILLING_STATUS_CODES = new Set([40200, 40210, 402]);

type DataforseoBillingClassifier = (
  status: number | undefined,
  details: string,
  path: string,
) => AppError | null;

/**
 * Maps DataForSEO balance/payment failures for a given API section to a typed
 * billing error. Feature-enablement is no longer classified: Backlinks and AI
 * Optimization are included in every DataForSEO account, so the only remaining
 * account-level failure is a depleted balance.
 */
export function createDataforseoBillingClassifier(config: {
  pathPrefix: string;
  billingIssueCode: ErrorCode;
  billingIssueMessage: string;
}): DataforseoBillingClassifier {
  return (status, details, path) => {
    if (!path.includes(config.pathPrefix)) return null;

    const text = details.toLowerCase();
    const matchesBillingStatus =
      status != null && BILLING_STATUS_CODES.has(status);
    const matchesBillingText = BILLING_SIGNALS.some((signal) =>
      text.includes(signal),
    );
    if (matchesBillingStatus || matchesBillingText) {
      return new AppError(config.billingIssueCode, config.billingIssueMessage);
    }

    return null;
  };
}

/**
 * Account-level failures come back in the response header of every API
 * section (/dataforseo_labs, /keywords_data, serp, …), so they classify
 * centrally instead of through a pathPrefix-bound domain classifier: an
 * unverified account or an empty balance hits related_keywords exactly like
 * it hits backlinks. The provider's status_message stays server-side in the
 * error message/details; the client only ever receives the code, whose copy
 * tells the operator to fix the account in the DataForSEO panel.
 */
export function classifyDataforseoAccountError(
  status: number | undefined,
  providerMessage?: string,
): AppError | null {
  if (status == null) return null;
  if (status === 40101) {
    // "Invalid Username or Password" — same copy the transport-level 401 uses.
    return new AppError(
      "DATAFORSEO_AUTH_FAILED",
      providerMessage || undefined,
      {
        dataforseoStatusCode: "40101",
      },
    );
  }
  if (status === 40104 || BILLING_STATUS_CODES.has(status)) {
    // 40104 "verify your account before using the API", 402xx balance.
    return new AppError(
      "DATAFORSEO_ACCOUNT_ISSUE",
      providerMessage || undefined,
      { dataforseoStatusCode: String(status) },
    );
  }
  return null;
}
