import { z } from "zod";

const trendsResponseSchema = z.object({
  default: z.object({
    timelineData: z.array(
      z.object({
        time: z.string(),
        value: z.array(z.number()),
      }),
    ),
    comparedItem: z.array(
      z.object({
        keyword: z.string(),
      }),
    ),
  }),
});

export type GoogleTrendPoint = {
  date: string;
  value: number;
};

export type GoogleTrendResult = {
  keyword: string;
  geo: string;
  timeframe: string;
  points: GoogleTrendPoint[];
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
  const explore = await fetch(exploreUrl, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!explore.ok)
    throw new Error(`Google Trends explore failed (${explore.status})`);
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
  const response = await fetch(timelineUrl, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(`Google Trends timeline failed (${response.status})`);
  const parsed = trendsResponseSchema.parse(unwrap(await response.text()));
  return {
    keyword,
    geo,
    timeframe,
    points: parsed.default.timelineData.map((point) => ({
      date: new Date(Number(point.time) * 1000).toISOString(),
      value: point.value[0] ?? 0,
    })),
    source: "google-trends",
    interpretation: "relative-interest-index",
  };
}
