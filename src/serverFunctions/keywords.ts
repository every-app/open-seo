import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authenticatedServerFunctionMiddleware } from "@/serverFunctions/middleware";
import {
  researchKeywordsSchema,
  saveKeywordsSchema,
  getSavedKeywordsSchema,
  removeSavedKeywordSchema,
  serpAnalysisSchema,
} from "@/types/schemas/keywords";
import { KeywordResearchService } from "@/server/features/keywords/services/KeywordResearchService";

export const researchKeywords = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => researchKeywordsSchema.parse(data))
  .handler(async ({ data, context }) =>
    KeywordResearchService.research(context.userId, data),
  );

export const saveKeywords = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => saveKeywordsSchema.parse(data))
  .handler(async ({ data, context }) =>
    KeywordResearchService.saveKeywords(context.userId, data),
  );

export const getSavedKeywords = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => getSavedKeywordsSchema.parse(data))
  .handler(async ({ data, context }) =>
    KeywordResearchService.getSavedKeywords(context.userId, data),
  );

export const removeSavedKeyword = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => removeSavedKeywordSchema.parse(data))
  .handler(async ({ data, context }) =>
    KeywordResearchService.removeSavedKeyword(context.userId, data),
  );

export const getOrCreateDefaultProject = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .handler(async ({ context }) =>
    KeywordResearchService.getOrCreateDefaultProject(context.userId),
  );

export const getSerpAnalysis = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => serpAnalysisSchema.parse(data))
  .handler(async ({ data }) => KeywordResearchService.getSerpAnalysis(data));

const getProjectSchema = z.object({
  projectId: z.string().min(1),
});

export const getProject = createServerFn({ method: "POST" })
  .middleware(authenticatedServerFunctionMiddleware)
  .inputValidator((data: unknown) => getProjectSchema.parse(data))
  .handler(async ({ data, context }) =>
    KeywordResearchService.getProject(context.userId, data.projectId),
  );
