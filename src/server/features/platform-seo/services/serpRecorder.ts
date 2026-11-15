import {
  KNOWN_PARASITE_PLATFORMS,
  platformDomain,
} from "../platforms/platformDomain";
import {
  PlatformDiscoveryRepository as repo,
  type NewPlatformInput,
  type ObservationInput,
} from "../repositories/PlatformDiscoveryRepository";
import { classifyPlatforms } from "./platformClassifier";
import { withPgClient } from "@/db";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { runAfterResponse } from "@/server/lib/background";
import type { SerpLiveItem, SerpReadsQuery } from "@/server/lib/dataforseo";
import { PS_SERP_DEPTH } from "@/shared/platform-seo";

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Keyword form shared by observations and the keywords they're joined to. */
export function normalizeSerpKeyword(keyword: string) {
  return keyword.trim().toLowerCase().replace(/\s+/g, " ");
}

type ResultRow = {
  domain: string;
  position: number;
  url: string | null;
  title: string | null;
  resultKey: string;
};

/**
 * One row per organic result on Google's first two pages, across every read
 * of the run, each at the best position any read gave it. A platform holding
 * two spots (two Reddit threads) keeps both.
 */
function resultRows(reads: SerpLiveItem[][]): ResultRow[] {
  const rows = new Map<string, ResultRow>();
  for (const read of reads) {
    for (const item of read) {
      if (item.type !== "organic") continue;
      const position = item.rank_group ?? item.rank_absolute;
      if (!position || position > PS_SERP_DEPTH) continue;
      const domain = platformDomain(item);
      if (!domain) continue;
      const title = item.title?.trim().slice(0, 300) || null;
      const resultKey = `${domain}|${(title ?? item.url ?? "").toLowerCase()}`;
      const existing = rows.get(resultKey);
      if (existing && existing.position <= position) continue;
      rows.set(resultKey, {
        domain,
        position,
        url: item.url?.slice(0, 2000) ?? null,
        title,
        resultKey: resultKey.slice(0, 400),
      });
    }
  }
  return [...rows.values()];
}

/**
 * Records a SERP the app just paid for: every result as an observation, and
 * every site not yet on the organization's platform list as a new platform.
 * Known publishing platforms join as parasites; the rest wait for review,
 * after an AI first pass in the background. Never throws: a recording
 * problem must not cost the caller the results they paid for.
 */
export async function recordSerpReads(params: {
  customer: BillingCustomerContext;
  query: SerpReadsQuery;
  taskIds: string[];
  reads: SerpLiveItem[][];
}) {
  // A city or region SERP isn't the national page the opportunity labels
  // describe, and observations are keyed by country location code.
  if (params.query.locationName) return;
  try {
    await withPgClient(() => record(params));
  } catch (error) {
    console.error("platform-seo.record-serp failed:", error);
  }
}

async function record({
  customer,
  query,
  taskIds,
  reads,
}: {
  customer: BillingCustomerContext;
  query: SerpReadsQuery;
  taskIds: string[];
  reads: SerpLiveItem[][];
}) {
  const rows = resultRows(reads);
  if (rows.length === 0) return;
  const organizationId = customer.organizationId;
  // The paid task ids identify the run; collecting it again (a free replay)
  // adds missing rows but must not count the platforms twice.
  const sortedTaskIds = [...taskIds];
  sortedTaskIds.sort();
  const runKey = (await sha256Hex(sortedTaskIds.join(","))).slice(0, 40);
  const keyword = normalizeSerpKeyword(query.keyword);
  const observedAt = new Date().toISOString();
  // Domains this run already recorded: a replay that collects late reads
  // adds only the platforms those reads brought, so nothing counts twice.
  const recordedBefore = new Set(
    await repo.listRunDomains(organizationId, runKey),
  );

  await repo.insertObservations(
    rows.map(
      (row): ObservationInput => ({
        organizationId,
        projectId: customer.projectId ?? null,
        runKey,
        keyword,
        locationCode: query.locationCode,
        languageCode: query.languageCode,
        device: query.device ?? "desktop",
        observedAt,
        ...row,
      }),
    ),
  );

  // Best result per platform on this page.
  const best = new Map<string, ResultRow>();
  for (const row of rows) {
    const current = best.get(row.domain);
    if (!current || row.position < current.position) best.set(row.domain, row);
  }

  const seen = await repo.upsertSeenPlatforms(
    [...best.values()].map((row): NewPlatformInput => {
      const isKnown = KNOWN_PARASITE_PLATFORMS.has(row.domain);
      return {
        organizationId,
        domain: row.domain,
        status: isKnown ? "parasite" : "pending",
        source: isKnown ? "seed" : "serp",
        exampleKeyword: keyword,
        exampleUrl: row.url,
        exampleTitle: row.title,
        bestPosition: row.position,
        // A platform this run already counted only gets its position kept.
        seenCount: recordedBefore.has(row.domain) ? 0 : 1,
        lastSeenAt: observedAt,
      };
    }),
  );

  // A seen count of 1 on a platform new to this run means this recording
  // added it to the list.
  const toClassify = seen
    .filter(
      (platform) =>
        !recordedBefore.has(platform.domain) &&
        platform.status === "pending" &&
        platform.seenCount === 1 &&
        !platform.aiClassifiedAt,
    )
    .map((platform) => platform.id);
  if (toClassify.length > 0) {
    await runAfterResponse(
      classifyPlatforms(customer, { ids: toClassify }).catch(
        (error: unknown) => {
          // No credits, no OpenRouter key, or a model hiccup: the platforms
          // simply wait for the "AI pass" button.
          console.warn("platform-seo.classify skipped:", error);
        },
      ),
    );
  }
}
