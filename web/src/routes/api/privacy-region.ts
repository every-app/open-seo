import { createFileRoute } from "@tanstack/react-router";
import { requiresOptIn } from "../../../../src/shared/privacy-choices";

// The page is prerendered, so the browser asks once which privacy defaults
// apply to its location (Cloudflare's CF-IPCountry).
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
