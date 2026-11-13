import { z } from "zod";

// A researched keyword can become a tracker topic, whose names allow 100.
const aiKeywordSchema = z.string().trim().min(1).max(100);
export const researchAiPromptsSchema = z.object({
  projectId: z.string().uuid(),
  keyword: aiKeywordSchema.describe(
    "A short head term such as a tracker topic name. Exact multi-word phrases return few prompts.",
  ),
});
export type ResearchAiPromptsInput = z.infer<typeof researchAiPromptsSchema>;
export const MAX_AI_RESEARCH_KEYWORDS = 100;
const aiKeywordListSchema = z
  .array(aiKeywordSchema)
  .max(MAX_AI_RESEARCH_KEYWORDS)
  .default([]);
export const updateAiResearchKeywordsSchema = z.object({
  projectId: z.string().uuid(),
  remove: aiKeywordListSchema.describe(
    "Saved keywords to take off the list. Case and spacing don't matter.",
  ),
  add: aiKeywordListSchema.describe(
    "Keywords to put at the top of the list, such as replacements for the removed ones.",
  ),
});
export type UpdateAiResearchKeywordsInput = z.infer<
  typeof updateAiResearchKeywordsSchema
>;
