import { createFileRoute } from "@tanstack/react-router";
import { Check, Database, KeyRound, User } from "@/client/components/icons";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { captureClientEvent } from "@/client/lib/posthog";

import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/client/components/ui/card";

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
    <Card className="w-full max-w-md">
      <CardHeader className="items-center space-y-2 p-8 pb-0 text-center">
        <img
          src="/transparent-logo.png"
          alt="OpenSEO"
          className="size-10 rounded-lg"
        />
        <h1 className="pt-3 text-xl font-semibold tracking-tight">
          Authorize MCP access
        </h1>
        <CardDescription>
          An MCP client is requesting access to your OpenSEO workspace.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6 p-8 pb-0 pt-6">
        {userEmail ? (
          <div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm">
            <div className="flex size-7 items-center justify-center rounded-full bg-accent">
              <User className="size-4" />
            </div>
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">Signed in as</div>
              <div className="font-medium">{userEmail}</div>
            </div>
          </div>
        ) : null}

        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            This will allow it to
          </div>
          <ul className="mt-3 space-y-3">
            {SCOPES.map((scope) => (
              <li key={scope.label} className="flex gap-3">
                <Check className="mt-0.5 size-4 shrink-0 text-link" />
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
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-6 p-8 pt-8">
        <div className="flex gap-2">
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

        <p className="text-center text-xs text-muted-foreground">
          You can revoke access at any time in Settings.
        </p>
      </CardFooter>
    </Card>
  );
}
