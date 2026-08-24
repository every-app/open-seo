import { waitUntil } from "cloudflare:workers";
import {
  queryHistoryRecord,
  queryRecord,
  type CruxFormFactor,
} from "@/server/lib/cruxClient";
import { AppError } from "@/server/lib/errors";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import {
  shapeCruxHistory,
  shapeCruxRecord,
} from "@/server/features/crux/cruxShaping";
import { cruxSnapshotSchema, type CruxSnapshot } from "@/types/schemas/crux";

/** CrUX publishes daily; a day-old snapshot is fresh enough. CrUX data is
 *  public per-origin, so cache entries are shared across projects. */
const CRUX_SNAPSHOT_TTL_SECONDS = 86_400;

type CruxSnapshotResult =
  | { status: "ok"; snapshot: CruxSnapshot }
  | { status: "no_data" };

/** Project domains are stored as bare hosts; CrUX keys origins by scheme. */
function resolveOrigin(domain: string | null): string | null {
  if (!domain) return null;
  return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
}

async function getSnapshot(input: {
  domain: string | null;
  url?: string;
  formFactor: CruxFormFactor;
}): Promise<CruxSnapshotResult> {
  const origin = input.url ? null : resolveOrigin(input.domain);
  if (!input.url && !origin) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Provide a url or set the project's domain first",
    );
  }
  const target = input.url ? { url: input.url } : { origin: origin ?? "" };

  const cacheKey = await buildCacheKey("crux:snapshot", {
    ...target,
    formFactor: input.formFactor,
  });
  const cached = cruxSnapshotSchema.safeParse(await getCached(cacheKey));
  if (cached.success) {
    return { status: "ok", snapshot: cached.data };
  }

  const [recordResult, historyResult] = await Promise.all([
    queryRecord({ ...target, formFactor: input.formFactor }),
    queryHistoryRecord({ ...target, formFactor: input.formFactor }),
  ]);
  // No current record means CrUX has nothing to show; not cached so the card
  // recovers as soon as the origin enters the dataset.
  if (recordResult.status === "no_data") {
    return { status: "no_data" };
  }

  const snapshot: CruxSnapshot = {
    record: shapeCruxRecord(recordResult.record),
    history:
      historyResult.status === "ok"
        ? shapeCruxHistory(historyResult.record)
        : [],
    fetchedAt: new Date().toISOString(),
  };

  // waitUntil, not void: workerd cancels unregistered pending I/O once the
  // response is sent, so a fire-and-forget put never persists the cache.
  waitUntil(
    setCached(cacheKey, snapshot, CRUX_SNAPSHOT_TTL_SECONDS).catch((error) => {
      console.error("crux.snapshot.cache-write failed:", error);
    }),
  );

  return { status: "ok", snapshot };
}

export const CruxService = {
  getSnapshot,
};
