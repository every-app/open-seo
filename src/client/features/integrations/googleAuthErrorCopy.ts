/**
 * Plain-language copy for Google OAuth failures, shared by the connect-surface
 * inline alert (GoogleLinkErrorAlert) and the /auth-error fallback page.
 * `code` is the `error` query param on the redirect: Google's own error code
 * (access_denied), or one set by googleOAuth.ts / Better Auth.
 *
 * `providerLabel` ("Search Console" / "Google Analytics") is set when the
 * failure came from a connect flow; without it the copy reads as a Google
 * sign-in failure.
 */
export function googleAuthErrorCopy(
  code: string,
  providerLabel?: string,
): { title: string; description: string } {
  const what = providerLabel ? `${providerLabel} connection` : "Google sign-in";

  switch (code) {
    case "state_mismatch":
      return {
        title: `${what} didn't finish`,
        description:
          "The attempt expired or was interrupted. Try again in a single browser tab and finish the Google steps within 10 minutes. If it keeps happening, make sure your browser allows cookies for this site.",
      };
    case "access_denied":
      return {
        title: `${what} was canceled`,
        description:
          "Google's permission screen was closed or declined. Try again whenever you're ready.",
      };
    case "connection_save_failed":
      return {
        title: `${what} didn't finish`,
        description:
          "We couldn't save the connection. Please try again — if it keeps failing, contact support.",
      };
    default:
      return {
        title: `${what} didn't finish`,
        description:
          "Something went wrong while talking to Google. Please try again — if it keeps failing, contact support.",
      };
  }
}
