import { AppError } from "@/server/lib/errors";
import { FirstPartyReportingRepository } from "./FirstPartyReportingRepository";

type FirstPartyFunnelTotals = {
  searchStarted: number;
  searchCompleted: number;
  searchNoResults: number;
  registrationsCompleted: number;
  checkoutStarted: number;
  paymentsCompleted: number;
};

function numericTotals(
  value: Partial<FirstPartyFunnelTotals> | null,
): FirstPartyFunnelTotals {
  return {
    searchStarted: Number(value?.searchStarted ?? 0),
    searchCompleted: Number(value?.searchCompleted ?? 0),
    searchNoResults: Number(value?.searchNoResults ?? 0),
    registrationsCompleted: Number(value?.registrationsCompleted ?? 0),
    checkoutStarted: Number(value?.checkoutStarted ?? 0),
    paymentsCompleted: Number(value?.paymentsCompleted ?? 0),
  };
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function conversionRates(totals: FirstPartyFunnelTotals) {
  return {
    searchCompletionRate: ratio(totals.searchCompleted, totals.searchStarted),
    noResultRate: ratio(totals.searchNoResults, totals.searchCompleted),
    registrationPerSearchRate: ratio(
      totals.registrationsCompleted,
      totals.searchCompleted,
    ),
    checkoutPerSearchRate: ratio(
      totals.checkoutStarted,
      totals.searchCompleted,
    ),
    paymentPerCheckoutRate: ratio(
      totals.paymentsCompleted,
      totals.checkoutStarted,
    ),
  };
}

function validateDateRange(startDate: string, endDate: string) {
  if (startDate > endDate) {
    throw new AppError(
      "VALIDATION_ERROR",
      "startDate must be on or before endDate.",
    );
  }
}

async function getFunnel(input: {
  projectId: string;
  startDate: string;
  endDate: string;
}) {
  validateDateRange(input.startDate, input.endDate);
  const row = await FirstPartyReportingRepository.getFunnel(
    input.projectId,
    input.startDate,
    input.endDate,
  );
  const hasData = Boolean(row?.observedAt);
  const totals = numericTotals(row);
  return {
    status: hasData ? ("ok" as const) : ("no_data" as const),
    period: {
      startDate: input.startDate,
      endDate: input.endDate,
      timezone: "UTC" as const,
    },
    observedAt: row?.observedAt ?? null,
    receivedAt: row?.receivedAt ?? null,
    totals: hasData ? totals : null,
    conversion: hasData ? conversionRates(totals) : null,
    privacy:
      "Daily aggregate counts only; no users, sessions, identifiers, search terms, or amounts.",
  };
}

async function getLandingConversions(input: {
  projectId: string;
  startDate: string;
  endDate: string;
  limit: number;
}) {
  validateDateRange(input.startDate, input.endDate);
  const rows = await FirstPartyReportingRepository.getLandingConversions(
    input.projectId,
    input.startDate,
    input.endDate,
    input.limit,
  );
  return {
    status: rows.length > 0 ? ("ok" as const) : ("no_data" as const),
    period: {
      startDate: input.startDate,
      endDate: input.endDate,
      timezone: "UTC" as const,
    },
    rows: rows.map((row) => {
      const totals = numericTotals(row);
      return {
        landingPath: row.landingPath,
        ...totals,
        conversion: conversionRates(totals),
      };
    }),
    privacy:
      "Only explicitly allowlisted public pathnames and aggregate counts are returned.",
  };
}

export const FirstPartyReportingService = {
  getFunnel,
  getLandingConversions,
};
