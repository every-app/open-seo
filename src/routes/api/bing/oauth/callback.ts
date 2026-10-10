import { createFileRoute } from "@tanstack/react-router";
import { handleBingOAuthCallbackRequest } from "@/server/features/bing/bingOAuth";

export const Route = createFileRoute("/api/bing/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) =>
        handleBingOAuthCallbackRequest(request),
    },
  },
});
