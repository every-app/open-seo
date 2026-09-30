/** Better Auth providerId for the incremental Google Ads connection. Kept in
 *  `shared` so both server (auth config, Ads client) and client (connect
 *  button) can reference it without importing the server-only auth config. */
export const GOOGLE_ADS_OAUTH_PROVIDER_ID = "google-ads";

// The Ads API has no read-only OAuth scope; read-only stays enforced by this
// app issuing only search/report requests (plus the developer token's access
// level on Google's side).
export const GOOGLE_ADS_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/adwords",
] as const;

export const GOOGLE_ADS_SELF_HOSTED_SETUP_DOCS_URL =
  "https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_GOOGLE_ADS.md";
