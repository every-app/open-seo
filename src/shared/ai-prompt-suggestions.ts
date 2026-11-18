/** Website setup seeds tracking with the first topics' prompts. */
export const SEEDED_TRACKING_TOPICS = 3;

export function normalizeAiSuggestion(text: string) {
  return text.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** A generated topic name cut to the five words topic names allow. */
export function toTopicName(text: string) {
  return text.trim().split(/\s+/).slice(0, 5).join(" ");
}
