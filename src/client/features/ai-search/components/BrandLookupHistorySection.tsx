import { Link } from "@tanstack/react-router";
import { Sparkles } from "@/client/components/icons";
import {
  HISTORY_ITEM_LINK_CLASS,
  SearchHistorySection,
} from "@/client/features/ai-search/components/SearchHistorySection";
import type { BrandLookupSearchHistoryItem } from "@/client/hooks/useBrandLookupSearchHistory";
import { RESEARCH_SCOPE_LABELS } from "@/shared/researchScope";

import { Badge } from "@/client/components/ui/badge";
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
            scope: item.scope,
          }}
          replace
          className={HISTORY_ITEM_LINK_CLASS}
        >
          {content}
        </Link>
      )}
      renderItem={(item) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2 truncate font-medium text-foreground">
            {item.query}
            {/* Only non-default scopes are stored, so this badge always adds
                information the query string doesn't already carry. */}
            {item.scope ? (
              <Badge variant="secondary" className="shrink-0">
                {RESEARCH_SCOPE_LABELS[item.scope]}
              </Badge>
            ) : null}
          </div>
          {item.competitors.length > 0 ? (
            <p className="truncate text-xs text-muted-foreground">
              vs {item.competitors.join(", ")}
            </p>
          ) : null}
        </div>
      )}
    />
  );
}
