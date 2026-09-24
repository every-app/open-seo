import type { ReactNode } from "react";

import { Input } from "@/client/components/ui/input";
function FilterFieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

export function FilterTextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="form-control gap-1.5">
      <FilterFieldLabel>{label}</FilterFieldLabel>
      <Input
        className="w-full bg-card h-8 text-sm"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function FilterNumberInput({
  value,
  onChange,
  placeholder,
  step,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  step?: string;
}) {
  return (
    <Input
      className="bg-card h-7 text-xs"
      type="text"
      inputMode="decimal"
      step={step}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function FilterRangeGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-2.5 space-y-2">
      <FilterFieldLabel>{title}</FilterFieldLabel>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}
