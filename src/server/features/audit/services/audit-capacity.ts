import type { LighthouseStrategy } from "@/server/lib/audit/types";

export const MAX_USER_AUDIT_USAGE = 100_000;

export function clampAuditMaxPages(maxPages?: number) {
  return Math.min(Math.max(maxPages ?? 50, 10), 10_000);
}

export function getEstimatedAuditCapacity(input: {
  maxPages?: number;
  lighthouseStrategy?: LighthouseStrategy;
}) {
  const pagesTotal = clampAuditMaxPages(input.maxPages);
  const lighthouseStrategy = input.lighthouseStrategy ?? "auto";

  let lighthouseChecks = 0;
  switch (lighthouseStrategy) {
    case "all":
      lighthouseChecks = pagesTotal * 2;
      break;
    case "auto":
      lighthouseChecks = 20;
      break;
    case "manual":
    case "none":
      lighthouseChecks = 0;
      break;
  }

  return {
    pagesTotal,
    lighthouseTotal: lighthouseChecks,
    total: pagesTotal + lighthouseChecks,
  };
}
