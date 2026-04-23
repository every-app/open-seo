import { useAccessGate } from "@/client/features/access-gate/useAccessGate";
import { getAiSearchAccessSetupStatus } from "@/serverFunctions/aiSearchAccess";

export function useAiSearchAccess(projectId: string) {
  return useAccessGate({
    queryKey: ["aiSearchAccessStatus", projectId],
    queryFn: () => getAiSearchAccessSetupStatus({ data: { projectId } }),
    statusErrorFallback: "Could not load AI Optimization setup status.",
  });
}
