import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { getOrCreateDefaultProject } from "@/serverFunctions/keywords";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

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
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-error">
          {getStandardErrorMessage(
            error,
            "An unexpected error occurred. Please check server logs.",
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full">
      <span className="loading loading-spinner loading-md" />
    </div>
  );
}
