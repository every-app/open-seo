import { captureClientEvent } from "@/client/lib/posthog";
import { BING_LINK_ERROR_PARAM } from "@/shared/bing";

/**
 * Read and scrub the error params synchronously at module init, before
 * TanStack Router starts. Routes are free to redirect on load, and a redirect
 * fired from a route loader replaces the URL before any effect runs — reading
 * window.location in useEffect would lose the params on exactly those pages.
 * __root.tsx calls captureBingLinkError() at module scope so the capture stays
 * in the entry chunk even when routes are code-split.
 */
function captureLinkErrorFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  if (url.searchParams.get(BING_LINK_ERROR_PARAM) !== "bing") return null;
  const code = url.searchParams.get("error") ?? "unknown";
  url.searchParams.delete(BING_LINK_ERROR_PARAM);
  url.searchParams.delete("error");
  // history.replaceState rather than a router navigate: the params are
  // one-shot and foreign to every route's search schema, and the router (not
  // yet started) should never see them. Passing the current history.state
  // through leaves whatever state the browser restored intact.
  window.history.replaceState(window.history.state, "", url);
  return code;
}

let captured: string | null = null;
let didCapture = false;
let reported = false;

/** Idempotent; the first call (from __root's module scope) wins. */
export function captureBingLinkError() {
  if (didCapture) return;
  didCapture = true;
  captured = captureLinkErrorFromLocation();
}

/** The captured link failure code, if one survived the redirect. */
export function getBingLinkError(): { code: string } | null {
  captureBingLinkError();
  return captured ? { code: captured } : null;
}

/** Called on dismiss so SPA navigation doesn't resurrect the alert. */
export function clearBingLinkError() {
  captured = null;
}

/**
 * Emit the analytics event the first time the error is actually shown.
 * Deliberately not at module init: PostHog capture only starts once the
 * session has loaded, which is guaranteed by the time an authenticated
 * connect surface renders the alert.
 */
export function reportBingLinkErrorOnce() {
  if (!captured || reported) return;
  reported = true;
  captureClientEvent("bing:connect_error", { error_code: captured });
}
