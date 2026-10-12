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
  title: z.string().max(10_000).nullish(),
});

export interface AiCitation {
  url: string;
  domain: string;
  title: string | null;
  position: number;
}

export interface ParsedAiAnswer {
  /** Null when the engine gave no answer (or Google showed no AI Overview). */
  answerMarkdown: string | null;
  /** Plain prose for brand matching; empty without an answer. */
  answerText: string;
  citations: AiCitation[];
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
  const answerText = markdown ? markdownToText(markdown) : "";
  return {
    answerMarkdown: answerText.trim() ? markdown : null,
    answerText: answerText.trim() ? answerText : "",
    citations: citationsFrom(sources),
    collectedAt: dateOrNull(result.datetime),
  };
}

/**
 * Normalize one live LLM Responses answer. The message sections hold the
 * answer, and their annotations hold the cited pages.
 */
export function parseLlmResponseAnswer(
  result: LlmResponseResult,
): ParsedAiAnswer {
  const sections = (result.items ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.sections ?? []);
  const markdown = sections
    .map((section) => section.text ?? "")
    .filter(Boolean)
    .join("\n\n");
  const answerText = markdownToText(markdown);
  return {
    answerMarkdown: answerText.trim() ? markdown : null,
    answerText: answerText.trim() ? answerText : "",
    citations: citationsFrom(
      sections.flatMap((section) => section.annotations ?? []),
    ),
    collectedAt: null,
  };
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
  const citations = new Map<string, AiCitation>();
  for (const item of list) {
    const source = sourceSchema.safeParse(item);
    const safe = source.success ? safeHttpUrl(source.data.url) : null;
    if (!source.success || !safe) continue;
    const url = new URL(safe);
    url.hash = "";
    // Snapshot keys before deleting: the URLSearchParams iterator is live.
    for (const key of Array.from(url.searchParams.keys()))
      if (
        /^utm_/i.test(key) ||
        ["gclid", "fbclid", "msclkid"].includes(key.toLowerCase())
      )
        url.searchParams.delete(key);
    const normalized = url.toString();
    const existing = citations.get(normalized);
    if (existing) {
      existing.title ??= source.data.title ?? null;
      continue;
    }
    citations.set(normalized, {
      url: normalized,
      domain: url.hostname,
      title: source.data.title ?? null,
      position: citations.size + 1,
    });
  }
  return [...citations.values()];
}
