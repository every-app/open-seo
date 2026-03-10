import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { getOrCreateDefaultProject } from "@/serverFunctions/keywords";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import { AuthConfigErrorCard } from "@/client/components/AuthConfigErrorCard";

export const Route = createFileRoute("/")({
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
