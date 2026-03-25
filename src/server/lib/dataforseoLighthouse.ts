import { env } from "cloudflare:workers";
import {
  parseDataforseoLighthousePayload,
  requestCategories,
  type LighthouseStrategy,
} from "@/server/lib/dataforseoLighthousePayload";
import type { DataforseoApiResponse } from "@/server/lib/dataforseoCost";
import type { StoredLighthousePayload } from "@/server/lib/lighthouseStoredPayload";

const DATAFORSEO_LIGHTHOUSE_ENDPOINT =
  "https://api.dataforseo.com/v3/on_page/lighthouse/live/json";

export async function fetchDataforseoLighthouseResultRaw(input: {
  url: string;
  strategy: LighthouseStrategy;
}): Promise<DataforseoApiResponse<StoredLighthousePayload>> {
  const response = await fetch(DATAFORSEO_LIGHTHOUSE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${env.DATAFORSEO_API_KEY?.trim() ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      {
        url: input.url,
        for_mobile: input.strategy === "mobile",
        categories: requestCategories,
      },
    ]),
    signal: AbortSignal.timeout(60_000),
  });

  const rawText = await response.text();

  if (!response.ok) {
    throw new Error(
      `DataForSEO Lighthouse request failed (${response.status}): ${rawText}`,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawText);
  } catch {
    throw new Error(
      `DataForSEO Lighthouse returned non-JSON content (content-type: ${response.headers.get("content-type") ?? "unknown"}): ${rawText}`,
    );
  }

  const data = parseDataforseoLighthousePayload(payload, input);

  return {
    data,
    billing: {
      path: ["v3", "on_page", "lighthouse", "live", "json"],
      costUsd: data.metadata.cost ?? 0,
      resultCount: 1,
    },
  };
}
