import {
  CLIENT_INFO_META_KEY,
  type ServerContext,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { resolveClientLabel } from "@/server/mcp/client-label";
import { buildDashboardUrl } from "@/server/mcp/urls";

export type ToolAuthContext = {
  userId: string;
  userEmail: string;
  organizationId: string;
  // Org role for permission gates (owner/admin/member, comma-joined when
  // multiple). Hosted: stamped per request from the member row in
  // transport.ts. Self-host/delegated: one implicit user per org → "owner".
  role: string;
  // How tool calls bind to an organization. "pinned": the request's
  // organizationId is the authorization boundary — self-host and SAM, which
  // have no member rows or are already bound to one project. "user": every
  // hosted credential (OAuth tokens, API keys; stamped by the hosted
  // transport) — project-scoped tools derive the org from the project row and
  // authorize via the caller's membership in THAT org, so one credential works
  // across every organization the user belongs to; organizationId is only the
  // fallback context for the few tools with no project argument.
  orgScope: "pinned" | "user";
  scopes: string[];
  clientId: string | null;
  baseUrl: string;
  // Which client made the call ("Claude Code", "Codex", "API key", …), for
  // display only — a self-reported hint, never an identity. Reports stamp it
  // into `created_by`; nothing authorizes, filters or bills on it. Always set
  // on the MCP path; absent on hand-built contexts (SAM), which name
  // themselves at the tool instead.
  clientLabel?: string;
};

export type ToolContext = {
  auth: ToolAuthContext;
  // The in-app agent's turn id, so a tool call's telemetry can be joined to
  // the `sam:turn` event of the turn that made it. Absent for MCP transports.
  turnId?: string;
};

export const MCP_AUTH_CONTEXT_PROP = "openSeoAuth";
export const MCP_ROUTE = "/mcp";

const applicationAuthContextSchema = z.object({
  userId: z.string().min(1),
  userEmail: z.string().min(1),
  organizationId: z.string().min(1),
  // Absent from OAuth grant props (role is stamped per request by the hosted
  // transport, never baked into tokens) and from delegated modes (implicit
  // owner).
  role: z.string().min(1).optional(),
  // Stamped per request by the hosted transport, never baked into tokens;
  // absent (self-host, SAM) means "pinned".
  orgScope: z.enum(["pinned", "user"]).optional(),
  baseUrl: z.string().url(),
  // Compatibility fallback until workers-oauth-provider supplies the verified
  // context marker consumed by Agents SDK 0.20.x (the
  // cloudflare.workers-oauth-provider.verified-context.v1 symbol, which mints
  // context.http.authInfo — watch the provider changelog). Once it ships,
  // delete these two fields and the fallback in createMcpToolContext, and read
  // clientId/scopes in transport.ts from authInfo instead of props.
  clientId: z.string().min(1).nullable().optional(),
  scopes: z.array(z.string()).optional(),
  // Raw request User-Agent, stamped per request by the transport. The only
  // client signal present on every call: initialize's clientInfo is not
  // visible on a later tools/call, and this transport never populates
  // ServerContext.http.req.
  userAgent: z.string().optional(),
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

export type McpProps = z.infer<typeof workersOAuthMcpPropsSchema>;

export function createWorkersOAuthMcpProps(
  context: ApplicationAuthContext,
): McpProps {
  return {
    [MCP_AUTH_CONTEXT_PROP]: context,
  };
}

// Clients on the 2026-07-28 protocol may carry their identity per request in
// the reserved clientInfo key, which the SDK lifts out of `_meta` into
// `mcpReq.envelope` before any handler runs — so the envelope is the only place
// to look. It is client-supplied and typed as an open envelope, so parse it
// rather than reaching into it.
const clientInfoMetaSchema = z.object({
  [CLIENT_INFO_META_KEY]: z.object({ title: z.string().optional() }).optional(),
});

// Not named McpRequestContext: the SDK exports a type by that name. `mcpReq`
// is optional so the two auth-fallback tests do not have to build a request
// fixture.
type ToolCallContext = Pick<ServerContext, "http"> &
  Partial<Pick<ServerContext, "mcpReq">>;

function readClientTitle(context: ToolCallContext): string | undefined {
  const parsed = clientInfoMetaSchema.safeParse(context.mcpReq?.envelope);
  return parsed.success ? parsed.data[CLIENT_INFO_META_KEY]?.title : undefined;
}

export function createMcpToolContext(
  context: ToolCallContext,
  props: McpProps,
): ToolContext {
  const result = workersOAuthMcpPropsSchema.safeParse(props);
  if (!result.success) {
    throw new Error(`MCP auth context missing: ${result.error.message}`);
  }

  // Scope enforcement happens once, at the hosted transport boundary
  // (handleAuthenticatedOpenSeoMcpRequest); this only assembles identity.
  const applicationAuth = result.data[MCP_AUTH_CONTEXT_PROP];
  const authInfo = context.http?.authInfo;
  const clientId = authInfo?.clientId ?? applicationAuth.clientId ?? null;
  const scopes = authInfo?.scopes ?? applicationAuth.scopes ?? [];
  const orgScope = applicationAuth.orgScope ?? "pinned";
  // Delegated/self-hosted modes have no member rows and a single implicit owner
  // per org; "pinned" without a role means owner. Hosted ("user" scope)
  // stamps the role from the member row per request in transport.ts.
  const role =
    applicationAuth.role ?? (orgScope === "pinned" ? "owner" : undefined);
  if (!role) {
    throw new Error(
      "MCP auth context is missing a role for a user-scoped credential",
    );
  }

  return {
    auth: {
      ...applicationAuth,
      role,
      orgScope,
      clientId,
      scopes,
      clientLabel: resolveClientLabel({
        userAgent: applicationAuth.userAgent,
        clientTitle: readClientTitle(context),
      }),
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
    baseUrl: string;
  },
  projectId: string,
  path?: string,
  params?: Record<string, string | number | undefined>,
) {
  return {
    projectId,
    url: path ? buildDashboardUrl(context.baseUrl, path, params) : undefined,
  };
}
