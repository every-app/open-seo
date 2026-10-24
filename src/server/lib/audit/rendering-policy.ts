import { isEveryAppAuthMode } from "@/lib/auth-mode";
import { hasProviderAccess } from "@/server/lib/provider-access";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { GATEWAY_RENDERING_NOT_SET_UP_MESSAGE } from "@/shared/audit-rendering";

// Rendering works when a renderer exists. Alchemy deployments (hosted,
// previews, self-hosted Cloudflare) bind Browser Run to the audit worker and
// set AUDIT_BROWSER_RENDERING on the app worker; local development sets the
// same flag to attach a remote browser. Docker and legacy Wrangler installs
// have no browser, so they render only through Context.dev: its key, or
// behind an Every App gateway, the gateway's.
// Hosted accounts pay for rendering with usage credits; self-hosted operators
// pay their own Cloudflare and Context accounts.
export async function isAuditRenderingAllowed(): Promise<boolean> {
  if (await hasProviderAccess("context")) return true;
  return (await getOptionalEnvValue("AUDIT_BROWSER_RENDERING")) === "true";
}

/**
 * Why a rendered audit can't start here, for the person who asked (and the
 * agent, as the tool's answer). Behind an Every App gateway the key is the
 * gateway's to set; elsewhere the deployment needs a renderer of its own.
 */
export async function auditRenderingUnavailableMessage(): Promise<string> {
  if (isEveryAppAuthMode(await getOptionalEnvValue("AUTH_MODE"))) {
    return GATEWAY_RENDERING_NOT_SET_UP_MESSAGE;
  }
  return "JavaScript rendering is not available on this deployment. It needs a Cloudflare deployment with Browser Run, or CONTEXT_API_KEY. Run the audit without rendering instead.";
}
