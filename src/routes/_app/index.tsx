import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { projectsQueryOptions } from "@/client/features/projects/projectQueries";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  clearLastProjectId,
  getLastProjectId,
} from "@/client/lib/active-project";
import { getErrorCode } from "@/client/lib/error-messages";
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

  const { data, error, isError, isFetching, refetch } = useQuery({
    ...projectsQueryOptions(),
    retry: false,
  });

  useEffect(() => {
    // getProjects always returns at least one project.
    if (!data) return;

    // localStorage is untrusted — only honor the remembered project if it's
    // actually in the org's list; otherwise fall back to the most recent and
    // clear the stale id.
    const lastProjectId = getLastProjectId();
    const target = data.find((project) => project.id === lastProjectId);
    if (lastProjectId && !target) {
      clearLastProjectId();
    }

    void navigate({
      to: "/p/$projectId",
      params: { projectId: (target ?? data[0]).id },
    });
  }, [data, navigate]);

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
              fallback="An unexpected error occurred. Please check server logs."
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
