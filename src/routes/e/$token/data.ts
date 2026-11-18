import { createFileRoute } from "@tanstack/react-router";
import { runEmbedCall } from "@/server/features/embeds/embedRoutes";

// The embed page's tool calls. See runEmbedCall for what a link may run.
export const Route = createFileRoute("/e/$token/data")({
  server: {
    handlers: {
      POST: ({ params, request }) => runEmbedCall(params.token, request),
    },
  },
});
