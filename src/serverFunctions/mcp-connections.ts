import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { McpConnectionsService } from "@/server/mcp/connections";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

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
