import { normalizeBacklinksTarget } from "@/server/lib/dataforseoBacklinksTarget";
import { normalizeAiSuggestion } from "@/shared/ai-prompt-suggestions";
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
      competitor.domain !== domain
    );
  });
}
