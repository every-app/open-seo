import { z } from "zod";

// ─── Server function input schemas ──────────────────────────────────────────

export const startSeoGraphAuditSchema = z.object({
  projectId: z.string().min(1),
  domain: z
    .string()
    .min(1, "Domain is required")
    .max(253)
    .transform((d) => d.replace(/^https?:\/\//, "").replace(/\/$/, "")),
  keywords: z.array(z.string().min(1).max(200)).max(20).default([]),
});

export const getSeoGraphAuditStatusSchema = z.object({
  projectId: z.string().min(1),
  auditId: z.string().min(1),
});

export const getSeoGraphAuditHistorySchema = z.object({
  projectId: z.string().min(1),
});

export const deleteSeoGraphAuditSchema = z.object({
  projectId: z.string().min(1),
  auditId: z.string().min(1),
});

// ─── URL search params schema for /p/$projectId/seo-audit ────────────────────

export const seoGraphSearchSchema = z.object({
  auditId: z.string().optional(),
});

// ─── Railway API response types ───────────────────────────────────────────────

export const railwaySeoStatusSchema = z.object({
  status: z.enum(["pending", "running", "completed", "failed"]),
  routing_path: z.array(z.string()).default([]),
  loop_counter: z.number().int().default(0),
  client_report: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
});

export type StartSeoGraphAuditInput = z.infer<typeof startSeoGraphAuditSchema>;
export type GetSeoGraphAuditStatusInput = z.infer<typeof getSeoGraphAuditStatusSchema>;
export type GetSeoGraphAuditHistoryInput = z.infer<typeof getSeoGraphAuditHistorySchema>;
export type DeleteSeoGraphAuditInput = z.infer<typeof deleteSeoGraphAuditSchema>;
export type SeoGraphSearchParams = z.infer<typeof seoGraphSearchSchema>;
export type RailwaySeoStatus = z.infer<typeof railwaySeoStatusSchema>;
