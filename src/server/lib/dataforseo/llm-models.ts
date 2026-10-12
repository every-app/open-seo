import { z } from "zod";
import { dataforseoGet } from "@/server/lib/dataforseo/core";
import { assertOk } from "@/server/lib/dataforseo/envelope";

export type LlmResponseModelSlug =
  | "chat_gpt"
  | "claude"
  | "gemini"
  | "perplexity";

/**
 * Model names come from DataForSEO's FREE ($0) per-provider catalog
 * (`/v3/ai_optimization/{slug}/llm_responses/models`), so the app tracks new
 * model families without code changes. This matters twice over: a hardcoded
 * pin goes stale (we shipped gpt-5 while the catalog had gpt-5.5), and
 * DataForSEO BILLS tasks that fail with `Invalid Field: 'model_name'`, so a
 * name must be validated against the catalog before a paid dispatch.
 */

const catalogRowSchema = z.object({ model_name: z.string() });

/**
 * Snapshot fallback (2026-08-25) used when the catalog endpoint is
 * unreachable or lists no flagship alias: the aliases we know DataForSEO
 * accepts, newest first.
 */
const FALLBACK_MODEL_NAMES: Record<LlmResponseModelSlug, string[]> = {
  chat_gpt: [
    "gpt-5.6-luna",
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.2",
    "gpt-5.1",
    "gpt-5",
  ],
  claude: ["claude-sonnet-5", "claude-sonnet-4-6", "claude-sonnet-4-5"],
  gemini: ["gemini-2.5-pro"],
  perplexity: ["sonar-reasoning-pro", "sonar-pro", "sonar"],
};

/**
 * Explicit preferred model per provider, taking precedence over the plain-
 * alias rule below while the catalog still lists it (a dropped pin falls back
 * to the rule instead of dispatching a billed-invalid name). ChatGPT is pinned
 * to the 5.6 tier by maintainer choice — the plain-alias rule can't rank tier
 * variants (terra/sol/luna), and 5.6 is newer than the plain gpt-5.5 alias.
 * Live-verified accepted + cited (2026-08-25).
 */
const PINNED_MODEL_NAMES: Partial<Record<LlmResponseModelSlug, string>> = {
  chat_gpt: "gpt-5.6-luna",
  // The catalog lists claude-sonnet-5-5, but its live calls fail with 50000
  // "Internal Error" while claude-sonnet-5 answers (verified 2026-10-07).
  claude: "claude-sonnet-5",
};

/**
 * The flagship alias per provider: a plain, undated, un-suffixed family name.
 * Dated releases ("gpt-5.5-2026-04-23") duplicate their alias, and suffixed
 * variants (mini/nano/-lite, or tier names like "gpt-5.6-terra"/"-sol") are
 * size/speed tiers whose consumer-default semantics we can't know — so the
 * highest plain alias is what "latest" means here. DataForSEO resolves an
 * alias to its latest dated version server-side.
 */
const LATEST_RULES: Record<LlmResponseModelSlug, RegExp> = {
  chat_gpt: /^gpt-(\d+(?:\.\d+)*)$/,
  claude: /^claude-sonnet-(\d+(?:-\d+)*)$/,
  gemini: /^gemini-(\d+(?:\.\d+)*)-pro$/,
  perplexity: /^sonar-reasoning-pro$/,
};

function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function pickLatestLlmModelName(
  slug: LlmResponseModelSlug,
  names: string[],
): string {
  const pinned = PINNED_MODEL_NAMES[slug];
  if (pinned && names.includes(pinned)) return pinned;
  const rule = LATEST_RULES[slug];
  let best: { name: string; version: number[] } | null = null;
  for (const name of names) {
    const match = rule.exec(name);
    if (!match) continue;
    const version = (match[1] ?? "0").split(/[.-]/).map(Number);
    if (!best || compareVersions(version, best.version) > 0) {
      best = { name, version };
    }
  }
  // No flagship alias in the catalog: take the newest snapshot name it still
  // lists, so the pick passes the catalog check in fetchLlmResponse.
  const fallback = FALLBACK_MODEL_NAMES[slug];
  return best?.name ?? fallback.find((n) => names.includes(n)) ?? fallback[0];
}

const CATALOG_TTL_MS = 60 * 60 * 1000;

// Per-isolate cache: the catalog is free but there's no reason to refetch it
// on every prompt. Failures are not cached, so a transient outage self-heals.
const catalogCache = new Map<
  LlmResponseModelSlug,
  { names: string[]; fetchedAt: number }
>();

async function getLlmModelNames(slug: LlmResponseModelSlug): Promise<string[]> {
  const cached = catalogCache.get(slug);
  if (cached && Date.now() - cached.fetchedAt < CATALOG_TTL_MS) {
    return cached.names;
  }
  try {
    const response = await dataforseoGet(
      `/v3/ai_optimization/${slug}/llm_responses/models`,
    );
    const task = assertOk(response);
    const names = (task.result ?? []).flatMap((row) => {
      const parsed = catalogRowSchema.safeParse(row);
      return parsed.success ? [parsed.data.model_name] : [];
    });
    if (names.length === 0) return FALLBACK_MODEL_NAMES[slug];
    catalogCache.set(slug, { names, fetchedAt: Date.now() });
    return names;
  } catch (error) {
    console.warn(`dataforseo.llm-models.catalog-fetch failed (${slug})`, error);
    return FALLBACK_MODEL_NAMES[slug];
  }
}

/** The model to use for a provider, picked from the live catalog. */
export async function resolveLatestLlmModelName(
  slug: LlmResponseModelSlug,
): Promise<string> {
  return pickLatestLlmModelName(slug, await getLlmModelNames(slug));
}

/** Whether DataForSEO's catalog accepts this model name. Checked before every
 *  paid dispatch because an unknown `model_name` fails as a BILLED task. */
export async function isKnownLlmModelName(
  slug: LlmResponseModelSlug,
  modelName: string,
): Promise<boolean> {
  return (await getLlmModelNames(slug)).includes(modelName);
}
