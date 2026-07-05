import { useAccessGate } from "@/client/features/access-gate/useAccessGate";
import { getSamAccessSetupStatus } from "@/serverFunctions/samAccess";

export function useSamAccess(projectId: string) {
  return useAccessGate({
    queryKey: ["samAccessStatus", projectId],
    queryFn: () => getSamAccessSetupStatus({ data: { projectId } }),
    statusErrorFallback: "Could not load AI agent setup status.",
  });
}
