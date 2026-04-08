import { z } from "zod";

export const backlinksTabSchema = z.enum(["backlinks", "domains", "pages"]);
export const backlinksTargetScopeSchema = z.enum(["domain", "page"]);
const DEFAULT_BACKLINKS_SPAM_THRESHOLD = 40;

function normalizeBacklinksSpamThreshold(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_BACKLINKS_SPAM_THRESHOLD;
  }

  return Math.min(100, Math.max(0, Math.trunc(value)));
}

export type BacklinksSpamFilterOptions = {
  hideSpam?: boolean;
  spamThreshold?: number;
};

export function normalizeBacklinksSpamFilterOptions(
  options?: BacklinksSpamFilterOptions,
) {
  const hideSpam = options?.hideSpam ?? true;

  return {
    hideSpam,
    spamThreshold: hideSpam
      ? normalizeBacklinksSpamThreshold(
          options?.spamThreshold ?? DEFAULT_BACKLINKS_SPAM_THRESHOLD,
        )
      : undefined,
  };
}
export const backlinksLookupSchema = z.object({
  target: z.string().min(1, "Target is required").max(2048),
  scope: backlinksTargetScopeSchema.optional(),
});

export const backlinksProjectSchema = z.object({
  projectId: z.string().min(1),
});

const backlinksSpamFilterSchema = z.object({
  hideSpam: z.boolean().optional(),
  spamThreshold: z.number().int().min(0).max(100).optional(),
});

export const backlinksOverviewInputSchema = backlinksLookupSchema
  .extend({
    projectId: z.string().min(1),
  })
  .merge(backlinksSpamFilterSchema);

export const backlinksSearchSchema = z.object({
  target: z.string().optional(),
  scope: backlinksTargetScopeSchema.optional(),
  tab: backlinksTabSchema.optional(),
});

export type BacklinksLookupInput = z.infer<typeof backlinksLookupSchema>;
export type BacklinksTab = z.infer<typeof backlinksTabSchema>;
export type BacklinksTargetScope = z.infer<typeof backlinksTargetScopeSchema>;
