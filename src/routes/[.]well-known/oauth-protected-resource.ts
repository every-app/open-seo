import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { mcpProtectedResourceMetadataResponse } from "@/server/mcp/protected-resource-metadata";

export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
  server: {
    handlers: {
      GET: async () => mcpProtectedResourceMetadataResponse(env.AUTH_MODE),
    },
  },
});
