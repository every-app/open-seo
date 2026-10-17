import { hasProviderAccess } from "@/server/lib/provider-access";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

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
