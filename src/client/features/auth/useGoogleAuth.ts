import { useState } from "react";
import { captureClientEvent } from "@/client/lib/posthog";
import { authClient } from "@/lib/auth-client";
import { toAuthCallbackURL } from "@/lib/auth-redirect";

export function useGoogleAuth({
  redirectTo,
  postSignupRedirect,
}: {
  redirectTo: string;
  postSignupRedirect?: string;
}) {
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSignUp = postSignupRedirect !== undefined;

  async function start() {
    setError(null);
    setIsStarting(true);
    try {
      captureClientEvent(
        isSignUp ? "auth:sign_up_google_start" : "auth:sign_in_google_start",
        { redirect_to: redirectTo },
      );
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: toAuthCallbackURL(redirectTo),
        ...(isSignUp
          ? {
              newUserCallbackURL: toAuthCallbackURL(postSignupRedirect),
              requestSignUp: true,
            }
          : {}),
      });
      if (!result.error) return;
      setError(result.error.message || fallbackMessage);
    } catch {
      setError(fallbackMessage);
    }
    setIsStarting(false);
  }

  const fallbackMessage = isSignUp
    ? "Google sign up is not available right now."
    : "Google sign in is not available right now.";

  return { isStarting, error, start, clearError: () => setError(null) };
}
