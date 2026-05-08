import { getMcpAuthContext } from "agents/mcp";
import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { buildDashboardUrl } from "@/server/mcp/urls";

type McpAuth = {
  userId: string;
  userEmail: string;
  organizationId: string;
  scopes: string[];
  clientId: string | null;
  audience: string;
  subject: string;
};

export const MCP_AUTH_CONTEXT_PROP = "openSeoAuth";

const mcpToolAuthContextSchema = z.object({
  userId: z.string().min(1),
  userEmail: z.string().min(1),
  organizationId: z.string().min(1),
  clientId: z.string().nullable(),
  scopes: z.array(z.string()),
  audience: z.string().min(1),
  subject: z.string().min(1),
  baseUrl: z.string().url(),
});

type McpToolAuthContext = z.infer<typeof mcpToolAuthContextSchema>;

export type ToolExtra = unknown;

export function requireMcpToolAuthContext(): McpToolAuthContext {
  const rawContext = getMcpAuthContext()?.props[MCP_AUTH_CONTEXT_PROP];
  const result = mcpToolAuthContextSchema.safeParse(rawContext);

  if (!result.success) {
    throw new Error(`MCP auth context missing: ${result.error.message}`);
  }

  return result.data;
}

export function getAuth(_extra?: ToolExtra): McpAuth {
  const { baseUrl: _baseUrl, ...auth } = requireMcpToolAuthContext();
  return auth;
}

export function getBaseUrl(_extra?: ToolExtra): string {
  return requireMcpToolAuthContext().baseUrl;
}

export function buildBillingCustomer(
  auth: McpAuth,
  projectId: string,
): BillingCustomerContext {
  return {
    userId: auth.userId,
    userEmail: auth.userEmail,
    organizationId: auth.organizationId,
    projectId,
  };
}

export function buildProjectMeta(
  context: { auth: Pick<McpAuth, "organizationId">; baseUrl: string },
  projectId: string,
  path?: string,
  params?: Record<string, string | number | undefined>,
) {
  return {
    organizationId: context.auth.organizationId,
    projectId,
    url: path ? buildDashboardUrl(context.baseUrl, path, params) : undefined,
  };
}
