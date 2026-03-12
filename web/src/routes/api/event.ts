import { createFileRoute } from "@tanstack/react-router";

const PLAUSIBLE_EVENT_URL = "https://plausible.io/api/event";

export const Route = createFileRoute("/api/event")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const proxyRequest = new Request(PLAUSIBLE_EVENT_URL, request);
        proxyRequest.headers.delete("cookie");

        const upstreamResponse = await fetch(proxyRequest);
        return new Response(upstreamResponse.body, {
          status: upstreamResponse.status,
          headers: upstreamResponse.headers,
        });
      },
    },
  },
});
