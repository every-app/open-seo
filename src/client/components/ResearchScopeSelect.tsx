import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  RESEARCH_SCOPES,
  RESEARCH_SCOPE_DESCRIPTIONS,
  RESEARCH_SCOPE_EXAMPLES,
  RESEARCH_SCOPE_LABELS,
  type ResearchScope,
} from "@/shared/researchScope";

type Props = {
  value: ResearchScope;
  onChange: (scope: ResearchScope) => void;
  /** Greys the whole control (e.g. a brand-keyword lookup) with this reason. */
  disabledReason?: string;
  className?: string;
  "aria-label"?: string;
};

/**
 * The shared research-scope selector: Exact URL / Subfolder / Domain /
 * Subdomains. A custom dropdown (not a native select) so each option can
 * explain what it covers. Every research input that accepts a URL or domain
 * renders this next to the input so scope is explicit instead of inferred.
 */
export function ResearchScopeSelect({
  value,
  onChange,
  disabledReason,
  className = "",
  "aria-label": ariaLabel = "Research scope",
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeScope, setActiveScope] = useState<ResearchScope>(value);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setActiveScope(value);
  }, [open, value]);

  // Close on outside click so it behaves like the surrounding native selects.
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !containerRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const select = (scope: ResearchScope) => {
    onChange(scope);
    setOpen(false);
  };

  const moveActive = (step: 1 | -1) => {
    const currentIndex = RESEARCH_SCOPES.indexOf(activeScope);
    const nextIndex = Math.min(
      Math.max(currentIndex + step, 0),
      RESEARCH_SCOPES.length - 1,
    );
    const next = RESEARCH_SCOPES[nextIndex];
    if (next) setActiveScope(next);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!open) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveActive(-1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        select(activeScope);
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        className="select select-bordered flex w-full items-center justify-between gap-2 text-left font-normal"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabledReason != null}
        title={disabledReason}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
      >
        <span className="truncate">{RESEARCH_SCOPE_LABELS[value]}</span>
        <ChevronDown className="size-4 shrink-0 text-base-content/60" />
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className="menu absolute right-0 z-30 mt-2 w-72 flex-nowrap rounded-box border border-base-300 bg-base-100 p-2 shadow-lg"
        >
          {RESEARCH_SCOPES.map((scope) => {
            const isSelected = scope === value;
            return (
              <li key={scope} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  className={`w-full items-start ${scope === activeScope ? "menu-focus" : ""}`}
                  onClick={() => select(scope)}
                  onMouseEnter={() => setActiveScope(scope)}
                >
                  <span className="flex-1">
                    <span className="block">
                      {RESEARCH_SCOPE_LABELS[scope]}
                    </span>
                    <span className="block text-xs text-base-content/60">
                      {RESEARCH_SCOPE_DESCRIPTIONS[scope]}
                    </span>
                    <span className="block font-mono text-xs text-base-content/40">
                      {RESEARCH_SCOPE_EXAMPLES[scope]}
                    </span>
                  </span>
                  {isSelected ? (
                    <Check className="mt-1 size-4 shrink-0 text-primary" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
