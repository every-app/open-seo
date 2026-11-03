import { z } from "zod";
import { safeHttpUrl } from "@/shared/safe-url";
import type { AiEngine } from "@/shared/ai-visibility";
import type { LlmResponseResult } from "@/server/lib/dataforseoLlmSchemas";

const optionalMarkdown = z.string().max(1_000_000).nullish();
const sourceList = z.array(z.unknown()).max(2_000).nullish();
const resultSchema = z.object({
  datetime: z.string().max(100).nullish(),
  // ChatGPT and Gemini LLM Scraper fields.
  markdown: optionalMarkdown,
  sources: sourceList,
  search_results: sourceList,
  // Google organic SERP field.
  items: z.array(z.unknown()).max(500).nullish(),
});
const aiOverviewSchema = z.object({
  type: z.literal("ai_overview"),
  markdown: optionalMarkdown,
  references: sourceList,
  items: z
    .array(z.object({ references: sourceList }))
    .max(500)
    .nullish(),
});
const sourceSchema = z.object({
  url: z.string().max(16_384),
  title: z.string().max(10_000).transform(withoutNul).nullish(),
});

// LLM Responses name the excerpt `snippet`; the ChatGPT LLM Scraper names it
// `description` and leaves out the date.
const searchResultSchema = sourceSchema.extend({
  snippet: z.string().nullish(),
  description: z.string().nullish(),
  date: z.string().max(100).nullish(),
});

export interface AiCitation {
  url: string;
  domain: string;
  title: string | null;
  position: number;
}

export interface AiSearchResult extends AiCitation {
  snippet: string | null;
  publishedAt: string | null;
}

export interface ParsedAiAnswer {
  /** Null when the engine gave no answer (or Google showed no AI Overview). */
  answerMarkdown: string | null;
  /** Plain prose for brand matching; empty without an answer. */
  answerText: string;
  citations: AiCitation[];
  /** Pages the engine found while searching, cited or not. */
  searchResults: AiSearchResult[];
  collectedAt: string | null;
}

/**
 * Normalize one DataForSEO task result. No URL fetches or model calls: all
 * evidence comes from the captured result. Returns null for an unreadable
 * result.
 */
export function parseDataforseoAnswer(
  raw: unknown,
  engine: AiEngine,
): ParsedAiAnswer | null {
  if (raw === null)
    return {
      answerMarkdown: null,
      answerText: "",
      citations: [],
      searchResults: [],
      collectedAt: null,
    };
  const parsed = resultSchema.safeParse(raw);
  if (!parsed.success) return null;
  const result = parsed.data;
  let markdown: string | null;
  let sources: unknown[];
  if (engine === "google_ai_overview") {
    const overview = result.items
      ?.map((item) => aiOverviewSchema.safeParse(item))
      .find((item) => item.success)?.data;
    markdown = overview?.markdown ?? null;
    sources = [
      ...(overview?.references ?? []),
      ...(overview?.items ?? []).flatMap((item) => item.references ?? []),
    ];
  } else {
    markdown = result.markdown ?? null;
    sources = result.sources ?? [];
  }
  if (markdown) markdown = withoutNul(markdown);
  const answerText = markdown ? markdownToText(markdown) : "";
  return {
    answerMarkdown: answerText.trim() ? markdown : null,
    answerText: answerText.trim() ? answerText : "",
    citations: citationsFrom(sources),
    searchResults: searchResultsFrom(result.search_results ?? []),
    collectedAt: dateOrNull(result.datetime),
  };
}

/**
 * Normalize one live LLM Responses answer. The message sections hold the
 * answer, their annotations hold the cited pages, and search_results holds
 * every page the model found while searching.
 */
