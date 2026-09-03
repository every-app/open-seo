import { captureClientEvent } from "@/client/lib/posthog";

/**
 * Marker appended to the errorCallbackURL so a failed Google link redirect can
 * be told apart from any other `error` query param. Its value is the provider
 * key ("gsc" | "ga4").
 */
export const GOOGLE_LINK_ERROR_PARAM = "google_link_error";

export type GoogleLinkProvider = "gsc" | "ga4";

type CapturedLinkError = {
  provider: GoogleLinkProvider;
  code: string;
};

/**
 * Read and scrub the error params synchronously at module init, before
 * TanStack Router starts. Routes are free to redirect on load (`/` bounces to
 * the project dashboard), and a redirect fired from a route loader replaces
 * the URL before any effect runs — reading window.location in useEffect would
 * lose the params on exactly those pages. __root.tsx calls
 * captureGoogleLinkError() at module scope so the capture stays in the entry
 * chunk even when routes are code-split.
 */
function captureLinkErrorFromLocation(): CapturedLinkError | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const provider = url.searchParams.get(GOOGLE_LINK_ERROR_PARAM);
  if (provider !== "gsc" && provider !== "ga4") return null;
  const code = url.searchParams.get("error") ?? "unknown";
  url.searchParams.delete(GOOGLE_LINK_ERROR_PARAM);
  url.searchParams.delete("error");
  url.searchParams.delete("error_description");
  // history.replaceState rather than a router navigate: the params are
  // one-shot and foreign to every route's search schema, and the router (not
  // yet started) should never see them. Passing the current history.state
  // through leaves whatever state the browser restored intact.
  window.history.replaceState(window.history.state, "", url);
  return { provider, code };
}

let captured: CapturedLinkError | null = null;
let didCapture = false;
let reported = false;

/** Idempotent; the first call (from __root's module scope) wins. */
export function captureGoogleLinkError() {
  if (didCapture) return;
  didCapture = true;
  captured = captureLinkErrorFromLocation();
}

/** The captured link failure for this provider, if any survived the redirect. */
export function getGoogleLinkError(
  provider: GoogleLinkProvider,
): { code: string } | null {
  captureGoogleLinkError();
  return captured?.provider === provider ? { code: captured.code } : null;
}

/** Called on dismiss so SPA navigation doesn't resurrect the alert. */
export function clearGoogleLinkError() {
  captured = null;
}

/**
 * Emit the analytics event the first time the error is actually shown.
 * Deliberately not at module init: PostHog capture only starts once the
 * session has loaded, which is guaranteed by the time an authenticated
 * connect surface renders the alert.
 */
export function reportGoogleLinkErrorOnce() {
  if (!captured || reported) return;
  reported = true;
  captureClientEvent(`${captured.provider}:connect_error`, {
    error_code: captured.code,
  });
}
