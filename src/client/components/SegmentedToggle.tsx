import type { ReactNode } from "react";

interface SegmentedToggleItem<T extends string> {
  value: T;
  icon: ReactNode;
  label: string;
}

export function SegmentedToggle<T extends string>({
  items,
  value,
  onChange,
}: {
  items: SegmentedToggleItem<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-base-300 p-0.5">
      {items.map((item) => (
        <button
          key={item.value}
          className={`btn btn-xs px-2 ${value === item.value ? "bg-primary/20 text-primary shadow-sm" : "btn-ghost text-base-content/40"}`}
          onClick={() => onChange(item.value)}
          title={item.label}
        >
          {item.icon}
        </button>
      ))}
    </div>
  );
}
