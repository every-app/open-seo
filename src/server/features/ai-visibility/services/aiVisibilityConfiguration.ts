import { sort } from "remeda";
import type { AiTrackerPatch } from "@/types/schemas/ai-visibility";
import {
  AI_DEFAULT_TOPIC,
  type AiBrand,
  type AiEngine,
} from "@/shared/ai-visibility";
import { computeNextCheckAt } from "@/shared/rank-tracking";
import { applyMarket } from "./aiVisibilityMarket";
import type {
  ConfigurationRows,
  PromptRow,
  TrackerRow,
} from "../repositories/AiVisibilityRepository";
import { AiVisibilityError } from "./aiVisibilityErrors";

const PROMPT_LIMIT = 100;
const TOPIC_LIMIT = 30;

export function trackerEngines(tracker: TrackerRow): AiEngine[] {
  return [
    ...(tracker.chatgpt ? (["chatgpt"] as const) : []),
    ...(tracker.gemini ? (["gemini"] as const) : []),
    ...(tracker.googleAiOverview ? (["google_ai_overview"] as const) : []),
    ...(tracker.claude ? (["claude"] as const) : []),
    ...(tracker.perplexity ? (["perplexity"] as const) : []),
  ];
}

function engineColumns(engines: AiEngine[]) {
  return {
    chatgpt: engines.includes("chatgpt"),
    gemini: engines.includes("gemini"),
    googleAiOverview: engines.includes("google_ai_overview"),
    claude: engines.includes("claude"),
    perplexity: engines.includes("perplexity"),
  };
}

export function activeAiPrompts(config: ConfigurationRows): PromptRow[] {
  return config.prompts.filter((p) => !p.paused && !p.archived);
}

/** Topics of unarchived prompts, in name order. */
export function aiTopics(config: ConfigurationRows): string[] {
  return sort(
    [...new Set(config.prompts.filter((p) => !p.archived).map((p) => p.topic))],
    (a, b) => a.localeCompare(b),
  );
}

/** The prompts and engines a check collects: every answer it pays for. */
export function aiScope(config: ConfigurationRows, promptIds?: string[]) {
  const active = activeAiPrompts(config);
  if (promptIds?.some((id) => !active.some((p) => p.id === id)))
    throw new AiVisibilityError(
      "INVALID_PROMPT_SELECTION",
      "Choose active prompt IDs from this tracker. Archived or paused prompts cannot be checked.",
    );
  return {
    prompts: promptIds
      ? active.filter((p) => promptIds.includes(p.id))
      : active,
    engines: trackerEngines(config.tracker),
  };
}

/** The project's own brand, then its competitors, from shared project context. */
export function aiBrands(
  project: { name: string; domain: string | null },
  competitors: { name: string | null; domain: string }[],
): AiBrand[] {
  if (!project.domain) return [];
  const brands = new Map<string, AiBrand>([
    [project.domain, { name: project.name, domain: project.domain, own: true }],
  ]);
  for (const c of competitors)
    if (!brands.has(c.domain))
      brands.set(c.domain, {
        name: c.name ?? c.domain,
        domain: c.domain,
        own: false,
      });
  return [...brands.values()];
}

/**
 * A new tracker's first check, at least a full week out. The shared weekly
 * slot is seven calendar days ahead at 04:00–10:00 UTC, which lands short of
 * a week for trackers created later in the UTC day.
 */
