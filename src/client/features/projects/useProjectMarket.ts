import { useQuery } from "@tanstack/react-query";
import { projectsQueryOptions } from "@/client/features/projects/projectQueries";
import type { ProjectMarket } from "./types";

/** The project's default market, or undefined until the projects query resolves. */
export function useProjectMarket(projectId: string): ProjectMarket | undefined {
  const projectsQuery = useQuery(projectsQueryOptions());

  return projectsQuery.data?.find((project) => project.id === projectId);
}
