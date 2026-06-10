import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import {
  HISTORY_ITEM_LINK_CLASS,
  SearchHistorySection,
} from "@/client/features/ai-search/components/SearchHistorySection";
import type { BrandLookupSearchHistoryItem } from "@/client/hooks/useBrandLookupSearchHistory";

type Props = {
  projectId: string;
  history: BrandLookupSearchHistoryItem[];
  historyLoaded: boolean;
  onRemoveHistoryItem: (timestamp: number) => void;
};

export function BrandLookupHistorySection({ projectId, ...props }: Props) {
  return (
    <SearchHistorySection
      {...props}
      emptyIcon={Sparkles}
      emptyMessage="Search a brand name or domain to see how AI cites it"
      noun="lookup"
      renderItemLink={(item, content) => (
        <Link
          from="/p/$projectId/brand-lookup"
          to="/p/$projectId/brand-lookup"
          params={{ projectId }}
          search={{
            q: item.query,
            c:
              item.competitors.length > 0
                ? item.competitors.join(",")
                : undefined,
          }}
          replace
          className={HISTORY_ITEM_LINK_CLASS}
        >
          {content}
        </Link>
      )}
      renderItem={(item) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-base-content">{item.query}</p>
          {item.competitors.length > 0 ? (
            <p className="truncate text-xs text-base-content/50">
              vs {item.competitors.join(", ")}
            </p>
          ) : null}
        </div>
      )}
    />
  );
}
