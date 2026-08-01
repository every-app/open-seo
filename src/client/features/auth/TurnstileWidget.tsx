import { useCallback, useEffect, useRef, useState } from "react";

const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js";

// Public Turnstile site key, inlined at build time (see vite.config envPrefix).
// The widget only renders when it's set, so unconfigured / self-hosted builds
// are unaffected. The matching TURNSTILE_SECRET_KEY lives server-side only.
export const TURNSTILE_SITE_KEY = import.meta.env.TURNSTILE_SITE_KEY?.trim();

type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// Captcha state for a form: the token in a ref (read at submit time, so the
// form's submit closure never sees a stale value), a boolean mirror to drive
// the submit button, and a reset (tokens are single-use — re-challenge after a
// failed submit). Wire `onToken`/`resetNonce` into <TurnstileWidget />.
export function useTurnstileCaptcha() {
  const tokenRef = useRef<string | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);

  const onToken = useCallback((token: string | null) => {
    tokenRef.current = token;
    setHasToken(Boolean(token));
  }, []);

  const reset = useCallback(() => {
    tokenRef.current = null;
    setHasToken(false);
    setResetNonce((nonce) => nonce + 1);
  }, []);

  return { tokenRef, hasToken, resetNonce, onToken, reset };
}

// Renders the Cloudflare Turnstile challenge and reports its token. `onToken`
// fires with the token when solved and with null when it expires/errors.
// Bump `resetNonce` to re-challenge (tokens are single-use, so reset after a
// failed submit).
export function TurnstileWidget({
  onToken,
  resetNonce,
}: {
  onToken: (token: string | null) => void;
  resetNonce: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Keep the latest callback in a ref so mounting the widget stays a one-time
  // effect (a fresh onToken each render must not tear down and re-render it).
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let cancelled = false;

    const renderWidget = () => {
      if (
        cancelled ||
        widgetIdRef.current !== null ||
        !containerRef.current ||
        !window.turnstile
      ) {
        return;
      }
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token) => onTokenRef.current(token),
        "expired-callback": () => onTokenRef.current(null),
        "error-callback": () => onTokenRef.current(null),
      });
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${TURNSTILE_SCRIPT_SRC}"]`,
      );
      const script = existing ?? document.createElement("script");
      script.addEventListener("load", renderWidget);
      if (!existing) {
        script.src = TURNSTILE_SCRIPT_SRC;
        script.async = true;
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (resetNonce === 0) return;
    if (widgetIdRef.current !== null && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
      onTokenRef.current(null);
    }
  }, [resetNonce]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={containerRef} className="flex justify-center" />;
}
