import { createFileRoute } from "@tanstack/react-router";
import {
  GA4_INTEGRATION,
  handleGoogleOAuthCallbackRequest,
} from "@/server/features/google/googleOAuth";

export const Route = createFileRoute("/api/ga4/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) =>
        handleGoogleOAuthCallbackRequest(request, GA4_INTEGRATION),
    },
  },
});
