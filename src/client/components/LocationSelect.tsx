import { useMemo } from "react";
import { Search } from "lucide-react";
import { CountryFlag } from "@/client/components/CountryFlag";
import { Button } from "@/client/components/ui/button";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from "@/client/components/ui/combobox";
import { InputGroupAddon } from "@/client/components/ui/input-group";
import { LOCATION_OPTIONS } from "@/shared/keyword-locations";

type LocationOption = (typeof LOCATION_OPTIONS)[number];
type LocationGroup = { value: string; items: LocationOption[] };

type Props = {
  value: number;
  onChange: (locationCode: number) => void;
  /** Defaults to the full country list. Pass a subset (e.g. Labs-only). */
  options?: readonly LocationOption[];
  /** Width utilities for the field. Defaults to full width. */
  className?: string;
};

// The ten countries with the most projects.
const POPULAR_LOCATION_CODES = new Set([
  2036, 2076, 2124, 2250, 2276, 2356, 2528, 2724, 2826, 2840,
]);

function matches(option: LocationOption, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    option.label.toLowerCase().includes(needle) ||
    option.shortLabel.toLowerCase().includes(needle)
  );
}

/** Searchable country picker: type to filter the country list. */
export function LocationSelect({
  value,
  onChange,
  options = LOCATION_OPTIONS,
  className = "w-full",
}: Props) {
  const selected = options.find((option) => option.code === value) ?? null;

  return (
    <Combobox
      items={options}
      value={selected}
      itemToStringLabel={(option) => option.label}
      autoHighlight
      filter={matches}
      onValueChange={(option) => {
        if (option) onChange(option.code);
      }}
    >
      <ComboboxInput
        className={className}
        placeholder="Select country"
        aria-label="Country"
      />
      <ComboboxContent>
        <ComboboxEmpty>No countries match.</ComboboxEmpty>
        <ComboboxList>
          {(option: LocationOption) => (
            <ComboboxItem key={option.code} value={option}>
              {option.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function groupLocationOptions(selected: LocationOption | null) {
  const rest = LOCATION_OPTIONS.filter((option) => option !== selected);
  const groups: LocationGroup[] = [
    // The selected country needs no heading: it sits first with its check.
    { value: "", items: selected ? [selected] : [] },
    {
      value: "Popular",
      items: rest.filter((option) => POPULAR_LOCATION_CODES.has(option.code)),
    },
    {
      value: "All countries",
      items: rest.filter((option) => !POPULAR_LOCATION_CODES.has(option.code)),
    },
  ];
  return groups.filter((group) => group.items.length > 0);
}

/** `LocationSelect` as a compact button, with its search inside the list. */
export function LocationChipSelect({
  value,
  onChange,
}: Pick<Props, "value" | "onChange">) {
  const selected =
    LOCATION_OPTIONS.find((option) => option.code === value) ?? null;
  const groups = useMemo(() => groupLocationOptions(selected), [selected]);
  const label = selected?.label ?? "Select country";

  return (
    <Combobox
      items={groups}
      value={selected}
      itemToStringLabel={(option: LocationOption) => option.label}
      autoHighlight
      filter={matches}
      onValueChange={(option: LocationOption | null) => {
        if (option) onChange(option.code);
      }}
    >
      <ComboboxTrigger
        aria-label={`Country: ${label}`}
        render={<Button variant="outline" className="font-normal" />}
      >
        <CountryFlag locationCode={value} />
        {label}
      </ComboboxTrigger>
      <ComboboxContent className="w-64">
        <ComboboxInput
          showTrigger={false}
          placeholder="Search"
          aria-label="Search countries"
        >
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
        </ComboboxInput>
        <ComboboxEmpty>No countries match.</ComboboxEmpty>
        <ComboboxList>
          {(group: LocationGroup) => (
            <ComboboxGroup key={group.value} items={group.items}>
              {group.value ? (
                <ComboboxLabel>{group.value}</ComboboxLabel>
              ) : null}
              <ComboboxCollection>
                {(option: LocationOption) => (
                  <ComboboxItem key={option.code} value={option}>
                    <CountryFlag locationCode={option.code} />
                    {option.label}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
