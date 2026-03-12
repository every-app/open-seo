import { createFileRoute } from "@tanstack/react-router";

const PLAUSIBLE_SCRIPT_URL = "https://plausible.io/js/pa-DllmchvGzcNdY2jEy1-Hc.js";

export const Route = createFileRoute("/js/script.js")({
  server: {
    handlers: {
      GET: async () => {
        const upstreamResponse = await fetch(PLAUSIBLE_SCRIPT_URL);

        if (!upstreamResponse.ok) {
          return new Response("Failed to load analytics script", {
            status: 502,
            headers: {
              "content-type": "text/plain; charset=utf-8",
            },
          });
        }

        const headers = new Headers(upstreamResponse.headers);
        headers.set("cache-control", "public, max-age=86400, immutable");

        return new Response(upstreamResponse.body, {
          status: upstreamResponse.status,
          headers,
        });
      },
    },
  },
});
