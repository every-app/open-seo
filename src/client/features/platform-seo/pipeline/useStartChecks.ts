import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  type getPipeline,
  startTrackingChecks,
} from "@/serverFunctions/platformSeo";
import { topicQueryKeys } from "../topics/topicQueryKeys";

export type PipelineData = Awaited<ReturnType<typeof getPipeline>>;

const startKey = (projectId: string) =>
  [...topicQueryKeys.pipeline(projectId), "start"] as const;

const copies = (n: number) => `${n} ${n === 1 ? "copy" : "copies"}`;

// Every Check button shares this, so none starts while another is posting.
export function useStartChecks(projectId: string) {
  const queryClient = useQueryClient();
  const starting = useIsMutating({ mutationKey: startKey(projectId) }) > 0;
  const mutation = useMutation({
    mutationKey: startKey(projectId),
    mutationFn: (syndicationIds?: string[]) =>
      startTrackingChecks({ data: { projectId, syndicationIds } }),
    onSuccess: async ({ started, alreadyRunning, failed }) => {
      await queryClient.invalidateQueries({
        queryKey: topicQueryKeys.pipeline(projectId),
      });
      const message =
        started > 0
          ? `Checking ${copies(started)} on Google. Results arrive in a few minutes.`
          : alreadyRunning > 0
            ? "Those checks are already running."
            : "Nothing to check yet.";
      if (failed > 0) {
        toast.warning(
          `${message} ${copies(failed)} couldn't start; try them again shortly.`,
        );
      } else {
        toast.success(message);
      }
    },
  });
  return { ...mutation, starting };
}
