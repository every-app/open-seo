import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getAiVisibilityTracker,
  saveAiVisibilityTracker,
  setAiVisibilitySchedule,
} from "@/serverFunctions/ai-visibility";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import type { AiRun, AiTrackerState } from "@/shared/ai-visibility";
import type { TrackerSetupReviewData } from "./TrackerSetupReview";

export function useTrackerSetupSave({
  projectId,
  onSaved,
}: {
  projectId: string;
  onSaved: (state: AiTrackerState, run?: AiRun) => void;
}) {
  return useMutation({
    mutationFn: async ({
      accepted,
      scheduleWeekly,
    }: {
      accepted: TrackerSetupReviewData;
      scheduleWeekly: boolean;
    }) => {
      const result = await saveAiVisibilityTracker({
        data: { projectId, ...accepted.patch },
      });
      if (!scheduleWeekly) return { state: result.state };
      try {
        // A first schedule also collects a baseline now.
        const scheduled = await setAiVisibilitySchedule({
          data: { projectId, enabled: true, scheduleInterval: "weekly" },
        });
        return { state: scheduled.state, run: scheduled.run ?? undefined };
      } catch (scheduleError) {
        // The schedule is saved before its first check starts, so a failed
        // check can leave tracking on. Show what the server kept.
        const state = await getAiVisibilityTracker({
          data: { projectId },
        }).catch(() => result.state);
        return { state, scheduleError };
      }
    },
    onSuccess: (result) => {
      onSaved(result.state, result.run);
      if (result.scheduleError)
        toast.error(
          `${result.state.tracker?.enabled ? "Weekly tracking is on, but the first check couldn't start." : "Prompts saved. We couldn't start weekly tracking."} ${getStandardErrorMessage(result.scheduleError)}`,
        );
    },
  });
}
