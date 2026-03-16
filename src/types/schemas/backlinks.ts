import { z } from "zod";

export const backlinksStatusSchema = z.enum(["live", "lost", "all"]);
export const backlinksTabSchema = z.enum(["backlinks", "domains", "pages"]);
export const backlinksTargetScopeSchema = z.enum(["domain", "page"]);
const booleanSearchParamSchema = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => value === true || value === "true");

export const backlinksLookupSchema = z.object({
  target: z.string().min(1, "Target is required").max(2048),
  scope: backlinksTargetScopeSchema.optional(),
  includeSubdomains: z.boolean().default(true),
  includeIndirectLinks: z.boolean().default(true),
  excludeInternalBacklinks: z.boolean().default(true),
  status: backlinksStatusSchema.default("live"),
});

export const backlinksProjectSchema = z.object({
  projectId: z.string().min(1),
});

export const backlinksOverviewInputSchema = backlinksLookupSchema.extend({
  projectId: z.string().min(1),
});

export const backlinksSearchSchema = z.object({
  target: z.string().optional(),
  scope: backlinksTargetScopeSchema.optional(),
  subdomains: booleanSearchParamSchema.optional(),
  indirect: booleanSearchParamSchema.optional(),
  excludeInternal: booleanSearchParamSchema.optional(),
  status: backlinksStatusSchema.optional(),
  tab: backlinksTabSchema.optional(),
});

export type BacklinksLookupInput = z.infer<typeof backlinksLookupSchema>;
export type BacklinksStatus = z.infer<typeof backlinksStatusSchema>;
export type BacklinksTab = z.infer<typeof backlinksTabSchema>;
export type BacklinksTargetScope = z.infer<typeof backlinksTargetScopeSchema>;
