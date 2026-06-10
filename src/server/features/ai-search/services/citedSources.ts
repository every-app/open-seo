import { sortBy } from "remeda";
import type { LlmPlatform } from "@/server/lib/dataforseo";
import type {
  LlmMentionItem,
  LlmTopPagesItem,
} from "@/server/lib/dataforseoLlmSchemas";
import { safeHostname, safeHttpUrl } from "@/server/features/ai-search/safeUrl";
import { roundOrNull } from "@/server/features/ai-search/services/shareOfVoice";
import type { BrandLookupResult } from "@/types/schemas/ai-search";

type Bundle = {
  platform: LlmPlatform;
  topPages: LlmTopPagesItem[];
  mentions: LlmMentionItem[];
};

type PromptExamples = Map<string, Map<string, number | null>>;

const MAX_URL_LENGTH = 2048;
const MAX_QUESTION_LENGTH = 500;

/**
 * Use DataForSEO top_pages for the ranked cited-source rows, then attach prompt
 * examples from the mentions sample when the exact cited URL appears there.
 * The page metrics stay authoritative while the prompt examples remain plainly
 * sample-based.
 */
export function deriveCitedSources(
  bundles: Bundle[],
  limits: { sourcesPerPlatform: number; keywordsPerSource: number },
): BrandLookupResult["topPages"] {
  const promptExamples = buildPromptExamples(bundles);

  const rows = bundles.flatMap((bundle) =>
    bundle.topPages
      .map((page) => {
        const url = safeHttpUrl(page.key);
        if (!url || url.length > MAX_URL_LENGTH) return null;
        const platformGroup = page.platform?.find(
          (entry) => entry.key === bundle.platform,
        );
        const key = sourceKey(bundle.platform, url);
        const examples =
          promptExamples.get(key) ?? new Map<string, number | null>();
        return {
          url,
          domain: safeHostname(url),
          platform: bundle.platform,
          mentions: roundOrNull(platformGroup?.mentions),
          capturedVolume: roundOrNull(platformGroup?.ai_search_volume),
          keywords: sortBy(
            Array.from(examples.entries()).map(
              ([question, aiSearchVolume]) => ({
                question,
                aiSearchVolume,
              }),
            ),
            [(keyword) => keyword.aiSearchVolume ?? 0, "desc"],
          ).slice(0, limits.keywordsPerSource),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null),
  );

  // Keep the top sources PER PLATFORM so a high-volume platform (Google) can't
  // crowd out a sparse one (ChatGPT, US/en only) entirely. Then order the
  // combined set by captured volume for a sensible default.
  const byPlatform = new Map<LlmPlatform, typeof rows>();
  for (const row of rows) {
    const list = byPlatform.get(row.platform) ?? [];
    list.push(row);
    byPlatform.set(row.platform, list);
  }
  const capped = Array.from(byPlatform.values()).flatMap((list) =>
    sortBy(list, [(row) => row.capturedVolume ?? 0, "desc"]).slice(
      0,
      limits.sourcesPerPlatform,
    ),
  );

  return sortBy(
    capped,
    [(row) => row.capturedVolume ?? 0, "desc"],
    [(row) => row.mentions ?? 0, "desc"],
  );
}

function buildPromptExamples(bundles: Bundle[]): PromptExamples {
  const examples: PromptExamples = new Map();
  for (const bundle of bundles) {
    for (const mention of bundle.mentions) {
      const question =
        typeof mention.question === "string"
          ? truncate(mention.question, MAX_QUESTION_LENGTH)
          : "";
      if (question.length === 0) continue;
      const volume = roundOrNull(mention.ai_search_volume);

      for (const source of mention.sources ?? []) {
        const url = safeHttpUrl(source.url);
        if (!url) continue;
        const key = sourceKey(bundle.platform, url);
        const existing = examples.get(key) ?? new Map<string, number | null>();
        if (!existing.has(question)) existing.set(question, volume);
        examples.set(key, existing);
      }
    }
  }
  return examples;
}

function sourceKey(platform: LlmPlatform, url: string): string {
  return `${platform}::${url}`;
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}
