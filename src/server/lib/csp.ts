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

const TURNSTILE = "https://challenges.cloudflare.com";

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
 *   'report-sample' allows nothing: it puts the first 40 characters of a
 *   refused inline script or eval in the report.
 * - styles: inline is allowed, because React, charts, toasts and the map all
 *   write style attributes and <style> tags.
 * - images: the app's own, plus Google's favicon service (which redirects to
 *   gstatic.com) for the domains in AI visibility.
 * - connections: the app (the SAM chat socket is named because older Safari
 *   does not count wss: as 'self'), PostHog, and Turnstile, whose script
 *   reports back to its own host.
 * - frames: saved reports (same origin) and the Turnstile challenge.
 */
export function reportOnlyCsp(options: {
  nonce: string;
  host: string;
  posthogHost: string | undefined;
}) {
  const posthog = posthogSources(options.posthogHost).join(" ");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${options.nonce}' 'report-sample' ${TURNSTILE} ${posthog}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://www.google.com https://*.gstatic.com",
    "font-src 'self' data:",
    `connect-src 'self' wss://${options.host} ${posthog} ${TURNSTILE}`,
    `frame-src 'self' ${TURNSTILE}`,
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
    "script-sample": z.string().optional(),
  }),
});

/** A URL without its query and fragment, which can hold tokens and searches. */
function withoutQuery(value: string | undefined) {
  if (!value) return undefined;
  if (!URL.canParse(value)) return value.slice(0, 200);
  const url = new URL(value);
  return (url.origin === "null" ? url.protocol : url.origin) + url.pathname;
}

type CspReport = z.infer<typeof reportSchema>["csp-report"];

/**
 * Whether a browser extension caused the violation, which says nothing about
 * the app. Three signs, each from a field the page cannot fake to look like
 * its own code:
 * - an extension URL as the blocked resource or the script at fault. Chrome
 *   and Firefox send its scheme alone ("chrome-extension"); Safari sends the
 *   whole URL.
 * - "sandbox eval code", Firefox's name for a script an extension runs in the
 *   page.
 * - a document at about:blank or about:srcdoc. Extensions draw their panels
 *   in such frames, which inherit this policy; the app renders none.
 */
function isFromExtension(report: CspReport) {
  const source = report["source-file"];
  return (
    [report["blocked-uri"], source].some(
      (uri) => uri && /^[a-z-]*extension(:|$)/.test(uri),
    ) ||
    source === "sandbox eval code" ||
    /^about(:|$)/.test(report["document-uri"] ?? "")
  );
}

function originOf(uri: string | undefined) {
  if (!uri || !URL.canParse(uri)) return undefined;
  const { origin } = new URL(uri);
  return origin === "null" ? undefined : origin;
}

/**
 * Whether the app itself caused a violation, as far as one report can tell:
 * - "yes": the blocked resource is on the app's own origin or on one the app
 *   runs scripts from (Turnstile, PostHog), so the app uses it and this
 *   directive doesn't list it. Or one of the app's bundles, or a script from
 *   one of those origins, made the request.
 * - "maybe": an inline script, an eval, or a data: or blob: URL. A report
 *   doesn't say who wrote those; `sample` is how the script starts.
 * - "no": a resource on an origin the app runs nothing from, which an
 *   extension's stylesheet or an injected tag asked for.
 */
function causedByApp(
  report: CspReport,
  directive: string,
  appOrigin: string,
  posthogHost: string | undefined,
) {
  // Here the blocked URL is the app's own page: another site framed it.
  if (directive === "frame-ancestors") return "no";
  const scriptOrigins = [TURNSTILE, ...posthogSources(posthogHost)];
  const blocked = originOf(report["blocked-uri"]);
  if (blocked && [appOrigin, ...scriptOrigins].includes(blocked)) return "yes";
  const source = report["source-file"];
  const byAppScript =
    source?.startsWith(`${appOrigin}/assets/`) ||
    scriptOrigins.some((origin) => origin === originOf(source));
  // Fonts, images and styles load when the page is laid out, and the report
  // names whichever script made that happen, not one that asked for them.
  if (byAppScript && !/^(font|img|media|style)-src/.test(directive)) {
    return "yes";
  }
  return blocked ? "no" : "maybe";
}

/**
 * Takes a browser's report of something the report-only policy would have
 * blocked and writes one `[csp-report]` line to the Worker's logs. Anyone can
 * post here, so a report is size capped, counted per IP, and logged only as
 * the few fields below. Violations a browser extension caused are dropped.
 */
export async function handleCspReport(
  request: Request,
  limiter: RateLimit | undefined,
  posthogHost: string | undefined,
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
  if (!isFromExtension(report)) {
    // Older browsers send the whole directive, sources and all.
    const directive =
      (report["effective-directive"] ?? report["violated-directive"])?.split(
        " ",
      )[0] ?? "";
    console.warn(
      "[csp-report]",
      JSON.stringify({
        ours: causedByApp(
          report,
          directive,
          new URL(request.url).origin,
          posthogHost,
        ),
        directive: directive.slice(0, 100),
        blocked: withoutQuery(report["blocked-uri"]),
        page: withoutQuery(report["document-uri"]),
        source: withoutQuery(report["source-file"]),
        line: report["line-number"],
        sample: report["script-sample"]?.slice(0, 40),
      }),
    );
  }
  return new Response(null, { status: 204 });
}
