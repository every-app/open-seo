import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { InsufficientCreditsError } from "@/client/features/billing/InsufficientCreditsError";
import { isOutOfCreditsRunError } from "@/shared/rank-tracking";
import type { useRankRunPolling } from "./useRankRunPolling";

function ReadWhatChangedLink() {
  return (
    <a
      href="https://openseo.so/blogs/rank-tracking-changes"
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium underline underline-offset-4"
    >
      Read what changed
    </a>
  );
}

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
          This check stopped responding. You can start a new one to replace it.
        </AlertDescription>
      </Alert>
    );
  }

  if (run.status === "failed" && isOutOfCreditsRunError(run.errorMessage)) {
    return <InsufficientCreditsError title="Your last rank check didn't run" />;
  }

  if (run.status === "failed") {
    return (
      <Alert variant="warning">
        <AlertTriangle />
        <AlertDescription className="text-foreground">
          <p>
            <span className="font-medium">
              We couldn't finish your last check.
            </span>{" "}
            Google's results have been unreliable for all rank trackers lately.
            Please try again later. <ReadWhatChangedLink />
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  // A completed run only has an error message when some checks have no result.
  if (run.status === "completed" && run.errorMessage) {
    return (
      <Alert variant="warning">
        <AlertTriangle />
        <AlertDescription className="text-foreground">
          <p>
            <span className="font-medium">
              Some keywords couldn't be checked.
            </span>{" "}
            Google's results have been unreliable for all rank trackers lately,
            so these show their last known position. <ReadWhatChangedLink />
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
