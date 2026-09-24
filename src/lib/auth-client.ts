import { createAuthClient } from "better-auth/react";
import { apiKeyClient } from "@better-auth/api-key/client";
import { dashClient } from "@better-auth/infra/client";
import {
  genericOAuthClient,
  inferAdditionalFields,
  organizationClient,
} from "better-auth/client/plugins";
import { captureClientEvent, resetAnalyticsUser } from "@/client/lib/posthog";
import { userAdditionalFields } from "@/lib/auth-options";
import { orgAccessControl, orgRoles } from "@/lib/org-permissions";
import { getSignInHrefForLocation } from "@/lib/auth-redirect";
import { isHostedClientAuthMode } from "@/lib/auth-mode";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : "",
  plugins: [
    apiKeyClient(),
    dashClient(),
    // ac/roles must match the server plugin exactly, otherwise the client's
    // synchronous checkRolePermission evaluates against the defaults and
    // disagrees with the server.
    organizationClient({ ac: orgAccessControl, roles: orgRoles }),
    genericOAuthClient(),
    inferAdditionalFields({ user: userAdditionalFields }),
  ],
});

export const { useSession } = authClient;

let signingOut = false;
export function isSigningOut() {
  return signingOut;
}

export function signOutAndRedirect() {
  signingOut = true;
  const signInHref = getSignInHrefForLocation(window.location);
  captureClientEvent("auth:sign_out");
  resetAnalyticsUser();
  void authClient.signOut({
    fetchOptions: {
      onError: () => {
        signingOut = false;
      },
      onSuccess: () => {
        // End only this application's session. The hub keeps its own cookie
        // and decides whether My services or central login should be shown.
        if (
          isHostedClientAuthMode() &&
          import.meta.env.VITE_DGTL_SSO_ENABLED === "true"
        ) {
          window.location.assign("https://auth.dgtl.lk/user");
          return;
        }
        // A local sign-out must not immediately trigger the automatic SSO
        // round-trip and silently sign the user back into SEO.
        const separator = signInHref.includes("?") ? "&" : "?";
        window.location.assign(`${signInHref}${separator}sso=off`);
      },
    },
  });
}
