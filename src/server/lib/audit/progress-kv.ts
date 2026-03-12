/**
 * KV-based live crawl progress.
 *
 * During a crawl, each crawled URL is appended to a KV key so the UI can
 * poll for a live feed of crawled pages (most recent first).
 *
 * The KV entry auto-expires after 30 minutes — it's only needed while
 * the audit is running. Once finalized, we explicitly delete it.
 */
import { env } from "cloudflare:workers";
import { z } from "zod";
import { jsonCodec } from "@/shared/json";

const KV_PREFIX = "audit-progress:";
const TTL_SECONDS = 30 * 60; // 30 minutes
const MAX_ENTRIES = 300;
const jsonUnknownCodec = jsonCodec(z.unknown());

export interface CrawledUrlEntry {
  url: string;
  statusCode: number;
  title: string;
  /** Unix timestamp ms when this page was crawled */
  crawledAt: number;
}

function isCrawledUrlEntry(value: unknown): value is CrawledUrlEntry {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    url?: unknown;
    statusCode?: unknown;
    title?: unknown;
    crawledAt?: unknown;
  };
  return (
    typeof candidate.url === "string" &&
    typeof candidate.statusCode === "number" &&
    typeof candidate.title === "string" &&
    typeof candidate.crawledAt === "number"
  );
}

function parseCrawledEntries(json: string | null): CrawledUrlEntry[] {
  if (!json) return [];
  const parsed = jsonUnknownCodec.safeParse(json);
  if (!parsed.success || !Array.isArray(parsed.data)) return [];
  return parsed.data.filter(isCrawledUrlEntry);
}

function key(auditId: string): string {
  return `${KV_PREFIX}${auditId}`;
}

/**
 * Append a crawled URL entry to the progress list.
 * Newest entries are prepended so the array is sorted newest-first.
 */
async function pushCrawledUrl(
  auditId: string,
  entry: CrawledUrlEntry,
): Promise<void> {
  await pushCrawledUrls(auditId, [entry]);
}

/**
 * Append multiple crawled URL entries in one KV write.
 * New entries are prepended and the list is capped.
 */
async function pushCrawledUrls(
  auditId: string,
  nextEntries: CrawledUrlEntry[],
): Promise<void> {
  if (nextEntries.length === 0) return;

  const k = key(auditId);
  const existing = await env.KV.get(k, "text");
  const entries = parseCrawledEntries(existing);
  const merged = [...nextEntries, ...entries].slice(0, MAX_ENTRIES);

  await env.KV.put(k, JSON.stringify(merged), {
    expirationTtl: TTL_SECONDS,
  });
}

/**
 * Read all crawled URL entries for a running audit.
 * Returns newest-first.
 */
async function getCrawledUrls(auditId: string): Promise<CrawledUrlEntry[]> {
  const data = await env.KV.get(key(auditId), "text");
  return parseCrawledEntries(data);
}

/**
 * Delete the progress key (called after audit completes).
 */
async function clear(auditId: string): Promise<void> {
  await env.KV.delete(key(auditId));
}

export const AuditProgressKV = {
  pushCrawledUrl,
  pushCrawledUrls,
  getCrawledUrls,
  clear,
} as const;
