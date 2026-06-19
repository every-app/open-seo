import { generateText } from "ai";
import { getOnboardingModel } from "@/server/lib/openrouter";
import type { ScrapedPage } from "@/server/features/onboarding/scrape";

export type RankedKeyword = {
  keyword: string;
  position: number | null;
  searchVolume: number | null;
  keywordDifficulty: number | null;
};

type StrategyInput = {
  domain: string;
  countryName: string;
  pages: ScrapedPage[];
  scrapeBlocked: boolean;
  organicTraffic: number | null;
  organicKeywords: number | null;
  rankedKeywords: RankedKeyword[];
};

const SYSTEM_PROMPT = `You are an SEO strategist onboarding a new user to OpenSEO.
From what you can see of their website plus the data provided, write a concise,
practical, and honest first SEO strategy in Markdown. Be specific to THIS site —
never generic. Structure it as:

## Positioning
One paragraph on what the site does and how it should position itself in search.

## Themes
3-5 content/topic themes worth owning, each a bullet with a one-line rationale.

## Target keywords
A short markdown table of starter keywords (Keyword | Why it fits). If ranking
data is provided, prefer and mark keywords they already rank for. If the site is
brand new with no rankings, say so plainly and propose keywords from the content.

## Do this next
A numbered list of 3-5 concrete next actions.

Keep it under ~400 words. Do not invent metrics you weren't given.`;

function buildPrompt(input: StrategyInput): string {
  const lines: string[] = [];
  lines.push(`Domain: ${input.domain}`);
  lines.push(`Primary market: ${input.countryName}`);
  lines.push(
    `Organic traffic estimate: ${input.organicTraffic ?? "unknown"}; ` +
      `ranking keywords: ${input.organicKeywords ?? "unknown"}.`,
  );

  if (input.rankedKeywords.length > 0) {
    lines.push("\nKeywords the site already ranks for (top by traffic):");
    for (const kw of input.rankedKeywords.slice(0, 20)) {
      lines.push(
        `- ${kw.keyword} (pos ${kw.position ?? "?"}, vol ${kw.searchVolume ?? "?"}, KD ${kw.keywordDifficulty ?? "?"})`,
      );
    }
  } else {
    lines.push(
      "\nThe site has no meaningful organic rankings yet (treat as brand new).",
    );
  }

  if (input.scrapeBlocked) {
    lines.push(
      "\nWe could not read the site's pages. Ask the user to describe what they do, and keep the strategy high-level.",
    );
  } else {
    lines.push("\nPages read from the site:");
    for (const page of input.pages) {
      lines.push(`\n### ${page.title ?? page.url} (${page.url})`);
      lines.push(page.text);
    }
  }

  return lines.join("\n");
}

/** Generates the initial onboarding strategy markdown for a site. */
export async function synthesizeStrategy(
  input: StrategyInput,
): Promise<string> {
  const model = await getOnboardingModel();
  const { text } = await generateText({
    model,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(input),
  });
  return text.trim();
}
