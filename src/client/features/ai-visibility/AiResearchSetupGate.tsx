import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { projectsQueryOptions } from "@/client/features/projects/projectQueries";
import { WebsiteResearchProgress } from "@/client/features/projects/WebsiteResearchProgress";
import { WebsiteSetupReview } from "@/client/features/projects/WebsiteSetupReview";
import { startAiResearchSetup } from "@/serverFunctions/ai-visibility";
import { saveProjectWebsiteSetup } from "@/serverFunctions/projectWebsite";
import type { SaveProjectWebsiteSetup } from "@/types/schemas/projectWebsite";
import { SkeletonPageContent } from "@/client/components/SkeletonPresets";
import {
  AiQueryError,
  aiResearchKeywordsQueryOptions,
  aiResearchSetupQueryOptions,
  aiRunResultsQueryOptions,
  aiTrackerQueryOptions,
  aiVisibilityKey,
} from "./shared";

/**
 * AI visibility needs research keywords. A project with a website but no
 * keywords confirms the spend here, then the server runs setup once: website
 * research and the onboarding competitor review when the overview or
 * competitors are missing, otherwise one keyword and prompt generation. The
 * run lives on the server, so leaving or reloading the page finds it again.
 * Both paths end on the page that started setup.
 */
export function AiResearchSetupGate({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const setupOptions = aiResearchSetupQueryOptions(projectId);
  const setup = useQuery(setupOptions);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: aiVisibilityKey(projectId) }),
      queryClient.invalidateQueries({
        queryKey: ["projectContext", projectId],
      }),
      queryClient.invalidateQueries({
        queryKey: projectsQueryOptions().queryKey,
      }),
    ]);
  const start = useMutation({
    mutationFn: () => startAiResearchSetup({ data: { projectId } }),
    onSuccess: (data) => queryClient.setQueryData(setupOptions.queryKey, data),
  });
  // Setup writes the tracker, research keywords and a first run. Load what the
  // AI visibility pages read before setup reads ready, so the page that
  // started it doesn't flash what it cached before. A failed load drops that
  // cache instead, so the page loads it again with its own retry and error.
  const loadSetupResults = async () => {
    const tracker = aiTrackerQueryOptions(projectId);
    const keywords = aiResearchKeywordsQueryOptions(projectId);
    await Promise.all([
      queryClient.fetchQuery(tracker).then(
        ({ recentRuns }) => {
          const runId = recentRuns[0]?.id;
          if (runId)
            return queryClient.prefetchQuery(
              aiRunResultsQueryOptions(projectId, runId),
            );
        },
        () => queryClient.removeQueries({ queryKey: tracker.queryKey }),
      ),
      queryClient
        .fetchQuery({ ...keywords, staleTime: 0 })
        .catch(() =>
          queryClient.removeQueries({ queryKey: keywords.queryKey }),
        ),
    ]);
    await refresh();
  };
  const save = useMutation({
    mutationFn: (accepted: Omit<SaveProjectWebsiteSetup, "projectId">) =>
      saveProjectWebsiteSetup({ data: { ...accepted, projectId } }),
    onSuccess: loadSetupResults,
  });
  const status = setup.data?.status;
  // Setup that finishes anywhere but this gate's save (a background run,
  // another tab) holds the progress screen until the results load, as a saved
  // review keeps its saving state.
  const [lastStatus, setLastStatus] = useState(status);
  const [finishing, setFinishing] = useState(false);
  if (status !== lastStatus) {
    setLastStatus(status);
    const done = lastStatus && lastStatus !== "ready" && status === "ready";
    if (done && !save.isPending) setFinishing(true);
  }
  useEffect(() => {
    if (finishing) void loadSetupResults().finally(() => setFinishing(false));
    // loadSetupResults only reads projectId, which keys this gate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishing]);
  if (setup.isPending) return <SkeletonPageContent />;
  if (setup.isError)
    return (
      <AiQueryError
        error={setup.error}
        retry={() => {
          void setup.refetch();
        }}
      />
    );
  if (status === "ready" && !finishing) return children;
  if (setup.data.review)
    return (
      <div className="grid min-h-[calc(100dvh-8rem)] place-items-center">
        <WebsiteSetupReview
          projectId={projectId}
          research={setup.data.review}
          saving={save.isPending}
          error={save.isError}
          onSave={(accepted) => save.mutate(accepted)}
        />
      </div>
    );
  if (status === "running" || start.isPending || finishing)
    return (
      <div className="grid min-h-[calc(100dvh-8rem)] place-items-center">
        <WebsiteResearchProgress
          missingOverview={setup.data.missingOverview}
          missingCompetitors={setup.data.missingCompetitors}
          note="You can leave this page; setup keeps running."
        />
      </div>
    );
  const failed = status === "failed" || start.isError;
  const unreadable =
    !start.isError && setup.data.failure === "website_unreadable";
  return (
    <div className="grid min-h-[calc(100dvh-8rem)] place-items-center">
      <Card className="w-full max-w-2xl py-6 md:py-8">
        <CardContent className="space-y-6 px-6 md:px-8">
          <div>
            <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-border bg-muted">
              <Sparkles className="size-5" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Set up AI visibility
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              We’ll research your brand and find the most relevant topics to
              monitor.
            </p>
          </div>
          {failed && (
            <Alert variant="destructive">
              <AlertDescription>
                {unreadable
                  ? "We couldn’t read this website. Check the URL in project settings, then try again."
                  : "We couldn’t finish setting up AI visibility. Check your available usage credits, then try again."}
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-3">
            <Button size="lg" className="w-full" onClick={() => start.mutate()}>
              {failed ? "Try again" : "Start research"}
            </Button>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Research and a first run of your prompts use a small amount of
              usage credits.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
