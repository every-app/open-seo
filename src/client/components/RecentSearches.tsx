import type { ReactNode } from "react";
import { Clock, History, X, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { EmptyState } from "@/client/components/EmptyState";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader } from "@/client/components/ui/card";

// Props for the caller's clickable element. Spread them onto a <Link> so
// cmd+click and "open in new tab" work, or onto a <button> for in-page state.
type ClickableProps = { className: string; children: ReactNode };

type Props<TItem extends { timestamp: number }> = {
  items: TItem[];
  loaded: boolean;
  onRemove: (timestamp: number) => void;
  renderLink: (item: TItem, props: ClickableProps) => ReactNode;
  getTitle: (item: TItem) => ReactNode;
  getSubtitle: (item: TItem) => ReactNode;
  emptyIcon: LucideIcon;
  /** Takes the icon's place. */
  emptyIllustration?: ReactNode;
  emptyTitle: string;
  emptyDescription?: string;
  /** Inside another card: no card of its own, and two columns from md. */
  embedded?: boolean;
};

export function RecentSearches<TItem extends { timestamp: number }>({
  items,
  loaded,
  onRemove,
  renderLink,
  getTitle,
  getSubtitle,
  emptyIcon,
  emptyIllustration,
  emptyTitle,
  emptyDescription,
  embedded = false,
}: Props<TItem>) {
  if (!loaded) {
    return null;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        illustration={emptyIllustration}
        title={emptyTitle}
        description={emptyDescription}
        variant={embedded ? "plain" : undefined}
      />
    );
  }

  const list = (
    <ul className={cn("grid gap-2", embedded && "md:grid-cols-2")}>
      {items.map((item) => (
        <li
          key={item.timestamp}
          className="group flex min-w-0 items-center gap-2 rounded-lg border border-border p-2"
        >
          {renderLink(item, {
            className:
              "flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1 text-left transition-colors outline-none hover:bg-foreground/5 focus-visible:ring-3 focus-visible:ring-ring/50",
            children: (
              <>
                <Clock
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="truncate font-medium">{getTitle(item)}</p>
                  {getSubtitle(item) ? (
                    <p className="truncate text-muted-foreground">
                      {getSubtitle(item)}
                    </p>
                  ) : null}
                </div>
              </>
            ),
          })}
          <div className="flex shrink-0 items-center gap-1">
            <span className="text-xs text-muted-foreground">
              {new Date(item.timestamp).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              className="reveal-on-hover"
              onClick={() => onRemove(item.timestamp)}
              aria-label="Remove from recent searches"
            >
              <X />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );

  if (embedded) {
    return (
      <section className="space-y-2 pt-2" aria-label="Recent searches">
        <h2 className="flex items-center gap-2 text-sm text-muted-foreground">
          <History className="size-4" aria-hidden />
          Recent searches
        </h2>
        {list}
      </section>
    );
  }

  return (
    <Card size="lg">
      <CardHeader className="flex items-center gap-2 text-muted-foreground">
        <History className="size-4" aria-hidden />
        {items.length} recent search{items.length !== 1 ? "es" : ""}
      </CardHeader>

      <CardContent>{list}</CardContent>
    </Card>
  );
}
