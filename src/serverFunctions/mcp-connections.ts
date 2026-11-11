import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { McpConnectionsService } from "@/server/mcp/connections";
import { getConsentRequest } from "@/server/mcp/oauth-provider";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

export const getMcpConsentRequest = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ query: z.string() }))
  .handler(({ data }) => getConsentRequest(getRequest(), data.query));

export const listMcpConnections = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    McpConnectionsService.listMcpConnections(context.userId),
  );

export const revokeMcpConnection = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ grantId: z.string().min(1) }))
  .handler(({ data, context }) =>
    McpConnectionsService.revokeMcpConnection(context.userId, data.grantId),
  );
