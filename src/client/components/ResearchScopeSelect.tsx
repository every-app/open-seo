import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
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

const SCOPE_ITEMS = RESEARCH_SCOPES.map((scope) => ({
  value: scope,
  label: RESEARCH_SCOPE_LABELS[scope],
}));

/**
 * The shared research-scope selector: Exact URL / Subfolder / Domain /
 * Subdomains. Each option explains what it covers. Every research input that
 * accepts a URL or domain renders this next to the input so scope is explicit
 * instead of inferred.
 */
export function ResearchScopeSelect({
  value,
  onChange,
  disabledReason,
  className,
  "aria-label": ariaLabel = "Research scope",
}: Props) {
  return (
    <Select
      items={SCOPE_ITEMS}
      value={value}
      onValueChange={(scope) => {
        if (scope != null) onChange(scope);
      }}
      disabled={disabledReason != null}
    >
      <SelectTrigger
        className={className}
        aria-label={ariaLabel}
        title={disabledReason}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" alignItemWithTrigger={false} className="w-72">
        {RESEARCH_SCOPES.map((scope) => (
          <SelectItem key={scope} value={scope} className="items-start py-1.5">
            <span className="flex flex-col whitespace-normal">
              <span>{RESEARCH_SCOPE_LABELS[scope]}</span>
              <span className="text-xs text-muted-foreground">
                {RESEARCH_SCOPE_DESCRIPTIONS[scope]}
              </span>
              <span className="font-mono text-xs text-muted-foreground/70">
                {RESEARCH_SCOPE_EXAMPLES[scope]}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
