import { Badge } from "@/client/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/client/components/ui/tooltip";
import type { getParasiteOpportunities } from "@/serverFunctions/platformSeo";

export type ParasiteOpportunity = Awaited<
  ReturnType<typeof getParasiteOpportunities>
>[number];

const LABELS = {
  easy: { text: "Easy", variant: "success" },
  possible: { text: "Possible", variant: "warning" },
  hard: { text: "Hard", variant: "secondary" },
} as const;

/**
 * How easily a parasite post could rank for a keyword, from the parasite
 * platforms on the latest Google results we've read for it.
 */
export function ParasiteOpportunityBadge({
  opportunity,
}: {
  opportunity: ParasiteOpportunity | undefined;
}) {
  if (!opportunity) {
    return <span className="text-muted-foreground">—</span>;
  }
  const label = LABELS[opportunity.label];
  const pages = opportunity.sawPage2
    ? `${opportunity.page1} on page 1, ${opportunity.page2} on page 2`
    : `${opportunity.page1} on page 1 (page 2 not read)`;
  return (
    <Tooltip>
      <TooltipTrigger
        delay={0}
        render={
          <Badge variant={label.variant} tabIndex={0} className="cursor-help" />
        }
        aria-label={`Parasite opportunity: ${label.text}`}
      >
        {label.text}
      </TooltipTrigger>
      <TooltipContent className="flex-col items-start gap-1">
        <span>Parasite results: {pages}.</span>
        <span>
          Checked {new Date(opportunity.checkedAt).toLocaleDateString()}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
