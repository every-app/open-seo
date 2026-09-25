import { Loader2, Zap } from "@/client/components/icons";
import { Modal } from "@/client/components/Modal";
import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";
import {
  estimateRankCheckCredits,
  devicesCount,
  KEYWORDS_PER_BATCH,
  SECONDS_PER_BATCH,
} from "@/shared/rank-tracking";

import { Button } from "@/client/components/ui/button";

export function CheckConfirmModal({
  keywordCount,
  devices,
  serpDepth,
  isPending,
  onRunNow,
  onCancel,
}: {
  keywordCount: number;
  devices: RankTrackingConfig["devices"];
  serpDepth: number;
  isPending: boolean;
  onRunNow: () => void;
  onCancel: () => void;
}) {
  const { costUsd } = estimateRankCheckCredits(
    keywordCount,
    devices,
    serpDepth,
    "live",
  );
  const dc = devicesCount(devices);
  const totalChecks = keywordCount * dc;
  const liveTime =
    Math.ceil(totalChecks / KEYWORDS_PER_BATCH) * SECONDS_PER_BATCH;

  return (
    <Modal
      maxWidth="max-w-md"
      onClose={onCancel}
      labelledBy="rank-check-confirm-title"
    >
      <div>
        <h3 id="rank-check-confirm-title" className="text-lg font-semibold">
          Check {keywordCount} keyword
          {keywordCount !== 1 ? "s" : ""}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {keywordCount} keywords &times; {dc} device
          {dc !== 1 ? "s" : ""} = {totalChecks} SERP checks
        </p>
      </div>

      <Button
        variant="outline"
        className="h-auto w-full justify-start gap-4 whitespace-normal rounded-xl p-4 text-left font-normal"
        onClick={onRunNow}
        disabled={isPending}
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Zap className="size-5 text-link" />
        </div>
        <div className="flex-1">
          <p className="font-medium">Run Now</p>
          <p className="text-xs text-muted-foreground">
            Results in ~
            {liveTime < 60 ? `${liveTime}s` : `${Math.ceil(liveTime / 60)} min`}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono font-semibold">~${costUsd.toFixed(2)}</p>
          {isPending && <Loader2 className="size-3 animate-spin ml-auto" />}
        </div>
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="self-center justify-self-center"
        onClick={onCancel}
      >
        Cancel
      </Button>
    </Modal>
  );
}
