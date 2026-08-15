import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import type { KeywordRow } from "@/client/features/domain/types";

type SaveMutation = (payload: {
  projectId: string;
  keywords: string[];
  locationCode?: number;
  metrics?: Array<{
    keyword: string;
    searchVolume?: number | null;
    cpc?: number | null;
    keywordDifficulty?: number | null;
  }>;
}) => void;

type SaveOptions = {
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
};

export function saveSelectedKeywords({
  selectedKeywords,
  filteredKeywords,
  save,
  projectId,
  locationCode,
}: {
  selectedKeywords: Set<string>;
  filteredKeywords: KeywordRow[];
  save: (payload: Parameters<SaveMutation>[0], opts?: SaveOptions) => void;
  projectId: string;
  locationCode?: number;
}) {
  if (selectedKeywords.size === 0) {
    toast.error("请先选择至少一个关键词");
    return;
  }

  const selectedRows = filteredKeywords.filter((row) =>
    selectedKeywords.has(row.keyword),
  );
  save(
    {
      projectId,
      keywords: [...selectedKeywords],
      locationCode,
      metrics: selectedRows.map((row) => ({
        keyword: row.keyword,
        searchVolume: row.searchVolume,
        cpc: row.cpc,
        keywordDifficulty: row.keywordDifficulty,
      })),
    },
    {
      onSuccess: () => {
        captureClientEvent("keyword:save", {
          source_feature: "domain_overview",
          keyword_count: selectedKeywords.size,
        });
        toast.success(`已保存 ${selectedKeywords.size} 个关键词`);
      },
      onError: (error: unknown) => {
        toast.error(getStandardErrorMessage(error, "保存失败。"));
      },
    },
  );
}
