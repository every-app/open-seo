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
