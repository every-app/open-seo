import { normalizeBacklinksTarget } from "@/server/lib/dataforseoBacklinksTarget";
import { normalizeAiSuggestion } from "@/shared/ai-prompt-suggestions";
import {
  LOCATION_OPTIONS,
  SERP_LANGUAGE_OPTIONS,
} from "@/shared/keyword-locations";
import type { WebsiteResearch } from "@/types/schemas/projectWebsite";

/** Drops a topic that repeats an earlier topic's name or any prompt. */
export function dropRepeatedTopics(topics: WebsiteResearch["suggestedTopics"]) {
  const topicNames = new Set<string>();
  const promptTexts = new Set<string>();
  return topics.filter((topic) => {
    const name = normalizeAiSuggestion(topic.name);
    const prompts = topic.prompts.map(normalizeAiSuggestion);
    if (
      topicNames.has(name) ||
      new Set(prompts).size !== prompts.length ||
      prompts.some((prompt) => promptTexts.has(prompt))
    )
      return false;
    topicNames.add(name);
    for (const prompt of prompts) promptTexts.add(prompt);
    return true;
  });
}

const PLATFORM_DOMAINS = [
  "play.google.com",
  "apps.apple.com",
  "chromewebstore.google.com",
  "amazon.com",
  "ebay.com",
  "etsy.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "x.com",
  "twitter.com",
  "tiktok.com",
  "youtube.com",
  "reddit.com",
  "wikipedia.org",
];

const isPlatform = (domain: string) =>
  PLATFORM_DOMAINS.some(
    (platform) => domain === platform || domain.endsWith(`.${platform}`),
  );

/** Keeps competitors that a page read during the research verifies. */
export function keepVerifiedCompetitors(
  competitors: WebsiteResearch["competitors"],
  sources: Set<string>,
  domain: string,
) {
  return competitors.filter((competitor) => {
    competitor.domain = normalizeBacklinksTarget(competitor.domain, {
      scope: "domain",
    }).apiTarget;
    const sourceDomain = normalizeBacklinksTarget(competitor.sourceUrl, {
      scope: "domain",
    }).apiTarget;
    return (
      sources.has(competitor.sourceUrl) &&
      sourceDomain === competitor.domain &&
      competitor.domain !== domain &&
      !isPlatform(competitor.domain)
    );
  });
}

export function describeMarket(market: {
  locationCode: number;
  languageCode: string;
}) {
  return {
    ...market,
    country: LOCATION_OPTIONS.find(
      (option) => option.code === market.locationCode,
    )?.label,
    language: SERP_LANGUAGE_OPTIONS.find(
      (option) => option.code === market.languageCode,
    )?.label,
  };
}
