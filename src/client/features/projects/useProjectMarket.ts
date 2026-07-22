import { useQuery } from "@tanstack/react-query";
import { getProjects } from "@/serverFunctions/projects";
import type { ProjectMarket } from "./types";

/** The project's default market, or undefined until the projects query resolves. */
export function useProjectMarket(projectId: string): ProjectMarket | undefined {
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
  });

  return projectsQuery.data?.find((project) => project.id === projectId);
}
