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
