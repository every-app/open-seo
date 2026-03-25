import { z } from "zod";
import {
  LIGHTHOUSE_CATEGORIES,
  LIGHTHOUSE_CATEGORY_TABS,
} from "@/shared/lighthouse";

export const lighthouseAuditIssueSchema = z.object({
  projectId: z.string().min(1, "Project id is required"),
  resultId: z.string().min(1, "Result id is required"),
});

export const lighthouseAuditExportSchema = z.object({
  projectId: z.string().min(1, "Project id is required"),
  resultId: z.string().min(1, "Result id is required"),
  mode: z.enum(["full", "issues", "category"]),
  category: z.enum(LIGHTHOUSE_CATEGORIES).optional(),
});

export const lighthouseIssuesSearchSchema = z.object({
  auditId: z.string().optional().catch(undefined),
  category: z.enum(LIGHTHOUSE_CATEGORY_TABS).catch("all").default("all"),
});
