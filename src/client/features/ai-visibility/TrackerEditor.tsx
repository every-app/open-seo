import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { estimateAiVisibilityCost } from "@/serverFunctions/ai-visibility";
import { useTrackerSetupSave } from "./useTrackerSetupSave";
import {
  aiTrackerPatchSchema,
  type AiTrackerPatch,
} from "@/types/schemas/ai-visibility";
import type { AiTrackerState, AiRun } from "@/shared/ai-visibility";
import {
  TrackerTrackingFields,
  collectableMarket,
  type TrackerDraft,
} from "./TrackerTrackingFields";
import { TrackerPromptFields } from "./TrackerPromptFields";
import {
  TrackerSetupReview,
  type TrackerSetupReviewData,
} from "./TrackerSetupReview";
import { AiQueryError } from "./shared";
import type { ProjectMarket } from "@/client/features/projects/types";

export enum TrackerEditorMode {
  Prompts = "prompts",
  Settings = "settings",
}

export function TrackerEditor({
  projectId,
  state,
  defaultMarket,
  mode,
  open = true,
  schedule,
  onManageTracking,
  onClose,
  onSaved,
}: {
  projectId: string;
  state: AiTrackerState;
  defaultMarket: ProjectMarket;
  mode: TrackerEditorMode;
  open?: boolean;
  /** Settings mode shows the tracking schedule above engines and country. */
  schedule?: ReactNode;
  onManageTracking?: () => void;
  onClose: () => void;
  onSaved: (state: AiTrackerState, run?: AiRun) => void;
}) {
  const adding = mode === TrackerEditorMode.Prompts;
  const [generating, setGenerating] = useState(false);
  const [review, setReview] = useState<TrackerSetupReviewData | null>(null);
  const [validationError, setValidationError] = useState<Error | null>(null);
  const topic =
    state.topics.find((name) =>
      state.prompts.some(
        (prompt) => !prompt.archived && !prompt.paused && prompt.topic === name,
      ),
    ) ??
    state.topics[0] ??
    "";
  const engines = state.engines.length
    ? state.engines
    : state.capabilities.slice(0, 1).map((capability) => capability.engine);
  const defaultDraft: TrackerDraft = {
    engines,
    ...(state.tracker
      ? {
          locationCode: state.tracker.locationCode,
          languageCode: state.tracker.languageCode,
        }
      : collectableMarket(engines, defaultMarket)),
    topic: { name: topic, prompts: ["", "", ""] },
  };
  const prepare = useMutation({
    mutationFn: async (patch: AiTrackerPatch) => ({
      patch,
      estimate: await estimateAiVisibilityCost({
        // An unscheduled tracker is offered weekly tracking.
        data: {
          projectId,
          patch,
          scheduleInterval: state.tracker?.enabled ? undefined : "weekly",
        },
      }),
    }),
    onSuccess: setReview,
  });
  const save = useTrackerSetupSave({ projectId, onSaved });
  const form = useForm({
    defaultValues: { draft: defaultDraft },
    onSubmit: ({ value: { draft } }) => {
      setValidationError(null);
      const parsed = aiTrackerPatchSchema.safeParse({
        ...(adding && state.tracker
          ? {}
          : {
              engines: draft.engines,
              locationCode: draft.locationCode,
              languageCode: draft.languageCode,
            }),
        prompts: adding
          ? draft.topic.prompts
              .map((text) => text.trim())
              .filter(Boolean)
              .map((text) => ({ text, topic: draft.topic.name }))
          : undefined,
      });
      if (!parsed.success) {
        setValidationError(
          new Error(
            parsed.error.issues.map((issue) => issue.message).join(". "),
          ),
        );
        return;
      }
      if (adding && !parsed.data.prompts?.length) {
        setValidationError(new Error("Add at least one prompt."));
        return;
      }
      prepare.mutate(parsed.data);
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !save.isPending && !generating) onClose();
      }}
    >
      <DialogContent className="sm:max-w-xl" showCloseButton={false}>
        <DialogHeader className="flex-row items-center justify-between gap-3">
          <DialogTitle className="text-lg">
            {adding ? "Add prompts" : "Tracking settings"}
          </DialogTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close setup"
            disabled={save.isPending || generating}
            onClick={onClose}
          >
            <X />
          </Button>
        </DialogHeader>
        {!adding && !review && (
          <p className="text-sm text-muted-foreground">
            Brand details and competitors come from{" "}
            <Link
              to="/p/$projectId/context"
              params={{ projectId }}
              className="text-foreground underline underline-offset-4"
            >
              project context
            </Link>
            .
          </p>
        )}
        {!adding && !review && schedule}
        {!state.providerConfigured && (
          <p className="rounded-lg bg-muted px-4 py-3 text-sm">
            An administrator needs to configure the DataForSEO API key before we
            can collect data.
          </p>
        )}
        {review ? (
          <TrackerSetupReview
            review={review}
            enabled={Boolean(state.tracker?.enabled)}
            creating={!state.tracker}
            pending={save.isPending}
            error={save.error}
            canSchedule={state.providerConfigured}
            scheduling={save.variables?.scheduleWeekly ?? false}
            onBack={() => {
              setReview(null);
              save.reset();
            }}
            onSave={() =>
              save.mutate({ accepted: review, scheduleWeekly: false })
            }
            onSaveAndSchedule={() =>
              save.mutate({ accepted: review, scheduleWeekly: true })
            }
          />
        ) : (
          <form
            className="space-y-6"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <fieldset
              disabled={prepare.isPending || generating}
              inert={prepare.isPending || generating}
            >
              <form.Field name="draft">
                {(field) => (
                  <div className="space-y-6">
                    {adding && (
                      <>
                        <TrackerPromptFields
                          projectId={projectId}
                          state={state}
                          value={{
                            ...field.state.value,
                            engines: defaultDraft.engines,
                            locationCode: defaultDraft.locationCode,
                            languageCode: defaultDraft.languageCode,
                          }}
                          onChange={field.handleChange}
                          onGeneratingChange={setGenerating}
                        />
                        <p className="text-xs text-muted-foreground">
                          Manage the active AI engines and country in{" "}
                          <button
                            type="button"
                            className="text-foreground underline underline-offset-4"
                            onClick={onManageTracking}
                          >
                            Tracking settings
                          </button>
                          .
                        </p>
                      </>
                    )}
                    {!adding && (
                      <TrackerTrackingFields
                        state={state}
                        defaultMarket={defaultMarket}
                        value={field.state.value}
                        onChange={field.handleChange}
                        disabled={prepare.isPending}
                      />
                    )}
                  </div>
                )}
              </form.Field>
            </fieldset>
            {(validationError || prepare.error) && (
              <AiQueryError error={validationError || prepare.error} />
            )}
            <DialogFooter>
              <Button type="submit" disabled={prepare.isPending || generating}>
                {prepare.isPending && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                {adding ? "Review prompts" : "Review changes"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
