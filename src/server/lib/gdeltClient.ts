const GDELT_DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc";

interface GdeltArticle {
  url: string;
  title: string;
  seendate: string;
  domain: string;
  tone?: number;
}

interface GdeltResponse {
  articles?: GdeltArticle[];
}

export interface GdeltMention {
  sourceId: string;
  title: string;
  url: string;
  publishedAt: string | null;
  sentimentScore: number;
  sentimentLabel: "positive" | "neutral" | "negative";
}

function toSentimentLabel(tone: number): "positive" | "neutral" | "negative" {
  if (tone <= -2) return "negative";
  if (tone >= 2) return "positive";
  return "neutral";
}

function parseSeenDate(seendate: string): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(seendate);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
}

/**
 * Free, unauthenticated news-index search. Bare special characters like "&"
 * in a query (e.g. "I&M Bank") make GDELT reject the request, so the whole
 * phrase is quoted before sending.
 */
export async function fetchGdeltMentions(
  query: string,
  options: { maxRecords?: number; timespan?: string } = {},
): Promise<GdeltMention[]> {
  const maxRecords = options.maxRecords ?? 50;
  const timespan = options.timespan ?? "7d";
  const safeQuery = `"${query.replace(/"/g, "")}"`;

  const url = new URL(GDELT_DOC_API);
  url.searchParams.set("query", safeQuery);
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", String(maxRecords));
  url.searchParams.set("timespan", timespan);

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url.toString(), {
        headers: { "User-Agent": "OpenSEO-BrandMonitor/1.0" },
      });
      if (!response.ok) {
        throw new Error(`GDELT request failed: ${response.status}`);
      }
      const body = (await response.json()) as GdeltResponse;
      const articles = body.articles ?? [];

      return articles.map((article) => {
        const tone = article.tone ?? 0;
        return {
          sourceId: article.url,
          title: article.title,
          url: article.url,
          publishedAt: parseSeenDate(article.seendate),
          sentimentScore: tone,
          sentimentLabel: toSentimentLabel(tone),
        };
      });
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("GDELT request failed");
}
