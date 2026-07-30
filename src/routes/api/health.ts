import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { isHostedAuthMode } from "@/lib/auth-mode";

// Unauthenticated setup/health endpoint for self-hosters: reports per-feature
// configuration status (statuses and guidance only — never secret values) so
// "container is up but misconfigured" is diagnosable with one curl. The Docker
// HEALTHCHECK probes it. Hosted mode returns a bare ok and no config detail.
async function handleHealthRequest(): Promise<Response> {
  if (isHostedAuthMode(env.AUTH_MODE)) {
    return Response.json({ status: "ok" });
  }

  const { getSelfHostSetupStatus } = await import("@/server/lib/setup-status");
  const setup = await getSelfHostSetupStatus();
  const hasError = Object.values(setup.checks).some(
    (check) => check.status === "error",
  );

  return Response.json({ status: hasError ? "issues" : "ok", ...setup });
}

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () => handleHealthRequest(),
    },
  },
});
