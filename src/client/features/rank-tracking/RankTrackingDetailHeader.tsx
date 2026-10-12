import { Monitor, Plus, Settings, Smartphone } from "lucide-react";
import { SegmentedToggle } from "@/client/components/SegmentedToggle";
import { Button } from "@/client/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { LOCATIONS } from "@/client/features/keywords/locations";
import { devicesLabel, scheduleLabel } from "@/shared/rank-tracking";
import { formatNextCheck } from "./scheduleTime";
import { formatLocationLabel } from "@/shared/keyword-locations";
import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";
import {
  comparePeriodSchema,
  type ComparePeriod,
} from "@/types/schemas/rank-tracking-search";

const COMPARE_ITEMS: { value: ComparePeriod; label: string }[] = [
  { value: "1d", label: "vs yesterday" },
  { value: "7d", label: "vs last week" },
  { value: "30d", label: "vs last month" },
  { value: "90d", label: "vs 90 days ago" },
];

export function RankTrackingDetailHeader({
  config,
  run,
  costEstimate,
  hasBothDevices,
  activeDevice,
  onActiveDeviceChange,
  comparePeriod,
  onComparePeriodChange,
  onEdit,
  onToggleAddKeywords,
}: {
  config: RankTrackingConfig;
  run: { lastCheckedAt: string | null } | null | undefined;
  costEstimate: { keywordCount: number; costUsd: number } | undefined;
  hasBothDevices: boolean;
  activeDevice: "desktop" | "mobile";
  onActiveDeviceChange: (v: "desktop" | "mobile") => void;
  comparePeriod: ComparePeriod;
  onComparePeriodChange: (v: ComparePeriod) => void;
  onEdit: () => void;
  onToggleAddKeywords: () => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 px-4 pt-4 pb-3">
      <div>
        <h2 className="text-lg font-semibold">{config.domain}</h2>
        <p className="text-xs text-muted-foreground">
          {config.locationName
            ? formatLocationLabel(config.locationName, 2)
            : (LOCATIONS[config.locationCode] ?? "US")}{" "}
          &middot; {devicesLabel(config.devices)} &middot;{" "}
          {scheduleLabel(config.scheduleInterval)}
          {config.scheduleInterval !== "manual" && config.nextCheckAt && (
            <> &middot; Next: {formatNextCheck(config.nextCheckAt)}</>
          )}
          {run?.lastCheckedAt && (
            <>
              {" "}
              &middot; Last: {new Date(run.lastCheckedAt).toLocaleDateString()}
            </>
          )}
          {costEstimate && costEstimate.keywordCount > 0 && (
            <> &middot; ~${costEstimate.costUsd.toFixed(2)}/check</>
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {hasBothDevices && (
          <SegmentedToggle
            items={[
              {
                value: "desktop" as const,
                icon: <Monitor className="size-3.5" />,
                label: "Desktop",
              },
              {
                value: "mobile" as const,
                icon: <Smartphone className="size-3.5" />,
                label: "Mobile",
              },
            ]}
            value={activeDevice}
            onChange={onActiveDeviceChange}
          />
        )}
        <Select
          items={COMPARE_ITEMS}
          value={comparePeriod}
          onValueChange={(value) => {
            const parsed = comparePeriodSchema.safeParse(value);
            if (parsed.success) onComparePeriodChange(parsed.data);
          }}
        >
          <SelectTrigger
            size="sm"
            aria-label="Comparison period"
            title="Comparison period"
            className="text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMPARE_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="hidden h-6 w-px bg-border sm:block" />
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Settings data-icon="inline-start" />
          Configure
        </Button>
        <Button size="sm" onClick={onToggleAddKeywords}>
          <Plus data-icon="inline-start" />
          Add Keywords
        </Button>
      </div>
    </div>
  );
}
