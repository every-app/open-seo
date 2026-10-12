import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { Badge } from "@/client/components/ui/badge";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@/client/components/ui/combobox";
import { InputGroupAddon } from "@/client/components/ui/input-group";
import { Spinner } from "@/client/components/ui/spinner";
import { searchSerpLocations } from "@/serverFunctions/serp-locations";
import { formatLocationLabel } from "@/shared/keyword-locations";
import type { SerpLocationResult } from "@/server/lib/dataforseo/serp-locations";

// The selected value is only a location name, so it has no type badge.
type LocationItem = Pick<SerpLocationResult, "locationName" | "displayLabel"> &
  Partial<Pick<SerpLocationResult, "locationType">>;

type Props = {
  value: string | undefined;
  onChange: (locationName: string | undefined) => void;
  /** ISO 3166-1 alpha-2 country code, e.g. "us". */
  countryCode: string;
  placeholder?: string;
  id?: string;
  invalid?: boolean;
};

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Searches the cities, counties and regions of one country. */
export function SerpLocationCombobox({
  value,
  onChange,
  countryCode,
  placeholder = "Search cities...",
  id,
  invalid,
}: Props) {
  // The list lines up with the whole field, not only the text input.
  const anchor = useComboboxAnchor();
  const [query, setQuery] = useState("");
  const trimmed = query.trim();
  const debounced = useDebounce(trimmed, 350);

  const searchQuery = useQuery({
    queryKey: ["serpLocations", countryCode, debounced],
    queryFn: () =>
      searchSerpLocations({ data: { query: debounced, countryCode } }),
    enabled: debounced !== "",
    staleTime: 5 * 60 * 1000,
  });
  const searching =
    trimmed !== "" && (trimmed !== debounced || searchQuery.isFetching);
  // Only show matches for the text in the field right now.
  const results = searching || !trimmed ? [] : (searchQuery.data ?? []);

  const selected: LocationItem | null = value
    ? { locationName: value, displayLabel: formatLocationLabel(value) }
    : null;

  const emptyMessage = !trimmed
    ? "Type a city, county, or region"
    : searching
      ? "Searching..."
      : searchQuery.isError
        ? "Unable to load locations"
        : `No locations found for "${trimmed}"`;

  return (
    <Combobox
      items={results}
      value={selected}
      // The server already matched the query.
      filter={null}
      itemToStringLabel={(item: LocationItem) => item.displayLabel}
      isItemEqualToValue={(item, current) =>
        item.locationName === current.locationName
      }
      onValueChange={(item) => {
        setQuery("");
        onChange(item?.locationName);
      }}
      // A closed list drops its search, so the next open starts fresh.
      onOpenChange={(open) => {
        if (!open) setQuery("");
      }}
      onInputValueChange={(text, { reason }) => {
        if (reason !== "input-change") return;
        setQuery(text);
        if (!text.trim()) onChange(undefined);
      }}
    >
      <div ref={anchor}>
        <ComboboxInput
          id={id}
          aria-invalid={invalid || undefined}
          className="w-full"
          placeholder={placeholder}
          showTrigger={false}
        >
          <InputGroupAddon align="inline-start">
            {searching ? <Spinner /> : <MapPin />}
          </InputGroupAddon>
        </ComboboxInput>
      </div>
      {/* Full labels such as "Orange County, California, United States" are
          wider than a compact field, so the list sizes to its content. */}
      <ComboboxContent anchor={anchor} className="w-max">
        <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
        <ComboboxList>
          {(item: LocationItem) => (
            <ComboboxItem key={item.locationName} value={item}>
              <span className="truncate">{item.displayLabel}</span>
              {item.locationType ? (
                <Badge variant="secondary" size="sm" className="ml-auto">
                  {item.locationType}
                </Badge>
              ) : null}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
