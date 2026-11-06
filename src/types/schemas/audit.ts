import { z } from "zod";
import { PAGE_FETCH_CLASSES } from "@/shared/audit-fetch-class";
import {
  DEFAULT_AUDIT_PAGES,
  MIN_AUDIT_PAGES,
  PAID_MAX_AUDIT_PAGES,
} from "@/shared/audit-limits";

// ─── Server function input schemas ──────────────────────────────────────────

export const startAuditSchema = z.object({
  projectId: z.string().min(1),
  renderJavaScript: z.boolean().optional().default(false),
  startUrl: z.string().min(1, "URL is required").max(2048),
  maxPages: z
    .number()
    .int()
    .min(MIN_AUDIT_PAGES)
    .max(PAID_MAX_AUDIT_PAGES)
    .optional()
    .default(DEFAULT_AUDIT_PAGES),
  lighthouseStrategy: z.enum(["auto", "none"]).optional().default("auto"),
});

export const getAuditStatusSchema = z.object({
  projectId: z.string().min(1),
  auditId: z.string().min(1),
});

export const getAuditSummarySchema = z.object({
  projectId: z.string().min(1),
  auditId: z.string().min(1),
});

export const auditPagesSortFields = [
  "url",
  "statusCode",
  "title",
  "h1Count",
  "wordCount",
  "images",
  "responseTimeMs",
] as const;

// Big enough for exports to page through a 10,000-page audit in a few
// requests, small enough that one request stays far below Worker memory.
export const AUDIT_ROWS_MAX_PAGE_SIZE = 2_000;

const optionalBound = z.number().finite().nullable().optional();

export const getAuditPagesSchema = z.object({
  projectId: z.string().min(1),
  auditId: z.string().min(1),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(AUDIT_ROWS_MAX_PAGE_SIZE),
  sort: z.enum(auditPagesSortFields).default("url"),
  order: z.enum(["asc", "desc"]).default("asc"),
  query: z.string().trim().max(200).optional(),
  status: z.enum(["all", "ok", "redirect", "error", "missing"]).default("all"),
  fetchClass: z.enum(["all", ...PAGE_FETCH_CLASSES]).default("all"),
  minWords: optionalBound,
  maxWords: optionalBound,
  minResponseMs: optionalBound,
  maxResponseMs: optionalBound,
  missingAlt: z.enum(["all", "yes", "no"]).default("all"),
});

export type GetAuditPagesInput = z.input<typeof getAuditPagesSchema>;

export const getAuditIssuesSchema = z.object({
  projectId: z.string().min(1),
  auditId: z.string().min(1),
  /** One issue type (an expanded group), or every issue for exports. */
  issueType: z.string().min(1).max(100).optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(AUDIT_ROWS_MAX_PAGE_SIZE),
});

export const getAuditHistorySchema = z.object({
  projectId: z.string().min(1),
});

export const deleteAuditSchema = z.object({
  projectId: z.string().min(1),
  auditId: z.string().min(1),
});

export const getCrawlProgressSchema = z.object({
  projectId: z.string().min(1),
  auditId: z.string().min(1),
});

// ─── URL search params schema for /p/$projectId/audit ────────────────────────

const auditTabs = ["issues", "pages", "performance"] as const;

export const auditSearchSchema = z.object({
  auditId: z.string().optional().catch(undefined),
  // Pre-fills the launch form (the dashboard's "Audit your site" step).
  url: z.string().optional().catch(undefined),
  tab: z.enum(auditTabs).catch("issues").default("issues"),
});
