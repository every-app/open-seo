import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { getOrCreateDefaultProject } from "@/serverFunctions/projects";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import { AuthConfigErrorCard } from "@/client/components/AuthConfigErrorCard";
import { UnauthenticatedErrorCard } from "@/client/components/UnauthenticatedErrorCard";
import { BILLING_ROUTE } from "@/shared/billing";

export const Route = createFileRoute("/_app/")({
  component: IndexRedirect,
});

function IndexRedirect() {
  const navigate = useNavigate();

  const { mutate, error, isError } = useMutation({
    mutationFn: () => getOrCreateDefaultProject(),
    onSuccess: (project) => {
      void navigate({
        to: "/p/$projectId/keywords",
        params: { projectId: project.id },
      });
    },
  });

  useEffect(() => {
    mutate();
  }, [mutate]);

  useEffect(() => {
    if (getErrorCode(error) !== "PAYMENT_REQUIRED") {
      return;
    }

    void navigate({ href: BILLING_ROUTE });
  }, [error, navigate]);

  if (isError) {
    const errorCode = getErrorCode(error);

    if (errorCode === "AUTH_CONFIG_MISSING") {
      return (
        <div className="flex items-center justify-center h-full p-4">
          <AuthConfigErrorCard
            message={getStandardErrorMessage(
              error,
              "An unexpected error occurred. Please check server logs.",
            )}
            onRetry={() => {
              mutate();
            }}
          />
        </div>
      );
    }

    if (errorCode === "UNAUTHENTICATED") {
      return (
        <div className="flex items-center justify-center h-full p-4">
          <UnauthenticatedErrorCard
            message="Please sign in to access your OpenSEO workspace."
            onRetry={() => {
              mutate();
            }}
          />
        </div>
      );
    }

    if (errorCode === "PAYMENT_REQUIRED") {
      return (
        <div className="flex items-center justify-center h-full p-4">
          <div className="flex flex-col items-center gap-3 max-w-xl text-center">
            <p className="text-base-content/80">
              Redirecting you to billing so you can start a hosted subscription.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="flex flex-col items-center gap-3 max-w-xl">
          <p className="text-error text-center">
            {getStandardErrorMessage(
              error,
              "An unexpected error occurred. Please check server logs.",
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full">
      <span className="loading loading-spinner loading-md" />
    </div>
  );
}
