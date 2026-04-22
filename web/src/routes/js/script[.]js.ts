import { createFileRoute } from "@tanstack/react-router";

const PLAUSIBLE_SCRIPT_URL =
  "https://plausible.io/js/pa-f6y3kIQsae-ldmIxlnaPu.js";

export const Route = createFileRoute("/js/script.js")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const upstreamResponse = await fetch(PLAUSIBLE_SCRIPT_URL);

          if (!upstreamResponse.ok) {
            return buildFallbackScriptResponse();
          }

          const headers = new Headers(upstreamResponse.headers);
          headers.set("cache-control", "public, max-age=86400, immutable");

          return new Response(upstreamResponse.body, {
            status: upstreamResponse.status,
            headers,
          });
        } catch {
          return buildFallbackScriptResponse();
        }
      },
    },
  },
});

function buildFallbackScriptResponse() {
  return new Response(
    "window.plausible=window.plausible||function(){(window.plausible.q=window.plausible.q||[]).push(arguments)};",
    {
      status: 200,
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    },
  );
}
