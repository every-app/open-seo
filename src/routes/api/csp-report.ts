import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { isHostedAuthMode } from "@/lib/auth-mode";
import { handleCspReport } from "@/server/lib/csp";

// Where browsers post what the report-only Content-Security-Policy would have
// blocked (src/server/lib/csp.ts). Only OpenSEO Cloud sends that policy.
export const Route = createFileRoute("/api/csp-report")({
  server: {
    handlers: {
      POST: ({ request }) =>
        isHostedAuthMode(env.AUTH_MODE)
          ? handleCspReport(request, env.CSP_REPORT_RATE_LIMIT)
          : new Response("Not found", { status: 404 }),
    },
  },
});
