import { Link, rootRouteId, useMatch, useRouter } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import * as React from "react";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import { AuthConfigErrorCard } from "@/client/components/AuthConfigErrorCard";
import { captureClientError } from "@/client/lib/posthog";
import { UnauthenticatedErrorCard } from "@/client/components/UnauthenticatedErrorCard";

function shouldCaptureBoundaryError(
  errorCode: ReturnType<typeof getErrorCode>,
) {
  return (
    errorCode !== "UNAUTHENTICATED" &&
    errorCode !== "NOT_FOUND" &&
    errorCode !== "VALIDATION_ERROR"
  );
}

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
    if (!shouldCaptureBoundaryError(errorCode)) {
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
      <p className="text-center text-error">{message}</p>
      <div className="flex gap-2 items-center flex-wrap">
        <button
          onClick={() => {
            void router.invalidate();
          }}
          className="btn btn-neutral btn-sm uppercase"
        >
          Try Again
        </button>
        {isRoot ? (
          <Link to="/" className="btn btn-neutral btn-sm uppercase">
            Home
          </Link>
        ) : (
          <Link
            to="/"
            className="btn btn-neutral btn-sm uppercase"
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
