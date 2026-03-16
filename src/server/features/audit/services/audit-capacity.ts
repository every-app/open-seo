import type { PsiStrategy } from "@/server/lib/audit/types";

export const MAX_USER_AUDIT_USAGE = 100_000;

export function clampAuditMaxPages(maxPages?: number) {
  return Math.min(Math.max(maxPages ?? 50, 10), 10_000);
}

export function getEstimatedAuditCapacity(input: {
  maxPages?: number;
  psiStrategy?: PsiStrategy;
}) {
  const pagesTotal = clampAuditMaxPages(input.maxPages);
  const psiStrategy = input.psiStrategy ?? "auto";

  let psiTotal = 0;
  switch (psiStrategy) {
    case "all":
      psiTotal = pagesTotal * 2;
      break;
    case "auto":
      psiTotal = 20;
      break;
    case "manual":
    case "none":
      psiTotal = 0;
      break;
  }

  return {
    pagesTotal,
    psiTotal,
    total: pagesTotal + psiTotal,
  };
}
