import type {
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { AsyncLocalStorage } from "node:async_hooks";
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
export const MCP_ROUTE = "/mcp";

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

export type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

export const workersOAuthMcpPropsSchema = z.object({
  [MCP_AUTH_CONTEXT_PROP]: mcpToolAuthContextSchema,
});

const mcpToolAuthContextStorage = new AsyncLocalStorage<McpToolAuthContext>();

export function createWorkersOAuthMcpProps(
  context: McpToolAuthContext,
): Record<string, McpToolAuthContext> {
  return {
    [MCP_AUTH_CONTEXT_PROP]: context,
  };
}

export function withWorkersOAuthMcpScopes(
  props: unknown,
  scopes: string[],
): Record<string, McpToolAuthContext> | undefined {
  const result = workersOAuthMcpPropsSchema.safeParse(props);
  if (!result.success) return undefined;

  return createWorkersOAuthMcpProps({
    ...result.data[MCP_AUTH_CONTEXT_PROP],
    scopes,
  });
}

export function runWithMcpToolAuthContext<T>(
  context: McpToolAuthContext,
  callback: () => T,
) {
  return mcpToolAuthContextStorage.run(context, callback);
}

export function requireMcpToolAuthContext(
  extra: ToolExtra,
): McpToolAuthContext {
  const rawContext =
    mcpToolAuthContextStorage.getStore() ??
    extra.authInfo?.extra?.[MCP_AUTH_CONTEXT_PROP];
  const result = mcpToolAuthContextSchema.safeParse(rawContext);

  if (!result.success) {
    throw new Error(`MCP auth context missing: ${result.error.message}`);
  }

  return result.data;
}

export function getAuth(extra: ToolExtra): McpAuth {
  const { baseUrl: _baseUrl, ...auth } = requireMcpToolAuthContext(extra);
  return auth;
}

export function getBaseUrl(extra: ToolExtra): string {
  return requireMcpToolAuthContext(extra).baseUrl;
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
