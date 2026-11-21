import { createFileRoute } from "@tanstack/react-router";
import { renderSharePage } from "@/server/features/reports/sharePage";

// The public share page is a raw-Response route, like the two document routes:
// no React, no auth guard, no app bundle for a reader who has never signed in.
// No `component`, on purpose: one would pull the server-only renderer (and
// `cloudflare:workers` with it) into the client bundle, and the app never
// navigates here client-side — the share modal links to it with a plain anchor.
export const Route = createFileRoute("/s/$token/")({
  server: {
    handlers: {
      GET: ({ params, request, context }) =>
        renderSharePage(params.token, request, context.cspNonce),
    },
  },
});
