import { sortBy } from "remeda";
import type { LlmCrossAggregatedItem } from "@/server/lib/dataforseoLlmSchemas";
import type { LlmPlatform } from "@/server/lib/dataforseo";
import type { BrandLookupResult } from "@/types/schemas/ai-search";
import { detectTarget } from "@/shared/targetDetection";

export type CrossOutcome = {
  platform: LlmPlatform;
  status: "success" | "error";
  items: LlmCrossAggregatedItem[];
};

export type CompetitorGroup = {
  label: string;
  detected: ReturnType<typeof detectTarget>;
};

/**
 * Resolve raw competitor inputs into comparison groups: detect each one's
 * target type, dedupe by resolved value, and drop any that collide with the
 * target — a duplicate aggregation group adds a redundant leaderboard row and
 * wastes a paid comparison slot. Dedupe is case-insensitive: domains are
 * already lowercased by detectTarget, but keyword targets preserve case while
 * DataForSEO matches them case-insensitively, so "Nike" and "nike" would be
 * two paid groups returning the same counts.
 */
export function resolveCompetitorGroups(
  targetValue: string,
  competitors: string[],
): CompetitorGroup[] {
  const seen = new Set<string>([targetValue.toLowerCase()]);
  const groups: CompetitorGroup[] = [];
  for (const competitor of competitors) {
    const detected = detectTarget(competitor);
    const dedupeKey = detected.value.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    groups.push({ label: detected.value, detected });
  }
  return groups;
}

/**
 * Build Share of Voice from the per-platform cross_aggregated calls. For each
 * brand (item.key), sum mentions across the platforms the calls returned.
 *
 * Every requested group (target + competitors) is seeded as a row up front, so
 * a brand the API returned no item for renders as "no data" instead of
 * silently vanishing from a leaderboard the user paid to compare it on. Echoed
 * aggregation_keys are matched back to requested keys case-insensitively so
 * vendor normalization can't orphan a row or the target's isTarget flag.
 *
 * US/en assumption: today the only locale that exists for both platforms is
 * US/en (the UI hardcodes locationCode 2840 / languageCode en and has no locale
 * selector), so we sum every returned platform. If a locale selector ships,
 * gate chat_gpt here the same way the single-brand totals do in shapeResult —
 * do not duplicate the chatGptLocaleMatches branch into this path.
 *
 * Null vs zero: a brand whose summed mentions is null is "no data" (excluded
 * from the denominator, sharePct null); a brand with mentions 0 is known-zero
 * and counts. sharePct = mentions / denominator * 100, guarded against
 * divide-by-zero. Returns null when there are no competitors or both calls
 * failed (so the UI omits the section rather than blanking the page).
 */
export function computeShareOfVoice(
  crossOutcomes: CrossOutcome[],
  targetKey: string,
  competitorKeys: string[],
): BrandLookupResult["shareOfVoice"] {
  if (competitorKeys.length === 0) return null;
  const successful = crossOutcomes.filter((c) => c.status === "success");
  if (successful.length === 0) return null;

  const requestedKeys = [targetKey, ...competitorKeys];
  const labelByKey = new Map(
    requestedKeys.map((key) => [key.toLowerCase(), key]),
  );
  const mentionsByKey = new Map<string, number | null>(
    requestedKeys.map((key) => [key.toLowerCase(), null]),
  );

  for (const outcome of successful) {
    for (const item of outcome.items) {
      if (item.key == null) continue;
      const key = item.key.toLowerCase();
      // The provider should echo only requested aggregation keys. If it ever
      // returns extra rows, do not let them alter requested share percentages.
      if (!labelByKey.has(key)) continue;
      const platformMentions = sumNullable(
        (item.platform ?? []).map((entry) => roundOrNull(entry.mentions)),
      );
      const prior = mentionsByKey.get(key) ?? null;
      // null + null stays null ("no data"); null + n = n; m + n = m + n.
      mentionsByKey.set(key, sumNullable([prior, platformMentions]));
    }
  }

  const denominator = sumNullable(Array.from(mentionsByKey.values())) ?? 0;
  const targetLower = targetKey.toLowerCase();

  const entries = sortBy(
    Array.from(mentionsByKey.entries()).map(([key, mentions]) => ({
      label: labelByKey.get(key) ?? key,
      isTarget: key === targetLower,
      mentions,
      sharePct:
        mentions == null || denominator <= 0
          ? null
          : (mentions / denominator) * 100,
    })),
    [(entry) => entry.mentions ?? -1, "desc"],
  );

  return { platforms: successful.map((outcome) => outcome.platform), entries };
}

export function sumNullable(values: Array<number | null>): number | null {
  let total = 0;
  let hasValue = false;
  for (const value of values) {
    if (value != null) {
      total += value;
      hasValue = true;
    }
  }
  return hasValue ? total : null;
}

export function roundOrNull(value: number | null | undefined): number | null {
  if (value == null) return null;
  return Math.round(value);
}
