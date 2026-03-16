import { buildCacheKey, getCached, setCached } from "@/server/lib/kv-cache";
import { normalizeBacklinksTarget } from "@/server/lib/dataforseoBacklinks";
import {
  profileBacklinksOverview,
  profileReferringDomainsRows,
  profileTopPagesRows,
  type BacklinksCache,
} from "@/server/features/backlinks/services/backlinksServiceData";
import type { BacklinksOverviewResult } from "@/server/features/backlinks/services/backlinksOverviewSchema";
import type { BacklinksLookupInput } from "@/types/schemas/backlinks";

const defaultCache: BacklinksCache = {
  get: getCached,
  set: setCached,
};

function createBacklinksService(cache: BacklinksCache = defaultCache) {
  return {
    async getOverview(
      input: BacklinksLookupInput,
    ): Promise<BacklinksOverviewResult> {
      const profile = await profileBacklinksOverview(
        cache,
        buildOverviewCacheKey(input),
        input,
      );
      return profile.overview;
    },
    async profileOverview(input: BacklinksLookupInput) {
      return profileBacklinksOverview(
        cache,
        buildOverviewCacheKey(input),
        input,
      );
    },
    async getReferringDomains(input: BacklinksLookupInput) {
      const profile = await profileReferringDomainsRows(
        cache,
        buildTabCacheKey("backlinks:referring-domains", input),
        input,
      );
      return profile.rows;
    },
    async profileReferringDomains(input: BacklinksLookupInput) {
      return profileReferringDomainsRows(
        cache,
        buildTabCacheKey("backlinks:referring-domains", input),
        input,
      );
    },
    async getTopPages(input: BacklinksLookupInput) {
      const profile = await profileTopPagesRows(
        cache,
        buildTabCacheKey("backlinks:top-pages", input),
        input,
      );
      return profile.rows;
    },
    async profileTopPages(input: BacklinksLookupInput) {
      return profileTopPagesRows(
        cache,
        buildTabCacheKey("backlinks:top-pages", input),
        input,
      );
    },
  } as const;
}

function buildOverviewCacheKey(input: BacklinksLookupInput) {
  const normalizedTarget = normalizeBacklinksTarget(input.target, {
    scope: input.scope,
  });
  return buildCacheKey("backlinks:overview", {
    target: normalizedTarget.apiTarget,
    scope: normalizedTarget.scope,
    includeSubdomains: input.includeSubdomains,
    includeIndirectLinks: input.includeIndirectLinks,
    excludeInternalBacklinks: input.excludeInternalBacklinks,
    status: input.status,
  });
}

function buildTabCacheKey(prefix: string, input: BacklinksLookupInput) {
  const normalizedTarget = normalizeBacklinksTarget(input.target, {
    scope: input.scope,
  });
  return buildCacheKey(prefix, {
    target: normalizedTarget.apiTarget,
    scope: normalizedTarget.scope,
    includeSubdomains: input.includeSubdomains,
    includeIndirectLinks: input.includeIndirectLinks,
    excludeInternalBacklinks: input.excludeInternalBacklinks,
    status: input.status,
  });
}

export const BacklinksService = createBacklinksService();
export { createBacklinksService };
