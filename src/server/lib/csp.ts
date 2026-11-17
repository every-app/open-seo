import { z } from "zod";

// The policy every app document already enforces:
// - `frame-ancestors 'self'`: no third-party page can frame an app route and
//   UI-redress a one-click action (delete a project, buy credits).
// - `object-src 'none'` and `base-uri 'self'`: the app has no plugins and no
//   <base>, so injected markup can't add either.
export const ENFORCED_CSP =
  "frame-ancestors 'self'; object-src 'none'; base-uri 'self'";

// Served by src/routes/api/csp-report.ts.
const CSP_REPORT_PATH = "/api/csp-report";

/** Where posthog-js sends events and loads its lazy bundles from. */
function posthogSources(posthogHost: string | undefined) {
  if (!posthogHost || !URL.canParse(posthogHost)) return [];
  const { origin, hostname } = new URL(posthogHost);
  // PostHog Cloud serves the bundles from a sibling host; a reverse proxy
  // serves them itself.
  const cloud = /^(us|eu)\.i\.posthog\.com$/.exec(hostname);
  return cloud
    ? [origin, `https://${cloud[1]}-assets.i.posthog.com`]
    : [origin];
}

/**
 * The full policy for OpenSEO Cloud's app documents, sent report-only: the
 * browser blocks nothing and posts what it would have blocked to
 * CSP_REPORT_PATH. It is the enforced policy plus everything a page may load:
 * - scripts: the app's own files, the inline scripts carrying this response's
 *   nonce, Turnstile, and PostHog's lazy bundles. No 'unsafe-inline'.
 * - styles: inline is allowed, because React, charts, toasts and the map all
 *   write style attributes and <style> tags.
 * - images: the app's own, plus Google's favicon service (which redirects to
 *   gstatic.com) for the domains in AI visibility.
 * - connections: the app (the SAM chat socket is named because older Safari
 *   does not count wss: as 'self') and PostHog.
 * - frames: saved reports (same origin) and the Turnstile challenge.
 */
export function reportOnlyCsp(options: {
  nonce: string;
  host: string;
  posthogHost: string | undefined;
}) {
  const posthog = posthogSources(options.posthogHost).join(" ");
  const turnstile = "https://challenges.cloudflare.com";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${options.nonce}' ${turnstile} ${posthog}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://www.google.com https://*.gstatic.com",
    "font-src 'self' data:",
    `connect-src 'self' wss://${options.host} ${posthog}`,
    `frame-src 'self' ${turnstile}`,
    "worker-src 'self' blob:",
    "form-action 'self'",
    ENFORCED_CSP,
    `report-uri ${CSP_REPORT_PATH}`,
  ]
    .map((directive) => directive.trim())
    .join("; ");
}

const MAX_REPORT_BYTES = 8192;

const reportSchema = z.object({
  "csp-report": z.object({
    "effective-directive": z.string().optional(),
    "violated-directive": z.string().optional(),
    "blocked-uri": z.string().optional(),
    "document-uri": z.string().optional(),
    "source-file": z.string().optional(),
    "line-number": z.number().optional(),
  }),
});

/** A URL without its query and fragment, which can hold tokens and searches. */
function withoutQuery(value: string | undefined) {
  if (!value) return undefined;
  if (!URL.canParse(value)) return value.slice(0, 200);
  const url = new URL(value);
  return (url.origin === "null" ? url.protocol : url.origin) + url.pathname;
}

/**
 * Takes a browser's report of something the report-only policy would have
 * blocked and writes one `[csp-report]` line to the Worker's logs. Anyone can
 * post here, so a report is size capped, counted per IP, and logged only as
 * the few fields below. Violations caused by a browser extension say nothing
 * about the app and are dropped.
 */
export async function handleCspReport(
  request: Request,
  limiter: RateLimit | undefined,
): Promise<Response> {
  const length = Number(request.headers.get("content-length"));
  if (!(length > 0 && length <= MAX_REPORT_BYTES)) {
    return new Response(null, { status: 413 });
  }
  const ip = request.headers.get("cf-connecting-ip");
  if (limiter && ip && !(await limiter.limit({ key: ip })).success) {
    return new Response(null, { status: 429 });
  }
  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });

  const report = parsed.data["csp-report"];
  const fromExtension = [report["blocked-uri"], report["source-file"]].some(
    (uri) => uri && /^[a-z-]*extension:/.test(uri),
  );
  if (!fromExtension) {
    console.warn(
      "[csp-report]",
      JSON.stringify({
        directive: (
          report["effective-directive"] ?? report["violated-directive"]
        )?.slice(0, 100),
        blocked: withoutQuery(report["blocked-uri"]),
        page: withoutQuery(report["document-uri"]),
        source: withoutQuery(report["source-file"]),
        line: report["line-number"],
      }),
    );
  }
  return new Response(null, { status: 204 });
}
