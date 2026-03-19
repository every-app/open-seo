import { z } from "zod";

const psiCategories = [
  "performance",
  "accessibility",
  "best-practices",
  "seo",
] as const;

export const psiProjectKeySchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  apiKey: z.string().min(1, "API key is required").max(512),
});

export const psiProjectSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
});

export const psiAuditIssueSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  resultId: z.string().min(1, "Result id is required"),
  category: z.enum(psiCategories).optional(),
});

export const psiAuditExportSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  resultId: z.string().min(1, "Result id is required"),
  mode: z.enum(["full", "issues", "category"]),
  category: z.enum(psiCategories).optional(),
});

export const psiIssuesSearchSchema = z.object({
  category: z
    .enum(["all", ...psiCategories])
    .catch("all")
    .default("all"),
});
