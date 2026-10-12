import { buttonVariants } from "@/client/components/ui/button";
import { SkeletonTableRows } from "@/client/components/SkeletonPresets";

// Shared building blocks for the dashboard cards.
export function MetricsTableSkeleton() {
  return <SkeletonTableRows rows={5} columns={3} />;
}

export const moreDetailsClass = buttonVariants({
  variant: "ghost",
  size: "xs",
});

export function formatDay(timestamp: string): string {
  const ms = Date.parse(
    // SQLite's current_timestamp default has no timezone marker; treat it as
    // UTC rather than letting the browser parse it as local time.
    /^\d{4}-\d{2}-\d{2} /.test(timestamp)
      ? `${timestamp.replace(" ", "T")}Z`
      : timestamp,
  );
  if (Number.isNaN(ms)) return timestamp;
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
