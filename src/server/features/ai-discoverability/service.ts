import robotsParser from "robots-parser";
import { z } from "zod";
import { analyzeHtml } from "@/server/lib/audit/page-analyzer";
import {
  normalizeAndValidateStartUrl,
  resolveStartUrlRedirects,
} from "@/server/lib/audit/url-policy";

const MAX_HTML_BYTES = 1024 * 1024;
const MAX_ROBOTS_BYTES = 500 * 1024;

export const aiDiscoverabilityInputSchema = z.object({
  projectId: z.string().min(1),
  url: z.string().trim().min(1).max(2048),
});

const crawlers = [
  { name: "ChatGPT Search", userAgent: "OAI-SearchBot" },
  { name: "Google AI Overviews / AI Mode", userAgent: "Googlebot" },
  { name: "Bing / Copilot", userAgent: "bingbot" },
  { name: "Claude Search", userAgent: "Claude-SearchBot" },
  { name: "Perplexity", userAgent: "PerplexityBot" },
] as const;

async function readTextCapped(response: Response, maxBytes: number) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

async function fetchPublic(url: string, userAgent: string) {
  return fetch(url, {
    redirect: "manual",
    headers: { "User-Agent": userAgent },
    signal: AbortSignal.timeout(12_000),
  });
}

export async function checkAiDiscoverability(rawUrl: string) {
  const validated = await normalizeAndValidateStartUrl(rawUrl);
  if (new URL(validated).username || new URL(validated).password) {
    throw new Error("URLs with credentials cannot be checked");
  }
  const url = await resolveStartUrlRedirects(validated);
  const origin = new URL(url).origin;
  const robotsUrl = `${origin}/robots.txt`;
  let robotsStatus: number | null = null;
  let robotsText: string | null = null;
  try {
    const response = await fetchPublic(robotsUrl, "OpenSEO-AI-Readiness/1.0");
    robotsStatus = response.status;
    if (response.ok) {
      robotsText = await readTextCapped(response, MAX_ROBOTS_BYTES);
    }
  } catch {
    // A network failure means policy is unknown, not that crawlers are allowed.
  }

  const robots =
    robotsText === null ? null : robotsParser(robotsUrl, robotsText);
  const robotsMissing = robotsStatus === 404 || robotsStatus === 410;
  const crawlerPolicies = crawlers.map(({ name, userAgent }) => ({
    name,
    userAgent,
    allowed: robots
      ? (robots.isAllowed(url, userAgent) ?? true)
      : robotsMissing
        ? true
        : null,
  }));
  const sitemaps = robots?.getSitemaps() ?? [];

  let pageStatus: number | null = null;
  let pageContentType: string | null = null;
  let challenge: string | null = null;
  let xRobotsTag: string | null = null;
  let page = null as ReturnType<typeof analyzeHtml> | null;
  let pageError: string | null = null;
  try {
    const response = await fetchPublic(url, "OpenSEO-AI-Readiness/1.0");
    pageStatus = response.status;
    pageContentType = response.headers.get("content-type");
    challenge = response.headers.get("x-vercel-mitigated");
    xRobotsTag = response.headers.get("x-robots-tag");
    if (response.ok && pageContentType?.includes("text/html")) {
      const html = await readTextCapped(response, MAX_HTML_BYTES);
      if (html === null) {
        pageError = "The page exceeds the 1 MB inspection limit.";
      } else {
        page = analyzeHtml(html, url, pageStatus, 0);
      }
    } else if (response.status >= 300 && response.status < 400) {
      pageError = "The page redirected after the URL probe.";
    } else if (response.ok) {
      pageError = "The URL did not return an HTML page.";
    }
  } catch {
    pageError = "The page could not be fetched from this server.";
  }

  const robotsDirectives = [page?.robotsMeta ?? "", xRobotsTag ?? ""];
  const noindex = robotsDirectives.some((value) =>
    /(?:^|[,\s])noindex(?:[,\s]|$)/i.test(value),
  );
  const nosnippet = robotsDirectives.some((value) =>
    /(?:^|[,\s])nosnippet(?:[,\s]|$)/i.test(value),
  );

  return {
    url,
    checkedAt: new Date().toISOString(),
    robots: {
      status: robotsStatus,
      readable: robots !== null || robotsMissing,
      sitemaps,
      crawlers: crawlerPolicies,
    },
    page: {
      status: pageStatus,
      contentType: pageContentType,
      challenge,
      xRobotsTag,
      error: pageError,
      title: page?.title ?? null,
      h1s: page?.h1s ?? [],
      metaDescription: page?.metaDescription ?? null,
      canonical: page?.canonical ?? null,
      wordCount: page?.wordCount ?? null,
      hasStructuredData: page?.hasStructuredData ?? null,
      noindex: page ? noindex : null,
      nosnippet: page ? nosnippet : null,
    },
  };
}
