import { useState, type ReactNode } from "react";
import { Button } from "@/client/components/ui/button";

const LIMIT = 3;

/**
 * A list that shows its first three items and a "+N more" toggle for the
 * rest. `renderItem` returns the `<li>`, with its key.
 */
export function ExpandableList<TItem>({
  items,
  renderItem,
  className,
}: {
  items: readonly TItem[];
  renderItem: (item: TItem, index: number) => ReactNode;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, LIMIT);

  return (
    <div className="space-y-1">
      <ul className={className}>{visible.map(renderItem)}</ul>
      {items.length > LIMIT ? (
        <Button
          variant="link"
          size="xs"
          className="h-auto px-0 text-muted-foreground hover:text-foreground"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Show less" : `+${items.length - LIMIT} more`}
        </Button>
      ) : null}
    </div>
  );
}
