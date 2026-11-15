import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import {
  clusterKeywordPull,
  filterKeywordPull,
  startKeywordPull,
} from "@/serverFunctions/platformSeo";
import type { PsPullStage } from "@/shared/platform-seo";

export type PipelineStep = "pull" | "filter" | "cluster";

export const expandQueryKeys = {
  setup: (projectId: string) => ["platformSeo", projectId, "setup"] as const,
  pulls: (projectId: string) => ["platformSeo", projectId, "pulls"] as const,
  pull: (projectId: string, pullId: string) =>
    ["platformSeo", projectId, "pull", pullId] as const,
};

const STEP_FAILURE: Record<PipelineStep, string> = {
  pull: "Couldn't pull keywords from Answer Socrates.",
  filter: "The relevance filter failed; the pull is saved, so you can resume.",
  cluster: "Clustering failed; you can resume it from the pull.",
};

type RunInput =
  | { seed: string; seedMeaning?: string }
  | { resumePullId: string; stage: PsPullStage };

// Runs pull -> relevance filter -> enrich + cluster as three server calls so
// each step is short and a failed step can be resumed from the pull's stage.
export function useExpandPipeline(
  projectId: string,
  onPull: (pullId: string) => void,
) {
  const queryClient = useQueryClient();
  const [step, setStepState] = useState<PipelineStep | null>(null);
  // onError runs with this render's closure; the ref has the step that failed.
  const stepRef = useRef<PipelineStep | null>(null);
  const setStep = (next: PipelineStep | null) => {
    stepRef.current = next;
    setStepState(next);
  };

  const refresh = (pullId?: string) =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: expandQueryKeys.pulls(projectId),
      }),
      pullId
        ? queryClient.invalidateQueries({
            queryKey: expandQueryKeys.pull(projectId, pullId),
          })
        : undefined,
    ]);

  const mutation = useMutation({
    mutationFn: async (input: RunInput) => {
      let pullId: string;
      let stage: PsPullStage;
      if ("seed" in input) {
        setStep("pull");
        const started = await startKeywordPull({
          data: { projectId, seed: input.seed, seedMeaning: input.seedMeaning },
        });
        if (!started.pullId) {
          toast.info(`Answer Socrates found no searches for “${input.seed}”.`);
          return null;
        }
        pullId = started.pullId;
        stage = "pulled";
        onPull(pullId);
        await refresh(pullId);
      } else {
        pullId = input.resumePullId;
        stage = input.stage;
      }
      try {
        if (stage === "pulled") {
          setStep("filter");
          await filterKeywordPull({ data: { projectId, pullId } });
          await refresh(pullId);
        }
        setStep("cluster");
        await clusterKeywordPull({ data: { projectId, pullId } });
      } finally {
        await refresh(pullId);
      }
      return pullId;
    },
    // Server errors arrive as bare codes, so say which step failed.
    meta: { errorToast: false },
    onError: (error) => {
      const failed = stepRef.current ?? "pull";
      const code = getErrorCode(error);
      if (code === "RATE_LIMITED" && failed === "pull") {
        toast.error(
          "Answer Socrates refused the request: rate limit (60/min) or monthly quota reached.",
        );
        return;
      }
      toast.error(`${STEP_FAILURE[failed]} ${getStandardErrorMessage(error)}`);
    },
    onSettled: () => setStep(null),
  });

  return { run: mutation.mutate, isRunning: mutation.isPending, step };
}
