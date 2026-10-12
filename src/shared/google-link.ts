/**
 * Query param the Google OAuth callback appends (next to `error`) when it
 * bounces a failed connect back to the page that started it, so the client can
 * tell a Search Console or Analytics link failure apart from any other `error`
 * param. Its value is the provider key.
 */
export const GOOGLE_LINK_ERROR_PARAM = "google_link_error";

export type GoogleLinkProvider = "gsc" | "ga4" | "gads";
