/** Better Auth providerId for the incremental Google Business Profile connection.
 *  Kept in `shared` so both server (auth config, GBP client) and client (connect
 *  button) can reference it without importing the server-only auth config. */
export const GBP_OAUTH_PROVIDER_ID = "google-business-profile";

export const GBP_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/business.manage",
] as const;

export const GBP_SELF_HOSTED_SETUP_DOCS_URL =
  "https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_GOOGLE_BUSINESS_PROFILE.md";
