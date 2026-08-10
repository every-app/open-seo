import { createFileRoute } from "@tanstack/react-router";
import {
  GA4_INTEGRATION,
  handleSelfHostedGoogleOAuthCallbackRequest,
} from "@/server/features/google/selfHostedOAuth";

export const Route = createFileRoute("/api/ga4/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) =>
        handleSelfHostedGoogleOAuthCallbackRequest(request, GA4_INTEGRATION),
    },
  },
});
