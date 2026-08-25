import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GoogleAnalyticsConnectionCard } from "@/client/features/ga4/GoogleAnalyticsConnectionCard";
import { captureClientEvent } from "@/client/lib/posthog";
import { dismissDashboardGa4Card } from "@/serverFunctions/dashboard";

export function Ga4ConnectCard({
  projectId,
  connected,
}: {
  projectId: string;
  connected: boolean;
}) {
  const queryClient = useQueryClient();
  const dismissMutation = useMutation({
    mutationFn: () => dismissDashboardGa4Card({ data: { projectId } }),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ["dashboardActivation", projectId],
      }),
  });

  return (
    <GoogleAnalyticsConnectionCard
      projectId={projectId}
      onDismiss={
        connected
          ? undefined
          : () => {
              captureClientEvent("dashboard:ga4_dismiss");
              dismissMutation.mutate();
            }
      }
      dismissing={dismissMutation.isPending}
    />
  );
}
