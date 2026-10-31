import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { useHostedPlanGate } from "@/client/features/billing/HostedPlanGate";
import { getScheduledRankChecksPaused } from "@/serverFunctions/rank-tracking";

/**
 * Shown while ops has paused scheduled checks during a provider outage. Free
 * plans never run scheduled checks, so they get the upgrade alert instead.
 */
export function ScheduledChecksPausedAlert({
  hasScheduledCheck,
}: {
  hasScheduledCheck: boolean;
}) {
  const affected = useHostedPlanGate() === "paid" && hasScheduledCheck;
  const { data: paused } = useQuery({
    queryKey: ["scheduledRankChecksPaused"],
    queryFn: () => getScheduledRankChecksPaused(),
    enabled: affected,
  });

  if (!affected || !paused) return null;

  return (
    <Alert variant="warning">
      <AlertTriangle />
      <AlertDescription className="text-foreground">
        <p>
          <span className="font-medium">Scheduled checks are paused</span> while
          our rankings data provider recovers from an outage. They'll catch up
          automatically once it's back.
        </p>
      </AlertDescription>
    </Alert>
  );
}
