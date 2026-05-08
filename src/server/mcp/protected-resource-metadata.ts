import { getHostedBaseUrl, hasHostedAuthConfig } from "@/lib/auth";
import { isHostedAuthMode } from "@/lib/auth-mode";
import { getOAuthProviderResourceActions } from "@/lib/oauth-provider-resource-client";
import { getMcpResource, MCP_OAUTH_SCOPES } from "@/lib/oauth-resource";

function unavailableMcpProtectedResourceMetadataResponse(
  authMode: string | null | undefined,
) {
  if (!isHostedAuthMode(authMode)) {
    return new Response("Not found", { status: 404 });
  }

  return new Response("Missing Better Auth hosted configuration", {
    status: 500,
  });
}

export async function mcpProtectedResourceMetadataResponse(
  authMode: string | null | undefined,
) {
  if (!isHostedAuthMode(authMode) || !hasHostedAuthConfig()) {
    return unavailableMcpProtectedResourceMetadataResponse(authMode);
  }

  const baseUrl = getHostedBaseUrl();
  const metadata =
    await getOAuthProviderResourceActions().getProtectedResourceMetadata({
      resource: getMcpResource(baseUrl),
      authorization_servers: [`${baseUrl}/api/auth`],
      scopes_supported: [...MCP_OAUTH_SCOPES],
      resource_name: "OpenSEO MCP",
    });

  return new Response(JSON.stringify(metadata), {
    headers: {
      "Cache-Control":
        "public, max-age=15, stale-while-revalidate=15, stale-if-error=86400",
      "Content-Type": "application/json",
    },
  });
}
