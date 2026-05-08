import { getMcpAuthContext } from "agents/mcp";
import { z } from "zod";

export const MCP_AUTH_CONTEXT_PROP = "openSeoAuth";

const mcpToolAuthContextSchema = z.object({
  userId: z.string().min(1),
  organizationId: z.string().min(1),
  clientId: z.string().nullable(),
  scopes: z.array(z.string()),
  audience: z.string().min(1),
  subject: z.string().min(1),
});

type McpToolAuthContext = z.infer<typeof mcpToolAuthContextSchema>;

export function requireMcpToolAuthContext(): McpToolAuthContext {
  const rawContext = getMcpAuthContext()?.props[MCP_AUTH_CONTEXT_PROP];
  const result = mcpToolAuthContextSchema.safeParse(rawContext);

  if (!result.success) {
    throw new Error(`MCP auth context missing: ${result.error.message}`);
  }

  return result.data;
}
