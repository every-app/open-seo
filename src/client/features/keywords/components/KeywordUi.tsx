import type { KeywordResearchRow } from "@/types/keywords";
import { formatNumber, scoreTierClass } from "../utils";
import { IntentBadge } from "./DisplayPrimitives";
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

export function KeywordRow({
  row,
  isSelected,
  isActive,
  onToggle,
  onClick,
}: {
  row: KeywordResearchRow;
  isSelected: boolean;
  isActive: boolean;
  onToggle: () => void;
  onClick: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 border-b border-base-200 text-sm hover:bg-base-200/50 transition-colors cursor-pointer ${
        isActive ? "bg-primary/5 border-l-2 border-l-primary" : ""
      }`}
      onClick={onClick}
    >
      <input
        type="checkbox"
        className="checkbox checkbox-xs shrink-0"
        checked={isSelected}
        onChange={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        onClick={(e) => e.stopPropagation()}
      />

      <span
        className="flex-1 min-w-0 truncate font-medium capitalize"
        title={row.keyword}
      >
        {row.keyword}
      </span>

      <span className="w-16 text-right tabular-nums text-base-content/70">
        {formatNumber(row.searchVolume)}
      </span>
      <span className="w-14 text-right tabular-nums text-base-content/70">
        {row.cpc == null ? "-" : row.cpc.toFixed(2)}
      </span>
      <span className="w-12 text-right tabular-nums text-base-content/70">
        {row.competition == null ? "-" : row.competition.toFixed(2)}
      </span>

      <div className="w-10 flex justify-end">
        <ScoreBadge value={row.keywordDifficulty} size="sm" />
      </div>
    </div>
  );
}

export function KeywordCard({
  row,
  isSelected,
  isActive,
  onToggle,
  onClick,
}: {
  row: KeywordResearchRow;
  isSelected: boolean;
  isActive: boolean;
  onToggle: () => void;
  onClick: () => void;
}) {
  return (
    <div
      className={`bg-base-100 border border-base-300 rounded-lg p-3 space-y-2 cursor-pointer transition-colors ${
        isActive ? "border-primary bg-primary/5" : "hover:bg-base-200/50"
      }`}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          className="checkbox checkbox-sm shrink-0 mt-0.5"
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          onClick={(e) => e.stopPropagation()}
        />
        <span className="flex-1 font-semibold text-sm capitalize leading-tight">
          {row.keyword}
        </span>
        <ScoreBadge value={row.keywordDifficulty} size="sm" />
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="text-center">
          <p className="text-base-content/50">Volume</p>
          <p className="font-medium tabular-nums">
            {formatNumber(row.searchVolume)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-base-content/50">CPC</p>
          <p className="font-medium tabular-nums">
            {row.cpc == null ? "-" : `$${row.cpc.toFixed(2)}`}
          </p>
        </div>
        <div className="text-center">
          <p className="text-base-content/50">Comp.</p>
          <p className="font-medium tabular-nums">
            {row.competition == null ? "-" : row.competition.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <IntentBadge intent={row.intent} />
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
