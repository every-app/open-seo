import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { InsufficientCreditsError } from "@/client/features/billing/InsufficientCreditsError";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { SUBREQUEST_LIMIT_ERROR } from "@/shared/rank-tracking";
import type { useRankRunPolling } from "./useRankRunPolling";

/** Warnings about the latest rank check: stale, failed, or incomplete. */
export function RankRunAlerts({
  run,
}: {
  run: ReturnType<typeof useRankRunPolling>;
}) {
  if (!run) return null;

  if (run.maybeStale) {
    return (
      <Alert variant="warning">
        <AlertTriangle />
        <AlertDescription className="text-foreground">
          This run may be unresponsive and will be cleaned up automatically.
        </AlertDescription>
      </Alert>
    );
  }

  if (run.status === "failed" && run.errorMessage === "INSUFFICIENT_CREDITS") {
    return <InsufficientCreditsError title="Your last rank check didn't run" />;
  }

  if (run.status === "failed") {
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertDescription className="text-foreground">
          <p>
            <span className="font-medium">Last check failed.</span>{" "}
            {run.errorMessage &&
              getStandardErrorMessage(new Error(run.errorMessage))}
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  // A completed run only has an error message when some checks failed.
  if (run.status === "completed" && run.errorMessage) {
    return (
      <Alert variant="warning">
        <AlertTriangle />
        <AlertDescription className="text-foreground">
          <p>
            <span className="font-medium">Your last check was incomplete.</span>{" "}
            {run.errorMessage.includes(SUBREQUEST_LIMIT_ERROR)
              ? SUBREQUEST_LIMIT_ERROR
              : "Our search data provider had errors, so some keywords will show their previous position."}
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
