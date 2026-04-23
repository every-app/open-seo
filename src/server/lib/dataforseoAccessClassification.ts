import { AppError } from "@/server/lib/errors";
import type { ErrorCode } from "@/shared/error-codes";

const ACCESS_SIGNALS = [
  "not available",
  "not enabled",
  "not allowed",
  "access denied",
  "forbidden",
  "insufficient",
  "subscription",
  "upgrade",
  "plan",
  "activate your subscription",
  "plans and subscriptions",
];

const BILLING_SIGNALS = [
  "insufficient funds",
  "balance is too low",
  "payment required",
  "billing",
  "balance",
  "problem billing",
  "recharged",
];

const ACCESS_STATUS_CODES = new Set([40204, 403]);
const BILLING_STATUS_CODES = new Set([40200, 40210, 402]);

type DataforseoAccessClassifier = (
  status: number | undefined,
  details: string,
  path: string,
) => AppError | null;

export function createDataforseoAccessClassifier(config: {
  pathPrefix: string;
  notEnabledCode: ErrorCode;
  notEnabledMessage: string;
  billingIssueCode: ErrorCode;
  billingIssueMessage: string;
}): DataforseoAccessClassifier {
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

    const matchesAccessStatus =
      status != null && ACCESS_STATUS_CODES.has(status);
    const matchesAccessText = ACCESS_SIGNALS.some((signal) =>
      text.includes(signal),
    );
    if (!matchesAccessStatus && !matchesAccessText) return null;

    return new AppError(config.notEnabledCode, config.notEnabledMessage);
  };
}
