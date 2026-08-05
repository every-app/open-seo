import { z } from "zod";
import { LIGHTHOUSE_CATEGORIES } from "@/shared/lighthouse";
import {
  buildStoredLighthouseIssues,
  scoreToPercent,
  type RawLighthouseAudit,
  type RawLighthouseCategory,
} from "@/server/lib/lighthouseStoredPayload";

/**
 * What PageSpeed keeps in R2 per run.
 *
 * Deliberately NOT the raw vendor response. A single PSI response is ~350 KB,
 * and with the daily sweep that is roughly 7 MB per project per day, nearly all
 * of it parts nothing reads. This keeps the extracted issues and scores — the
 * whole of what the drill-down shows — at a fraction of the size. Lab metrics
 * are not duplicated here: they are already columns on psi_snapshots, and the
 * run detail renders them from there.
 *
 * Issue extraction is shared with the DataForSEO audit path
 * (`buildStoredLighthouseIssues`): PSI returns the same Lighthouse `audits` and
 * `categories` shapes, including the `auditRefs` that extraction walks —
 * verified against a live response (Lighthouse 13.4.1). The envelope is
 * separate so neither source has to pretend to be the other.
 */
const storedPagespeedIssueSchema = z.object({
  category: z.enum(LIGHTHOUSE_CATEGORIES),
  auditKey: z.string(),
  title: z.string(),
  description: z.string(),
  score: z.number().nullable(),
  scoreDisplayMode: z.string().nullable(),
  displayValue: z.string().nullable(),
  impactMs: z.number().nullable(),
  impactBytes: z.number().nullable(),
  severity: z.enum(["critical", "warning", "info"]),
  items: z.array(z.string()),
});

export const storedPagespeedPayloadSchema = z.object({
  version: z.literal(1),
  source: z.literal("pagespeed-insights"),
  metadata: z.object({
    requestedUrl: z.string(),
    finalUrl: z.string(),
    strategy: z.enum(["mobile", "desktop"]),
    fetchedAt: z.string(),
    lighthouseVersion: z.string().nullable(),
  }),
  scores: z.object({
    performance: z.number().nullable(),
    accessibility: z.number().nullable(),
    "best-practices": z.number().nullable(),
    seo: z.number().nullable(),
  }),
  issues: z.array(storedPagespeedIssueSchema),
});

export type StoredPagespeedPayload = z.infer<
  typeof storedPagespeedPayloadSchema
>;
export type StoredPagespeedIssue = z.infer<typeof storedPagespeedIssueSchema>;

/** The slice of `lighthouseResult` the payload is built from. */
export type PagespeedLighthouseResult = {
  requestedUrl?: string;
  finalUrl?: string;
  lighthouseVersion?: string;
  fetchTime?: string;
  audits?: Record<string, RawLighthouseAudit>;
  categories?: Record<string, RawLighthouseCategory>;
};

export function buildStoredPagespeedPayload(input: {
  lighthouseResult: PagespeedLighthouseResult;
  strategy: "mobile" | "desktop";
  url: string;
}): StoredPagespeedPayload {
  const lighthouse = input.lighthouseResult;
  const audits = lighthouse.audits ?? {};
  const categories = lighthouse.categories ?? {};
  const { issues } = buildStoredLighthouseIssues({ audits, categories });

  return {
    version: 1,
    source: "pagespeed-insights",
    metadata: {
      requestedUrl: lighthouse.requestedUrl ?? input.url,
      finalUrl: lighthouse.finalUrl ?? lighthouse.requestedUrl ?? input.url,
      strategy: input.strategy,
      fetchedAt: lighthouse.fetchTime ?? "",
      lighthouseVersion: lighthouse.lighthouseVersion ?? null,
    },
    scores: {
      performance: scoreToPercent(categories["performance"]?.score),
      accessibility: scoreToPercent(categories["accessibility"]?.score),
      "best-practices": scoreToPercent(categories["best-practices"]?.score),
      seo: scoreToPercent(categories["seo"]?.score),
    },
    issues,
  };
}

/** Parse a payload read back from R2. Throws on a shape we don't recognize,
 *  so a future version bump surfaces loudly rather than rendering blanks. */
export function readStoredPagespeedPayload(
  payloadJson: string,
): StoredPagespeedPayload {
  return storedPagespeedPayloadSchema.parse(JSON.parse(payloadJson));
}
