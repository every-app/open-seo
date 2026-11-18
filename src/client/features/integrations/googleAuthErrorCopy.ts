import { ACCOUNT_DELETION_SCHEDULED_ERROR } from "@/shared/account-deletion";
import { CHATGPT_EMAIL_NOT_VERIFIED_CODE } from "@/shared/chatgpt-sign-in";

/**
 * Plain-language copy for OAuth failures, shared by the connect-surface
 * inline alert (GoogleLinkErrorAlert) and the /auth-error fallback page.
 * `code` is the `error` query param on the redirect: the provider's own error
 * code (access_denied), or one set by googleOAuth.ts / Better Auth.
 *
 * `providerLabel` ("Search Console" / "Google Analytics") is set when the
 * failure came from a connect flow; without it the copy reads as a sign-in
 * failure. The error page can't tell a Google sign-in from a ChatGPT one, so
 * that copy names neither.
 */
export function googleAuthErrorCopy(
  code: string,
  providerLabel?: string,
): { title: string; description: string } {
  const what = providerLabel ? `${providerLabel} connection` : "Sign-in";
  const provider = providerLabel ? "Google" : "the sign-in provider";

  switch (code) {
    case ACCOUNT_DELETION_SCHEDULED_ERROR:
      return {
        title: "This account is being deleted",
        description:
          "You asked us to delete this account, so it can't be signed in to. To keep it, email support@openseo.so before the deletion date.",
      };
    // Sign-in with Google or ChatGPT reached an existing account it may not
    // be attached to: the provider hasn't verified the email, or the account
    // never confirmed its own.
    case "account_not_linked":
      return {
        title: "This email already has an account",
        description:
          "Sign in the way you did before. If that was email and password and you never confirmed your email, confirm it first.",
      };
    case CHATGPT_EMAIL_NOT_VERIFIED_CODE:
      return {
        title: "Verify your email with ChatGPT first",
        description:
          "OpenAI hasn't verified the email on your ChatGPT account, so we can't create an OpenSEO account from it. Verify it in ChatGPT, or sign up with Google or email.",
      };
    case "state_mismatch":
      return {
        title: `${what} didn't finish`,
        description:
          "The attempt expired or was interrupted. Try again in a single browser tab and finish the steps within 10 minutes. If it keeps happening, make sure your browser allows cookies for this site.",
      };
    case "access_denied":
      return {
        title: `${what} was canceled`,
        description:
          "The permission screen was closed or declined. Try again whenever you're ready.",
      };
    case "scope_not_granted":
      return {
        title: `${what} is missing a permission`,
        description: `OpenSEO didn't get access to your ${providerLabel ?? "Google"} data because a box on Google's permission screen wasn't checked. Try again and check every box before you continue.`,
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
        description: `Something went wrong while talking to ${provider}. Please try again — if it keeps failing, contact support.`,
      };
  }
}
