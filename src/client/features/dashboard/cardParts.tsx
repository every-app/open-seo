import { buttonVariants } from "@/client/components/ui/button";
import { SkeletonTableRows } from "@/client/components/SkeletonPresets";
import { parseDbTimestamp } from "@/client/lib/db-timestamp";

// Shared building blocks for the dashboard cards.
export function MetricsTableSkeleton() {
  return <SkeletonTableRows rows={5} columns={3} />;
}

export const moreDetailsClass = buttonVariants({
  variant: "ghost",
  size: "xs",
});

export function formatDay(timestamp: string): string {
  const ms = parseDbTimestamp(timestamp).getTime();
  if (Number.isNaN(ms)) return timestamp;
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
