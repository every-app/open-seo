import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { QueryError } from "@/client/components/QueryState";
import { Spinner } from "@/client/components/Spinner";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Progress } from "@/client/components/ui/progress";
import {
  getAiResearchSetup,
  getAiVisibilityRun,
  getAiVisibilityTracker,
  getAiVisibilityResults,
  listAiResearchKeywords,
} from "@/serverFunctions/ai-visibility";
import type { AiRun } from "@/shared/ai-visibility";

export const aiVisibilityKey = (projectId: string) => [
  "aiVisibility",
  projectId,
];

/** Read the full bounded result set for prompt inventory and history. */
async function fetchAllAiVisibilityResults(
  input: Omit<
    Parameters<typeof getAiVisibilityResults>[0]["data"],
    "cursor" | "limit" | "branded"
  >,
) {
  const first = await getAiVisibilityResults({
    data: { ...input, branded: "all", limit: 50 },
  });
  const rows = [...first.rows];
  for (let cursor = first.nextCursor; cursor; ) {
    const page = await getAiVisibilityResults({
      data: { ...input, branded: "all", limit: 50, cursor },
    });
    rows.push(...page.rows);
    cursor = page.nextCursor;
  }
  return { ...first, rows };
}

export const aiTrackerQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: [...aiVisibilityKey(projectId), "tracker"],
    queryFn: () => getAiVisibilityTracker({ data: { projectId } }),
    staleTime: 0,
  });

export const aiResearchSetupQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: [...aiVisibilityKey(projectId), "researchSetup"],
    queryFn: () => getAiResearchSetup({ data: { projectId } }),
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? 3000 : false,
  });

export const aiResearchKeywordsQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: [...aiVisibilityKey(projectId), "researchKeywords"],
    queryFn: () => listAiResearchKeywords({ data: { projectId } }),
  });

/** Every answer in a run, so each prompt can show its per-engine result. */
export const aiRunResultsQueryOptions = (
  projectId: string,
  runId: string | undefined,
) =>
  queryOptions({
    queryKey: [...aiVisibilityKey(projectId), "results", "all", runId],
    queryFn: async () => {
      const result = await fetchAllAiVisibilityResults({ projectId, runId });
      return result.rows;
    },
    enabled: Boolean(runId),
  });

export const aiPromptHistoryQueryOptions = (
  projectId: string,
  promptId: string,
) =>
  queryOptions({
    queryKey: [...aiVisibilityKey(projectId), "results", "history", promptId],
    // Read all pages of the latest 50 runs so engine ordering cannot hide
    // a newer execution from the selector.
    queryFn: () =>
      fetchAllAiVisibilityResults({
        projectId,
        promptId,
        includeHistory: true,
      }),
  });

export function useAiVisibilityTracker(projectId: string) {
  return useQuery(aiTrackerQueryOptions(projectId));
}

export function useAiRunProgress(projectId: string, initialRun: AiRun | null) {
  const queryClient = useQueryClient();
  const runId = initialRun?.id;
  const query = useQuery({
    queryKey: [...aiVisibilityKey(projectId), "run", runId],
    queryFn: () => getAiVisibilityRun({ data: { projectId, runId: runId! } }),
    enabled: Boolean(runId),
    initialData: initialRun ?? undefined,
    staleTime: 0,
    refetchInterval: (current) => {
      const run = current.state.data;
      return run && (run.status === "running" || run.status === "queued")
        ? Math.max(4, run.pollAfterSeconds) * 1000
        : false;
    },
  });
  const run = query.data ?? initialRun;
  useEffect(() => {
    if (!run) return;
    void queryClient.invalidateQueries({
      queryKey: [...aiVisibilityKey(projectId), "results"],
    });
    void queryClient.invalidateQueries({
      queryKey: [...aiVisibilityKey(projectId), "sources"],
    });
    if (run.status !== "running" && run.status !== "queued") {
      void queryClient.invalidateQueries({
        queryKey: [...aiVisibilityKey(projectId), "tracker"],
      });
    }
  }, [projectId, queryClient, run]);
  return { run, error: query.error };
}

export function AiQueryError({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <QueryError
      error={error}
      fallback="Could not load AI visibility. Please try again."
      onRetry={retry}
    />
  );
}

export function AiLoading() {
  return (
    <div className="flex justify-center py-12">
      <Spinner size="sm" label="Loading AI visibility…" />
    </div>
  );
}

export function AiMatchBadge({
  value,
  positive = "Mentioned",
}: {
  value: boolean;
  positive?: "Mentioned" | "Cited";
}) {
  return (
    <Badge variant={value ? "success" : "secondary"}>
      {value ? positive : positive === "Cited" ? "Not cited" : "Not mentioned"}
    </Badge>
  );
}

export function aiDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : date.toLocaleString();
}

export function aiRate(count: number, eligible: number) {
  return eligible ? `${Math.round((count / eligible) * 100)}%` : "—";
}

export function aiMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: value > 0 && value < 1 ? 4 : 2,
  }).format(value);
}

export function AiRunStatus({ run }: { run: AiRun }) {
  const pending = run.status === "running" || run.status === "queued";
  return (
    <div
      className="space-y-2 rounded-lg border bg-card px-4 py-3 border-border"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2 font-medium">
          {pending && <Loader2 className="size-4 animate-spin" />}
          {run.trigger === "manual"
            ? "One-off run"
            : run.trigger === "baseline"
              ? "First scheduled run"
              : "Scheduled run"}
          <Badge variant="secondary">{run.status}</Badge>
        </span>
        <span className="text-xs text-muted-foreground">
          {aiDate(run.createdAt)}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span>
          {run.completed} of {run.expected} answers collected
        </span>
        {run.pending > 0 && <span>{run.pending} pending</span>}
        {run.failed > 0 && (
          <span className="text-destructive">{run.failed} failed</span>
        )}
      </div>
      {pending && (
        <Progress value={run.completed + run.failed} max={run.expected || 1} />
      )}
    </div>
  );
}

/** The paid-plan gate's way out on AI pages: tracking needs only credits. */
export function PromptTrackingWithoutUpgradeButton({
  projectId,
}: {
  projectId: string;
}) {
  return (
    <Button
      size="lg"
      variant="outline"
      nativeButton={false}
      render={<Link to="/p/$projectId/ai-visibility" params={{ projectId }} />}
    >
      Use Prompt Tracking without upgrading
    </Button>
  );
}
