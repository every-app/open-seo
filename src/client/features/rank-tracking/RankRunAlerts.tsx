import { AlertTriangle, Clock } from "lucide-react";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { InsufficientCreditsError } from "@/client/features/billing/InsufficientCreditsError";
import {
  isOutOfCreditsRunError,
  RANK_CHECK_DELAYED_ERROR,
} from "@/shared/rank-tracking";
import type { useRankRunPolling } from "./useRankRunPolling";

function ReadWhatChangedLink() {
  return (
    <a
      href="https://openseo.so/blogs/state-of-rank-tracking-november-2026"
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium underline underline-offset-4"
    >
      Read what changed
    </a>
  );
}

/** The latest rank check's state: running, delayed, stale, failed, or incomplete. */
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

  if (run.isDelayed) {
    return (
      <Alert variant="warning">
        <Clock />
        <AlertDescription className="text-foreground">
          <p>
            <span className="font-medium">This check is delayed</span> because
            our search data provider is slow. We'll keep waiting for up to 6
            hours. You can leave this page.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  if (run.status === "pending" || run.status === "running") {
    return (
      <Alert variant="info">
        <Clock />
        <AlertDescription className="text-foreground">
          <p>
            <span className="font-medium">This check takes about an hour</span>{" "}
            because Google's results have been unreliable lately. You can leave
            this page while it's running. <ReadWhatChangedLink />
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  if (run.status === "failed" && isOutOfCreditsRunError(run.errorMessage)) {
    return <InsufficientCreditsError title="Your last rank check didn't run" />;
  }

  if (
    run.status === "failed" &&
    run.errorMessage === RANK_CHECK_DELAYED_ERROR
  ) {
    return (
      <Alert variant="warning">
        <AlertTriangle />
        <AlertDescription className="text-foreground">
          <p>
            <span className="font-medium">
              We couldn't finish your last check.
            </span>{" "}
            Our search data provider didn't return Google's results within 6
            hours. Please try again later.
          </p>
        </AlertDescription>
      </Alert>
    );
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
