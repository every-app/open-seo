/**
 * AI / agent-readiness checks: is the site reachable and legible for AI
 * assistants? Covers robots.txt treatment of known AI user agents and the
 * llms.txt convention (llmstxt.org).
 *
 * The check functions are pure over fetched bodies so tests need no network;
 * `runAiReadinessChecks` does the one extra fetch (llms.txt) and reuses the
 * robots.txt text the discovery phase already checkpointed.
 */
import robotsParser from "robots-parser";
import type { DetectedIssue } from "@/server/lib/audit/issues/page-reporters";
import { readBoundedText } from "@/server/lib/scrape";
import { normalizeAndValidateStartUrl } from "@/server/lib/audit/url-policy";

type AiCrawlerPurpose = "search" | "user" | "training";

interface AiCrawler {
  name: string;
  vendor: string;
  purpose: AiCrawlerPurpose;
}

/**
 * Well-known AI user agents, grouped by why they visit: "search" agents build
 * the indexes AI answers cite, "user" agents fetch a page live when an
 * assistant's user asks about it, "training" agents collect model training
 * data. Google-Extended is listed under training but also controls grounding
 * of Gemini answers — the descriptor text calls that out.
 */
const AI_CRAWLERS: AiCrawler[] = [
  { name: "OAI-SearchBot", vendor: "OpenAI", purpose: "search" },
  { name: "Claude-SearchBot", vendor: "Anthropic", purpose: "search" },
  { name: "PerplexityBot", vendor: "Perplexity", purpose: "search" },
  { name: "ChatGPT-User", vendor: "OpenAI", purpose: "user" },
  { name: "Claude-User", vendor: "Anthropic", purpose: "user" },
  { name: "Perplexity-User", vendor: "Perplexity", purpose: "user" },
  { name: "MistralAI-User", vendor: "Mistral", purpose: "user" },
  { name: "GPTBot", vendor: "OpenAI", purpose: "training" },
  { name: "ClaudeBot", vendor: "Anthropic", purpose: "training" },
  { name: "Google-Extended", vendor: "Google", purpose: "training" },
  { name: "Applebot-Extended", vendor: "Apple", purpose: "training" },
  { name: "meta-externalagent", vendor: "Meta", purpose: "training" },
  { name: "CCBot", vendor: "Common Crawl", purpose: "training" },
  { name: "Bytespider", vendor: "ByteDance", purpose: "training" },
];

const PURPOSE_ISSUE_TYPE = {
  search: "ai-search-crawlers-blocked",
  user: "ai-user-fetchers-blocked",
  training: "ai-training-crawlers-blocked",
} as const;

/** A UA no robots.txt names, so it resolves through the generic `*` group. */
const GENERIC_PROBE_AGENT = "OpenSEO-Generic-Probe";

/**
 * One issue per purpose group listing the AI agents robots.txt blocks from
 * the site root. A site that blocks the generic `*` agent made a site-wide
 * choice, so only agents treated worse than the generic rules count as an
 * AI-specific signal.
 */
export function checkAiCrawlerAccess(
  origin: string,
  robotsText: string | null,
): DetectedIssue[] {
  if (robotsText === null) return [];
  const robotsUrl = `${origin}/robots.txt`;
  const robots = robotsParser(robotsUrl, robotsText);
  const rootUrl = `${origin}/`;

  if ((robots.isAllowed(rootUrl, GENERIC_PROBE_AGENT) ?? true) === false) {
    return [];
  }

  const blockedByPurpose = new Map<AiCrawlerPurpose, AiCrawler[]>();
  for (const crawler of AI_CRAWLERS) {
    const allowed = robots.isAllowed(rootUrl, crawler.name) ?? true;
    if (allowed) continue;
    const group = blockedByPurpose.get(crawler.purpose);
    if (group) group.push(crawler);
    else blockedByPurpose.set(crawler.purpose, [crawler]);
  }

  return Array.from(blockedByPurpose, ([purpose, crawlers]) => ({
    issueType: PURPOSE_ISSUE_TYPE[purpose],
    pageId: null,
    pageUrl: robotsUrl,
    dedupeKey: purpose,
    // A flat string, not an array/object: the issues UI renders detail values
    // as-is, so a structured value would surface as "[object Object]".
    details: {
      blockedAgents: crawlers
        .map(({ name, vendor }) => `${name} (${vendor})`)
        .join(", "),
    },
  }));
}

