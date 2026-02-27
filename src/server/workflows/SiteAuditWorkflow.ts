/**
 * Cloudflare Workflow for site audit crawling.
 *
 * Each step is durable — if a step fails, it retries without redoing
 * completed steps.
 *
 * Flow:
 *   Step 1:  Discovery (robots.txt + sitemaps)
 *   Step 2-N: Crawl page batches (parallel fetch+analyze per step)
 *   Step N+1: Select PSI sample
 *   Step N+2-M: PSI batches (parallel URLs, mobile+desktop per URL)
 *   Step M+1: Finalize (batch write to D1)
 */
import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import {
  discoverUrls,
  fetchRobotsTxt,
  type RobotsResult,
} from "@/server/lib/audit/discovery";
import { analyzeHtml } from "@/server/lib/audit/page-analyzer";
import { fetchPsiResult, selectPsiSample } from "@/server/lib/audit/psi";
import {
  normalizeUrl,
  isSameOrigin,
  getOrigin,
} from "@/server/lib/audit/url-utils";
import { putTextToR2 } from "@/server/lib/r2";
import { AuditRepository } from "@/server/repositories/AuditRepository";
import { AuditProgressKV } from "@/server/lib/audit/progress-kv";
import type { AuditConfig, PsiResult } from "@/server/lib/audit/types";

interface AuditParams {
  auditId: string;
  projectId: string;
  startUrl: string;
  config: AuditConfig;
}

const CRAWL_CONCURRENCY = 25;
const PSI_URL_CONCURRENCY = 6;

/** Serializable page data passed between workflow steps. */
interface StepPageResult {
  id: string;
  url: string;
  statusCode: number;
  redirectUrl: string | null;
  // Metadata
  title: string;
  metaDescription: string;
  canonicalUrl: string | null;
  robotsMeta: string | null;
  // Open Graph
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  // Headings
  h1Count: number;
  h2Count: number;
  h3Count: number;
  h4Count: number;
  h5Count: number;
  h6Count: number;
  headingOrder: number[];
  // Content
  wordCount: number;
  // Images
  imagesTotal: number;
  imagesMissingAlt: number;
  images: Array<{ src: string | null; alt: string | null }>;
  // Links
  internalLinks: string[];
  externalLinks: string[];
  // Structured data
  hasStructuredData: boolean;
  // Hreflang
  hreflangTags: string[];
  // Indexability
  isIndexable: boolean;
  // Performance
  responseTimeMs: number;
}

type PsiUploadContext = {
  projectId: string;
  auditId: string;
};

function shouldQueueCrawlLink(
  link: string,
  origin: string,
  robots: RobotsResult,
  visited: Set<string>,
  queued: Set<string>,
): boolean {
  return (
    isSameOrigin(link, origin) &&
    robots.isAllowed(link) &&
    !visited.has(link) &&
    !queued.has(link)
  );
}

function countPsiBatchResults(results: PsiResult[]): {
  completed: number;
  failed: number;
} {
  let completed = 0;
  let failed = 0;
  for (const result of results) {
    if (result.errorMessage) {
      failed += 1;
      continue;
    }
    completed += 1;
  }
  return { completed, failed };
}

