import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      appearance: "interaction-only";
      size: "flexible";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
      "timeout-callback": () => void;
      "unsupported-callback": () => void;
    },
  ) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
  isExpired: (id: string) => boolean;
};

// Share one script across tool pages, including navigation while it is loading.
let scriptPromise: Promise<TurnstileApi> | undefined;
function loadTurnstile() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => {
      script.remove();
      scriptPromise = undefined;
      reject(new Error("Turnstile could not load"));
    };
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onerror = fail;
    script.onload = () => {
      const api = (window as Window & { turnstile?: TurnstileApi }).turnstile;
      if (api) resolve(api);
      else fail();
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function useTurnstile(
  siteKey: string,
  onToken: (token?: string) => void,
  onError: () => void,
) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<{ api: TurnstileApi; id: string } | null>(null);
  const callbacks = useRef({ onToken, onError });
  callbacks.current = { onToken, onError };
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    const fail = () => {
      if (!cancelled) callbacks.current.onError();
    };
    const updateToken = (token?: string) => {
      if (!cancelled) callbacks.current.onToken(token);
    };
    void loadTurnstile()
      .then((api) => {
        if (cancelled || !container.current) return;
        const id = api.render(container.current, {
          sitekey: siteKey,
          action: "free_tool",
          appearance: "interaction-only",
          size: "flexible",
          callback: updateToken,
          "expired-callback": () => updateToken(),
          "error-callback": fail,
          "timeout-callback": fail,
          "unsupported-callback": fail,
        });
        widget.current = { api, id };
      })
      .catch(fail);
    return () => {
      cancelled = true;
      if (widget.current) widget.current.api.remove(widget.current.id);
      widget.current = null;
    };
  }, [siteKey, attempt]);

  return {
    container,
    isExpired: () =>
      !widget.current || widget.current.api.isExpired(widget.current.id),
    reset: () => {
      if (widget.current) widget.current.api.reset(widget.current.id);
      else setAttempt((value) => value + 1);
    },
  };
}
