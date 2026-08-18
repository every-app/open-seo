import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getProjectAiSettings,
  updateProjectAiSettings,
} from "@/serverFunctions/aiSettings";
import { AiModelSelect } from "@/client/features/ai/AiModelSelect";
import { EffectiveModelReadout } from "@/client/features/ai/AiConnectionTest";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

// Per-project override for the in-app agent's model. Empty (inherited) state
// means "use the organization default"; the toggle switches between inheriting
// and pinning a model for this project.

export function ProjectAiSettingsSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["aiSettings", "project", projectId],
    queryFn: () => getProjectAiSettings({ data: { projectId } }),
  });
  const [inheriting, setInheriting] = useState<boolean | null>(null);
  const [model, setModel] = useState<string | null>(null);

  const settings = settingsQuery.data;
  const [lastLoaded, setLastLoaded] = useState<string | null | undefined>(
    undefined,
  );
  if (settings && (settings.project?.model ?? null) !== lastLoaded) {
    setLastLoaded(settings.project?.model ?? null);
    setModel(settings.project?.model ?? null);
    setInheriting(settings.project === null);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      updateProjectAiSettings({
        data: {
          projectId,
          provider: "openrouter",
          model: inheriting ? undefined : (model ?? undefined),
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["aiSettings"] });
      toast.success("Project AI settings saved");
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Failed to save AI settings")),
  });

  if (settingsQuery.isPending || !settings || inheriting === null) {
    return (
      <div className="flex items-center gap-2">
        <span className="loading loading-spinner loading-sm" />
        <span className="text-sm text-base-content/50">Loading…</span>
      </div>
    );
  }

  const isDirty =
    inheriting !== (settings.project === null) ||
    (!inheriting && (model ?? null) !== (settings.project?.model ?? null));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Use organization default</p>
          <p className="text-xs text-base-content/50">
            Inherit the default model configured in app settings.
          </p>
        </div>
        <input
          type="checkbox"
          className="toggle toggle-primary"
          checked={inheriting}
          onChange={(event) => setInheriting(event.currentTarget.checked)}
          disabled={saveMutation.isPending}
          aria-label="Inherit organization AI model"
        />
      </div>

      {!inheriting && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Model override</span>
          <AiModelSelect
            value={model}
            onChange={setModel}
            disabled={saveMutation.isPending}
          />
        </div>
      )}

      <EffectiveModelReadout effectiveModel={settings.effective.model} />

      <div className="flex justify-end">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !isDirty}
        >
          {saveMutation.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}