import { ChevronDown } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
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
 * Subdomains. A menu (not a native select) so each option can
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className={`justify-between gap-2 rounded-md px-3 font-normal ${className}`}
            aria-label={ariaLabel}
            disabled={disabledReason != null}
            title={disabledReason}
          />
        }
      >
        <span className="truncate">{RESEARCH_SCOPE_LABELS[value]}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72" aria-label={ariaLabel}>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            const scope = RESEARCH_SCOPES.find((option) => option === next);
            if (scope) onChange(scope);
          }}
        >
          {RESEARCH_SCOPES.map((scope) => (
            <DropdownMenuRadioItem
              key={scope}
              value={scope}
              className="items-start"
            >
              <span className="flex-1">
                <span className="block">{RESEARCH_SCOPE_LABELS[scope]}</span>
                <span className="block text-xs text-muted-foreground">
                  {RESEARCH_SCOPE_DESCRIPTIONS[scope]}
                </span>
                <span className="block font-mono text-xs text-muted-foreground">
                  {RESEARCH_SCOPE_EXAMPLES[scope]}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
