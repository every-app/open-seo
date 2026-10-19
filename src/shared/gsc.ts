/** Better Auth providerId for the incremental Google Search Console connection.
 *  Kept in `shared` so both server (auth config, GSC client) and client (connect
 *  button) can reference it without importing the server-only auth config. */
export const GSC_OAUTH_PROVIDER_ID = "google-search-console";

export const GSC_DATA_SCOPE =
  "https://www.googleapis.com/auth/webmasters.readonly";

export const GSC_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  GSC_DATA_SCOPE,
] as const;

export const GSC_SELF_HOSTED_SETUP_DOCS_URL =
  "https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md";
