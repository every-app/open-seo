import { createFileRoute } from "@tanstack/react-router";
import {
  GSC_INTEGRATION,
  handleSelfHostedGoogleOAuthCallbackRequest,
} from "@/server/features/google/selfHostedOAuth";

export const Route = createFileRoute("/api/gsc/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        return handleSelfHostedGoogleOAuthCallbackRequest(
          request,
          GSC_INTEGRATION,
        );
      },
    },
  },
});
