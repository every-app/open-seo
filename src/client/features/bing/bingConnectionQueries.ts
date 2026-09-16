import { queryOptions } from "@tanstack/react-query";
import { getBingConnection } from "@/serverFunctions/bing";

export const bingConnectionOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["bingConnection", projectId],
    queryFn: () => getBingConnection({ data: { projectId } }),
  });
