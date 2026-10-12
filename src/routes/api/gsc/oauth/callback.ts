import { createFileRoute } from "@tanstack/react-router";
import {
  GSC_INTEGRATION,
  handleGoogleOAuthCallbackRequest,
} from "@/server/features/google/googleOAuth";

export const Route = createFileRoute("/api/gsc/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) =>
        handleGoogleOAuthCallbackRequest(request, GSC_INTEGRATION),
    },
  },
});
