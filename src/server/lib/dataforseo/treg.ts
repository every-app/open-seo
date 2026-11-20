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

// The refusals treg makes itself that retrying can't fix. Its 429 and 5xx
// go through the DataForSEO error ladder instead (retry later).
const TREG_REFUSAL_STATUSES = new Set([401, 402, 403, 404]);

/** A refusal treg made itself (one of TREG_REFUSAL_STATUSES), as OpenSEO's error. */
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
  // 404: treg relays only the paths its catalog lists. INTERNAL_ERROR because
  // the app's copy for it sends a self-hoster to the server log.
  return new AppError(
    "INTERNAL_ERROR",
    `treg doesn't serve DataForSEO's ${path} yet. Set DATAFORSEO_API_KEY to use this feature.`,
    details,
  );
}

/**
 * A fetch that takes DataForSEO URLs and serves them through treg, sent with
 * `tregFetch`, which puts a treg token on the call: the deployment's own, or
 * on an Every App gateway the gateway's. treg's own refusals (a bad token, an
 * empty balance, a path it doesn't serve) come back as OpenSEO errors;
 * DataForSEO's answers pass through unchanged.
 */
export function createTregDataforseoFetch(
  tregFetch: typeof fetch,
): typeof fetch {
  return async (input, init) => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const response = await tregFetch(tregUrlFor(rawUrl), init);
    // treg marks its own refusals; without the header the status and body
    // are DataForSEO's (a 402 there is treg's DataForSEO account, not yours).
    // Decide from the status, not the body: a body read here can't be read
    // again downstream, and the Docker edition's runtime can't clone it.
    if (
      response.headers.get("X-Treg-Error") !== "1" ||
      !TREG_REFUSAL_STATUSES.has(response.status)
    ) {
      return response;
    }
    throw await tregRefusalError(response, new URL(rawUrl).pathname);
  };
}
