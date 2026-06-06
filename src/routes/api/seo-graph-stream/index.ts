/**
 * /api/seo-graph-stream?run_id={runId}
 *
 * Proxies the SSE stream from Railway FastAPI:
 *   GET /api/v1/audit-graph/{run_id}/stream
 *
 * Events emitted by Railway:
 *   node_start    { node, timestamp }
 *   thinking      { node, chunk }        (Nemotron streaming tokens)
 *   node_complete { node, timestamp }
 *   done          { client_report }
 *   error         { message }
 *
 * Cloudflare Workers support native EventSource / ReadableStream passthrough.
 */
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

const RAILWAY_BASE =
  (env as unknown as { RAILWAY_SEO_API_URL?: string }).RAILWAY_SEO_API_URL ??
  "https://openclaw-api-k30t.onrender.com";

const RAILWAY_API_KEY =
  (env as unknown as { RAILWAY_SEO_API_KEY?: string }).RAILWAY_SEO_API_KEY ??
  "test";

export const Route = createFileRoute("/api/seo-graph-stream/")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const runId = url.searchParams.get("run_id");

        if (!runId) {
          return new Response(
            JSON.stringify({ error: "run_id query param required" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        // Proxy the upstream SSE stream from Railway
        const upstream = await fetch(
          `${RAILWAY_BASE}/api/v1/audit-graph/${runId}/stream`,
          {
            headers: {
              Accept: "text/event-stream",
              Authorization: `Bearer ${RAILWAY_API_KEY}`,
            },
          },
        );

        if (!upstream.ok || !upstream.body) {
          return new Response(
            JSON.stringify({ error: `Railway returned ${upstream.status}` }),
            { status: upstream.status, headers: { "Content-Type": "application/json" } },
          );
        }

        // Pass the ReadableStream through with SSE headers
        return new Response(upstream.body, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
