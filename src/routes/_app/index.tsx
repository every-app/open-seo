import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getProjects } from "@/serverFunctions/projects";
import {
  clearLastProjectId,
  getLastProjectId,
} from "@/client/lib/active-project";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import { AuthConfigErrorCard } from "@/client/components/AuthConfigErrorCard";
import { UnauthenticatedErrorCard } from "@/client/components/UnauthenticatedErrorCard";
import { SUBSCRIBE_ROUTE } from "@/shared/billing";

export const Route = createFileRoute("/_app/")({
  component: IndexRedirect,
});

function IndexRedirect() {
  const navigate = useNavigate();

  const { data, error, isError, refetch } = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
    retry: false,
  });

  useEffect(() => {
    if (!data || data.length === 0) return;

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

    if (errorCode === "AUTH_CONFIG_MISSING") {
      return (
        <div className="flex items-center justify-center h-full p-4">
          <AuthConfigErrorCard
            message={getStandardErrorMessage(
              error,
              "发生意外错误，请检查服务器日志。",
            )}
            onRetry={() => {
              void refetch();
            }}
          />
        </div>
      );
    }

    if (errorCode === "UNAUTHENTICATED") {
      return (
        <div className="flex items-center justify-center h-full p-4">
          <UnauthenticatedErrorCard
            message="请登录以访问你的 OpenSEO 工作区。"
            onRetry={() => {
              void refetch();
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
              正在跳转到账单页面，以便开通托管订阅。
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="flex flex-col items-center gap-3 max-w-xl">
          <p className="text-error text-center">
            {getStandardErrorMessage(error, "发生意外错误，请检查服务器日志。")}
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