type LlmsTxtFetchResult =
  | { status: "found"; text: string }
  | { status: "missing" }
  | { status: "unreachable" };

const LLMS_TXT_TIMEOUT_MS = 10_000;
const LLMS_TXT_HEADERS = { "User-Agent": "OpenSEO-Audit/1.0" };

/**
 * Fetch /llms.txt safely. `redirect: "manual"` + a same-origin check stop a
 * 30x from steering the request at an internal host (SSRF), and the body is
 * read through the shared bounded reader so an oversized file can't exhaust
 * memory. Only one redirect hop is followed, and only within the same origin
 * (llms.txt lives at the origin root — an off-origin redirect means none here).
 */
export async function fetchLlmsTxt(
  origin: string,
): Promise<LlmsTxtFetchResult> {
  try {
    const url = `${origin}/llms.txt`;
    let response = await fetch(url, {
      headers: LLMS_TXT_HEADERS,
      redirect: "manual",
      signal: AbortSignal.timeout(LLMS_TXT_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { status: "missing" };
      const target = new URL(location, url);
      if (target.origin !== origin) return { status: "missing" };
      let validated: string;
      try {
        validated = await normalizeAndValidateStartUrl(target.toString());
      } catch {
        return { status: "unreachable" };
      }
      response = await fetch(validated, {
        headers: LLMS_TXT_HEADERS,
        redirect: "manual",
        signal: AbortSignal.timeout(LLMS_TXT_TIMEOUT_MS),
      });
      if (response.status >= 300 && response.status < 400) {
        return { status: "unreachable" };
      }
    }

    if (response.status === 404 || response.status === 410) {
      return { status: "missing" };
    }
    if (!response.ok) return { status: "unreachable" };

    const contentType = response.headers.get("content-type") ?? "";
    const text = await readBoundedText(response);
    // Oversized body (over the shared cap) — not a real llms.txt file.
    if (text === null) return { status: "missing" };
    // SPA catch-alls answer 200 with the app shell for any path; an HTML
    // page is not an llms.txt, however the server labels it.
    if (contentType.includes("text/html") || looksLikeHtml(text)) {
      return { status: "missing" };
    }
    return { status: "found", text };
  } catch (error) {
    console.warn("Failed to fetch llms.txt:", error);
    return { status: "unreachable" };
  }
}

function looksLikeHtml(text: string): boolean {
  return /^\s*(<!doctype|<html)/i.test(text);
}

/**
 * llmstxt.org's only hard requirement: the first content line is an H1 title.
 * Blockquote summary and link sections are optional, so their absence is not
 * flagged — lenient on purpose to avoid false positives on valid files.
 */
export function findLlmsTxtStructureProblem(text: string): string | null {
  const firstContentLine = text
    .split(/\r?\n/)
    .find((line) => line.trim() !== "");
  if (firstContentLine === undefined) return "file-empty";
  if (!/^#\s+\S/.test(firstContentLine.trim())) return "missing-h1-title";
  return null;
}

export function checkLlmsTxt(
  origin: string,
  fetchResult: LlmsTxtFetchResult,
): DetectedIssue[] {
  // Unreachable is a transient/network condition, not evidence about the
  // site — stay silent rather than mis-report a file that may exist.
  if (fetchResult.status === "unreachable") return [];

  const pageUrl = `${origin}/llms.txt`;
  if (fetchResult.status === "missing") {
    return [{ issueType: "missing-llms-txt", pageId: null, pageUrl }];
  }

  const problem = findLlmsTxtStructureProblem(fetchResult.text);
  if (problem === null) return [];
  return [
    {
      issueType: "llms-txt-invalid",
      pageId: null,
      pageUrl,
      details: { problem },
    },
  ];
}

export async function runAiReadinessChecks(input: {
  origin: string;
  robotsText: string | null;
}): Promise<DetectedIssue[]> {
  const llmsTxt = await fetchLlmsTxt(input.origin);
  return [
    ...checkAiCrawlerAccess(input.origin, input.robotsText),
    ...checkLlmsTxt(input.origin, llmsTxt),
  ];
}
