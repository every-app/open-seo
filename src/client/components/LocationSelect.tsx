import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/client/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/client/components/ui/popover";
import { LOCATION_OPTIONS } from "@/shared/keyword-locations";

type LocationOption = (typeof LOCATION_OPTIONS)[number];

type Props = {
  value: number;
  onChange: (locationCode: number) => void;
  /** Defaults to the full country list. Pass a subset (e.g. Labs-only). */
  options?: readonly LocationOption[];
  /** Width utilities for the wrapper/trigger. Defaults to full width. */
  className?: string;
};

function matches(option: LocationOption, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    option.label.toLowerCase().includes(needle) ||
    option.shortLabel.toLowerCase().includes(needle)
  );
}

/**
 * Searchable country picker. Allows users to filter the country list instead of
 * scrolling it. The scrollable list is preserved below the search input.
 */
export function LocationSelect({
  value,
  onChange,
  options = LOCATION_OPTIONS,
  className = "w-full",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((option) => option.code === value) ?? null;

  const filtered = useMemo(
    () => options.filter((option) => matches(option, query)),
    [options, query],
  );

  // Reset transient state and focus the search input each time the menu opens.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    inputRef.current?.focus();
  }, [open]);

  // Keep the highlighted option in view as the user arrows through results.
  useEffect(() => {
    if (!open) return;
    const activeItem = listRef.current?.children[activeIndex];
    activeItem?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const select = (option: LocationOption) => {
    onChange(option.code);
    setOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        break;
      case "Enter": {
        event.preventDefault();
        const option = filtered[activeIndex];
        if (option) select(option);
        break;
      }
      case "Escape":
        event.preventDefault();
        setOpen(false);
        break;
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={`justify-between gap-2 rounded-md px-3 font-normal ${className}`}
            aria-haspopup="listbox"
          />
        }
      >
        <span className="truncate">{selected?.label ?? "Select country"}</span>
        <ChevronDown className="size-4 shrink-0 opacity-60" />
      </PopoverTrigger>

      <PopoverContent align="start" className="w-56 p-2">
        <InputGroup>
          <InputGroupAddon className="border-r-0 bg-transparent pr-0">
            <Search className="size-4" />
          </InputGroupAddon>
          <InputGroupInput
            ref={inputRef}
            type="text"
            placeholder="Search countries"
            aria-label="Search countries"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
        </InputGroup>

        <ul
          ref={listRef}
          role="listbox"
          aria-label="Countries"
          className="mt-2 flex max-h-64 w-full flex-col gap-0.5 overflow-y-auto"
        >
          {filtered.length === 0 ? (
            <li className="w-full break-all px-3 py-2 text-sm text-muted-foreground">
              No countries match “{query.trim()}”
            </li>
          ) : (
            filtered.map((option, index) => {
              const isSelected = option.code === value;
              return (
                <li key={option.code} role="option" aria-selected={isSelected}>
                  <Button
                    variant="ghost"
                    className={`h-auto w-full justify-between rounded-md px-3 py-1.5 font-normal text-foreground ${
                      index === activeIndex ? "bg-muted" : ""
                    }`}
                    onClick={() => select(option)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <span className="flex-1 truncate text-left">
                      {option.label}
                    </span>
                    {isSelected ? (
                      <Check className="size-4 shrink-0 text-primary" />
                    ) : null}
                  </Button>
                </li>
              );
            })
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
