import type { KeywordResearchRow } from "@/types/keywords";
import { formatNumber, scoreTierClass } from "../utils";
import { IntentBadge } from "./IntentBadge";
export { SerpAnalysisCard } from "./SerpAnalysisCard";

export type { SortDir, SortField } from "./DisplayPrimitives";
export {
  AreaTrendChart,
  HeaderHelpLabel,
  SortHeader,
} from "./DisplayPrimitives";

export function OverviewStats({ keyword }: { keyword: KeywordResearchRow }) {
  return (
    <div className="shrink-0 bg-base-100 border border-base-300 rounded-xl px-4 py-2.5 flex items-center gap-4 min-h-[48px]">
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        <span className="font-bold text-base truncate max-w-[240px] capitalize">
          {keyword.keyword}
        </span>
        <ScoreBadge value={keyword.keywordDifficulty} size="sm" />
      </div>

      <div className="w-px h-6 bg-base-300 shrink-0" />

      <div className="flex items-center gap-4 text-sm flex-wrap min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-base-content/50">Vol</span>
          <span className="font-semibold tabular-nums">
            {formatNumber(keyword.searchVolume)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-base-content/50">CPC</span>
          <span className="font-semibold tabular-nums">
            {keyword.cpc == null ? "-" : `$${keyword.cpc.toFixed(2)}`}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-base-content/50">Comp</span>
          <span className="font-semibold tabular-nums">
            {keyword.competition == null ? "-" : keyword.competition.toFixed(2)}
          </span>
        </div>
        <IntentBadge intent={keyword.intent} />
      </div>
    </div>
  );
}

function ScoreBadge({
  value,
  size = "sm",
}: {
  value: number | null;
  size?: "sm" | "lg";
}) {
  if (value == null) return null;

  const tierClass = scoreTierClass(value);
  const sizeClasses =
    size === "lg"
      ? "size-9 text-sm font-bold"
      : "size-6 text-[10px] font-semibold";

  return (
    <span
      className={`score-badge ${tierClass} inline-flex items-center justify-center rounded-full ${sizeClasses}`}
    >
      {value}
    </span>
  );
}
