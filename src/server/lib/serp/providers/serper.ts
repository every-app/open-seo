import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { getIsoCountryCode } from "@/shared/keyword-locations";
import type { SerpLiveInput, SerpLiveItem, SerpProvider } from "./base";

// ---------------------------------------------------------------------------
// Normaliser: maps a Serper organic row into our internal shape
// parity with dataforseo/serp.ts output.
// ---------------------------------------------------------------------------

function normalise(row: Record<string, unknown>): SerpLiveItem {
  return {
    type: "organic",
    rank_absolute: typeof row.position === "number" ? row.position : null,
    rank_group: typeof row.position === "number" ? row.position : null,
    title: (typeof row.title === "string" && row.title) || null,
    url: (typeof row.link === "string" && row.link) || null,
    domain: (typeof row.domain === "string" && row.domain) || null,
    description: (typeof row.snippet === "string" && row.snippet) || null,
    etv: null,
    estimated_paid_traffic_cost: null,
    backlinks_info: null,
  };
}

// ---------------------------------------------------------------------------
// Serper provider — POST https://google.serper.dev/search
// ---------------------------------------------------------------------------

export class SerperProvider implements SerpProvider {
  name = "serper";

  async liveSerp(input: SerpLiveInput): Promise<SerpLiveItem[]> {
    const apiKey = await getOptionalEnvValue("SERPER_API_KEY");
    if (!apiKey) {
      throw new AppError(
        "VALIDATION_ERROR",
        "SERPER_API_KEY environment variable is not set. Sign up at serper.dev to get one.",
      );
    }

    const body: Record<string, unknown> = { q: input.keyword };

    // Map DataForSEO location_code → Serper gl param
    if (input.locationCode) {
      // getIsoCountryCode returns uppercase ISO codes ("US", "GB") which Serper accepts
      body.gl = getIsoCountryCode(input.locationCode);
    }

    if (input.languageCode) {
      body.hl = input.languageCode;
    }

    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new AppError(
        "UPSTREAM_UNAVAILABLE",
        `Serper HTTP ${response.status}: ${raw.slice(0, 500)}`,
      );
    }

    const json = (await response.json()) as Record<string, unknown>;
    const organicRows = (json.organic as Record<string, unknown>[] | undefined) ?? [];

    return organicRows.map(normalise);
  }
}
