import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import {
  createRankTrackingConfig,
  updateRankTrackingConfig,
} from "@/serverFunctions/rank-tracking";
import { captureClientEvent } from "@/client/lib/posthog";
import type {
  RankCheckScheduleTime,
  RankTrackingConfig,
} from "@/types/schemas/rank-tracking";

export type SaveConfigInput = {
  domain: string;
  devices: "both" | "desktop" | "mobile";
  serpDepth: number;
  locationCode: number;
  languageCode: string;
  targetingMode: "national" | "local";
  locationName: string | undefined;
  schedule: RankTrackingConfig["scheduleInterval"];
  scheduleTime: RankCheckScheduleTime | undefined;
};

function commonFields(input: SaveConfigInput) {
  return {
    domain: input.domain,
    devices: input.devices,
    serpDepth: input.serpDepth,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    scheduleInterval: input.schedule,
    scheduleTime: input.scheduleTime,
  };
}

export function useSaveConfigMutations(input: {
  projectId: string;
  existingConfig?: RankTrackingConfig | null;
  onCreated: (configId: string) => void;
  onUpdated: () => void;
}) {
  const { projectId, existingConfig, onCreated, onUpdated } = input;

  const createMutation = useMutation({
    mutationFn: (fields: SaveConfigInput) =>
      createRankTrackingConfig({
        data: {
          projectId,
          ...commonFields(fields),
          locationName:
            fields.targetingMode === "local" ? fields.locationName : undefined,
        },
      }),
    onSuccess: (result) => {
      captureClientEvent("rank_tracking:config_create");
      toast.success("Domain added for rank tracking");
      onCreated(result.id);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (fields: SaveConfigInput) =>
      updateRankTrackingConfig({
        data: {
          projectId,
          configId: existingConfig!.id,
          ...commonFields(fields),
          // null clears a previously-set local target; undefined would leave
          // the old location_name in the DB and silently keep city targeting.
          locationName:
            fields.targetingMode === "local" ? fields.locationName : null,
        },
      }),
    onSuccess: () => {
      captureClientEvent("rank_tracking:config_update");
      toast.success("Configuration updated");
      onUpdated();
    },
  });

  return { createMutation, updateMutation };
}