function firstWeeklyCheckAt() {
  const next = new Date(computeNextCheckAt("weekly"));
  if (next.getTime() < Date.now() + 7 * 86_400_000)
    next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

export function projectAiConfiguration(input: {
  previous: ConfigurationRows | null;
  projectId: string;
  projectMarket: { locationCode: number; languageCode: string };
  patch: AiTrackerPatch;
  now: string;
}): {
  rows: ConfigurationRows;
  created: number;
  updated: number;
  skipped: number;
} {
  const { previous, patch, now } = input;
  const rows: ConfigurationRows = previous
    ? structuredClone(previous)
    : {
        tracker: {
          id: crypto.randomUUID(),
          projectId: input.projectId,
          // New tracking runs weekly. The first check is a week out, so
          // creating a tracker never charges on its own.
          enabled: true,
          ...engineColumns(["chatgpt", "gemini"]),
          ...input.projectMarket,
          scheduleInterval: "weekly",
          nextCheckAt: firstWeeklyCheckAt(),
          lastSkipReason: null,
          createdAt: now,
        },
        prompts: [],
      };
  if (patch.engines)
    Object.assign(rows.tracker, engineColumns([...new Set(patch.engines)]));
  applyMarket(rows, patch, !previous, trackerEngines(rows.tracker));
  const counts = applyPrompts(rows, patch, now);
  const unarchived = rows.prompts.filter((p) => !p.archived);
  if (unarchived.length > PROMPT_LIMIT)
    throw new AiVisibilityError(
      "PROMPT_LIMIT",
      "Tracking supports up to 100 unarchived prompts per project. Archive unused prompts first.",
    );
  if (new Set(unarchived.map((p) => p.topic)).size > TOPIC_LIMIT)
    throw new AiVisibilityError(
      "TOPIC_LIMIT",
      "Tracking supports up to 30 topics per project. Archive the prompts of an unused topic first.",
    );
  return { rows, ...counts };
}

/**
 * Prompt text never changes in place. New text archives the edited prompt and
 * adds the text as a prompt of its own, restoring an archived prompt with the
 * same text so its history continues.
 */
function applyPrompts(
  rows: ConfigurationRows,
  patch: AiTrackerPatch,
  now: string,
) {
  const trackerId = rows.tracker.id;
  let created = 0,
    updated = 0,
    skipped = 0;
  const touched = new Set<string>();
  for (const prompt of patch.prompts ?? []) {
    const existing = prompt.id
      ? rows.prompts.find((p) => p.id === prompt.id)
      : undefined;
    if (prompt.id && !existing)
      throw new AiVisibilityError(
        "INVALID_PROMPT",
        "A supplied prompt ID is not part of this tracker. Read the tracker and retry with its IDs.",
      );
    if (existing && touched.has(existing.id))
      throw new AiVisibilityError(
        "DUPLICATE_PROMPT_EDIT",
        "A prompt may be edited only once in a bulk patch.",
      );
    if (existing) touched.add(existing.id);
    const text = prompt.text.trim();
    const topic = prompt.topic?.trim() || existing?.topic || AI_DEFAULT_TOPIC;
    const paused = prompt.paused ?? existing?.paused ?? false;
    if (existing && existing.text === text) {
      Object.assign(existing, { topic, paused });
      updated++;
      continue;
    }
    if (rows.prompts.some((p) => p.text === text && !p.archived)) {
      if (existing)
        throw new AiVisibilityError(
          "DUPLICATE_PROMPT",
          "This edit duplicates another active prompt's exact text.",
        );
      skipped++;
      continue;
    }
    if (existing) {
      existing.archived = true;
      updated++;
    }
    const archived = rows.prompts.find((p) => p.archived && p.text === text);
    if (archived) {
      Object.assign(archived, { archived: false, topic, paused });
      touched.add(archived.id);
    } else {
      const id = crypto.randomUUID();
      touched.add(id);
      rows.prompts.push({
        id,
        trackerId,
        topic,
        text,
        paused,
        archived: false,
        createdAt: now,
      });
    }
    created++;
  }
  for (const id of patch.archivePromptIds ?? []) {
    const prompt = rows.prompts.find((p) => p.id === id);
    if (!prompt)
      throw new AiVisibilityError(
        "INVALID_PROMPT",
        "An archive ID does not belong to this tracker.",
      );
    if (!prompt.archived) {
      prompt.archived = true;
      updated++;
    }
  }
  return { created, updated, skipped };
}
