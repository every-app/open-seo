import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";
import {
  devicesCount,
  KEYWORDS_PER_BATCH,
  SECONDS_PER_BATCH,
} from "@/shared/rank-tracking";

export function CheckConfirmModal({
  keywordCount,
  devices,
  costUsd,
  isPending,
  onRunNow,
  onCancel,
}: {
  keywordCount: number;
  devices: RankTrackingConfig["devices"];
  /** Server estimate; it prices each keyword's text (operators cost 5x). */
  costUsd: number | undefined;
  isPending: boolean;
  onRunNow: () => void;
  onCancel: () => void;
}) {
  const dc = devicesCount(devices);
  const totalChecks = keywordCount * dc;
  const liveTime =
    Math.ceil(totalChecks / KEYWORDS_PER_BATCH) * SECONDS_PER_BATCH;

  const eta =
    liveTime < 60 ? `${liveTime}s` : `${Math.ceil(liveTime / 60)} min`;

  return (
    <ConfirmDialog
      title={`Check ${keywordCount} keyword${keywordCount !== 1 ? "s" : ""}?`}
      confirmLabel="Run now"
      pending={isPending}
      onConfirm={onRunNow}
      onClose={onCancel}
    >
      {keywordCount} keywords &times; {dc} device{dc !== 1 ? "s" : ""} ={" "}
      {totalChecks} SERP checks. Results in ~{eta}.
      {costUsd != null ? (
        <>
          {" "}
          Costs about{" "}
          <span className="font-mono font-semibold text-foreground">
            ${costUsd.toFixed(2)}
          </span>
          .
        </>
      ) : null}
    </ConfirmDialog>
  );
}
