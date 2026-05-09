const MCP_RESOURCE_PATH = "/mcp";
export const MCP_SCOPE = "mcp";
export const MCP_OAUTH_SCOPES = ["offline_access", MCP_SCOPE];

export function getMcpResource(baseUrl: string) {
  return new URL(MCP_RESOURCE_PATH, baseUrl).toString();
}
