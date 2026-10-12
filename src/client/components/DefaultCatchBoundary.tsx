import { Link, rootRouteId, useMatch, useRouter } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import * as React from "react";
import { shouldCaptureAppErrorCode } from "@/shared/error-codes";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import { AuthErrorCard } from "@/client/components/AuthErrorCard";
import { captureClientError } from "@/client/lib/posthog";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardFooter } from "@/client/components/ui/card";

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
  const router = useRouter();
  const isRoot = useMatch({
    strict: false,
    select: (state) => state.id === rootRouteId,
  });
  const pathname = router.state.location.pathname;

  const message = getStandardErrorMessage(
    error,
    "Something went wrong. Please try again.",
  );
  const errorCode = getErrorCode(error);

  React.useEffect(() => {
    if (!shouldCaptureAppErrorCode(errorCode)) {
      return;
    }

    captureClientError(error, {
      errorCode,
      path: pathname,
    });
  }, [error, errorCode, pathname]);

  const genericError = (
    <div className="flex min-w-0 flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="text-center text-destructive">
          {message}
        </CardContent>
        <CardFooter className="flex flex-wrap justify-center gap-2">
          <Button
            onClick={() => {
              void router.invalidate();
            }}
            size="sm"
          >
            Try Again
          </Button>
          {isRoot ? (
            <Button
              nativeButton={false}
              render={<Link to="/" />}
              size="sm"
              variant="outline"
            >
              Home
            </Button>
          ) : (
            <Button
              nativeButton={false}
              render={
                <Link
                  to="/"
                  onClick={(e) => {
                    e.preventDefault();
                    window.history.back();
                  }}
                />
              }
              size="sm"
              variant="outline"
            >
              Go Back
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );

  return (
    <AuthErrorCard
      error={error}
      onRetry={() => {
        void router.invalidate();
      }}
      fallback={genericError}
    />
  );
}
