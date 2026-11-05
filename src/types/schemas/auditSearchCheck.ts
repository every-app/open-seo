import { z } from "zod";
import {
  GSC_DATE_RANGES,
  GSC_MAX_ROW_LIMIT,
} from "@/server/features/gsc/searchAnalytics";
import {
  DEFAULT_DATE_RANGE,
  DEFAULT_MAX_INSPECTIONS,
  DEFAULT_MAX_NOT_CRAWLED_SHOWN,
  DEFAULT_MIN_IMPRESSIONS,
  MAX_INSPECTIONS_CAP,
  MAX_NOT_CRAWLED_SHOWN_CAP,
} from "@/server/features/audit-search-check/searchCheckThresholds";

export const auditSearchCheckInputSchema = z.object({
  auditId: z
    .string()
    .optional()
    .describe("Audit ID. If omitted, uses the latest completed audit."),
  dateRange: z
    .enum(GSC_DATE_RANGES)
    .optional()
    .describe(
      `Search Console window for page demand, default ${DEFAULT_DATE_RANGE}. Only the top ${GSC_MAX_ROW_LIMIT} pages are considered.`,
    ),
  minImpressions: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      `A page counts as having search demand at this many impressions in the window, default ${DEFAULT_MIN_IMPRESSIONS}. Tracked ranking URLs always count.`,
    ),
  maxInspections: z
    .number()
    .int()
    .min(0)
    .max(MAX_INSPECTIONS_CAP)
    .optional()
    .describe(
      `How many pages the audit did not crawl get a Search Console URL Inspection, default ${DEFAULT_MAX_INSPECTIONS}, maximum ${MAX_INSPECTIONS_CAP}, 0 to skip. Inspection is free but quota-limited.`,
    ),
  maxNotCrawled: z
    .number()
    .int()
    .min(0)
    .max(MAX_NOT_CRAWLED_SHOWN_CAP)
    .optional()
    .describe(
      `How many "search-page-not-crawled" findings to return in full, default ${DEFAULT_MAX_NOT_CRAWLED_SHOWN}, maximum ${MAX_NOT_CRAWLED_SHOWN_CAP}. The rest are grouped by folder in summary.notCrawledByFolder, and countsByType keeps the full count.`,
    ),
  ignorePaths: z
    .array(z.string().min(1))
    .max(50)
    .optional()
    .describe(
      'Path prefixes to leave out entirely, e.g. ["/property-investment-glossary-list/", "/teams/"]. Pages under them produce no findings, are not counted and are never inspected. Use for sections that are noindexed on purpose.',
    ),
});

const SEARCH_CHECK_FINDING_TYPES = [
  "noindex-page-with-search-demand",
  "broken-page-with-search-demand",
  "canonical-elsewhere-with-search-demand",
  "redirect-with-search-demand",
  "search-page-not-crawled",
  "inspected-canonical-elsewhere",
  "inspected-not-indexable",
] as const;

const findingSchema = z.looseObject({
  type: z.enum(SEARCH_CHECK_FINDING_TYPES),
  severity: z.enum(["critical", "warning", "info"]),
  url: z.string(),
  /** Zero when the page only counts as demand because it is a tracked ranking URL. */
  impressions: z.number(),
  clicks: z.number(),
  averagePosition: z.number().nullable(),
  trackedKeywords: z.array(
    z.looseObject({
      keyword: z.string(),
      device: z.enum(["desktop", "mobile"]),
      position: z.number().nullable(),
    }),
  ),
  /** What the audit or URL Inspection saw on this page. */
  evidence: z.string(),
  howToFix: z.string(),
});

export const auditSearchCheckOutputSchema = z.looseObject({
  findings: z.array(findingSchema),
  summary: z.looseObject({
    auditId: z.string().nullable(),
    auditDate: z.string().nullable(),
    countsByType: z.record(z.string(), z.number()),
    searchConsoleWindow: z
      .looseObject({ startDate: z.string(), endDate: z.string() })
      .nullable(),
    rankCheckDate: z.string().nullable(),
    inspectedCount: z.number(),
    /** Not-crawled findings beyond `maxNotCrawled`, grouped by first path folder. */
    notCrawledByFolder: z.array(
      z.looseObject({
        folder: z.string(),
        count: z.number(),
        impressions: z.number(),
        clicks: z.number(),
      }),
    ),
    /** Pages with search demand left out because of `ignorePaths`. */
    ignoredPages: z.number(),
    ignoredPaths: z.array(z.string()),
  }),
  /** Plain-language caveats: skipped data sources, other-host URLs, no audit. */
  notes: z.array(z.string()),
});

export type AuditSearchCheckInput = z.infer<typeof auditSearchCheckInputSchema>;
export type AuditSearchCheck = z.infer<typeof auditSearchCheckOutputSchema>;
export type SearchCheckFinding = AuditSearchCheck["findings"][number];
