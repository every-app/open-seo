import type { getAuditResults } from "@/serverFunctions/audit";

export type AuditResultsData = Awaited<ReturnType<typeof getAuditResults>>;
