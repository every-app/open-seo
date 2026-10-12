import { sort } from "remeda";
import type { AiBrand } from "@/shared/ai-visibility";
import type { ParsedAiAnswer } from "../providers/dataforseoEvidence";

export function ownedAiDomain(hostname: string, owned: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  const domain = owned.toLowerCase().replace(/^www\./, "");
  return !!domain && (host === domain || host.endsWith(`.${domain}`));
}

export function aiMentionSpans(
  text: string,
  names: string[],
): { start: number; end: number }[] {
  // URLs/emails in captured prose are not textual brand mentions. Keep their
  // length so returned evidence offsets still address the original answer.
  const prose = text.replace(
    /(?:https?:\/\/|www\.)[^\s<>]+|[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/giu,
    (value) => " ".repeat(value.length),
  );
  // Match canonically equivalent Unicode without losing original UTF-16 spans.
  let normalized = "";
  const starts: number[] = [],
    ends: number[] = [];
  let offset = 0;
  for (const character of prose) {
    const decomposed = character.normalize("NFD");
    normalized += decomposed;
    for (let i = 0; i < decomposed.length; i++) {
      starts.push(offset);
      ends.push(offset + character.length);
    }
    offset += character.length;
  }
  const found = new Map<string, { start: number; end: number }>();
  for (const name of new Set(
    names.map((n) => n.trim()).filter((n) => n.length >= 2),
  )) {
    const escaped = name
      .normalize("NFD")
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s+");
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{M}\\p{N}_])${escaped}(?![\\p{L}\\p{M}\\p{N}_])`,
      "giu",
    );
    for (const match of normalized.matchAll(pattern)) {
      const start = starts[match.index],
        end = ends[match.index + match[0].length - 1];
      found.set(`${start}:${end}`, { start, end });
    }
  }
  return sort(
    [...found.values()],
    (a, b) => a.start - b.start || b.end - a.end,
  ).filter(
    (span, i, all) =>
      !all
        .slice(0, i)
        .some((other) => other.start <= span.start && other.end >= span.end),
  );
}

/**
 * A brand is mentioned when its name or domain appears in the answer prose,
 * and cited when the answer cites a page on its domain. A generic brand name
 * can count as a mention of something else; that is accepted for simplicity.
 */
export function matchAiBrand(
  answer: ParsedAiAnswer,
  brand: Pick<AiBrand, "name" | "domain">,
) {
  const spans = aiMentionSpans(answer.answerText, [brand.name, brand.domain]);
  return {
    mentioned: spans.length > 0,
    cited: answer.citations.some((citation) =>
      ownedAiDomain(citation.domain, brand.domain),
    ),
    firstMention: spans[0]?.start ?? null,
  };
}

/** Prompt cohorts must include diagnostics that name the brand only by URL. */
export function aiPromptIsBranded(
  prompt: string,
  brand: Pick<AiBrand, "name" | "domain">,
): boolean {
  if (aiMentionSpans(prompt, [brand.name]).length) return true;
  const domain = brand.domain
    .replace(/^www\./i, "")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Domain labels must end here: openseo.so.evil.example is another site.
  return (
    !!domain &&
    new RegExp(
      `(?<![\\p{L}\\p{M}\\p{N}_-])${domain}(?![\\p{L}\\p{M}\\p{N}_.-])`,
      "iu",
    ).test(prompt)
  );
}
