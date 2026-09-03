import { ClarityMaintenanceRepository } from "@/server/features/clarity/repositories/ClarityMaintenanceRepository";
import { CLARITY_CACHE_RETENTION_MS } from "@/server/features/clarity/services/ClarityReportSupport";

export function purgeExpiredClarityData(now = new Date()) {
  return ClarityMaintenanceRepository.purgeExpiredData({
    cacheCutoff: new Date(
      now.getTime() - CLARITY_CACHE_RETENTION_MS,
    ).toISOString(),
    now: now.toISOString(),
  });
}
