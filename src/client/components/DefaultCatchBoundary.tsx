import { Link, rootRouteId, useMatch, useRouter } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import * as React from "react";
import { shouldCaptureAppErrorCode } from "@/shared/error-codes";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import { AuthConfigErrorCard } from "@/client/components/AuthConfigErrorCard";
import { captureClientError } from "@/client/lib/posthog";
import { UnauthenticatedErrorCard } from "@/client/components/UnauthenticatedErrorCard";

import { Button, buttonVariants } from "@/client/components/ui/button";
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

  const showAuthConfigHelp = errorCode === "AUTH_CONFIG_MISSING";
  const showSignInHelp = errorCode === "UNAUTHENTICATED";

  if (showAuthConfigHelp) {
    return (
      <div className="min-w-0 flex-1 p-4 flex items-center justify-center">
        <AuthConfigErrorCard
          message={message}
          onRetry={() => {
            void router.invalidate();
          }}
        />
      </div>
    );
  }

  if (showSignInHelp) {
    return (
      <div className="min-w-0 flex-1 p-4 flex items-center justify-center">
        <UnauthenticatedErrorCard
          message={message}
          onRetry={() => {
            void router.invalidate();
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-w-0 flex-1 p-4 flex flex-col items-center justify-center gap-6">
      <p className="text-center text-destructive">{message}</p>
      <div className="flex gap-2 items-center flex-wrap">
        <Button
          size="sm"
          onClick={() => {
            void router.invalidate();
          }}
        >
          Try Again
        </Button>
        {isRoot ? (
          <Link
            to="/"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Home
          </Link>
        ) : (
          <Link
            to="/"
            className={buttonVariants({ variant: "outline", size: "sm" })}
            onClick={(e) => {
              e.preventDefault();
              window.history.back();
            }}
          >
            Go Back
          </Link>
        )}
      </div>
    </div>
  );
}
