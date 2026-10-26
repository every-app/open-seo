import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  buildCacheKey,
  cacheObjectPrefix,
  getCached,
  setCached,
} from "@/server/lib/r2-cache";
import { deleteR2Prefix } from "@/server/lib/r2";
import { DataRefreshClaimRepository } from "@/server/features/dashboard/repositories/DataRefreshClaimRepository";
import { AppError, asAppError } from "@/server/lib/errors";

// Cached provider responses are disposable; keep them longer than their refresh
// cadence so credit/provider failures can display the last successful result.
async function readThrough<T>(input: {
  namespace: string;
  organizationId: string;
  params: Record<string, unknown>;
  schema: z.ZodType<T>;
  maxAgeMs: number;
  load: () => Promise<T>;
  // Results that should not outlive the request, such as a dead Google grant:
  // a reconnect only rewrites the account row, so the cache key would not change.
  shouldCache?: (value: T) => boolean;
}) {
  const key = await buildCacheKey(input.namespace, {
    ...input.params,
    organizationId: input.organizationId,
  });
  const schema = z.object({ value: input.schema, fetchedAt: z.string() });
  const parsed = schema.safeParse(await getCached(key));
  const cached = parsed.success ? parsed.data : null;
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < input.maxAgeMs) {
    return { ...cached, stale: false, refreshError: null };
  }
  const token = await DataRefreshClaimRepository.claim(
    key,
    input.organizationId,
  );
  if (!token) {
    if (cached)
      return {
        ...cached,
        stale: true,
        refreshError: "Update already running or temporarily paused.",
      };
    throw new AppError(
      "RATE_LIMITED",
      "An update is already running or temporarily paused. Try again shortly.",
    );
  }
  try {
    // Recheck after winning the claim: a preceding request may have completed
    // between the initial cache read and this database write.
    const latest = schema.safeParse(await getCached(key));
    if (
      latest.success &&
      Date.now() - Date.parse(latest.data.fetchedAt) < input.maxAgeMs
    ) {
      await DataRefreshClaimRepository.finish(key, token, 0);
      return { ...latest.data, stale: false, refreshError: null };
    }
    const value = input.schema.parse(await input.load());
    const result = { value, fetchedAt: new Date().toISOString() };
    if (input.shouldCache?.(value) ?? true)
      await setCached(key, result, 90 * 86400);
    await DataRefreshClaimRepository.finish(key, token, 0);
    return { ...result, stale: false, refreshError: null };
  } catch (error) {
    await DataRefreshClaimRepository.finish(key, token, 5 * 60_000);
    if (!cached) throw error;
    return {
      ...cached,
      stale: true,
      refreshError: asAppError(error)?.code ?? "UPSTREAM_UNAVAILABLE",
    };
  }
}

// Search Console rows are Google data the privacy policy lets users remove, so
// every cached copy for a project sits under one prefix that disconnect,
// project deletion, and account erasure can drop.
function gscNamespace(projectId: string, name: string) {
  return `dashboard:gsc:${projectId}:${name}`;
}

async function deleteGscCache(projectId: string) {
  return deleteR2Prefix(
    env.R2,
    cacheObjectPrefix(`dashboard:gsc:${projectId}`),
  );
}

export const DashboardCacheService = {
  readThrough,
  gscNamespace,
  deleteGscCache,
};
