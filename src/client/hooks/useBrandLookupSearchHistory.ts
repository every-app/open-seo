import { z } from "zod";
import { useTimestampedSearchHistory } from "@/client/hooks/useTimestampedSearchHistory";
import { researchScopeSchema } from "@/shared/researchScope";

const brandLookupSearchBodySchema = z.object({
  query: z.string(),
  // Optional/defaulted so pre-existing history entries (query only) still parse.
  competitors: z.array(z.string()).optional().default([]),
  // Absent on entries saved before scopes existed, and on lookups that used
  // the query's default scope — both re-derive the default on restore.
  scope: researchScopeSchema.optional(),
});

type BrandLookupSearchBody = z.infer<typeof brandLookupSearchBodySchema>;

export type BrandLookupSearchHistoryItem = BrandLookupSearchBody & {
  timestamp: number;
};

export function useBrandLookupSearchHistory(projectId: string) {
  return useTimestampedSearchHistory({
    storageKey: `brand-lookup-search-history:${projectId}`,
    bodySchema: brandLookupSearchBodySchema,
    // Competitor set is part of the identity: a plain lookup must not replace
    // the saved (already paid for) Share-of-Voice comparison of the same brand.
    isSame: (a, b) =>
      a.query === b.query &&
      a.competitors.join(",") === b.competitors.join(",") &&
      a.scope === b.scope,
  });
}
