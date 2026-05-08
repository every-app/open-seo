import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Database, KeyRound, User } from "lucide-react";
import { useState } from "react";
import { authClient, useSession } from "@/lib/auth-client";
import { getOAuthClientInfo } from "@/serverFunctions/oauth";

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
    description: "Run tools and write results back to your workspace.",
  },
];

function OAuthConsentPage() {
  const { data: session } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("client_id")
      : null;

  const clientInfoQuery = useQuery({
    queryKey: ["oauth-client-info", clientId],
    queryFn: () =>
      clientId
        ? getOAuthClientInfo({ data: { clientId } })
        : Promise.resolve(null),
    enabled: Boolean(clientId),
    staleTime: 60_000,
  });

  const clientName = clientInfoQuery.data?.name ?? null;
  const userEmail = session?.user?.email ?? null;
  const isLoadingClient = clientInfoQuery.isLoading;
  const named = Boolean(clientName);

  async function respond(accept: boolean) {
    setError(null);
    setIsSubmitting(true);

    const { data, error: consentError } = await authClient.oauth2.consent({
      accept,
    });

    if (consentError) {
      setError(consentError.message ?? "Unable to complete authorization.");
      setIsSubmitting(false);
      return;
    }

    if (data?.redirect && data.url) {
      window.location.assign(data.url);
      return;
    }

    setError("Authorization response did not include a redirect URL.");
    setIsSubmitting(false);
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-base-300 bg-base-100 p-8 shadow-sm">
      <div className="flex flex-col items-center text-center">
        <img
          src="/transparent-logo.png"
          alt="OpenSEO"
          className="size-10 rounded-lg"
        />
        {isLoadingClient ? (
          <div className="mt-5 h-7 w-48 animate-pulse rounded-md bg-base-200" />
        ) : (
          <h1 className="mt-5 text-xl font-semibold">
            {named ? (
              <>
                Authorize <span className="text-primary">{clientName}</span>
              </>
            ) : (
              "Authorize MCP access"
            )}
          </h1>
        )}
        <p className="mt-2 text-sm text-base-content/70">
          {named
            ? `${clientName} is requesting access to your OpenSEO workspace.`
            : "An MCP client is requesting access to your OpenSEO workspace."}
        </p>
      </div>

      {!named && !isLoadingClient ? (
        <div className="mt-5 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-content/90">
          This client did not provide a name during registration. Only continue
          if you started this connection yourself.
        </div>
      ) : null}

      {userEmail ? (
        <div className="mt-6 flex items-center gap-3 rounded-lg border border-base-300 bg-base-200/50 px-3 py-2 text-sm">
          <div className="flex size-7 items-center justify-center rounded-full bg-base-300">
            <User className="size-4" />
          </div>
          <div className="flex-1">
            <div className="text-xs text-base-content/60">Signed in as</div>
            <div className="font-medium">{userEmail}</div>
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        <div className="text-xs font-medium uppercase tracking-wide text-base-content/60">
          {named ? `This will allow ${clientName} to` : "This will allow it to"}
        </div>
        <ul className="mt-3 space-y-3">
          {SCOPES.map((scope) => (
            <li key={scope.label} className="flex gap-3">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <div className="text-sm font-medium">{scope.label}</div>
                <div className="text-xs text-base-content/60">
                  {scope.description}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {error ? (
        <div className="mt-6 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
          {error}
        </div>
      ) : null}

      <div className="mt-8 flex gap-2">
        <button
          type="button"
          className="btn btn-ghost flex-1"
          disabled={isSubmitting}
          onClick={() => void respond(false)}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary flex-1"
          disabled={isSubmitting}
          onClick={() => void respond(true)}
        >
          {isSubmitting ? "Authorizing..." : "Authorize"}
        </button>
      </div>

      <p className="mt-6 text-center text-xs text-base-content/50">
        You can revoke access at any time in Settings.
      </p>
    </div>
  );
}
