import { useCallback, useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { DGTL_SSO_PROVIDER_ID } from "@/lib/dgtl-sso";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import { DgtlSsoRedirect } from "./DgtlSsoRedirect";

export function isDgtlRecoveryError(error: unknown) {
  const code = getErrorCode(error);
  return code === "DGTL_LINK_REQUIRED" || code === "DGTL_REAUTH_REQUIRED";
}

export function DgtlAccessRecovery({ error }: { error: unknown }) {
  const linking = getErrorCode(error) === "DGTL_LINK_REQUIRED";
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  const recover = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      const options = {
        providerId: DGTL_SSO_PROVIDER_ID,
        callbackURL: "/",
        errorCallbackURL: "/auth-error?provider=dgtl",
      };
      const result = await authClient.signIn.oauth2(options);
      if (result.error || !result.data?.url) throw new Error("handoff_failed");
      window.location.assign(result.data.url);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (linking || started.current) return;
    started.current = true;
    // Survives the OAuth round trip. A persistently rejected identity must not
    // bounce between the two applications indefinitely.
    try {
      const key = "dgtl:last-auto-renewal";
      const previous = Number(window.sessionStorage.getItem(key));
      if (previous && Date.now() - previous < 60_000) return;
      window.sessionStorage.setItem(key, String(Date.now()));
    } catch {
      // If storage is unavailable, keep the explicit reconnect button.
      return;
    }
    void recover();
  }, [linking, recover]);

  // Re-enter central authentication; the server only matches verified emails.
  // Never link whichever central user happens to be logged in to this session.
  if (linking) return <DgtlSsoRedirect redirectTo="/" signedOut={false} />;

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold">Reconnect to DGTL</h1>
        <p>{getStandardErrorMessage(error)}</p>
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void recover()}
        >
          {busy ? "Opening DGTL…" : "Reconnect to DGTL"}
        </button>
        {failed ? (
          <p role="alert">Unable to connect. Please try again.</p>
        ) : null}
        <a className="block underline" href="https://auth.dgtl.lk/user">
          Return to My services
        </a>
      </div>
    </main>
  );
}
