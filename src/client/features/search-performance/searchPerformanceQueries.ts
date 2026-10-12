import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";
import { getSearchPerformanceTable } from "@/serverFunctions/searchPerformance";
import type {
  searchPerformanceInputSchema,
  SearchPerformanceTableDimension,
} from "@/types/schemas/search-performance";

export type FilterInput = Omit<
  z.infer<typeof searchPerformanceInputSchema>,
  "projectId"
>;

// Shared by the live table and prefetch so the query key and request agree.
export function tableQueryOptions(
  projectId: string,
  dimension: SearchPerformanceTableDimension,
  page: number,
  pageSize: number,
  filterInput: FilterInput,
) {
  return queryOptions({
    queryKey: [
      "searchPerformanceTable",
      projectId,
      dimension,
      page,
      pageSize,
      filterInput,
    ],
    queryFn: () =>
      getSearchPerformanceTable({
        data: { projectId, dimension, page, pageSize, ...filterInput },
      }),
  });
}
