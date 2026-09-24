import { useCallback, useEffect, useRef, useState } from "react";
import { authClient, isSigningOut } from "@/lib/auth-client";
import { DGTL_SSO_PROVIDER_ID } from "@/lib/dgtl-sso";

/** Central authentication handoff; never renders local credentials or signup. */
export function DgtlSsoRedirect({
  redirectTo,
  signedOut,
}: {
  redirectTo: string;
  signedOut: boolean;
}) {
  const started = useRef(false);
  const [error, setError] = useState(false);
  const start = useCallback(async () => {
    setError(false);
    try {
      const result = await authClient.signIn.oauth2({
        providerId: DGTL_SSO_PROVIDER_ID,
        callbackURL: redirectTo,
        errorCallbackURL: "/auth-error?provider=dgtl",
      });
      if (result.error) setError(true);
    } catch {
      setError(true);
    }
  }, [redirectTo]);

  useEffect(() => {
    if (signedOut || started.current || isSigningOut()) return;
    started.current = true;
    void start();
  }, [signedOut, start]);

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="space-y-4 text-center" role="status" aria-live="polite">
        <p>
          {signedOut
            ? "You are signed out of SEO."
            : error
              ? "Unable to connect to DGTL. Please try again."
              : "Connecting to your DGTL account…"}
        </p>
        {error ? (
          <button className="btn btn-primary" onClick={() => void start()}>
            Retry connection
          </button>
        ) : null}
        {signedOut || error ? (
          <a className="block underline" href="https://auth.dgtl.lk/user">
            Return to My services
          </a>
        ) : null}
      </div>
    </main>
  );
}
