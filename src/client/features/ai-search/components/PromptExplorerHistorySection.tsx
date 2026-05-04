import { Link } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import {
  HISTORY_ITEM_LINK_CLASS,
  SearchHistorySection,
} from "@/client/features/ai-search/components/SearchHistorySection";
import { formatModelLabel } from "@/client/features/ai-search/platformLabels";
import type { PromptExplorerSearchHistoryItem } from "@/client/hooks/usePromptExplorerSearchHistory";

type Props = {
  projectId: string;
  history: PromptExplorerSearchHistoryItem[];
  historyLoaded: boolean;
  onRemoveHistoryItem: (timestamp: number) => void;
};

export function PromptExplorerHistorySection({ projectId, ...props }: Props) {
  return (
    <SearchHistorySection
      {...props}
      emptyIcon={MessageSquare}
      emptyMessage="Enter a prompt to compare model answers"
      noun="prompt"
      renderItemLink={(item, content) => (
        <Link
          from="/p/$projectId/prompt-explorer"
          to="/p/$projectId/prompt-explorer"
          params={{ projectId }}
          search={{
            q: item.prompt,
            models: item.models,
            web: item.webSearch ? undefined : false,
            cc:
              item.webSearchCountryCode === "US"
                ? undefined
                : item.webSearchCountryCode,
            hb: item.highlightBrand || undefined,
          }}
          replace
          className={HISTORY_ITEM_LINK_CLASS}
        >
          {content}
        </Link>
      )}
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
