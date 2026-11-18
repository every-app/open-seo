import { AppError } from "@/server/lib/errors";

// treg (https://treg.to) resells DataForSEO per call from a prepaid balance,
// so a self-hoster can run OpenSEO without a DataForSEO account. It serves
// the DataForSEO endpoints in its catalog under its own base URL and relays
// request and response bodies unchanged, so only the base URL and the auth
// header change.

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
 * A refusal treg made itself, as OpenSEO's error; null for the ones the
 * DataForSEO error ladder already handles (429 and 5xx: retry later).
 */
async function tregRefusalError(response: Response, path: string) {
  // treg's refusals are JSON with a `detail`: a sentence, or an object with
  // an `error` and what to do about it. Kept whole for the server log.
  const body: unknown = await response.json().catch(() => null);
  const details = {
    provider: "treg",
    providerStatus: String(response.status),
    providerPath: path,
    tregDetail: JSON.stringify(body).slice(0, 600),
  };
  // Not reportable and so not logged by the error handlers: warn so the
  // self-hoster finds treg's own words in the server log.
  console.warn("treg.refused", { event: "treg.refused", ...details });

  if (response.status === 402) {
    // Out of prepaid balance: nothing was billed, and only a top-up helps.
    return new AppError(
      "UPSTREAM_UNAVAILABLE",
      "Your treg balance is empty. Top up at https://treg.to to keep using SEO data.",
      details,
    );
  }
  if (response.status === 401 || response.status === 403) {
    return new AppError(
      "DATAFORSEO_AUTH_FAILED",
      "treg refused TREG_API_TOKEN. Check the token and its team's balance at https://treg.to.",
      details,
    );
  }
  if (response.status === 404) {
    // treg relays only the paths its catalog lists. INTERNAL_ERROR because
    // the app's copy for it sends a self-hoster to the server log.
    return new AppError(
      "INTERNAL_ERROR",
      `treg doesn't serve DataForSEO's ${path} yet. Set DATAFORSEO_API_KEY to use this feature.`,
      details,
    );
  }
  return null;
}

/**
 * A fetch that takes DataForSEO URLs and serves them through treg, billed to
 * the treg team that owns `apiKey`. treg's own refusals (a bad token, an
 * empty balance, a path it doesn't serve) come back as OpenSEO errors;
 * DataForSEO's answers pass through unchanged.
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
    // treg marks its own refusals; without the header the status and body
    // are DataForSEO's (a 402 there is treg's DataForSEO account, not yours).
    if (response.ok || response.headers.get("X-Treg-Error") !== "1") {
      return response;
    }
    const refused = await tregRefusalError(
      response.clone(),
      new URL(rawUrl).pathname,
    );
    if (refused) throw refused;
    return response;
  };
}
