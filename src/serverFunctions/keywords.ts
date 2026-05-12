import { createServerFn } from "@tanstack/react-start";
import {
  deleteSavedKeywordTagSchema,
  researchKeywordsSchema,
  saveKeywordsSchema,
  getSavedKeywordsSchema,
  exportSavedKeywordsSchema,
  removeSavedKeywordsSchema,
  serpAnalysisSchema,
  updateSavedKeywordTagSchema,
  updateSavedKeywordTagsSchema,
} from "@/types/schemas/keywords";
import { KeywordResearchService } from "@/server/features/keywords/services/KeywordResearchService";
import { requireProjectContext } from "@/serverFunctions/middleware";

export const researchKeywords = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => researchKeywordsSchema.parse(data))
  .handler(async ({ data, context }) => {
    return KeywordResearchService.research(
      {
        ...data,
        projectId: context.projectId,
      },
      context,
    );
  });

export const saveKeywords = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => saveKeywordsSchema.parse(data))
  .handler(async ({ data, context }) => {
    return KeywordResearchService.saveKeywords({
      ...data,
      projectId: context.projectId,
    });
  });

export const getSavedKeywords = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => getSavedKeywordsSchema.parse(data))
  .handler(async ({ data, context }) => {
    return KeywordResearchService.getSavedKeywords({
      ...data,
      projectId: context.projectId,
    });
  });

export const exportSavedKeywords = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => exportSavedKeywordsSchema.parse(data))
  .handler(async ({ data, context }) => {
    return KeywordResearchService.exportSavedKeywords({
      ...data,
      projectId: context.projectId,
    });
  });

export const updateSavedKeywordTags = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => updateSavedKeywordTagsSchema.parse(data))
  .handler(async ({ data, context }) => {
    return KeywordResearchService.updateSavedKeywordTags({
      ...data,
      projectId: context.projectId,
    });
  });

export const updateSavedKeywordTag = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => updateSavedKeywordTagSchema.parse(data))
  .handler(async ({ data, context }) => {
    return KeywordResearchService.updateSavedKeywordTag({
      ...data,
      projectId: context.projectId,
    });
  });

export const deleteSavedKeywordTag = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => deleteSavedKeywordTagSchema.parse(data))
  .handler(async ({ data, context }) => {
    return KeywordResearchService.deleteSavedKeywordTag({
      ...data,
      projectId: context.projectId,
    });
  });

export const removeSavedKeywords = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => removeSavedKeywordsSchema.parse(data))
  .handler(async ({ data, context }) => {
    return KeywordResearchService.removeSavedKeywords(context.projectId, data);
  });

export const getSerpAnalysis = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .inputValidator((data: unknown) => serpAnalysisSchema.parse(data))
  .handler(async ({ data, context }) =>
    KeywordResearchService.getSerpAnalysis(
      {
        ...data,
        projectId: context.projectId,
      },
      context,
    ),
  );