export function parseLlmResponseAnswer(
  result: LlmResponseResult,
): ParsedAiAnswer {
  const sections = (result.items ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.sections ?? []);
  const markdown = withoutNul(
    sections
      .map((section) => section.text ?? "")
      .filter(Boolean)
      .join("\n\n"),
  );
  const answerText = markdownToText(markdown);
  return {
    answerMarkdown: answerText.trim() ? markdown : null,
    answerText: answerText.trim() ? answerText : "",
    citations: citationsFrom(
      sections.flatMap((section) => section.annotations ?? []),
    ),
    searchResults: searchResultsFrom(result.search_results ?? []),
    collectedAt: null,
  };
}

/** Postgres text columns reject NUL, which scraped answers and titles can carry. */
function withoutNul(text: string): string {
  return text.replaceAll("\0", "");
}

function dateOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

/**
 * Plain answer prose for brand matching. Citation pills (`[1]`, `[example.com]`)
 * are evidence of a source, not a textual mention, so they are removed.
 */
export function markdownToText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)\s]*\)/g, "")
    .replace(
      /\[((?:[^[\]]|\[[^\]]*\])*)\]\((https?:\/\/[^)\s]+)\)/g,
      (_, label: string, url: string) =>
        citationPill(label, url) ? "" : label,
    )
    .replace(/\*\*|__|`/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^(\s*)[*+-]\s+/gm, "$1");
}

function citationPill(label: string, url: string): boolean {
  const text = label
    .replace(/^\[|\]$/g, "")
    .trim()
    .toLowerCase();
  if (/^\d+$/.test(text)) return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return text.replace(/^www\./, "") === host.replace(/^www\./, "");
  } catch {
    return false;
  }
}

/** Safe, de-duplicated cited URLs with tracking parameters removed. */
function citationsFrom(list: unknown[]): AiCitation[] {
  return pagesFrom(list, sourceSchema, (page) => page);
}

/** Safe, de-duplicated search results, normalized like citations. */
function searchResultsFrom(list: unknown[]): AiSearchResult[] {
  return pagesFrom(list, searchResultSchema, (page, data) => ({
    ...page,
    snippet: snippetOrNull(data.snippet ?? data.description),
    publishedAt: dateOrNull(data.date),
  }));
}

function pagesFrom<S extends typeof sourceSchema, T extends AiCitation>(
  list: unknown[],
  schema: S,
  build: (page: AiCitation, data: z.infer<S>) => T,
): T[] {
  const pages = new Map<string, T>();
  for (const item of list) {
    const source = schema.safeParse(item);
    const safe = source.success ? safeHttpUrl(source.data.url) : null;
    if (!source.success || !safe) continue;
    const url = new URL(safe);
    url.hash = "";
    // Snapshot keys before deleting: the URLSearchParams iterator is live.
    for (const key of Array.from(url.searchParams.keys()))
      if (
        /^utm_/i.test(key) ||
        ["gclid", "fbclid", "msclkid", "_hsmi"].includes(key.toLowerCase())
      )
        url.searchParams.delete(key);
    const normalized = url.toString();
    const existing = pages.get(normalized);
    if (existing) {
      existing.title ??= source.data.title ?? null;
      continue;
    }
    pages.set(
      normalized,
      build(
        {
          url: normalized,
          domain: url.hostname,
          title: source.data.title ?? null,
          position: pages.size + 1,
        },
        source.data,
      ),
    );
  }
  return [...pages.values()];
}

const SNIPPET_LIMIT = 500;

/**
 * ChatGPT's search snippets open with an internal citation marker (wrapped in
 * private-use characters) and a "[wordlim: 200]" note, and can run to whole
 * pages of text.
 */
function snippetOrNull(value: string | null | undefined): string | null {
  const text = withoutNul(value ?? "")
    .replace(/^\p{Co}?cite\p{Co}?turn\w+\p{Co}?\s*(\[wordlim: \d+\]\s*)?/u, "")
    .trim();
  if (!text) return null;
  return text.length > SNIPPET_LIMIT
    ? `${text.slice(0, SNIPPET_LIMIT - 1)}…`
    : text;
}
