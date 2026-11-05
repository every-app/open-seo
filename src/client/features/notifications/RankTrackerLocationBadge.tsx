import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/client/components/ui/tooltip";
import { rankTrackerLocationDisplay } from "@/shared/rank-tracker-location-display";

export function RankTrackerLocationBadge({
  locationCode,
  locationName,
  className,
}: {
  locationCode: number;
  locationName: string | null;
  className?: string;
}) {
  const { label, flag } = rankTrackerLocationDisplay({
    locationCode,
    locationName,
  });
  if (!flag) return null;

  return (
    <Tooltip>
      <TooltipTrigger className={className ?? "cursor-default"}>
        <span aria-label={label} role="img">
          {flag}
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function RankTrackerSelectLabel({
  domain,
  locationCode,
  locationName,
}: {
  domain: string;
  locationCode: number;
  locationName: string | null;
}) {
  const { label, flag } = rankTrackerLocationDisplay({
    locationCode,
    locationName,
  });
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{domain}</span>
      {flag ? (
        <Tooltip>
          <TooltipTrigger className="cursor-default text-base leading-none">
            <span aria-label={label} role="img">
              {flag}
            </span>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  );
}
