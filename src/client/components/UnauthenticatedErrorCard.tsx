import { useEffect } from "react";
import { getSignInHref, getSignInHrefForLocation } from "@/lib/auth-redirect";
import { isHostedClientAuthMode } from "@/lib/auth-mode";

import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";

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
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-lg">Authentication required</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{message}</p>
        <p className="text-sm text-muted-foreground">
          This deployment uses external authentication. Refresh your access
          session, then try again.
        </p>
        {onRetry ? (
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <Button size="sm" type="button" onClick={onRetry}>
              Try Again
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
