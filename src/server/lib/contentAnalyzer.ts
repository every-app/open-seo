import * as cheerio from "cheerio";

export interface ContentAnalysis {
  url: string;
  title: string | null;
  titleLength: number;
  metaDescription: string | null;
  metaDescriptionLength: number;
  wordCount: number;
  sentenceCount: number;
  avgWordsPerSentence: number;
  readingEaseScore: number;
  readingEaseLabel: string;
  headingCounts: { h1: number; h2: number; h3: number };
  h1Text: string[];
  imageCount: number;
  imagesMissingAlt: number;
  internalLinkCount: number;
  externalLinkCount: number;
  targetKeyword: {
    keyword: string;
    inTitle: boolean;
    inH1: boolean;
    inFirstParagraph: boolean;
    occurrences: number;
    densityPercent: number;
  } | null;
}

const MAX_HTML_BYTES = 2_000_000;

function countSyllables(word: string): number {
  const normalized = word.toLowerCase().replace(/[^a-z]/g, "");
  if (normalized.length === 0) return 0;
  const matches = normalized.match(/[aeiouy]+/g);
  let count = matches ? matches.length : 1;
  if (normalized.endsWith("e") && !normalized.endsWith("le") && count > 1) {
    count -= 1;
  }
  return Math.max(count, 1);
}

function readingEaseLabel(score: number): string {
  if (score >= 90) return "very easy";
  if (score >= 70) return "easy";
  if (score >= 60) return "standard";
  if (score >= 50) return "fairly difficult";
  if (score >= 30) return "difficult";
  return "very difficult";
}

export function analyzeHtml(
  html: string,
  options: { url: string; targetKeyword?: string },
): ContentAnalysis {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();

  const title = $("title").first().text().trim() || null;
  const metaDescription =
    $('meta[name="description"]').attr("content")?.trim() || null;

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const words = bodyText.length > 0 ? bodyText.split(" ") : [];
  const wordCount = words.length;

  const sentences = bodyText
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const sentenceCount = Math.max(sentences.length, 1);
  const avgWordsPerSentence = wordCount / sentenceCount;

  const syllableCount = words.reduce(
    (sum, word) => sum + countSyllables(word),
    0,
  );
  const avgSyllablesPerWord = wordCount > 0 ? syllableCount / wordCount : 0;
  const readingEaseScore =
    wordCount > 0
      ? Math.round(
          206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord,
        )
      : 0;

  const h1Text = $("h1")
    .map((_, el) => $(el).text().trim())
    .get();

  const headingCounts = {
    h1: $("h1").length,
    h2: $("h2").length,
    h3: $("h3").length,
  };

  const images = $("img");
  const imageCount = images.length;
  const imagesMissingAlt = images.filter(
    (_, el) => !$(el).attr("alt")?.trim(),
  ).length;

  let internalLinkCount = 0;
  let externalLinkCount = 0;
  let pageHost: string | null = null;
  try {
    pageHost = new URL(options.url).host;
  } catch {
    pageHost = null;
  }

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (
      !href ||
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:")
    ) {
      return;
    }
    try {
      const linkHost = new URL(href, options.url).host;
      if (pageHost && linkHost === pageHost) {
        internalLinkCount += 1;
      } else {
        externalLinkCount += 1;
      }
    } catch {
      internalLinkCount += 1;
    }
  });

  let targetKeyword: ContentAnalysis["targetKeyword"] = null;
  if (options.targetKeyword && options.targetKeyword.trim().length > 0) {
    const keyword = options.targetKeyword.trim();
    const keywordLower = keyword.toLowerCase();
    const bodyLower = bodyText.toLowerCase();
    const occurrences = bodyLower.split(keywordLower).length - 1;
    const firstParagraph = $("p").first().text().trim().toLowerCase();

    targetKeyword = {
      keyword,
      inTitle: (title ?? "").toLowerCase().includes(keywordLower),
      inH1: h1Text.some((text) => text.toLowerCase().includes(keywordLower)),
      inFirstParagraph: firstParagraph.includes(keywordLower),
      occurrences,
      densityPercent:
        wordCount > 0 ? Math.round((occurrences / wordCount) * 1000) / 10 : 0,
    };
  }

  return {
    url: options.url,
    title,
    titleLength: title?.length ?? 0,
    metaDescription,
    metaDescriptionLength: metaDescription?.length ?? 0,
    wordCount,
    sentenceCount,
    avgWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
    readingEaseScore,
    readingEaseLabel: readingEaseLabel(readingEaseScore),
    headingCounts,
    h1Text,
    imageCount,
    imagesMissingAlt,
    internalLinkCount,
    externalLinkCount,
    targetKeyword,
  };
}

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function assertFetchableUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https URLs are supported.");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    BLOCKED_HOSTS.has(hostname) ||
    hostname.endsWith(".local") ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  ) {
    throw new Error("This URL is not fetchable.");
  }
  return url;
}

export async function fetchAndAnalyze(
  rawUrl: string,
  options: { targetKeyword?: string } = {},
): Promise<ContentAnalysis> {
  const url = assertFetchableUrl(rawUrl);

  const response = await fetch(url.toString(), {
    headers: { "User-Agent": "OpenSEO-ContentQualityCheck/1.0" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch page: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    throw new Error(
      `URL did not return HTML (content-type: ${contentType || "unknown"}).`,
    );
  }

  const buffer = await response.arrayBuffer();
  const truncated = buffer.slice(0, MAX_HTML_BYTES);
  const html = new TextDecoder("utf-8").decode(truncated);

  return analyzeHtml(html, {
    url: url.toString(),
    targetKeyword: options.targetKeyword,
  });
}
