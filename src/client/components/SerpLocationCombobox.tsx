import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "@/client/components/icons";
import { searchSerpLocations } from "@/serverFunctions/serp-locations";
import { formatLocationLabel } from "@/shared/keyword-locations";
import type { SerpLocationResult } from "@/server/lib/dataforseo/serp-locations";

import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { InputGroup } from "@/client/components/ui/input-group";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/client/components/ui/popover";
import { Input } from "@/client/components/ui/input";
type Props = {
  value: string | undefined;
  onChange: (locationName: string | undefined) => void;
  /** ISO 3166-1 alpha-2 country code, e.g. "us". */
  countryCode: string;
  placeholder?: string;
};

function useDebounce(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function SerpLocationCombobox({
  value,
  onChange,
  countryCode,
  placeholder = "Search cities...",
}: Props) {
  const [inputValue, setInputValue] = useState(
    value ? formatLocationLabel(value) : "",
  );
  const [results, setResults] = useState<SerpLocationResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  // Selecting a result sets the input to its display label; that change must
  // not itself trigger a search for the label text.
  const skipNextFetchRef = useRef(false);

  const debouncedQuery = useDebounce(inputValue, 350);

  // Sync display when value prop changes externally (e.g. mode reset)
  useEffect(() => {
    if (!value) {
      setInputValue("");
      setResults([]);
      setOpen(false);
    }
  }, [value]);

  // Fetch results when debounced query changes
  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (!trimmed) {
      setResults([]);
      setOpen(false);
      setIsLoading(false);
      return;
    }
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      // Any fetch this change superseded was cancelled before its own
      // finally could clear the spinner, so clear it here.
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setIsError(false);
    searchSerpLocations({ data: { query: trimmed, countryCode } })
      .then((data) => {
        if (cancelled) return;
        setResults(data);
        setOpen(true);
        setActiveIndex(0);
      })
      .catch(() => {
        if (cancelled) return;
        setIsError(true);
        setOpen(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, countryCode]);

  // Scroll active item into view
  useEffect(() => {
    if (!open) return;
    listRef.current?.children[activeIndex]?.scrollIntoView({
      block: "nearest",
    });
  }, [activeIndex, open]);

  const select = (loc: SerpLocationResult) => {
    onChange(loc.locationName);
    skipNextFetchRef.current = true;
    setInputValue(loc.displayLabel);
    setResults([]);
    setOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setInputValue(v);
    if (!v.trim()) {
      onChange(undefined);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter": {
        e.preventDefault();
        const loc = results[activeIndex];
        if (loc) select(loc);
        break;
      }
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor className="w-full">
        <InputGroup
          className="w-full"
          prefix={
            <>
              {isLoading ? (
                <Loader2 className="size-4 shrink-0 animate-spin" />
              ) : (
                <Search className="size-4 shrink-0" />
              )}
            </>
          }
        >
          <Input
            type="text"
            placeholder={placeholder}
            aria-label={placeholder}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (results.length > 0) setOpen(true);
            }}
            autoComplete="off"
          />
        </InputGroup>
      </PopoverAnchor>

      {/* Focus stays in the input so typing keeps refining the results. */}
      <PopoverContent
        align="start"
        sideOffset={4}
        initialFocus={false}
        className="w-(--anchor-width) p-1"
      >
        {isError ? (
          <p className="px-3 py-2 text-sm text-negative">
            Unable to load locations
          </p>
        ) : results.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            No locations found for "{debouncedQuery.trim()}"
          </p>
        ) : (
          <ul
            ref={listRef}
            role="listbox"
            className="flex max-h-56 w-full flex-col gap-0.5 overflow-y-auto"
          >
            {results.map((loc, index) => (
              <li
                key={loc.locationCode}
                role="option"
                aria-selected={loc.locationName === value}
              >
                <Button
                  variant="ghost"
                  type="button"
                  className={`h-auto w-full justify-between gap-2 rounded-lg px-3 py-1.5 font-normal text-foreground ${
                    index === activeIndex ? "bg-muted" : ""
                  }`}
                  onClick={() => select(loc)}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span className="truncate text-left">{loc.displayLabel}</span>
                  <Badge variant="secondary" className="shrink-0">
                    {loc.locationType}
                  </Badge>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
