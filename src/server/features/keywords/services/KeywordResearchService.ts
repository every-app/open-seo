import {
  getSavedKeywords,
  getSerpAnalysis,
  removeSavedKeywords,
  research,
  saveKeywords,
} from "@/server/features/keywords/services/research";

export const KeywordResearchService = {
  research,
  getSerpAnalysis,
  saveKeywords,
  getSavedKeywords,
  removeSavedKeywords,
} as const;
