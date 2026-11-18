import { useState } from "react";
import { captureClientEvent } from "@/client/lib/posthog";
import { authClient } from "@/lib/auth-client";
import { toAuthCallbackURL } from "@/lib/auth-redirect";
import { CHATGPT_PROVIDER_ID } from "@/shared/chatgpt-sign-in";

const PROVIDER_LABELS = { google: "Google", chatgpt: "ChatGPT" };

/** Starts Google or ChatGPT sign-in: a full-page redirect to the provider. */
export function useSocialAuth(
  provider: keyof typeof PROVIDER_LABELS,
  {
    redirectTo,
    postSignupRedirect,
  }: {
    redirectTo: string;
    postSignupRedirect?: string;
  },
) {
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSignUp = postSignupRedirect !== undefined;

  async function start() {
    setError(null);
    setIsStarting(true);
    try {
      captureClientEvent(
        isSignUp
          ? `auth:sign_up_${provider}_start`
          : `auth:sign_in_${provider}_start`,
        { redirect_to: redirectTo },
      );
      const destination = {
        callbackURL: toAuthCallbackURL(redirectTo),
        ...(isSignUp
          ? {
              newUserCallbackURL: toAuthCallbackURL(postSignupRedirect),
              requestSignUp: true,
            }
          : {}),
      };
      const result =
        provider === "google"
          ? await authClient.signIn.social({ provider, ...destination })
          : await authClient.signIn.oauth2({
              providerId: CHATGPT_PROVIDER_ID,
              ...destination,
            });
      if (!result.error) return;
      setError(result.error.message || fallbackMessage);
    } catch {
      setError(fallbackMessage);
    }
    setIsStarting(false);
  }

  const fallbackMessage = `${PROVIDER_LABELS[provider]} ${isSignUp ? "sign up" : "sign in"} is not available right now.`;

  return { isStarting, error, start, clearError: () => setError(null) };
}
