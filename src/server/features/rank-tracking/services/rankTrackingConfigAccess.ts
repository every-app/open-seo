import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { AppError } from "@/server/lib/errors";

// Shared by RankTrackingService and keywordScheduling. Lives in its own module so
// keywordScheduling does not have to import the service back and form a cycle.
export async function getValidatedConfig(configId: string, projectId: string) {
  const config = await RankTrackingRepository.getConfigById({
    configId,
    projectId,
  });
  if (!config) {
    throw new AppError("INTERNAL_ERROR", "Rank tracking config not found");
  }
  return config;
}
