import { z } from "zod";
import { suggestedAiTopicSchema } from "./aiPromptSuggestions";
import { PROSE_MAX_CHARS } from "./projectContext";

const domain = z.string().trim().min(1).max(255);
export const MAX_SUGGESTED_KEYWORDS = 15;
// AI visibility setup matches this text to tell users why its workflow failed.
export const WEBSITE_UNREADABLE_MESSAGE =
  "We couldn't read this website. Check the URL and try again.";
const researchKeywordSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^\S+(?:\s+\S+){0,4}$/, "Keywords must contain five words or fewer.");
const websiteCompetitorSchema = z.object({
  name: z.string().trim().min(1).max(120),
  domain,
  notes: z.string().trim().min(1).max(500),
  sourceUrl: z.string().url(),
});
export const websiteResearchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  domain,
  overview: z.string().trim().min(1).max(PROSE_MAX_CHARS),
  competitors: z.array(websiteCompetitorSchema).max(5),
  preserveCompetitors: z.boolean(),
  // The first three topics seed tracking. All topic names and the suggested
  // keywords become Prompt Research keywords.
  suggestedTopics: z.array(suggestedAiTopicSchema).max(5),
  suggestedKeywords: z.array(researchKeywordSchema).max(MAX_SUGGESTED_KEYWORDS),
});
export const researchProjectWebsiteSchema = z.object({
  projectId: z.string().uuid(),
  website: z.string().trim().min(1).max(2000),
});
export const saveProjectWebsiteSetupSchema = websiteResearchSchema
  .omit({
    suggestedTopics: true,
    suggestedKeywords: true,
    preserveCompetitors: true,
  })
  .extend({
    projectId: z.string().uuid(),
    suggestedTopics: z.array(suggestedAiTopicSchema).max(5).optional(),
    suggestedKeywords: websiteResearchSchema.shape.suggestedKeywords.optional(),
    competitors: z
      .array(
        websiteCompetitorSchema.omit({ sourceUrl: true }).extend({
          notes: z.string().trim().max(500).default(""),
        }),
      )
      .max(100),
  });
export type WebsiteResearch = z.infer<typeof websiteResearchSchema>;
export type SaveProjectWebsiteSetup = z.infer<
  typeof saveProjectWebsiteSetupSchema
>;
