import { env } from "cloudflare:workers";
import { genericOAuth, organization } from "better-auth/plugins";
import { baseAuthOptions } from "@/lib/auth-options";
import { GSC_OAUTH_PROVIDER_ID } from "@/shared/gsc";

/** Read-only Search Console scope. openid/email/profile are also required —
 *  the genericOAuth callback rejects with `name_is_missing` without a name claim. */
const GSC_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/webmasters.readonly",
];

export function createBaseAuthConfig() {
  return {
    ...baseAuthOptions,
    account: {
      // Encrypt OAuth access/refresh tokens at rest in D1. Also covers the
      // google social-login tokens; the key derives from BETTER_AUTH_SECRET.
      encryptOAuthTokens: true,
      accountLinking: {
        // Allow connecting a Google account whose email differs from the
        // logged-in user's (agency/freelancer managing a client's property).
        allowDifferentEmails: true,
      },
    },
    plugins: [
      organization(),
      genericOAuth({
        config: [
          {
            providerId: GSC_OAUTH_PROVIDER_ID,
            clientId: env.GOOGLE_CLIENT_ID?.trim() ?? "",
            clientSecret: env.GOOGLE_CLIENT_SECRET?.trim() ?? "",
            discoveryUrl:
              "https://accounts.google.com/.well-known/openid-configuration",
            scopes: GSC_OAUTH_SCOPES,
            accessType: "offline", // request a refresh token
            prompt: "consent", // force refresh-token issuance on re-consent
            pkce: true,
          },
        ],
      }),
    ],
  };
}
