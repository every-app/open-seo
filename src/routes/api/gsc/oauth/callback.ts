import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { getAuthMode, isHostedAuthMode } from "@/lib/auth-mode";
import { resolveCloudflareAccessContext } from "@/middleware/ensure-user/cloudflareAccess";
import { resolveLocalNoAuthContext } from "@/middleware/ensure-user/delegated";
import { responseForAppError } from "@/server/lib/http-errors";
import { handleSelfHostedGscOAuthCallback } from "@/server/features/gsc/selfHostedOAuth";
import { getPublicOrigin } from "@/server/mcp/public-origin";

async function resolveSelfHostedContext(request: Request) {
  const authMode = getAuthMode(env.AUTH_MODE);

  if (isHostedAuthMode(authMode)) return null;

  return authMode === "local_noauth"
    ? resolveLocalNoAuthContext()
    : resolveCloudflareAccessContext(request.headers);
}

async function handleCallbackRequest(request: Request) {
  try {
    const context = await resolveSelfHostedContext(request);
    if (!context) return new Response("Not found", { status: 404 });

    return await handleSelfHostedGscOAuthCallback({
      request,
      user: {
        userId: context.userId,
        userEmail: context.userEmail,
      },
      publicOrigin: getPublicOrigin(request),
    });
  } catch (error) {
    return responseForAppError(error, "Search Console OAuth failed");
  }
}

export const Route = createFileRoute("/api/gsc/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        return handleCallbackRequest(request);
      },
    },
  },
});