export class SiteAuditWorkflow extends WorkflowEntrypoint<Env, AuditParams> {
  async run(event: WorkflowEvent<AuditParams>, step: WorkflowStep) {
    const { auditId, projectId, startUrl, config } = event.payload;
    const origin = getOrigin(startUrl);
    const maxPages = config.maxPages;

    try {
      // ─── Step 1: Discovery ───────────────────────────────────────
      const discovery = await step.do("discover-urls", async () => {
        const result = await discoverUrls(origin, maxPages);
        // Update audit with discovery info
        await AuditRepository.updateAuditProgress(auditId, {
          pagesTotal: Math.min(result.urls.length + 1, maxPages),
          currentPhase: "crawling",
        });
        return {
          sitemapUrls: result.urls,
          // We can't serialize the robots function, so we store the raw result
          // and re-fetch robots in crawl steps if needed
        };
      });

      const robots = await fetchRobotsTxt(origin);
      // ─── Step 2-N: Crawl pages ──────────────────────────────────
      const visited = new Set<string>();
      const queue: string[] = [];
      const queued = new Set<string>();
      const allPages: StepPageResult[] = [];

      // Seed the queue
      const normalizedStart = normalizeUrl(startUrl) ?? startUrl;
      if (
        robots.isAllowed(normalizedStart) &&
        isSameOrigin(normalizedStart, origin)
      ) {
        queue.push(normalizedStart);
        queued.add(normalizedStart);
      }

      // Add sitemap URLs to queue
      for (const sitemapUrl of discovery.sitemapUrls) {
        const normalized = normalizeUrl(sitemapUrl);
        if (
          normalized &&
          isSameOrigin(normalized, origin) &&
          robots.isAllowed(normalized)
        ) {
          if (!visited.has(normalized) && !queued.has(normalized)) {
            queue.push(normalized);
            queued.add(normalized);
          }
        }
      }

      let crawlBatchIndex = 0;

      while (queue.length > 0 && allPages.length < maxPages) {
        const remaining = maxPages - allPages.length;
        const batchSize = Math.min(CRAWL_CONCURRENCY, remaining);
        const urlsToCrawl: string[] = [];

        while (queue.length > 0 && urlsToCrawl.length < batchSize) {
          const url = queue.shift()!;
          queued.delete(url);

          if (visited.has(url)) continue;
          if (!robots.isAllowed(url)) continue;
          visited.add(url);
          urlsToCrawl.push(url);
        }

        if (urlsToCrawl.length === 0) continue;

        crawlBatchIndex++;

        const crawledBatch = await step.do(
          `crawl-batch-${crawlBatchIndex}`,
          async () => {
            const settled = await Promise.allSettled(
              urlsToCrawl.map((url) => crawlPage(url, origin)),
            );

            return settled.flatMap((result) => {
              if (result.status === "fulfilled" && result.value) {
                return [result.value];
              }
              return [];
            });
          },
        );

        allPages.push(...crawledBatch);

        // Add discovered internal links to queue
        for (const pageResult of crawledBatch) {
          for (const link of pageResult.internalLinks.filter((candidate) =>
            shouldQueueCrawlLink(candidate, origin, robots, visited, queued),
          )) {
            queue.push(link);
            queued.add(link);
          }
        }

        // Push crawled URLs to KV for live progress (batched)
        await step.do(`kv-progress-batch-${crawlBatchIndex}`, async () => {
          await AuditProgressKV.pushCrawledUrls(
            auditId,
            crawledBatch.map((pageResult) => ({
              url: pageResult.url,
              statusCode: pageResult.statusCode,
              title: pageResult.title,
              crawledAt: Date.now(),
            })),
          );
        });

        // Update D1 progress each batch
        await step.do(`progress-batch-${crawlBatchIndex}`, async () => {
          await AuditRepository.updateAuditProgress(auditId, {
            pagesCrawled: allPages.length,
            pagesTotal: Math.min(visited.size + queue.length, maxPages),
          });
        });
      }

      // ─── PSI Phase ──────────────────────────────────────────────
      const psiResults: PsiResult[] = [];

      if (config.psiStrategy !== "none" && config.psiApiKey) {
        const psiSample = await step.do("select-psi-sample", async () => {
          const pagesForSample = allPages.map((p) => ({
            id: p.id,
            url: p.url,
            statusCode: p.statusCode,
          }));
          const sample = selectPsiSample(
            pagesForSample,
            startUrl,
            config.psiStrategy,
          );

          await AuditRepository.updateAuditProgress(auditId, {
            currentPhase: "psi",
            psiTotal: sample.length * 2,
            psiCompleted: 0,
            psiFailed: 0,
          });

          return sample;
        });

        let psiCompleted = 0;
        let psiFailed = 0;

        const updatePsiProgress = async (stepName: string) => {
          await step.do(stepName, async () => {
            await AuditRepository.updateAuditProgress(auditId, {
              psiCompleted,
              psiFailed,
            });
          });
        };

        const psiWork = psiSample.flatMap((psiUrl) => {
          const page = allPages.find((p) => p.url === psiUrl);
          if (!page) return [];
          return [{ url: psiUrl, pageId: page.id }];
        });

        let psiBatchIndex = 0;
        for (let i = 0; i < psiWork.length; i += PSI_URL_CONCURRENCY) {
          const batch = psiWork.slice(i, i + PSI_URL_CONCURRENCY);
          psiBatchIndex += 1;

          const psiBatchResults = await step.do(
            `psi-batch-${psiBatchIndex}`,
            async () => {
              const perUrlResults = await Promise.all(
                batch.map(async ({ url, pageId }) => {
                  const [mobileResult, desktopResult] = await Promise.all([
                    fetchPsiAndUploadToR2(
                      url,
                      pageId,
                      "mobile",
                      config.psiApiKey!,
                      { projectId, auditId },
                    ),
                    fetchPsiAndUploadToR2(
                      url,
                      pageId,
                      "desktop",
                      config.psiApiKey!,
                      { projectId, auditId },
                    ),
                  ]);

                  return [mobileResult, desktopResult];
                }),
              );

              return perUrlResults.flat();
            },
          );

          psiResults.push(...psiBatchResults);

          const counts = countPsiBatchResults(psiBatchResults);
          psiFailed += counts.failed;
          psiCompleted += counts.completed;

          await updatePsiProgress(`psi-progress-batch-${psiBatchIndex}`);
        }
      }

      // ─── Finalize ────────────────────────────────────────────────
      await step.do("finalize", async () => {
        await AuditRepository.updateAuditProgress(auditId, {
          currentPhase: "finalizing",
        });

        // Batch write all results to D1
        await AuditRepository.batchWriteResults(auditId, allPages, psiResults);

        // Mark audit as completed
        await AuditRepository.completeAudit(auditId, {
          pagesCrawled: allPages.length,
          pagesTotal: allPages.length,
        });

        // Clean up KV progress data (no longer needed once results are in D1)
        await AuditProgressKV.clear(auditId);
      });
    } catch (error) {
      console.error(`Audit ${auditId} failed:`, error);
      await step.do("mark-failed", async () => {
        await AuditRepository.failAudit(auditId);
      });
      throw error;
    }
  }
}

