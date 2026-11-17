import { AppError } from "@/server/lib/errors";

// treg (https://treg.to) resells DataForSEO per call from a prepaid balance,
// so a self-hoster can run OpenSEO without a DataForSEO account. It serves
// DataForSEO's API under its own base URL and relays request and response
// bodies unchanged, so only the base URL and the auth header change.

const DATAFORSEO_BASE = "https://api.dataforseo.com/v3/";
const TREG_DATAFORSEO_BASE = "https://treg.to/call/dataforseo/";

/** The treg URL for a DataForSEO URL. */
function tregUrlFor(dataforseoUrl: string): string {
  // The free validation sandbox has no treg twin, and sending its probe to
  // the live API would bill it.
  if (!dataforseoUrl.startsWith(DATAFORSEO_BASE)) {
    throw new AppError(
      "DATAFORSEO_AUTH_FAILED",
      `treg doesn't serve ${new URL(dataforseoUrl).host}. Set DATAFORSEO_API_KEY to use it.`,
      { provider: "treg" },
    );
  }
  return TREG_DATAFORSEO_BASE + dataforseoUrl.slice(DATAFORSEO_BASE.length);
}

/**
 * A fetch that takes DataForSEO URLs and serves them through treg, billed to
 * the treg team that owns `apiKey`. treg's own refusals (empty balance) come
 * back as OpenSEO errors; DataForSEO's answers pass through unchanged.
 */
export function createTregDataforseoFetch(apiKey: string): typeof fetch {
  return async (input, init) => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const headers = new Headers(init?.headers);
    headers.set("X-Treg-Token", apiKey);
    const response = await fetch(tregUrlFor(rawUrl), { ...init, headers });
    if (response.status === 402) {
      // Out of prepaid balance: nothing was billed, and only a top-up helps.
      console.warn("treg.insufficient-balance", {
        event: "treg.insufficient-balance",
      });
      throw new AppError(
        "UPSTREAM_UNAVAILABLE",
        "Your treg balance is empty. Top up at https://treg.to to keep using SEO data.",
        { provider: "treg", providerStatus: "402" },
      );
    }
    return response;
  };
}
