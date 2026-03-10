import { ShieldAlert } from "lucide-react";

const README_CLOUDFLARE_ACCESS_URL =
  "https://github.com/every-app/open-seo#cloudflare-deployment--access-setup";

type AuthConfigErrorCardProps = {
  message: string;
  onRetry?: () => void;
};

export function AuthConfigErrorCard({
  message,
  onRetry,
}: AuthConfigErrorCardProps) {
  return (
    <div className="card w-full max-w-2xl bg-base-100 border border-base-300 shadow-xl">
      <div className="card-body gap-4">
        <h2 className="card-title gap-2">
          <ShieldAlert className="size-5 text-error" />
          Cloudflare Access setup required
        </h2>

        <div className="alert alert-error">
          <span>{message}</span>
        </div>

        <p className="text-sm text-base-content/70">
          This deployment is missing required Access settings for
          <code className="mx-1">AUTH_MODE=cloudflare_access</code>. Configure{" "}
          <code className="mx-1">TEAM_DOMAIN</code> and
          <code className="ml-1">POLICY_AUD</code>, then retry.
        </p>

        <div className="card-actions justify-end">
          {onRetry ? (
            <button className="btn btn-ghost btn-sm" onClick={onRetry}>
              Try Again
            </button>
          ) : null}
          <a
            className="btn btn-primary btn-sm"
            href={README_CLOUDFLARE_ACCESS_URL}
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
