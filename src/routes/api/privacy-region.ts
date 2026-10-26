import { createFileRoute } from "@tanstack/react-router";
import { requiresOptIn } from "@/shared/privacy-choices";

// Which privacy defaults apply to the visitor's location (Cloudflare's
// CF-IPCountry). A route rather than a server function: signed-out pages need
// it, and every server function requires a signed-in user.
export const Route = createFileRoute("/api/privacy-region")({
  server: {
    handlers: {
      GET: ({ request }) =>
        Response.json(
          { optIn: requiresOptIn(request.headers.get("cf-ipcountry")) },
          { headers: { "cache-control": "private, no-store" } },
        ),
    },
  },
});
