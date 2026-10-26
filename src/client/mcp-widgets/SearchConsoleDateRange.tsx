import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";

enum DateRange {
  Custom = "custom",
  Last7Days = "last_7_days",
  Last28Days = "last_28_days",
  Last3Months = "last_3_months",
  Last6Months = "last_6_months",
  Last12Months = "last_12_months",
  Last16Months = "last_16_months",
}

const LABELS: Record<DateRange, string> = {
  [DateRange.Custom]: "Custom range",
  [DateRange.Last7Days]: "Last 7 days",
  [DateRange.Last28Days]: "Last 28 days",
  [DateRange.Last3Months]: "Last 3 months",
  [DateRange.Last6Months]: "Last 6 months",
  [DateRange.Last12Months]: "Last 12 months",
  [DateRange.Last16Months]: "Last 16 months",
};

export function SearchConsoleDateRange({
  input,
  disabled,
  onChange,
}: {
  input: Record<string, unknown>;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      items={LABELS}
      value={
        input.startDate && input.endDate
          ? DateRange.Custom
          : typeof input.dateRange === "string"
            ? input.dateRange
            : DateRange.Last28Days
      }
      disabled={disabled}
      onValueChange={(value) => {
        if (value != null) onChange(value);
      }}
    >
      <SelectTrigger aria-label="Date range" className="w-44 bg-card pr-3">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.values(DateRange).map((value) => (
          <SelectItem
            key={value}
            value={value}
            disabled={value === DateRange.Custom}
          >
            {LABELS[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
