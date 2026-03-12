import {
  createProject,
  deleteProject,
  getOrCreateDefaultProject,
  getProject,
  getSavedKeywords,
  getSerpAnalysis,
  listProjects,
  removeSavedKeyword,
  research,
  saveKeywords,
} from "@/server/features/keywords/services/research";

export const KeywordResearchService = {
  research,
  getSerpAnalysis,
  listProjects,
  createProject,
  deleteProject,
  saveKeywords,
  getSavedKeywords,
  removeSavedKeyword,
  getOrCreateDefaultProject,
  getProject,
} as const;
