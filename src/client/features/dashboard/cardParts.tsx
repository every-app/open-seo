import { cn } from "cn";
import { buttonVariants } from "@/client/components/ui/button";
import { parseDbTimestamp } from "@/client/lib/db-timestamp";

// Shared building blocks for the dashboard cards.
export const moreDetailsClass = cn(
  buttonVariants({ variant: "link", size: "sm" }),
  "px-0",
);

/** Supporting text beside a card title. */
export const cardMetaClass = "text-sm font-normal text-muted-foreground";

/** Card tables share the title's edges, and their rows aren't clickable. */
export const cardTableClass =
  "[&_td:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:first-child]:pl-0 [&_th:last-child]:pr-0 [&_tr]:hover:bg-transparent";

export function formatDay(timestamp: string): string {
  const ms = parseDbTimestamp(timestamp).getTime();
  if (Number.isNaN(ms)) return timestamp;
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
