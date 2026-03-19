import {
  getSavedKeywords,
  getSerpAnalysis,
  removeSavedKeyword,
  research,
  saveKeywords,
} from "@/server/features/keywords/services/research";

export const KeywordResearchService = {
  research,
  getSerpAnalysis,
  saveKeywords,
  getSavedKeywords,
  removeSavedKeyword,
} as const;
