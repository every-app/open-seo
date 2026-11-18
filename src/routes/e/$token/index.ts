import { createFileRoute } from "@tanstack/react-router";
import { renderEmbedPage } from "@/server/features/embeds/embedRoutes";
import { EmbedWidget } from "@/shared/embeds";

// An embed link's full page, for a sidebar: every widget, one under another.
// Raw-Response routes like /s/<token>: no React shell, no auth guard, and no
// `component`, which would pull the server-only renderer into the client.
export const Route = createFileRoute("/e/$token/")({
  server: {
    handlers: {
      GET: ({ params, request }) =>
        renderEmbedPage(params.token, Object.values(EmbedWidget), request),
    },
  },
});
