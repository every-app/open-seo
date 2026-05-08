import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { getAuth, hasHostedAuthConfig } from "@/lib/auth";
import { isHostedAuthMode } from "@/lib/auth-mode";

function unavailableMetadataResponse() {
  if (!isHostedAuthMode(env.AUTH_MODE)) {
    return new Response("Not found", { status: 404 });
  }

  return new Response("Missing Better Auth hosted configuration", {
    status: 500,
  });
}

export const Route = createFileRoute("/.well-known/oauth-authorization-server")(
  {
    server: {
      handlers: {
        GET: async ({ request }: { request: Request }) => {
          if (!isHostedAuthMode(env.AUTH_MODE) || !hasHostedAuthConfig()) {
            return unavailableMetadataResponse();
          }

          return oauthProviderAuthServerMetadata(getAuth())(request);
        },
      },
    },
  },
);
