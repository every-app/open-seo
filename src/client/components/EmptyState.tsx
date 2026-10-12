import type { ReactNode } from "react";
import { CircleAlert, Inbox, SearchX, type LucideIcon } from "lucide-react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/client/components/ui/empty";

const KIND_ICONS: Record<EmptyStateKind, LucideIcon> = {
  "no-data": Inbox,
  filtered: SearchX,
  error: CircleAlert,
};

type EmptyStateKind = "no-data" | "filtered" | "error";

/**
 * The one empty state: an icon, a title, a body and an action.
 *
 * `kind` picks the default icon. Say why the region is empty: "no-data" when
 * nothing exists yet, "filtered" when filters hide every row, "error" when the
 * data failed to load. Name only filters and buttons that exist on the page.
 */
export function EmptyState({
  kind = "no-data",
  icon: Icon = KIND_ICONS[kind],
  title,
  description,
  action,
  variant = "dashed",
  size,
}: {
  kind?: EmptyStateKind;
  /** Pass `null` for a text-only empty state. */
  icon?: LucideIcon | null;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** `dashed` for sections and lists, `card` for a whole panel, `plain` inside a card or table. */
  variant?: "dashed" | "card" | "plain";
  size?: "sm" | "default" | "lg";
}) {
  return (
    <Empty
      variant={variant}
      size={size}
      role={kind === "error" ? "alert" : undefined}
    >
      <EmptyHeader>
        {Icon ? (
          <EmptyMedia
            variant="icon"
            className={
              kind === "error"
                ? "bg-destructive/10 text-destructive"
                : undefined
            }
          >
            <Icon aria-hidden />
          </EmptyMedia>
        ) : null}
        <EmptyTitle>{title}</EmptyTitle>
        {description ? (
          <EmptyDescription>{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
