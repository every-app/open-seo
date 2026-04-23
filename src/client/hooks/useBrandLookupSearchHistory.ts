import { z } from "zod";
import { useTimestampedSearchHistory } from "@/client/hooks/useTimestampedSearchHistory";

const brandLookupSearchBodySchema = z.object({
  query: z.string(),
});

type BrandLookupSearchBody = z.infer<typeof brandLookupSearchBodySchema>;

export type BrandLookupSearchHistoryItem = BrandLookupSearchBody & {
  timestamp: number;
};

export function useBrandLookupSearchHistory(projectId: string) {
  return useTimestampedSearchHistory({
    storageKey: `brand-lookup-search-history:${projectId}`,
    bodySchema: brandLookupSearchBodySchema,
    isSame: (a, b) => a.query === b.query,
  });
}
