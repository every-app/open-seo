/** Bing Webmaster Tools JSON/HTTP API base. The legacy SOAP and POX/HTTP
 *  protocols were retired on 2026-08-31, so JSON is the only supported
 *  surface. Methods are appended as `/METHOD?apikey=…&param=…`. */
export const BING_WEBMASTER_API_BASE =
  "https://ssl.bing.com/webmaster/api.svc/json";

/** Where a user generates the per-user API key. */
export const BING_WEBMASTER_API_KEY_DOCS_URL =
  "https://learn.microsoft.com/en-us/bingwebmaster/getting-access";

/** Better Auth providerId for the delegated Bing Webmaster OAuth grant. Grants
 *  live in the `account` table (like the Google grants); the per-user API
 *  keys live in `bing_credentials` instead. */
export const BING_OAUTH_PROVIDER_ID = "bing-webmaster";

/** Read-only scope: view the user's Bing Webmaster data, nothing more. */
export const BING_OAUTH_SCOPES = ["webmaster.read"] as const;

/** OAuth callback path. Register `<origin>/api/bing/oauth/callback` as the
 *  Redirect URI on the Bing OAuth client — one client per environment, since
 *  Bing holds a single exact-match redirect URI per client. */
export const BING_OAUTH_CALLBACK_PATH = "/api/bing/oauth/callback";

/** Query param the Bing OAuth callback appends (next to `error`) when it
 *  bounces a failed connect back to the page that started it. */
export const BING_LINK_ERROR_PARAM = "bing_link_error";

/** Bing keys are opaque; reject obviously-wrong input before a network call. */
export const BING_API_KEY_MIN_LENGTH = 20;
