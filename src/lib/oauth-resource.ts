const MCP_RESOURCE_PATH = "/mcp";
export const MCP_SCOPE = "mcp";

export function getMcpResource(baseUrl: string) {
  return new URL(MCP_RESOURCE_PATH, baseUrl).toString();
}

export function getMcpOrganizationIdClaim(baseUrl: string) {
  return new URL(
    `${MCP_RESOURCE_PATH}/claims/organization-id`,
    baseUrl,
  ).toString();
}

export function getMcpProtectedResourceMetadataUrl(resource: string) {
  const url = new URL(resource);
  const pathname = url.pathname.endsWith("/")
    ? url.pathname.slice(0, -1)
    : url.pathname;

  return `${url.origin}/.well-known/oauth-protected-resource${pathname}`;
}
