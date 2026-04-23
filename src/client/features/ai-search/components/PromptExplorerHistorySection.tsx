import { MessageSquare } from "lucide-react";
import { SearchHistorySection } from "@/client/features/ai-search/components/SearchHistorySection";
import { formatModelLabel } from "@/client/features/ai-search/platformLabels";
import type { PromptExplorerSearchHistoryItem } from "@/client/hooks/usePromptExplorerSearchHistory";

type Props = {
  history: PromptExplorerSearchHistoryItem[];
  historyLoaded: boolean;
  onRemoveHistoryItem: (timestamp: number) => void;
  onSelectHistoryItem: (item: PromptExplorerSearchHistoryItem) => void;
};

export function PromptExplorerHistorySection(props: Props) {
  return (
    <SearchHistorySection
      {...props}
      emptyIcon={MessageSquare}
      emptyMessage="Enter a prompt to compare model answers"
      noun="prompt"
      renderItem={(item) => (
        <>
          <p className="font-medium text-base-content truncate">
            {item.prompt}
          </p>
          <p className="text-sm text-base-content/60 truncate">
            {item.models.map(formatModelLabel).join(", ")}
          </p>
        </>
      )}
    />
  );
}
