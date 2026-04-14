import { useState } from "react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import {
  createRankTrackingConfig,
  updateRankTrackingConfig,
} from "@/serverFunctions/rank-tracking";
import { Loader2, X } from "lucide-react";
import { Modal } from "@/client/components/Modal";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";
import {
  LOCATION_OPTIONS,
  DEFAULT_LOCATION_CODE,
  getLanguageCode,
} from "@/client/features/keywords/locations";

type Props = {
  projectId: string;
  existingConfig?: RankTrackingConfig | null;
  onClose: () => void;
  onSaved: () => void;
};

export function RankTrackingConfigModal({
  projectId,
  existingConfig,
  onClose,
  onSaved,
}: Props) {
  const isEdit = !!existingConfig;
  const [domain, setDomain] = useState(existingConfig?.domain ?? "");
  const [devices, setDevices] = useState<"both" | "desktop" | "mobile">(
    existingConfig?.devices ?? "mobile",
  );
  const [locationCode, setLocationCode] = useState(
    existingConfig?.locationCode ?? DEFAULT_LOCATION_CODE,
  );
  const [schedule, setSchedule] = useState<"daily" | "weekly" | "manual">(
    existingConfig?.scheduleInterval ?? "weekly",
  );

  const createMutation = useMutation({
    mutationFn: () =>
      createRankTrackingConfig({
        data: {
          projectId,
          domain,
          devices,
          locationCode,
          languageCode: getLanguageCode(locationCode),
          scheduleInterval: schedule,
        },
      }),
    onSuccess: () => {
      captureClientEvent("rank_tracking:config_create");
      toast.success("Domain added for rank tracking");
      onSaved();
    },
    onError: (error) => {
      toast.error(getStandardErrorMessage(error, "Failed to save config"));
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateRankTrackingConfig({
        data: {
          projectId,
          configId: existingConfig!.id,
          domain,
          devices,
          locationCode,
          languageCode: getLanguageCode(locationCode),
          scheduleInterval: schedule,
        },
      }),
    onSuccess: () => {
      captureClientEvent("rank_tracking:config_update");
      toast.success("Configuration updated");
      onSaved();
    },
    onError: (error) => {
      toast.error(getStandardErrorMessage(error, "Failed to update config"));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    if (!domain.trim()) {
      toast.error("Please enter a domain");
      return;
    }
    if (isEdit) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Modal>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {isEdit ? "Edit Domain Config" : "Add Domain"}
        </h2>
        <button className="btn btn-ghost btn-sm btn-square" onClick={onClose}>
          <X className="size-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Target Domain</span>
          </label>
          <input
            type="text"
            placeholder="example.com"
            className="input input-bordered w-full"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Country</span>
          </label>
          <select
            className="select select-bordered w-full"
            value={locationCode}
            onChange={(e) => setLocationCode(Number(e.target.value))}
          >
            {LOCATION_OPTIONS.map((loc) => (
              <option key={loc.code} value={loc.code}>
                {loc.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Devices</span>
          </label>
          <select
            className="select select-bordered w-full"
            value={devices}
            onChange={(e) => {
              const value = e.target.value;
              if (
                value === "both" ||
                value === "desktop" ||
                value === "mobile"
              ) {
                setDevices(value);
              }
            }}
          >
            <option value="both">Desktop + Mobile</option>
            <option value="desktop">Desktop only</option>
            <option value="mobile">Mobile only</option>
          </select>
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Schedule</span>
          </label>
          <select
            className="select select-bordered w-full"
            value={schedule}
            onChange={(e) => {
              const value = e.target.value;
              if (
                value === "daily" ||
                value === "weekly" ||
                value === "manual"
              ) {
                setSchedule(value);
              }
            }}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="manual">Manual only</option>
          </select>
        </div>

        <p className="text-xs text-base-content/60">
          After adding a domain, manage tracked keywords from the domain detail
          view.
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={isPending || !domain.trim()}
          >
            {isPending && <Loader2 className="size-3.5 animate-spin" />}
            {isEdit ? "Save Changes" : "Add Domain"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
