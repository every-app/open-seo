import { oauthProvider } from "@better-auth/oauth-provider";
import { jwt, organization } from "better-auth/plugins";
import { baseAuthOptions } from "@/lib/auth-options";
import { getMcpResource, MCP_SCOPE } from "@/lib/oauth-resource";

export function createBaseAuthConfig(baseUrl: string) {
  const mcpResource = getMcpResource(baseUrl);

  return {
    ...baseAuthOptions,
    plugins: [
      organization(),
      jwt(),
      oauthProvider({
        loginPage: "/sign-in",
        consentPage: "/oauth-consent",
        signup: {
          page: "/sign-up",
        },
        scopes: ["offline_access", MCP_SCOPE],
        allowDynamicClientRegistration: true,
        // TODO: drop once the MCP spec settles on a replacement for
        // unauthenticated DCR — better-auth has flagged this option for removal.
        allowUnauthenticatedClientRegistration: true,
        validAudiences: [mcpResource],
      }),
    ],
  };
}
