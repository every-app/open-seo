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

// The canonical article for a topic. Marking it ready moves the topic to Ready.
export const PS_ARTICLE_STATUSES = ["draft", "ready"] as const;
export type PsArticleStatus = (typeof PS_ARTICLE_STATUSES)[number];

// Long enough for any article; keeps one row well inside D1's size limits.
export const PS_ARTICLE_MAX_CHARS = 100_000;

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

// Syndication: where a canonical article is republished, with a canonical link
// back to the original.
export const PS_CHANNEL_TYPES = ["hashnode", "devto"] as const;
export type PsChannelType = (typeof PS_CHANNEL_TYPES)[number];

export const PS_CHANNEL_LABELS: Record<PsChannelType, string> = {
  hashnode: "Hashnode",
  devto: "Dev.to",
};

// prepared = a platform copy here only; drafted = a draft on the platform;
// published = live there.
export const PS_SYNDICATION_STATUSES = [
  "prepared",
  "drafted",
  "published",
] as const;
export type PsSyndicationStatus = (typeof PS_SYNDICATION_STATUSES)[number];

// Dev.to asks how much AI wrote the article; it shows a label on the post.
export const PS_AI_DISCLOSURES = [
  "no_ai",
  "some_ai",
  "fully_autonomous",
] as const;
export type PsAiDisclosure = (typeof PS_AI_DISCLOSURES)[number];

// Tracking: each check of a published copy reads Google twice through the
// queued SERP endpoint (its target keyword, and site: its URL for indexing)
// and looks for the URL among the project's AI answer sources.
export const PS_TRACKING_STATUSES = ["pending", "done", "failed"] as const;
// Three pages: where a post is still worth pushing up.
export const PS_TRACKING_DEPTH = 30;
