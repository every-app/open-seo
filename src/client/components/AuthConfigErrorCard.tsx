import { ShieldAlert } from "lucide-react";
import { isHostedClientAuthMode } from "@/lib/auth-mode";

const CLOUDFLARE_SETUP_GUIDE_URL =
  "https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_CLOUDFLARE.md#2-configure-authentication-and-secrets";

type AuthConfigErrorCardProps = {
  message: string;
  onRetry?: () => void;
};

export function AuthConfigErrorCard({
  message,
  onRetry,
}: AuthConfigErrorCardProps) {
  const isHostedMode = isHostedClientAuthMode();

  return (
    <div className="card w-full max-w-2xl bg-base-100 border border-base-300 shadow-xl">
      <div className="card-body gap-4">
        <h2 className="card-title gap-2">
          <ShieldAlert className="size-5 text-error" />
          Authentication setup required
        </h2>

        <div className="alert alert-error">
          <span>{message}</span>
        </div>

        {isHostedMode ? (
          <p className="text-sm text-base-content/70">
            Hosted mode requires{" "}
            <code className="mx-1">BETTER_AUTH_SECRET</code>
            (32+ characters), <code className="mx-1">BETTER_AUTH_URL</code>, and
            Google OAuth credentials on the deployment.
          </p>
        ) : (
          <p className="text-sm text-base-content/70">
            Cloudflare Access mode requires
            <code className="mx-1">TEAM_DOMAIN</code> (a full https URL) and
            <code className="mx-1">POLICY_AUD</code> set on the deployment, with
            an Access application protecting this hostname.
          </p>
        )}

        <div className="card-actions justify-end">
          {onRetry ? (
            <button className="btn btn-ghost btn-sm" onClick={onRetry}>
              Try Again
            </button>
          ) : null}
          <a
            className="btn btn-primary btn-sm"
            href={CLOUDFLARE_SETUP_GUIDE_URL}
            target="_blank"
            rel="noreferrer"
          >
            Open Setup Guide
          </a>
        </div>
      </div>
    </div>
  );
}
