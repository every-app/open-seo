import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { projectsQueryOptions } from "@/client/features/projects/projectQueries";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getLastProjectId } from "@/client/lib/active-project";
import {
  getErrorCode,
  UNEXPECTED_ERROR_MESSAGE,
} from "@/client/lib/error-messages";
import { AuthErrorCard } from "@/client/components/AuthErrorCard";
import { QueryError } from "@/client/components/QueryState";
import { SkeletonPage } from "@/client/components/SkeletonPresets";
import { StatusScreen } from "@/client/components/StatusScreen";
import { SUBSCRIBE_ROUTE } from "@/shared/billing";

export const Route = createFileRoute("/_app/")({
  component: IndexRedirect,
});

function IndexRedirect() {
  const navigate = useNavigate();

  // Open the remembered project at once instead of waiting on the project
  // list. localStorage is untrusted, but the project layout checks access and,
  // if the id isn't one of the org's projects, clears it and sends the user
  // back here to fall back to the list.
  const lastProjectId = getLastProjectId();
  const { data, error, isError, isFetching, refetch } = useQuery({
    ...projectsQueryOptions(),
    retry: false,
  });

  useEffect(() => {
    // getProjects always returns at least one project.
    const projectId = lastProjectId ?? data?.[0]?.id;
    if (!projectId) return;
    void navigate({ to: "/p/$projectId", params: { projectId } });
  }, [lastProjectId, data, navigate]);

  useEffect(() => {
    if (getErrorCode(error) !== "PAYMENT_REQUIRED") {
      return;
    }

    void navigate({ href: SUBSCRIBE_ROUTE });
  }, [error, navigate]);

  if (isError) {
    const errorCode = getErrorCode(error);

    if (errorCode === "PAYMENT_REQUIRED") {
      return (
        <StatusScreen
          pending
          description="Redirecting you to billing so you can start a hosted subscription."
        />
      );
    }

    return (
      <AuthErrorCard
        error={error}
        onRetry={() => void refetch()}
        fallback={
          <StatusScreen>
            <QueryError
              error={error}
              fallback={UNEXPECTED_ERROR_MESSAGE}
              onRetry={() => void refetch()}
              isRetrying={isFetching}
            />
          </StatusScreen>
        }
      />
    );
  }

  // Shaped like the page it is about to open.
  return <SkeletonPage />;
}
