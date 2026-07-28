import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildDashboardUrl } from "@/server/mcp/urls";
import { hasSelfHostedGscConfig } from "@/server/features/gsc/oauth-config";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { GscNotConnectedError } from "@/server/features/gsc/services/GscService";
import { GscApiError, GscTokenError } from "@/server/lib/gscClient";
import { GSC_SELF_HOSTED_SETUP_DOCS_URL } from "@/shared/gsc";

/** Minimal shape of the MCP project-auth context the GSC helpers need. */
type GscProjectAuthContext = {
  auth: { organizationId: string };
  baseUrl: string;
};

export function connectGscUrl(baseUrl: string, projectId: string): string {
  // GSC Insights hosts the connection card AND the data the user came for,
  // so land them there rather than in settings.
  return buildDashboardUrl(baseUrl, `/p/${projectId}/search-performance`);
}

/** Self-hosted GSC requires the operator to provide a Google OAuth client and
 *  BETTER_AUTH_SECRET. Hosted mode always has both; self-hosted tools return this
 *  setup nudge before attempting a token lookup when either is missing. */
export async function missingSelfHostedGoogleClientResponse(
  context: GscProjectAuthContext,
  projectId: string,
) {
  const [hosted, configured] = await Promise.all([
    isHostedServerAuthMode(),
    hasSelfHostedGscConfig(),
  ]);
  if (hosted || configured) return null;

  return mcpResponse({
    text: `This self-hosted OpenSEO deployment is not configured for Search Console yet. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and BETTER_AUTH_SECRET, then reconnect Search Console from the project's settings page. Setup docs: ${GSC_SELF_HOSTED_SETUP_DOCS_URL}`,
    meta: buildProjectMeta(context, projectId),
    structuredContent: {
      ok: false,
      connected: false,
      reason: "gsc_oauth_not_configured",
      setupDocsUrl: GSC_SELF_HOSTED_SETUP_DOCS_URL,
    },
  });
}

export function describeGscError(error: unknown): string {
  if (error instanceof GscNotConnectedError) {
    return "Search Console is not connected for this project.";
  }
  if (error instanceof GscTokenError) {
    return "The Search Console connection has expired or was revoked. Reconnect it to continue.";
  }
  if (error instanceof GscApiError) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
