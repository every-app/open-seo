import { z } from "zod";
import { aiProjectSchema } from "./ai-visibility";

// A researched keyword can become a tracker topic, whose names allow 100.
const aiKeywordSchema = z.string().trim().min(1).max(100);
export const researchAiPromptsSchema = aiProjectSchema.extend({
  keyword: aiKeywordSchema.describe(
    "A short head term such as a tracker topic name. Exact multi-word phrases return few prompts.",
  ),
});
export type ResearchAiPromptsInput = z.infer<typeof researchAiPromptsSchema>;
