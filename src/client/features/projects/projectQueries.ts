import { queryOptions } from "@tanstack/react-query";
import { getProjects } from "@/serverFunctions/projects";

// The org's active projects. Invalidating this key also refreshes the
// archived list, which lives under ["projects", "archived"].
export const projectsQueryOptions = () =>
  queryOptions({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
  });
