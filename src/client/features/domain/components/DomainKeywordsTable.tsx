import { HeaderHelpLabel } from "@/client/features/keywords/components";
import { DifficultyBadge } from "@/client/features/domain/components/DifficultyBadge";
import { SortableHeader } from "@/client/features/domain/components/SortableHeader";
import { formatFloat, formatNumber } from "@/client/features/domain/utils";
import type {
  DomainSortMode,
  KeywordRow,
  SortOrder,
} from "@/client/features/domain/types";

type Props = {
  rows: KeywordRow[];
  selectedKeywords: Set<string>;
  visibleKeywords: string[];
  sortMode: DomainSortMode;
  currentSortOrder: SortOrder;
  onSortClick: (sort: DomainSortMode) => void;
  onToggleKeyword: (keyword: string) => void;
  onToggleAllVisible: () => void;
};

export function DomainKeywordsTable({
  rows,
  selectedKeywords,
  visibleKeywords,
  sortMode,
  currentSortOrder,
  onSortClick,
  onToggleKeyword,
  onToggleAllVisible,
}: Props) {
  return (
    <div className="overflow-x-auto">
      <div className="mb-2 text-xs text-base-content/60">
        {selectedKeywords.size > 0
          ? `${selectedKeywords.size} selected`
          : "Select keywords to save"}
      </div>
      <table className="table table-zebra table-sm">
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                className="checkbox checkbox-xs"
                checked={
                  visibleKeywords.length > 0 &&
                  visibleKeywords.every((keyword) =>
                    selectedKeywords.has(keyword),
                  )
                }
                onChange={onToggleAllVisible}
              />
            </th>
            <th>Keyword</th>
            <th>
              <SortableHeader
                label="Rank"
                isActive={sortMode === "rank"}
                order={currentSortOrder}
                onClick={() => onSortClick("rank")}
              />
            </th>
            <th>
              <SortableHeader
                label="Volume"
                isActive={sortMode === "volume"}
                order={currentSortOrder}
                onClick={() => onSortClick("volume")}
              />
            </th>
            <th>
              <SortableHeader
                label="Traffic"
                isActive={sortMode === "traffic"}
                order={currentSortOrder}
                onClick={() => onSortClick("traffic")}
              />
            </th>
            <th>
              <HeaderHelpLabel label="CPC" helpText="Cost per click in USD." />
            </th>
            <th>URL</th>
            <th>
              <HeaderHelpLabel
                label="Score"
                helpText="Keyword difficulty score."
              />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="py-6 text-center text-base-content/60">
                No keywords match this search.
              </td>
            </tr>
          ) : (
            rows.slice(0, 100).map((row) => (
              <tr key={`${row.keyword}-${row.url ?? ""}`}>
                <td>
                  <input
                    type="checkbox"
                    className="checkbox checkbox-xs"
                    checked={selectedKeywords.has(row.keyword)}
                    onChange={() => onToggleKeyword(row.keyword)}
                    aria-label={`Select ${row.keyword}`}
                  />
                </td>
                <td className="font-medium">{row.keyword}</td>
                <td>{row.position ?? "-"}</td>
                <td>{formatNumber(row.searchVolume)}</td>
                <td>{formatFloat(row.traffic)}</td>
                <td>{row.cpc == null ? "-" : `$${row.cpc.toFixed(2)}`}</td>
                <td
                  className="max-w-[260px] truncate"
                  title={row.url ?? undefined}
                >
                  {row.relativeUrl ?? row.url ?? "-"}
                </td>
                <td>
                  <DifficultyBadge value={row.keywordDifficulty} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
