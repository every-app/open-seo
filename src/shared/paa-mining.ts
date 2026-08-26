// Shared constants for the PAA + Social Mining module (People Also Ask
// extraction + Reddit/Quora answer mining for demand discovery).
//
// The core insight behind this module: PAA boxes don't create new keyword
// demand — they're reformulations of the seed. The real demand-discovery
// signal lives in what people actually SAY in social threads answering those
// questions. So this module surfaces the language, pain points, and angles
// that keyword tools miss, by mining the social discussion around each PAA
// question.

// The Google SERP regions the Serper.dev search API accepts. Shared between
// the client form, the server functions, and the MCP tools so the option
// lists stay in sync.
export const PAA_MINING_REGIONS = [
  "US",
  "CA",
  "UK",
  "AU",
  "NZ",
  "ES",
  "DE",
  "IT",
  "FR",
  "IE",
  "NL",
  "CH",
  "SE",
  "NO",
  "DK",
  "FI",
  "ZA",
  "MX",
  "BR",
  "CO",
  "IN",
  "SG",
  "MY",
  "JP",
  "KE",
  "AE",
  "HK",
] as const;

export type PaaMiningRegion = (typeof PAA_MINING_REGIONS)[number];

// The social platforms we mine for answer language. Reddit is primary
// (JSON endpoint, free, rate-limited). Quora is deferred to v2 (JS-rendered,
// no reliable parse) — the UI shows "no Quora coverage yet" for it.
export const SOCIAL_SOURCES = ["reddit", "quora"] as const;
export type SocialSource = (typeof SOCIAL_SOURCES)[number];

// How many PAA questions we extract per seed, and how many social threads we
// mine per question. Kept conservative to bound Serper.dev spend.
export const MAX_PAA_QUESTIONS = 10;
export const MAX_SOCIAL_THREADS_PER_QUESTION = 3;

// The intent buckets we cluster PAA questions into. These are the "angle
// surfaces" that keyword tools miss — the demand-discovery framing.
export const PAA_INTENTS = [
  "comparison",
  "how_to",
  "what_is",
  "why",
  "when",
  "where",
  "cost",
  "problem",
  "alternative",
  "other",
] as const;

export type PaaIntent = (typeof PAA_INTENTS)[number];
