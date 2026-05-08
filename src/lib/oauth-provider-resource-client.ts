import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import { getAuth } from "@/lib/auth";

type ResourceClientAuth = Parameters<typeof oauthProviderResourceClient>[0];

export function getOAuthProviderResourceActions() {
  // Better Auth documents passing the server auth instance here, but the
  // resource-client package currently types the generic too narrowly for the
  // concrete `betterAuth(...)` return type.
  return oauthProviderResourceClient(
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
    getAuth() as unknown as ResourceClientAuth,
  ).getActions();
}
