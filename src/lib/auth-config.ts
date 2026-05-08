import { oauthProvider } from "@better-auth/oauth-provider";
import { jwt, organization } from "better-auth/plugins";
import { baseAuthOptions } from "@/lib/auth-options";
import { getActiveOrganizationId } from "@/lib/auth-session";
import {
  getMcpOrganizationIdClaim,
  getMcpResource,
  MCP_OAUTH_SCOPES,
  MCP_SCOPE,
} from "@/lib/oauth-resource";

function assertSingleMcpAudience(audiences: string[]) {
  if (audiences.length !== 1) {
    throw new Error(
      "MCP OAuth resource injection requires exactly one valid audience",
    );
  }
}

export function createBaseAuthConfig(baseUrl: string) {
  const mcpResource = getMcpResource(baseUrl);
  const mcpOrganizationIdClaim = getMcpOrganizationIdClaim(baseUrl);
  const validAudiences = [mcpResource];

  assertSingleMcpAudience(validAudiences);

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
        scopes: MCP_OAUTH_SCOPES,
        // We publish /.well-known/oauth-authorization-server/api/auth via
        // TanStack routes, so silence Better Auth's metadata reminder.
        silenceWarnings: {
          oauthAuthServerConfig: true,
        },
        allowDynamicClientRegistration: true,
        clientRegistrationDefaultScopes: MCP_OAUTH_SCOPES,
        clientRegistrationAllowedScopes: MCP_OAUTH_SCOPES,
        // TODO: drop once the MCP spec settles on a replacement for
        // unauthenticated DCR — better-auth has flagged this option for removal.
        allowUnauthenticatedClientRegistration: true,
        // Single allowed audience — see `routes/api/auth/$.ts`, which defaults
        // missing `resource` on /oauth2/token to this value. Adding a second
        // audience here would make that injection unsafe (we'd no longer know
        // which to pick) and require scope-conditional logic in the route.
        validAudiences,
        postLogin: {
          page: "/oauth-consent",
          shouldRedirect: () => false,
          consentReferenceId: ({ session, scopes }) => {
            if (!scopes.includes(MCP_SCOPE)) {
              return undefined;
            }

            return getActiveOrganizationId({ session }) ?? undefined;
          },
        },
        customAccessTokenClaims: ({ referenceId, scopes }) => {
          if (!scopes.includes(MCP_SCOPE)) {
            return {};
          }

          return referenceId ? { [mcpOrganizationIdClaim]: referenceId } : {};
        },
      }),
    ],
  };
}
