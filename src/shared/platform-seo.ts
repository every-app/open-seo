// Enum values shared by the Platform SEO schema (both dialects), server and UI.

export const PS_KEYWORD_GROUPS = [
  "question",
  "comparison",
  "preposition",
  "time",
  "autocomplete",
] as const;
export type PsKeywordGroup = (typeof PS_KEYWORD_GROUPS)[number];

export const PS_INTENTS = [
  "informational",
  "commercial",
  "transactional",
  "navigational",
] as const;
export type PsIntent = (typeof PS_INTENTS)[number];

export const PS_FUNNEL_STAGES = ["tofu", "mofu", "bofu"] as const;
export type PsFunnelStage = (typeof PS_FUNNEL_STAGES)[number];

// pulled -> filtered -> clustered. A failed stage keeps the last good stage so
// the user can retry just that step.
export const PS_PULL_STAGES = ["pulled", "filtered", "clustered"] as const;
export type PsPullStage = (typeof PS_PULL_STAGES)[number];

export const PS_TOPIC_STATUSES = [
  "idea",
  "drafting",
  "ready",
  "published",
] as const;
export type PsTopicStatus = (typeof PS_TOPIC_STATUSES)[number];

// Platform discovery: sites found ranking in Google that may host our content.
// pending = waiting for the user; the AI's first pass is advisory only. Tools
// and sponsorship marketplaces are kept as their own directories, and never
// count as parasites in a keyword's score.
export const PS_PLATFORM_DECISIONS = [
  "parasite",
  "not_parasite",
  "tool",
  "sponsorship",
] as const;
export const PS_PLATFORM_STATUSES = [
  "pending",
  ...PS_PLATFORM_DECISIONS,
] as const;
export type PsPlatformStatus = (typeof PS_PLATFORM_STATUSES)[number];
export type PsPlatformDecision = (typeof PS_PLATFORM_DECISIONS)[number];

export const PS_PLATFORM_SOURCES = ["seed", "serp", "import"] as const;
export type PsPlatformSource = (typeof PS_PLATFORM_SOURCES)[number];

export const PS_AI_VERDICTS = ["parasite", "not_parasite", "unsure"] as const;
export type PsAiVerdict = (typeof PS_AI_VERDICTS)[number];

// Google's first two pages: where a parasite post can realistically rank.
export const PS_SERP_DEPTH = 20;
