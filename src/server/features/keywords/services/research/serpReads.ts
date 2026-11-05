import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import {
  createDataforseoClient,
  fetchSerpTaskResult,
  type SerpLiveItem,
  type SerpQuery,
} from "@/server/lib/dataforseo";
import { AppError } from "@/server/lib/errors";
import { getCached, setCached } from "@/server/lib/r2-cache";

// Polling stops 40 s into the call so it answers inside the 60 s many MCP
// clients wait. Reads usually all finish within about 20 s.
const READ_COLLECT_MS = 40_000;
const READ_POLL_INTERVAL_MS = 3000;
// Lets a call that starts late, after a slow post, still collect what's ready.
const READ_POLL_MIN_MS = 1000;
// The posted task ids are the receipt: the same query again within this window
// collects those reads instead of buying them twice, so a caller that lost the
// response, or got "processing", can simply call again.
const READ_RECEIPT_TTL_SECONDS = 12 * 60 * 60;
const readReceiptSchema = z.array(z.string()).min(1);

// Reciprocal rank fusion's usual constant. It's large enough that a site on
// another read beats any move up the page, so one poisoned read can't put its
// sites above the ones the reads agree on.
const FUSION_K = 60;

export type MergedSerpItem = SerpLiveItem & {
  /** How many of the merged reads showed this row. */
  seenIn: number;
};

type MergedSerpOutcome =
  | { status: "completed"; items: MergedSerpItem[] }
  /** Nothing is back yet; the same query again collects it at no charge. */
  | { status: "processing" }
  | { status: "failed"; error: unknown };

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** One organic row per site; a SERP feature row per type and site. */
function mergeKey(item: SerpLiveItem) {
  // DataForSEO's domain keeps "www." but a goto row's breadcrumb host doesn't.
  const site = item.domain?.toLowerCase().replace(/^www\./, "");
  return `${item.type}|${site ?? item.title ?? ""}`;
}

function bestPosition(item: SerpLiveItem) {
  return item.rank_group ?? item.rank_absolute ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Merges several reads of one SERP. Organic rows come first, the sites the
 * reads agree on at the top, each reported at the best position any read gave
 * it. SERP features follow in page order.
 */
function mergeSerpReads(reads: SerpLiveItem[][]): MergedSerpItem[] {
  const rows = new Map<
    string,
    { item: SerpLiveItem; seenIn: number; score: number }
  >();
  for (const read of reads) {
    const seenOnRead = new Set<string>();
    for (const item of read) {
      const key = mergeKey(item);
      // Rows arrive in page order, so a site's first row on a read is its best.
      if (seenOnRead.has(key)) continue;
      seenOnRead.add(key);
      const row = rows.get(key);
      const score = 1 / (FUSION_K + bestPosition(item));
      if (!row) {
        rows.set(key, { item, seenIn: 1, score });
        continue;
      }
      row.seenIn += 1;
      row.score += score;
      if (bestPosition(item) < bestPosition(row.item)) row.item = item;
    }
  }
  const all = [...rows.values()];
  const organic = all.filter((row) => row.item.type === "organic");
  organic.sort((a, b) => b.score - a.score);
  const features = all.filter((row) => row.item.type !== "organic");
  features.sort(
    (a, b) =>
      (a.item.rank_absolute ?? Number.MAX_SAFE_INTEGER) -
      (b.item.rank_absolute ?? Number.MAX_SAFE_INTEGER),
  );
  return [...organic, ...features].map((row) => ({
    ...row.item,
    seenIn: row.seenIn,
  }));
}

/** Polls one read until it finishes or the deadline passes. */
async function collectRead(taskId: string, deadline: number) {
  for (;;) {
    // A slow poll must not hold back the reads already in. A failed one says
    // nothing about the read, which is already paid for.
    const outcome = await fetchSerpTaskResult(
      taskId,
      AbortSignal.timeout(Math.max(deadline - Date.now(), READ_POLL_MIN_MS)),
    ).catch((error: unknown) => {
      console.warn(`serp-reads.poll failed for ${taskId}:`, error);
      return { status: "pending" as const };
    });
    if (
      outcome.status !== "pending" ||
      Date.now() + READ_POLL_INTERVAL_MS > deadline
    ) {
      return outcome;
    }
    await wait(READ_POLL_INTERVAL_MS);
  }
}

function forgetReceipt(receiptKey: string) {
  return setCached(receiptKey, null, 0).catch((error) => {
    console.error("serp-reads.receipt-reset failed:", error);
  });
}

async function collectMergedSerp(
  taskIds: string[],
  receiptKey: string,
  deadline: number,
): Promise<MergedSerpOutcome> {
  const reads = await Promise.all(
    taskIds.map((taskId) => collectRead(taskId, deadline)),
  );
  const items = mergeSerpReads(
    reads.flatMap((read) => (read.status === "completed" ? [read.items] : [])),
  );
  if (items.length > 0) return { status: "completed", items };
  if (reads.some((read) => read.status === "pending")) {
    return { status: "processing" };
  }

  // Forget the receipt so a retry posts fresh reads instead of replaying this
  // for the rest of the window: DataForSEO also reports "no results" transiently.
  await forgetReceipt(receiptKey);
  const failed = reads.find((read) => read.status === "failed");
  if (failed?.status === "failed") {
    return {
      status: "failed",
      error: new AppError(
        "UPSTREAM_UNAVAILABLE",
        `Every read of this search failed at DataForSEO: ${failed.message}`,
      ),
    };
  }
  return { status: "completed", items: [] };
}

/**
 * Reads each query several times and merges the reads, because any one read can
 * be a poisoned page. Reads that aren't back by the deadline are left out of
 * the merge; the same query again collects them at no charge. Resolves per
 * query, in order.
 */
export async function readMergedSerps(
  billing: BillingCustomerContext,
  requests: Array<{ query: SerpQuery; receiptKey: string }>,
): Promise<MergedSerpOutcome[]> {
  const deadline = Date.now() + READ_COLLECT_MS;
  const receipts = await Promise.all(
    requests.map(async ({ receiptKey }) => {
      const receipt = readReceiptSchema.safeParse(await getCached(receiptKey));
      return receipt.success ? receipt.data : null;
    }),
  );

  const toPost = requests.filter((_, index) => receipts[index] === null);
  // A batch that can't hold any credits rejects as a whole; report it on each
  // query being posted, so queries already paid for still return.
  const posted =
    toPost.length > 0
      ? await createDataforseoClient(billing)
          .serp.readsTaskPostBatch(toPost.map(({ query }) => query))
          .catch((reason: unknown) =>
            toPost.map(() => ({ status: "rejected" as const, reason })),
          )
      : [];

  return Promise.all(
    requests.map(async (request, index): Promise<MergedSerpOutcome> => {
      const receipt = receipts[index];
      if (receipt) {
        return collectMergedSerp(receipt, request.receiptKey, deadline);
      }
      const outcome = posted[toPost.indexOf(request)];
      if (outcome.status === "rejected") {
        return { status: "failed", error: outcome.reason };
      }
      // The reads are already paid for, so a failed receipt write must not fail
      // this call; it only means a repeat would buy them again.
      await setCached(
        request.receiptKey,
        outcome.value,
        READ_RECEIPT_TTL_SECONDS,
      ).catch((error) => {
        console.error("serp-reads.receipt-write failed:", error);
      });
      return collectMergedSerp(outcome.value, request.receiptKey, deadline);
    }),
  );
}
