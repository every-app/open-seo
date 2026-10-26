import type { ServerContext } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { resolveClientLabel } from "@/server/mcp/client-label";
import { buildDashboardUrl } from "@/server/mcp/urls";

export type ToolAuthContext = {
  userId: string;
  userEmail: string;
  // The one organization every tool call is bound to. Hosted credentials
  // (OAuth grants, API keys) are pinned at creation to the org that was active
  // then and re-checked against a live membership on every request; self-host
  // and SAM are bound to their single org / the chat's project org.
  organizationId: string;
  // Org role for permission gates (owner/admin/member, comma-joined when
  // multiple). Hosted: stamped per request from the member row in
  // transport.ts. Self-host/delegated: one implicit user per org → "owner".
  role: string;
  scopes: string[];
  // OAuth client id, the literal "api_key", or null for first-party callers
  // (self-host transports, SAM). See isHostedMcpClient.
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
//
// The SDK's CLIENT_INFO_META_KEY, spelled out: a value import from
// @modelcontextprotocol/server would evaluate the whole SDK, protocol schemas
// included, at worker startup, and this module is on the eager path.
const CLIENT_INFO_META_KEY = "io.modelcontextprotocol/clientInfo";
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

// Hosted credentials always carry a client identity: an OAuth client id or
// "api_key". First-party callers (self-host transports, SAM) have none. Gates
// hosted-only side effects such as finishing the onboarding wizard.
export function isHostedMcpClient(auth: Pick<ToolAuthContext, "clientId">) {
  return auth.clientId !== null;
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
  // Hosted credentials get their role stamped per request by transport.ts
  // from the member row; one arriving without it bypassed that check, so fail
  // closed. Delegated/self-hosted modes have no member rows and a single
  // implicit owner per org.
  if (isHostedMcpClient({ clientId }) && !applicationAuth.role) {
    throw new Error("MCP auth context is missing a role for a hosted client");
  }
  const role = applicationAuth.role ?? "owner";

  return {
    auth: {
      ...applicationAuth,
      role,
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
