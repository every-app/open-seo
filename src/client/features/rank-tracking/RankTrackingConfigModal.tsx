import { useState } from "react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import {
  createRankTrackingConfig,
  updateRankTrackingConfig,
} from "@/serverFunctions/rank-tracking";
import { Info, Loader2, X } from "lucide-react";
import { Modal } from "@/client/components/Modal";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";
import {
  depthToPages,
  pagesToDepth,
  estimateRankCheckCredits,
} from "@/shared/rank-tracking";
import {
  LOCATION_OPTIONS,
  DEFAULT_LOCATION_CODE,
  getLanguageCode,
} from "@/client/features/keywords/locations";
import { KeywordSuggestionStep } from "./KeywordSuggestionStep";

type Props = {
  projectId: string;
  existingConfig?: RankTrackingConfig | null;
  onClose: () => void;
  onSaved: (createdConfigId?: string) => void;
  onConfigCreated?: () => void;
};

export function RankTrackingConfigModal({
  projectId,
  existingConfig,
  onClose,
  onSaved,
  onConfigCreated,
}: Props) {
  const isEdit = !!existingConfig;
  const [step, setStep] = useState<"config" | "keywords">("config");
  const [domain, setDomain] = useState(existingConfig?.domain ?? "");
  const [devices, setDevices] = useState<"both" | "desktop" | "mobile">(
    existingConfig?.devices ?? "mobile",
  );
  const [locationCode, setLocationCode] = useState(
    existingConfig?.locationCode ?? DEFAULT_LOCATION_CODE,
  );
  const [serpDepth, setSerpDepth] = useState(existingConfig?.serpDepth ?? 40);
  const [schedule, setSchedule] = useState<"daily" | "weekly" | "manual">(
    existingConfig?.scheduleInterval ?? "weekly",
  );
  const [createdConfigId, setCreatedConfigId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      createRankTrackingConfig({
        data: {
          projectId,
          domain,
          devices,
          serpDepth,
          locationCode,
          languageCode: getLanguageCode(locationCode),
          scheduleInterval: schedule,
        },
      }),
    onSuccess: (result) => {
      captureClientEvent("rank_tracking:config_create");
      toast.success("Domain added for rank tracking");
      setCreatedConfigId(result.configId);
      onConfigCreated?.();
      setStep("keywords");
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
          serpDepth,
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

  if (step === "keywords" && createdConfigId) {
    return (
      <Modal maxWidth="max-w-3xl">
        <KeywordSuggestionStep
          configId={createdConfigId}
          projectId={projectId}
          domain={domain}
          locationCode={locationCode}
          languageCode={getLanguageCode(locationCode)}
          onDone={(id) => onSaved(id)}
          onClose={() => onSaved(createdConfigId ?? undefined)}
        />
      </Modal>
    );
  }

  return (
    <Modal maxWidth="max-w-lg">
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
          <div className="mt-1.5 text-xs text-base-content/50">
            Most Google searches come from mobile, but select this based on your
            customer.
          </div>
          {devices === "both" && (
            <div className="mt-1.5 flex items-start gap-1.5 text-xs text-info">
              <Info className="size-3.5 shrink-0 mt-0.5" />
              <span>
                Tracking both devices uses 2x credits per keyword check
              </span>
            </div>
          )}
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
          {schedule === "daily" && (
            <div className="mt-1.5 flex items-start gap-1.5 text-xs text-warning">
              <Info className="size-3.5 shrink-0 mt-0.5" />
              <span>Daily checks use 7x more credits than weekly</span>
            </div>
          )}
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Search Depth</span>
          </label>
          <select
            className="select select-bordered w-full"
            value={depthToPages(serpDepth)}
            onChange={(e) => setSerpDepth(pagesToDepth(Number(e.target.value)))}
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((pages) => (
              <option key={pages} value={pages}>
                {pages} {pages === 1 ? "page" : "pages"} (top {pages * 10}{" "}
                results)
              </option>
            ))}
          </select>
          <div className="mt-1.5 text-xs text-base-content/50">
            10 pages is ~8x more expensive than 1 page
          </div>
        </div>

        {(() => {
          const { costUsd: costPerKeyword } = estimateRankCheckCredits(
            1,
            devices,
            serpDepth,
          );
          const checksPerMonth = schedule === "daily" ? 30 : 4;
          return (
            <div className="rounded-lg bg-base-200/50 px-3 py-2.5 text-xs text-base-content/70 space-y-0.5">
              <div>
                <span className="font-mono font-semibold text-base-content">
                  ~${costPerKeyword.toFixed(4)}
                </span>{" "}
                per keyword per check
              </div>
              {schedule !== "manual" && (
                <div>
                  50 keywords would cost{" "}
                  <span className="font-mono font-semibold text-base-content">
                    ~${(costPerKeyword * 50 * checksPerMonth).toFixed(2)}
                  </span>
                  /month
                </div>
              )}
            </div>
          );
        })()}

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
