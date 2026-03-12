import { z } from "zod";

// ─── Server function input schemas ──────────────────────────────────────────

export const startAuditSchema = z.object({
  projectId: z.string().min(1),
  startUrl: z.string().min(1, "URL is required").max(2048),
  maxPages: z.number().int().min(10).max(10_000).optional().default(50),
  psiStrategy: z
    .enum(["auto", "all", "manual", "none"])
    .optional()
    .default("auto"),
  psiApiKey: z.string().optional(),
});

export const getAuditStatusSchema = z.object({
  auditId: z.string().min(1),
});

export const getAuditResultsSchema = z.object({
  auditId: z.string().min(1),
});

export const getAuditHistorySchema = z.object({
  projectId: z.string().min(1),
});

export const deleteAuditSchema = z.object({
  auditId: z.string().min(1),
});

export const getCrawlProgressSchema = z.object({
  auditId: z.string().min(1),
});

// ─── URL search params schema for /p/$projectId/audit ────────────────────────

const auditTabs = ["pages", "performance"] as const;

export const auditSearchSchema = z.object({
  auditId: z.string().optional().catch(undefined),
  tab: z.enum(auditTabs).catch("pages").default("pages"),
});
