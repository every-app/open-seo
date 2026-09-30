import type { ReactNode } from "react";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/client/components/ui/toggle-group";

interface SegmentedToggleItem<T extends string> {
  value: T;
  icon: ReactNode;
  label: string;
}

export function SegmentedToggle<T extends string>({
  items,
  value,
  onChange,
  showLabels = false,
}: {
  items: SegmentedToggleItem<T>[];
  value: T;
  onChange: (value: T) => void;
  showLabels?: boolean;
}) {
  return (
    <ToggleGroup
      size="sm"
      value={[value]}
      onValueChange={(next) => {
        // Clicking the pressed item empties the group; keep one selected.
        const item = items.find((option) => option.value === next[0]);
        if (item) onChange(item.value);
      }}
    >
      {items.map((item) => (
        <ToggleGroupItem
          key={item.value}
          value={item.value}
          title={item.label}
          aria-label={item.label}
          className="gap-1.5"
        >
          {item.icon}
          {showLabels && item.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
