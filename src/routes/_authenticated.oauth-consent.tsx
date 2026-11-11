import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, User } from "lucide-react";
import { useEffect, useState } from "react";
import { signOutAndRedirect, useSession } from "@/lib/auth-client";
import { clearLastProjectId } from "@/client/lib/active-project";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { QueryState } from "@/client/components/QueryState";
import { Spinner } from "@/client/components/Spinner";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { AuthPageCard } from "@/client/features/auth/AuthPage";
import { organizationContextQueryOptions } from "@/client/features/team/organizationQueries";
import { getMcpConsentRequest } from "@/serverFunctions/mcp-connections";
import { switchOrganization } from "@/serverFunctions/organization";
import { pageHead } from "@/client/lib/pageHead";

export const Route = createFileRoute("/_authenticated/oauth-consent")({
  head: () => pageHead("Authorize MCP access"),
  // Reads the authorize params from window.location, which only the browser
  // has.
  ssr: false,
  component: OAuthConsentPage,
});

const PERMISSIONS = [
  "Read your projects, keywords, and audits",
  "Run tools and save results",
];

// Where the approval is sent. Only https is left out, so an app link or a
// plain http address never reads as a website.
function redirectTarget(redirectUri: string) {
  const url = new URL(redirectUri);
  return url.protocol === "https:" ? url.host : `${url.protocol}//${url.host}`;
}

function OAuthConsentPage() {
  const query = window.location.search;
  const requestQuery = useQuery({
    queryKey: ["mcpConsentRequest", query],
    queryFn: () => getMcpConsentRequest({ data: { query } }),
  });

  useEffect(() => {
    captureClientEvent("mcp:consent_viewed");
  }, []);

  return (
    // One column for the request and for the error that replaces it.
    <div className="flex w-full max-w-md flex-col items-center">
      <QueryState
        query={requestQuery}
        errorFallback="We couldn't load this request."
        loading={<Spinner />}
      >
        {(request) => <ConsentRequest query={query} request={request} />}
      </QueryState>
    </div>
  );
}

function ConsentRequest({
  query,
  request,
}: {
  query: string;
  request: { clientName?: string; redirectUri: string };
}) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { data: organizationContext } = useQuery(
    organizationContextQueryOptions(),
  );
  const organizations = organizationContext?.organizations ?? [];
  const [pendingAction, setPendingAction] = useState<"allow" | "deny" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [appRedirectUrl, setAppRedirectUrl] = useState<string | null>(null);

  // The grant binds to the session's active workspace when Allow is clicked,
  // so switching here is the same switch as the account menu's and carries
  // over to the app.
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
    setPendingAction(accept ? "allow" : "deny");
    if (!accept) {
      captureClientEvent("mcp:consent_denied");
    }

    try {
      const response = await fetch("/api/oauth/consent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accept, query }),
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
    <Card className="w-full sm:[--card-spacing:--spacing(8)]">
      <CardContent>
        <AuthPageCard
          className="max-w-none"
          title={`Allow ${request.clientName ?? "this app"} to access your OpenSEO account?`}
        >
          <div className="flex items-center gap-3 text-sm">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted/50">
              <User className="size-4" />
            </div>
            {/* _authenticated only renders this page with a signed-in user. */}
            <div className="min-w-0 flex-1 truncate font-medium">
              {session?.user.email}
            </div>
            {/* Signing in again comes back to this same request. */}
            <Button
              type="button"
              variant="link"
              className="h-auto p-0"
              disabled={pendingAction !== null}
              onClick={() => signOutAndRedirect()}
            >
              Switch account
            </Button>
          </div>

          <dl className="space-y-3 rounded-lg border border-border bg-muted/50 px-3 py-3 text-sm sm:px-4">
            <div className="flex items-center justify-between gap-4">
              <dt className="shrink-0 text-muted-foreground">Redirects to</dt>
              <dd className="truncate font-medium" title={request.redirectUri}>
                {redirectTarget(request.redirectUri)}
              </dd>
            </div>
            {/* The grant is bound to the active workspace. Which one only
            matters to people in more than one, the same rule as the account
            menu switcher and the Settings organization columns. */}
            {organizations.length > 1 ? (
              <div className="flex items-center justify-between gap-4">
                <dt className="shrink-0 text-muted-foreground">Workspace</dt>
                <dd className="min-w-0">
                  <Select
                    items={organizations.map((organization) => ({
                      value: organization.organizationId,
                      label: organization.organizationName,
                    }))}
                    value={organizationContext?.organizationId ?? null}
                    disabled={
                      switchWorkspace.isPending || pendingAction !== null
                    }
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
                      className="max-w-full font-medium"
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
                </dd>
              </div>
            ) : null}
          </dl>

          <ul className="space-y-2 rounded-lg border border-border bg-muted/50 px-3 py-3 text-sm text-pretty sm:px-4">
            {PERMISSIONS.map((permission) => (
              <li key={permission} className="flex gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                {permission}
              </li>
            ))}
          </ul>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {appRedirectUrl ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">
                Opening your app... Didn't open?
              </p>
              <Button
                className="w-full"
                nativeButton={false}
                render={<a href={appRedirectUrl} />}
              >
                Open app
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Button
                type="button"
                className="w-full"
                pending={pendingAction === "allow"}
                disabled={pendingAction !== null || switchWorkspace.isPending}
                onClick={() => void respond(true)}
              >
                Allow
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                pending={pendingAction === "deny"}
                disabled={pendingAction !== null}
                onClick={() => void respond(false)}
              >
                Deny
              </Button>
            </div>
          )}
        </AuthPageCard>
      </CardContent>
    </Card>
  );
}