async function fetchPsiAndUploadToR2(
  url: string,
  pageId: string,
  strategy: "mobile" | "desktop",
  apiKey: string,
  context: PsiUploadContext,
): Promise<PsiResult> {
  const result = await fetchPsiResult(url, pageId, strategy, apiKey);

  if (result.rawPayloadJson) {
    const key = `site-audit/${context.projectId}/${context.auditId}/${pageId}-${strategy}.json`;
    const uploaded = await putTextToR2(key, result.rawPayloadJson);
    result.r2Key = uploaded.key;
    result.payloadSizeBytes = uploaded.sizeBytes;
    result.rawPayloadJson = null;
  }

  return result;
}

/**
 * Fetch and analyze a single page. Returns null if the page can't be fetched.
 */
async function crawlPage(
  url: string,
  crawlOrigin: string,
): Promise<StepPageResult | null> {
  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "OpenSEO-Audit/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });

    const responseTimeMs = Date.now() - startTime;
    const statusCode = response.status;
    const finalUrl = normalizeUrl(response.url) ?? response.url;

    if (!isSameOrigin(finalUrl, crawlOrigin)) {
      return null;
    }

    // Detect redirects
    const redirectUrl =
      response.redirected && response.url !== url ? response.url : null;

    // Only parse HTML responses
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return {
        id: crypto.randomUUID(),
        url: finalUrl,
        statusCode,
        redirectUrl,
        title: "",
        metaDescription: "",
        canonicalUrl: null,
        robotsMeta: null,
        ogTitle: null,
        ogDescription: null,
        ogImage: null,
        h1Count: 0,
        h2Count: 0,
        h3Count: 0,
        h4Count: 0,
        h5Count: 0,
        h6Count: 0,
        headingOrder: [],
        wordCount: 0,
        imagesTotal: 0,
        imagesMissingAlt: 0,
        images: [],
        internalLinks: [],
        externalLinks: [],
        hasStructuredData: false,
        hreflangTags: [],
        isIndexable: false,
        responseTimeMs,
      };
    }

    const html = await response.text();
    const analysis = analyzeHtml(
      html,
      finalUrl,
      statusCode,
      responseTimeMs,
      redirectUrl,
    );

    // Determine indexability
    const isIndexable = !(
      analysis.robotsMeta?.toLowerCase().includes("noindex") ?? false
    );

    // Count headings by level
    const h2Count = analysis.headingOrder.filter((h) => h === 2).length;
    const h3Count = analysis.headingOrder.filter((h) => h === 3).length;
    const h4Count = analysis.headingOrder.filter((h) => h === 4).length;
    const h5Count = analysis.headingOrder.filter((h) => h === 5).length;
    const h6Count = analysis.headingOrder.filter((h) => h === 6).length;

    return {
      id: crypto.randomUUID(),
      url: finalUrl,
      statusCode,
      redirectUrl,
      title: analysis.title,
      metaDescription: analysis.metaDescription,
      canonicalUrl: analysis.canonical,
      robotsMeta: analysis.robotsMeta,
      ogTitle: analysis.ogTitle,
      ogDescription: analysis.ogDescription,
      ogImage: analysis.ogImage,
      h1Count: analysis.h1s.length,
      h2Count,
      h3Count,
      h4Count,
      h5Count,
      h6Count,
      headingOrder: analysis.headingOrder,
      wordCount: analysis.wordCount,
      imagesTotal: analysis.images.length,
      imagesMissingAlt: analysis.images.filter(
        (img) => !img.alt || img.alt === "",
      ).length,
      images: analysis.images,
      internalLinks: analysis.internalLinks,
      externalLinks: analysis.externalLinks,
      hasStructuredData: analysis.hasStructuredData,
      hreflangTags: analysis.hreflangTags,
      isIndexable,
      responseTimeMs,
    };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    console.warn(`Failed to crawl ${url}:`, error);

    return {
      id: crypto.randomUUID(),
      url,
      statusCode: 0,
      redirectUrl: null,
      title: "",
      metaDescription: "",
      canonicalUrl: null,
      robotsMeta: null,
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
      h1Count: 0,
      h2Count: 0,
      h3Count: 0,
      h4Count: 0,
      h5Count: 0,
      h6Count: 0,
      headingOrder: [],
      wordCount: 0,
      imagesTotal: 0,
      imagesMissingAlt: 0,
      images: [],
      internalLinks: [],
      externalLinks: [],
      hasStructuredData: false,
      hreflangTags: [],
      isIndexable: false,
      responseTimeMs,
    };
  }
}
