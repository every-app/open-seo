import { createAuthClient } from "better-auth/react";
import { apiKeyClient } from "@better-auth/api-key/client";
import {
  inferAdditionalFields,
  organizationClient,
} from "better-auth/client/plugins";
import { clearLastProjectId } from "@/client/lib/active-project";
import { captureClientEvent, resetAnalyticsUser } from "@/client/lib/posthog";
import { userAdditionalFields } from "@/lib/auth-options";
import { orgAccessControl, orgRoles } from "@/lib/org-permissions";
import { getSignInHrefForLocation } from "@/lib/auth-redirect";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : "",
  plugins: [
    apiKeyClient(),
    // ac/roles must match the server plugin exactly, otherwise the client's
    // synchronous checkRolePermission evaluates against the defaults and
    // disagrees with the server.
    organizationClient({ ac: orgAccessControl, roles: orgRoles }),
    inferAdditionalFields({ user: userAdditionalFields }),
  ],
});

export const { useSession } = authClient;

export function signOutAndRedirect() {
  const signInHref = getSignInHrefForLocation(window.location);
  captureClientEvent("auth:sign_out");
  resetAnalyticsUser();
  // The remembered project belongs to this account. Left behind, it would
  // open the next account straight into the app shell, past the onboarding
  // gate in the app layout.
  clearLastProjectId();
  void authClient.signOut({
    fetchOptions: {
      onSuccess: () => {
        window.location.assign(signInHref);
      },
    },
  });
}
