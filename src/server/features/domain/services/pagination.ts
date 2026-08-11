/** Whether more pages exist, given the raw provider row count for this page
 *  (`response.items.length`). */
export function computeHasMore(
  offset: number,
  fetchedCount: number,
  totalCount: number | null | undefined,
  pageSize: number,
): boolean {
  return totalCount != null
    ? offset + fetchedCount < totalCount
    : fetchedCount === pageSize;
}
