import { useEffect } from "react";
import { getCurrentAuthRedirect } from "@/lib/auth-redirect";
import { isHostedClientAuthMode } from "@/lib/auth-mode";

type UnauthenticatedErrorCardProps = {
  message: string;
  onRetry?: () => void;
};

function getSignInHref(redirectTo: string) {
  return redirectTo === "/"
    ? "/sign-in"
    : `/sign-in?redirect=${encodeURIComponent(redirectTo)}`;
}

export function UnauthenticatedErrorCard({
  message,
  onRetry,
}: UnauthenticatedErrorCardProps) {
  const redirectTo =
    typeof window === "undefined"
      ? "/"
      : getCurrentAuthRedirect(window.location);
  const isHostedMode = isHostedClientAuthMode();
  const signInHref = getSignInHref(redirectTo);

  useEffect(() => {
    if (typeof window === "undefined" || !isHostedMode) {
      return;
    }

    window.location.replace(signInHref);
  }, [isHostedMode, signInHref]);

  if (isHostedMode) {
    return null;
  }

  return (
    <div className="card w-full max-w-md bg-base-100 border border-base-300 shadow-xl">
      <div className="card-body gap-4">
        <h2 className="card-title">Authentication required</h2>
        <p className="text-sm text-base-content/70">{message}</p>
        <p className="text-sm text-base-content/70">
          This deployment uses external authentication. Refresh your access
          session, then try again.
        </p>
        {onRetry ? (
          <div className="card-actions justify-end">
            <button className="btn btn-primary btn-sm" onClick={onRetry}>
              Try Again
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
