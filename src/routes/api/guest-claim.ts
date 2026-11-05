import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/guest-claim")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleGuestClaimRequest } =
          await import("@/server/auth/guest-claim-route");
        return handleGuestClaimRequest(request);
      },
    },
  },
});
