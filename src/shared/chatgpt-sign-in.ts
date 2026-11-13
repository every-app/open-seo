import { OAUTH_AUTHORIZE_PATH } from "@/lib/auth-redirect";

/** Better Auth providerId for Sign in with ChatGPT (hosted only). */
export const CHATGPT_PROVIDER_ID = "chatgpt";

/**
 * The `error` code on /auth-error when a new ChatGPT sign-up is refused
 * because OpenAI has not verified its email.
 */
export const CHATGPT_EMAIL_NOT_VERIFIED_CODE = "email_not_verified";

/**
 * Whether a connector authorize URL says the person chose "Continue with
 * ChatGPT" in ChatGPT's own connect window: ChatGPT adds this parameter
 * (https://developers.openai.com/siwc/chatgpt-plugin). Takes an absolute URL
 * or a path on this origin.
 */
export function asksForChatGptSignIn(authorizeUrl: string) {
  const url = new URL(authorizeUrl, "https://openseo.local");
  return (
    url.pathname === OAUTH_AUTHORIZE_PATH &&
    url.searchParams.get("target_flow") === "chatgpt_siwc"
  );
}
