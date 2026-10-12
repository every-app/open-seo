import { AiVisibilityRepository as repo } from "../repositories/AiVisibilityRepository";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import {
  aiEngineUsesModelApi,
  AI_ENGINE_LABELS,
  AI_UNSUPPORTED_LOCATIONS,
  type AiEngine,
  type AiTrackerState,
} from "@/shared/ai-visibility";
import { aiEngineSchema } from "@/types/schemas/ai-visibility";
import { aiPromptIsBranded } from "./aiVisibilityMatching";
import {
  aiBrands,
  aiTopics,
  trackerEngines,
} from "./aiVisibilityConfiguration";
import { aiRunView } from "./aiVisibilityResults";
import { reconcileAiRun } from "./aiVisibilityRuns";

const CONSUMER_NOTE =
  "One consumer-site answer. Collects in any project market country except unsupportedLocationCodes.";
const LIVE_NOTE =
  "One answer from the model's live API with web search, at live API pricing. Collects in any project market country except unsupportedLocationCodes.";
const AI_ENGINE_NOTES: Record<AiEngine, string> = {
  chatgpt: CONSUMER_NOTE,
  gemini: CONSUMER_NOTE,
  google_ai_overview:
    "The AI Overview on one Google results page. A page without an AI Overview is a no-answer result, not a missing brand.",
  claude: LIVE_NOTE,
  perplexity: LIVE_NOTE,
};

export async function getTracker(input: {
  projectId: string;
}): Promise<AiTrackerState> {
  const [config, competitors, recent, providerKey, project] = await Promise.all(
    [
      repo.getConfiguration(input.projectId),
      repo.listCompetitors(input.projectId),
      repo.listRuns(input.projectId, 10),
      getOptionalEnvValue("DATAFORSEO_API_KEY"),
      repo.getProject(input.projectId),
    ],
  );
  // A run whose workflow stopped is failed here, so it never looks stuck.
  const runs = await Promise.all(recent.map((run) => reconcileAiRun(run)));
  const [observations, answered] = await Promise.all([
    repo.getObservationStatuses(runs.map((r) => r.id)),
    config
      ? repo.listAnsweredPromptIds(config.tracker.id)
      : Promise.resolve<string[]>([]),
  ]);
  const brands = project ? aiBrands(project, competitors) : [];
  const own = brands.find((b) => b.own);
  const capabilities = aiEngineSchema.options.map((engine) => ({
    engine,
    label: AI_ENGINE_LABELS[engine],
    unsupportedLocationCodes: [...AI_UNSUPPORTED_LOCATIONS[engine]],
    maxPromptLength: 2000,
    note: AI_ENGINE_NOTES[engine],
    modelApi: aiEngineUsesModelApi(engine),
  }));
  const providerConfigured = !!providerKey;
  if (!config)
    return {
      configured: false,
      tracker: null,
      topics: [],
      prompts: [],
      brands,
      engines: [],
      capabilities,
      recentRuns: [],
      providerConfigured,
    };
  const { tracker } = config;
  return {
    configured: true,
    tracker: {
      id: tracker.id,
      projectId: tracker.projectId,
      enabled: tracker.enabled,
      locationCode: tracker.locationCode,
      languageCode: tracker.languageCode,
      scheduleInterval: tracker.scheduleInterval,
      nextCheckAt: tracker.nextCheckAt,
      lastSkipReason: tracker.lastSkipReason,
      createdAt: tracker.createdAt,
    },
    topics: aiTopics(config),
    prompts: config.prompts.map((p) => ({
      id: p.id,
      text: p.text,
      topic: p.topic,
      paused: p.paused,
      archived: p.archived,
      branded: !!own && aiPromptIsBranded(p.text, own),
      hasResults: answered.includes(p.id),
    })),
    brands,
    engines: trackerEngines(tracker),
    capabilities,
    recentRuns: runs.map((r) =>
      aiRunView(
        r,
        observations.filter((o) => o.runId === r.id),
      ),
    ),
    providerConfigured,
  };
}
