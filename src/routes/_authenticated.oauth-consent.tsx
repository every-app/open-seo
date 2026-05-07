import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_authenticated/oauth-consent")({
  component: OAuthConsentPage,
});

function OAuthConsentPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="w-full max-w-sm space-y-5">
      <div className="text-center space-y-3">
        <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-base-200">
          <ShieldCheck className="size-6" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Authorize MCP access</h1>
          <p className="mt-2 text-sm text-base-content/70">
            Allow this MCP client to access your OpenSEO workspace.
          </p>
        </div>
      </div>

      {error ? <p className="text-sm text-error">{error}</p> : null}

      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-ghost flex-1"
          disabled={isSubmitting}
          onClick={() => void respond(false)}
        >
          Deny
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
    </div>
  );
}
