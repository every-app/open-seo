import { createFileRoute } from "@tanstack/react-router";
import { ingestEvent } from "@/server/features/web-analytics/services/WebAnalyticsIngestService";

// Public tracker ingestion. Unauthenticated by design (the tracker runs on
// the customer's own site): every payload is validated, bots are dropped,
// and events for anything but the site's own domain are rejected. CORS `*`
// matches the tracker's text/plain "simple" request (no preflight needed,
// but allow it anyway for custom setups).

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

type IngestStatus = 202 | 400 | 403 | 404 | 413;

function emptyResponse(status: IngestStatus): Response {
  return new Response(null, {
    status,
    headers: { ...CORS_HEADERS, "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/wa/event")({
  server: {
    handlers: {
      OPTIONS: () => emptyResponse(202),
      POST: async ({ request }) => {
        // Geo: request.cf on Workers deployments; behind the Cloudflare
        // tunnel (Docker self-host) request.cf is absent, but the edge
        // stamps the visitor's country on every proxied request as
        // CF-IPCountry. No IP is ever stored.
        const cf = (
          request as Request & {
            readonly cf?: { country?: string; region?: string; city?: string };
          }
        ).cf;
        const outcome = await ingestEvent({
          rawBody: await request.text(),
          userAgent: request.headers.get("user-agent") ?? "",
          geo: {
            country: request.headers.get("cf-ipcountry") ?? cf?.country ?? null,
            region: cf?.region ?? null,
            city: cf?.city ?? null,
          },
        });
        const status: IngestStatus =
          outcome === "accepted" || outcome === "bot"
            ? 202
            : outcome === "payload_too_large"
              ? 413
              : outcome === "unknown_site"
                ? 404
                : outcome === "foreign_domain"
                  ? 403
                  : 400;
        return emptyResponse(status);
      },
    },
  },
});
