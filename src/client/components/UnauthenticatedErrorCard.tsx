import { useEffect } from "react";
import { getSignInHref, getSignInHrefForLocation } from "@/lib/auth-redirect";
import { isHostedClientAuthMode } from "@/lib/auth-mode";

import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardTitle } from "@/client/components/ui/card";
type UnauthenticatedErrorCardProps = {
  message: string;
  onRetry?: () => void;
};

export function UnauthenticatedErrorCard({
  message,
  onRetry,
}: UnauthenticatedErrorCardProps) {
  const isHostedMode = isHostedClientAuthMode();
  const signInHref =
    typeof window === "undefined"
      ? getSignInHref("/")
      : getSignInHrefForLocation(window.location);

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
    <Card className="w-full max-w-md shadow-xl">
      <CardContent className="pt-6 gap-4">
        <CardTitle>Authentication required</CardTitle>
        <p className="text-sm text-muted-foreground">{message}</p>
        <p className="text-sm text-muted-foreground">
          This deployment uses external authentication. Refresh your access
          session, then try again.
        </p>
        {onRetry ? (
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <Button size="sm" onClick={onRetry}>
              Try Again
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
