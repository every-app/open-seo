import { z } from "zod";

export const backlinksTabSchema = z.enum(["backlinks", "domains", "pages"]);
export const backlinksTargetScopeSchema = z.enum(["domain", "page"]);

export const backlinksLookupSchema = z.object({
  target: z.string().min(1, "Target is required").max(2048),
  scope: backlinksTargetScopeSchema.optional(),
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
  tab: backlinksTabSchema.optional(),
});

export type BacklinksLookupInput = z.infer<typeof backlinksLookupSchema>;
export type BacklinksTab = z.infer<typeof backlinksTabSchema>;
export type BacklinksTargetScope = z.infer<typeof backlinksTargetScopeSchema>;
