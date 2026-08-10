import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { getAuthMode } from "@/lib/auth-mode";
import { WorkspaceMergeService } from "@/server/auth/workspace-merge";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

// Legacy per-user workspaces only ever existed in cloudflare_access mode, and
// the merge must not be reachable anywhere else. AUTH_MODE is a runtime var on
// self-host deployments, so the client can't gate this itself — the status
// response is what hides the banner in other modes.
function isCloudflareAccessMode() {
  return getAuthMode(env.AUTH_MODE) === "cloudflare_access";
}

export const getWorkspaceMergeStatus = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async () => {
    if (!isCloudflareAccessMode()) {
      return { legacyWorkspaceCount: 0 };
    }

    return {
      legacyWorkspaceCount: await WorkspaceMergeService.countLegacyWorkspaces(),
    };
  });

// Any authenticated user may run the merge: everyone behind the same Access
// policy is equally trusted in this deployment model. The service itself
// refuses to run outside cloudflare_access mode.
export const mergeLegacyWorkspaces = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async () => WorkspaceMergeService.mergeLegacyWorkspaces());
