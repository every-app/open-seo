import type { KeywordResearchRow } from "@/types/keywords";
import { Card } from "@/client/components/ui/card";
import { Separator } from "@/client/components/ui/separator";
import { ScoreBadge } from "@/client/components/table/ScoreBadge";
import { formatNumber } from "../utils";
import { IntentBadge } from "./IntentBadge";
export { SerpAnalysisCard } from "./SerpAnalysisCard";

export type { SortDir, SortField } from "./DisplayPrimitives";
export { AreaTrendChart } from "./DisplayPrimitives";

export function OverviewStats({ keyword }: { keyword: KeywordResearchRow }) {
  return (
    <Card className="shrink-0 flex-row items-center gap-4 px-4 py-2.5 min-h-[48px]">
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        <span className="font-bold text-base truncate max-w-[240px] capitalize">
          {keyword.keyword}
        </span>
        <ScoreBadge value={keyword.keywordDifficulty} />
      </div>

      <Separator orientation="vertical" className="h-6" />

      <div className="flex items-center gap-4 text-sm flex-wrap min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Vol</span>
          <span className="font-semibold tabular-nums">
            {formatNumber(keyword.searchVolume)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">CPC</span>
          <span className="font-semibold tabular-nums">
            {keyword.cpc == null ? "-" : `$${keyword.cpc.toFixed(2)}`}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Comp</span>
          <span className="font-semibold tabular-nums">
            {keyword.competition == null ? "-" : keyword.competition.toFixed(2)}
          </span>
        </div>
        <IntentBadge intent={keyword.intent} />
      </div>
    </Card>
  );
}
