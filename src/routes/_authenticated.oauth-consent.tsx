import { createFileRoute } from "@tanstack/react-router";
import { Check, Database, KeyRound, User } from "lucide-react";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { captureClientEvent } from "@/client/lib/posthog";

import { Button } from "@/client/components/ui/button";
export const Route = createFileRoute("/_authenticated/oauth-consent")({
  component: OAuthConsentPage,
});

const SCOPES = [
  {
    icon: Database,
    label: "Read your OpenSEO data",
    description: "Projects, keyword reports, and audit results.",
  },
  {
    icon: KeyRound,
    label: "Act on your behalf via MCP",
    description: "Run tools and write results back to your organization.",
  },
];

function OAuthConsentPage() {
  const { data: session } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userEmail = session?.user?.email ?? null;

  useEffect(() => {
    captureClientEvent("mcp:consent_viewed");
  }, []);

  async function respond(accept: boolean) {
    setError(null);
    setIsSubmitting(true);
    if (!accept) {
      captureClientEvent("mcp:consent_denied");
    }

    const response = await fetch("/api/oauth/consent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        accept,
        query: window.location.search,
      }),
    });
    const data: {
      redirectTo?: string;
      error?: string;
    } = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Unable to complete authorization.");
      setIsSubmitting(false);
      return;
    }

    if (data.redirectTo) {
      window.location.assign(data.redirectTo);
      return;
    }

    setError("Authorization response did not include a redirect URL.");
    setIsSubmitting(false);
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
      <div className="flex flex-col items-center text-center">
        <img
          src="/transparent-logo.png"
          alt="OpenSEO"
          className="size-10 rounded-lg"
        />
        <h1 className="mt-5 text-xl font-semibold">Authorize MCP access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          An MCP client is requesting access to your OpenSEO workspace.
        </p>
      </div>

      {userEmail ? (
        <div className="mt-6 flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
          <div className="flex size-7 items-center justify-center rounded-full bg-border">
            <User className="size-4" />
          </div>
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">Signed in as</div>
            <div className="font-medium">{userEmail}</div>
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          This will allow it to
        </div>
        <ul className="mt-3 space-y-3">
          {SCOPES.map((scope) => (
            <li key={scope.label} className="flex gap-3">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <div className="text-sm font-medium">{scope.label}</div>
                <div className="text-xs text-muted-foreground">
                  {scope.description}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {error ? (
        <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="mt-8 flex gap-2">
        <Button
          variant="ghost"
          type="button"
          className="flex-1"
          disabled={isSubmitting}
          onClick={() => void respond(false)}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={isSubmitting}
          onClick={() => void respond(true)}
        >
          {isSubmitting ? "Authorizing..." : "Authorize"}
        </Button>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground/70">
        You can revoke access at any time in Settings.
      </p>
    </div>
  );
}
