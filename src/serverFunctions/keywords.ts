import { createServerFn } from "@tanstack/react-start";
import {
  researchKeywordsSchema,
  saveKeywordsSchema,
  getSavedKeywordsSchema,
  removeSavedKeywordSchema,
  serpAnalysisSchema,
} from "@/types/schemas/keywords";
import { KeywordResearchService } from "@/server/features/keywords/services/KeywordResearchService";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";

export const researchKeywords = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => researchKeywordsSchema.parse(data))
  .handler(async ({ data, context }) => {
    return KeywordResearchService.research({
      ...data,
      projectId: context.project.id,
    });
  });

export const saveKeywords = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => saveKeywordsSchema.parse(data))
  .handler(async ({ data, context }) => {
    return KeywordResearchService.saveKeywords({
      ...data,
      projectId: context.project.id,
    });
  });

export const getSavedKeywords = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => getSavedKeywordsSchema.parse(data))
  .handler(async ({ data, context }) => {
    return KeywordResearchService.getSavedKeywords({
      ...data,
      projectId: context.project.id,
    });
  });

export const removeSavedKeyword = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => removeSavedKeywordSchema.parse(data))
  .handler(async ({ data, context }) => {
    return KeywordResearchService.removeSavedKeyword(context.project.id, data);
  });

export const getSerpAnalysis = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .inputValidator((data: unknown) => serpAnalysisSchema.parse(data))
  .handler(async ({ data }) => KeywordResearchService.getSerpAnalysis(data));
