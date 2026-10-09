import { z } from "zod";

// A researched keyword can become a tracker topic, whose names allow 100.
const aiKeywordSchema = z.string().trim().min(1).max(100);
export const researchAiPromptsSchema = z.object({
  projectId: z.string().min(1),
  keyword: aiKeywordSchema.describe(
    "A short head term such as a tracker topic name. Exact multi-word phrases return few prompts.",
  ),
});
export type ResearchAiPromptsInput = z.infer<typeof researchAiPromptsSchema>;
