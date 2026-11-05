import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { Spinner } from "@/client/components/Spinner";
import { AuthPageCard, AuthPageShell } from "@/client/features/auth/AuthPage";
import {
  TURNSTILE_SITE_KEY,
  TurnstileWidget,
} from "@/client/features/auth/TurnstileWidget";
import { getSignInHref, OAUTH_AUTHORIZE_PATH } from "@/lib/auth-redirect";
import { pageHead } from "@/client/lib/pageHead";

export const Route = createFileRoute("/connect")({
  head: () => pageHead("Connect"),
  // Reads the authorize params from window.location, which only the browser
  // has; the page has nothing worth server-rendering anyway.
  ssr: false,
  component: ConnectPage,
});

const guestResponseSchema = z.object({ redirectTo: z.string() });

// Long enough for Turnstile's occasional interactive check, short enough that
// a blocked Turnstile script doesn't leave someone watching a spinner.
const GIVE_UP_AFTER_MS = 20_000;

/**
 * Where an AI app's sign-in window lands when the browser has no OpenSEO
 * session (src/server/mcp/oauth-provider.ts). It passes Turnstile and asks the
 * server for a guest account, which answers with where to go next: back to
 * the AI app, or the normal sign-in page when it won't make a guest. Anything
 * that goes wrong here also falls back to the sign-in page, so this page never
 * leaves someone worse off than signing in. Navigations replace this page in
 * history, so the back button can't replay it into a second guest.
 */
function ConnectPage() {
  const query = window.location.search.slice(1);
  const signInHref = getSignInHref(`${OAUTH_AUTHORIZE_PATH}?${query}`);
  const started = useRef(false);

  const connect = (turnstileToken: string | undefined) => {
    if (started.current) return;
    started.current = true;
    void fetch("/api/oauth/guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, turnstileToken }),
    })
      .then(async (response) => {
        const body = guestResponseSchema.safeParse(await response.json());
        if (!response.ok || !body.success) throw new Error("Guest refused");
        window.location.replace(body.data.redirectTo);
      })
      .catch(() => window.location.replace(signInHref));
  };

  useEffect(() => {
    // Without a site key (local dev) there is nothing to wait for.
    if (!TURNSTILE_SITE_KEY) connect(undefined);
    const timer = setTimeout(() => {
      if (!started.current) window.location.replace(signInHref);
    }, GIVE_UP_AFTER_MS);
    return () => clearTimeout(timer);
    // Runs once: connect and signInHref only read this page's URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthPageShell>
      <AuthPageCard
        title="Connecting OpenSEO"
        helperText="This takes a few seconds. You'll go back to your AI app when it's done."
        footer={
          <p className="text-center text-sm text-muted-foreground">
            Already have an OpenSEO account?{" "}
            <a href={signInHref} className="underline">
              Sign in
            </a>
          </p>
        }
      >
        <div className="flex flex-col items-center gap-4">
          <Spinner />
          <TurnstileWidget
            onToken={(token) => {
              if (token) connect(token);
            }}
            resetNonce={0}
          />
        </div>
      </AuthPageCard>
    </AuthPageShell>
  );
}
