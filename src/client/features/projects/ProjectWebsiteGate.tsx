import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { projectsQueryOptions } from "@/client/features/projects/projectQueries";
import { ProjectWebsiteSetup } from "@/client/features/projects/ProjectWebsiteSetup";
import { QueryError } from "@/client/components/QueryState";
import { SkeletonPageContent } from "@/client/components/SkeletonPresets";

export function ProjectWebsiteGate({
  projectId,
  header,
  children,
}: {
  projectId: string;
  /** The page's title, kept above the setup card so the page keeps its name. */
  header?: ReactNode;
  children: ReactNode;
}) {
  const query = useQuery(projectsQueryOptions());
  if (query.isPending) return <SkeletonPageContent />;
  if (query.isError)
    return (
      <QueryError
        fallback="Couldn't load your project."
        error={query.error}
        onRetry={() => void query.refetch()}
        isRetrying={query.isFetching}
      />
    );
  const project = query.data.find((row) => row.id === projectId);
  if (!project) return null;
  if (project.domain) return children;
  return (
    <>
      {header}
      <div
        className={cn(
          "grid place-items-center",
          header ? "min-h-[calc(100dvh-13rem)]" : "min-h-[calc(100dvh-8rem)]",
        )}
      >
        <ProjectWebsiteSetup projectId={projectId} />
      </div>
    </>
  );
}
