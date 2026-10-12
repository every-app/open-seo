import { Progress } from "@/client/components/ui/progress";
import { Spinner } from "@/client/components/ui/spinner";
import type { AiRun, AiTrackerState } from "@/shared/ai-visibility";
import { aiDate } from "./shared";

/** Progress while a run collects; otherwise when results last updated. */
export function RunStatusLine({
  run,
  tracker,
}: {
  run: AiRun | null;
  tracker: AiTrackerState["tracker"];
}) {
  const pending = run?.status === "running" || run?.status === "queued";
  if (run && pending) {
    return (
      <div className="space-y-1.5">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          Collecting {run.completed + run.failed} of {run.expected} answers…
        </p>
        <Progress value={run.completed + run.failed} max={run.expected || 1} />
      </div>
    );
  }
  if (!run && !tracker?.enabled) return null;
  return (
    <p className="text-xs text-muted-foreground">
      {[
        run && `Updated ${aiDate(run.completedAt ?? run.createdAt)}`,
        tracker?.enabled && `Next run ${aiDate(tracker.nextCheckAt)}`,
      ]
        .filter(Boolean)
        .join(" · ")}
    </p>
  );
}
