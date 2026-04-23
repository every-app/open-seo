import { Sparkles } from "lucide-react";
import { SearchHistorySection } from "@/client/features/ai-search/components/SearchHistorySection";
import type { BrandLookupSearchHistoryItem } from "@/client/hooks/useBrandLookupSearchHistory";

type Props = {
  history: BrandLookupSearchHistoryItem[];
  historyLoaded: boolean;
  onRemoveHistoryItem: (timestamp: number) => void;
  onSelectHistoryItem: (item: BrandLookupSearchHistoryItem) => void;
};

export function BrandLookupHistorySection(props: Props) {
  return (
    <SearchHistorySection
      {...props}
      emptyIcon={Sparkles}
      emptyMessage="Search a brand name or domain to see how AI cites it"
      noun="lookup"
      renderItem={(item) => (
        <p className="font-medium text-base-content truncate">{item.query}</p>
      )}
    />
  );
}
