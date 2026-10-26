import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Check, Database, KeyRound, User } from "lucide-react";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { clearLastProjectId } from "@/client/lib/active-project";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { organizationContextQueryOptions } from "@/client/features/team/organizationQueries";
import { switchOrganization } from "@/serverFunctions/organization";

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
    description: "Run tools and save results in this workspace.",
  },
];

function OAuthConsentPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { data: organizationContext } = useQuery(
    organizationContextQueryOptions(),
  );
  const organizations = organizationContext?.organizations ?? [];
  const [pendingAction, setPendingAction] = useState<
    "authorize" | "cancel" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [appRedirectUrl, setAppRedirectUrl] = useState<string | null>(null);

  useEffect(() => {
    captureClientEvent("mcp:consent_viewed");
  }, []);

  // The grant binds to the session's active workspace when Authorize is
  // clicked, so switching here is the same switch as the account menu's and
  // carries over to the app.
  const switchWorkspace = useMutation({
    mutationFn: (organizationId: string) =>
      switchOrganization({ data: { organizationId } }),
    onMutate: () => setError(null),
    onSuccess: async () => {
      // The remembered project belongs to the old workspace.
      clearLastProjectId();
      await queryClient.invalidateQueries(organizationContextQueryOptions());
    },
    onError: (switchError) => setError(getStandardErrorMessage(switchError)),
  });

  async function respond(accept: boolean) {
    setError(null);
    setPendingAction(accept ? "authorize" : "cancel");
    if (!accept) {
      captureClientEvent("mcp:consent_denied");
    }

    try {
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
      } else if (data.redirectTo) {
        window.location.assign(data.redirectTo);
        // An app link like claude:// hands off to the desktop app and leaves
        // this page in place, so offer a link in case the handoff was missed.
        if (/^https?:/i.test(data.redirectTo)) return;
        setAppRedirectUrl(data.redirectTo);
      } else {
        setError("Authorization response did not include a redirect URL.");
      }
    } catch {
      setError("We couldn't reach OpenSEO. Please try again.");
    }
    setPendingAction(null);
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="flex flex-col items-center text-center">
        <img
          src="/transparent-logo.png"
          alt="OpenSEO"
          className="size-10 rounded-lg"
        />
        <CardTitle className="mt-5 text-xl">
          <h1>Authorize MCP access</h1>
        </CardTitle>
        <p className="mt-2 text-sm text-muted-foreground">
          An MCP client is requesting access to your OpenSEO workspace.
        </p>
      </CardHeader>
      <CardContent>
        {/* _authenticated only renders this page with a signed-in user. */}
        <div className="mt-6 flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
          <div className="flex size-7 items-center justify-center rounded-full bg-muted">
            <User className="size-4" />
          </div>
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">Signed in as</div>
            <div className="font-medium">{session?.user.email}</div>
          </div>
        </div>
        {/* The grant is bound to the active workspace. Which one only
            matters to people in more than one, the same rule as the account
            menu switcher and the Settings organization columns. */}
        {organizations.length > 1 ? (
          <div className="mt-2 flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
            <div className="flex size-7 items-center justify-center rounded-full bg-muted">
              <Building2 className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted-foreground">Workspace</div>
              <Select
                items={organizations.map((organization) => ({
                  value: organization.organizationId,
                  label: organization.organizationName,
                }))}
                value={organizationContext?.organizationId ?? null}
                disabled={switchWorkspace.isPending || pendingAction !== null}
                onValueChange={(organizationId) => {
                  if (
                    organizationId &&
                    organizationId !== organizationContext?.organizationId
                  ) {
                    switchWorkspace.mutate(organizationId);
                  }
                }}
              >
                <SelectTrigger
                  size="sm"
                  aria-label="Workspace"
                  className="mt-0.5 w-full font-medium"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((organization) => (
                    <SelectItem
                      key={organization.organizationId}
                      value={organization.organizationId}
                    >
                      {organization.organizationName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          <Alert variant="destructive" className="mt-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {appRedirectUrl ? (
          <div className="mt-8 text-center">
            <p className="text-sm text-muted-foreground">
              Opening your app... Didn't open?
            </p>
            <Button
              className="mt-3 w-full"
              nativeButton={false}
              render={<a href={appRedirectUrl} />}
            >
              Open app
            </Button>
          </div>
        ) : (
          <div className="mt-8 flex gap-2">
            <Button
              type="button"
              variant="ghost"
              className="flex-1"
              pending={pendingAction === "cancel"}
              disabled={pendingAction !== null}
              onClick={() => void respond(false)}
            >
              {pendingAction === "cancel" ? "Canceling..." : "Cancel"}
            </Button>
            <Button
              type="button"
              className="flex-1"
              pending={pendingAction === "authorize"}
              disabled={pendingAction !== null || switchWorkspace.isPending}
              onClick={() => void respond(true)}
            >
              {pendingAction === "authorize" ? "Authorizing..." : "Authorize"}
            </Button>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          You can disconnect it anytime in Settings under Connected agents.
        </p>
      </CardContent>
    </Card>
  );
}
