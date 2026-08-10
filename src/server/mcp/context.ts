import type { ServerContext } from "@modelcontextprotocol/server";
import { getMcpAuthContext } from "agents/mcp/server";
import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { buildDashboardUrl } from "@/server/mcp/urls";

export type ToolAuthContext = {
  userId: string;
  userEmail: string;
  organizationId: string;
  scopes: string[];
  clientId: string | null;
  baseUrl: string;
};

export type ToolContext = {
  auth: ToolAuthContext;
};

export const MCP_AUTH_CONTEXT_PROP = "openSeoAuth";
export const MCP_ROUTE = "/mcp";

const applicationAuthContextSchema = z.object({
  userId: z.string().min(1),
  userEmail: z.string().min(1),
  organizationId: z.string().min(1),
  baseUrl: z.string().url(),
  // Compatibility fallback until workers-oauth-provider supplies the verified
  // context marker consumed by Agents SDK 0.20.x (the
  // cloudflare.workers-oauth-provider.verified-context.v1 symbol, which mints
  // context.http.authInfo — watch the provider changelog). Once it ships,
  // delete these two fields and the fallback in createMcpToolContext, and read
  // clientId/scopes in transport.ts from authInfo instead of props.
  clientId: z.string().min(1).nullable().optional(),
  scopes: z.array(z.string()).optional(),
});

type ApplicationAuthContext = z.infer<typeof applicationAuthContextSchema>;

export const workersOAuthMcpPropsSchema = z.object({
  [MCP_AUTH_CONTEXT_PROP]: applicationAuthContextSchema,
});

// The hosted /mcp route only ever sees provider-minted tokens, whose props
// always carry the OAuth client identity — require it so scope enforcement
// fails closed instead of silently degrading to first-party.
export const hostedWorkersOAuthMcpPropsSchema = z.object({
  [MCP_AUTH_CONTEXT_PROP]: applicationAuthContextSchema.extend({
    clientId: z.string().min(1),
    scopes: z.array(z.string()),
  }),
});

export function createWorkersOAuthMcpProps(
  context: ApplicationAuthContext,
): Record<string, ApplicationAuthContext> {
  return {
    [MCP_AUTH_CONTEXT_PROP]: context,
  };
}

export function createMcpToolContext(
  context: Pick<ServerContext, "http">,
): ToolContext {
  const result = workersOAuthMcpPropsSchema.safeParse(
    getMcpAuthContext()?.props,
  );
  if (!result.success) {
    throw new Error(`MCP auth context missing: ${result.error.message}`);
  }

  // Scope enforcement happens once, at the hosted transport boundary
  // (handleAuthenticatedOpenSeoMcpRequest); this only assembles identity.
  const applicationAuth = result.data[MCP_AUTH_CONTEXT_PROP];
  const authInfo = context.http?.authInfo;
  const clientId = authInfo?.clientId ?? applicationAuth.clientId ?? null;
  const scopes = authInfo?.scopes ?? applicationAuth.scopes ?? [];

  return {
    auth: {
      ...applicationAuth,
      clientId,
      scopes,
    },
  };
}

export function buildBillingCustomer(
  auth: Pick<ToolAuthContext, "userId" | "userEmail" | "organizationId">,
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
  context: {
    auth: Pick<ToolAuthContext, "organizationId">;
    baseUrl: string;
  },
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
