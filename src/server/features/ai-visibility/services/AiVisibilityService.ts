import { getTracker } from "./aiVisibilityState";
import { saveTracker } from "./aiVisibilitySetup";
import { estimateCost } from "./aiVisibilityCost";
import { setSchedule } from "./aiVisibilitySchedule";
import { runCheck, getRun } from "./aiVisibilityRuns";
import {
  loadAiResults,
  loadAiSources,
  loadAiAnswer,
  loadAiPageResults,
} from "./aiVisibilityResults";
import { exportAiData } from "./aiVisibilityExport";
import { loadAiTrend } from "./aiVisibilityTrend";
import { listAiResearchKeywords, researchAiPrompts } from "./aiPromptResearch";
import type { GenerateAiPromptsInput } from "@/types/schemas/aiPromptSuggestions";
import type { BillingCustomerContext } from "@/server/billing/subscription";
export const AiVisibilityService = {
  generatePrompts: async (
    input: GenerateAiPromptsInput,
    billing: BillingCustomerContext,
  ) =>
    (await import("./aiPromptSuggestions")).generateAiPrompts(input, billing),
  getResearchSetup: async (input: { projectId: string }) =>
    (await import("./aiResearchKeywords")).getAiResearchSetup(input.projectId),
  startResearchSetup: async (
    input: { projectId: string },
    billing: BillingCustomerContext,
    options?: { runSeededTracking?: boolean },
  ) =>
    (await import("./aiResearchKeywords")).startAiResearchSetup(
      input,
      billing,
      options,
    ),
  researchPrompts: researchAiPrompts,
  listResearchKeywords: listAiResearchKeywords,
  getTracker,
  saveTracker,
  estimateCost,
  setSchedule,
  runCheck,
  getRun,
  getResults: loadAiResults,
  getPageResults: loadAiPageResults,
  getSources: loadAiSources,
  getTrend: loadAiTrend,
  getAnswer: loadAiAnswer,
  exportData: exportAiData,
};
