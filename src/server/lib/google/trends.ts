import { z } from "zod";

const trendsResponseSchema = z.object({
  default: z.object({
    timelineData: z.array(
      z.object({
        time: z.string(),
        value: z.array(z.number()),
      }),
    ),
  }),
});

const relatedQueriesResponseSchema = z.object({
  default: z.object({
    rankedList: z.array(
      z.object({
        rankedKeyword: z.array(
          z.object({ keyword: z.string(), value: z.number() }),
        ),
      }),
    ),
  }),
});

const cache = new Map<
  string,
  { expiresAt: number; result: GoogleTrendResult }
>();
const CACHE_TTL_MS = 15 * 60 * 1000;

async function fetchWithRetry(url: URL): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) return response;
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) {
      throw new Error(`Google Trends request failed (${response.status})`);
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    const delayMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 10000)
        : 500 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error("Google Trends request failed after retries");
}

export type GoogleTrendPoint = {
  date: string;
  value: number;
};

export type GoogleTrendResult = {
  keyword: string;
  geo: string;
  timeframe: string;
  points: GoogleTrendPoint[];
  relatedQueries: Array<{ query: string; value: number }>;
  source: "google-trends";
  interpretation: "relative-interest-index";
};

function unwrap(payload: string): unknown {
  const json = payload.replace(/^\)]}',?\n/, "");
  return JSON.parse(json) as unknown;
}

export async function fetchGoogleTrend(input: {
  keyword: string;
  geo?: string;
  timeframe?: string;
}): Promise<GoogleTrendResult> {
  const keyword = input.keyword.trim();
  const geo = input.geo ?? "US";
  const timeframe = input.timeframe ?? "today 12-m";
  const cacheKey = `${keyword}|${geo}|${timeframe}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  const exploreUrl = new URL("https://trends.google.com/trends/api/explore");
  exploreUrl.searchParams.set(
    "req",
    JSON.stringify({
      comparisonItem: [{ keyword, geo, time: timeframe }],
      category: 0,
      property: "",
    }),
  );
  exploreUrl.searchParams.set("tz", "0");
  const explore = await fetchWithRetry(exploreUrl);
  const widgets = z
    .array(
      z.object({ id: z.string(), token: z.string(), request: z.unknown() }),
    )
    .parse((unwrap(await explore.text()) as { widgets?: unknown }).widgets);
  const timeline = widgets.find((widget) => widget.id === "TIMESERIES");
  if (!timeline) throw new Error("Google Trends returned no timeline widget");
  const timelineUrl = new URL(
    "https://trends.google.com/trends/api/widgetdata/multiline",
  );
  timelineUrl.searchParams.set("req", JSON.stringify(timeline.request));
  timelineUrl.searchParams.set("token", timeline.token);
  timelineUrl.searchParams.set("tz", "0");
  const response = await fetchWithRetry(timelineUrl);
  const parsed = trendsResponseSchema.parse(unwrap(await response.text()));
  const relatedWidget = widgets.find((widget) =>
    widget.id.startsWith("RELATED_QUERIES"),
  );
  let relatedQueries: Array<{ query: string; value: number }> = [];
  if (relatedWidget) {
    const relatedUrl = new URL(
      "https://trends.google.com/trends/api/widgetdata/relatedsearches",
    );
    relatedUrl.searchParams.set("req", JSON.stringify(relatedWidget.request));
    relatedUrl.searchParams.set("token", relatedWidget.token);
    relatedUrl.searchParams.set("tz", "0");
    try {
      const relatedResponse = await fetchWithRetry(relatedUrl);
      const related = relatedQueriesResponseSchema.parse(
        unwrap(await relatedResponse.text()),
      );
      relatedQueries = related.default.rankedList
        .flatMap((list) => list.rankedKeyword)
        .map(({ keyword: query, value }) => ({ query, value }));
    } catch {
      relatedQueries = [];
    }
  }
  const result = {
    keyword,
    geo,
    timeframe,
    points: parsed.default.timelineData.map((point) => ({
      date: new Date(Number(point.time) * 1000).toISOString(),
      value: point.value[0] ?? 0,
    })),
    relatedQueries,
    source: "google-trends",
    interpretation: "relative-interest-index",
  };
  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, result });
  return result;
}
