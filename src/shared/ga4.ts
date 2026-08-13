/** Better Auth provider ID for the dedicated Google Analytics grant. */
export const GA4_OAUTH_PROVIDER_ID = "google-analytics";

// Google hasn't approved the GA4 OAuth app yet, so hosted connect attempts
// show Google's "unverified app" warning. Gates every GA4 connect surface;
// flip to false once the app is approved. Self-hosted deployments use their
// own OAuth app, so only hosted mode is gated.
export const GA4_OAUTH_APP_PENDING = true;

export const GA4_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/analytics.readonly",
] as const;

export const GA4_SELF_HOSTED_SETUP_DOCS_URL =
  "https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_GOOGLE_ANALYTICS.md";
