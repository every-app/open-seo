import { queryOptions } from "@tanstack/react-query";
import { queryClient } from "@/client/tanstack-db";
import { listSamSessions } from "@/serverFunctions/sam";

export const samSessionsQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["samSessions", projectId],
    queryFn: () => listSamSessions({ data: { projectId } }),
  });

export function invalidateSamSessions(projectId: string) {
  void queryClient.invalidateQueries({ queryKey: ["samSessions", projectId] });
}
