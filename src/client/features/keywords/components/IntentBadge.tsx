import type { KeywordIntent } from "@/types/keywords";
import { Badge } from "@/client/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/client/components/ui/tooltip";

const VARIANTS: Record<
  KeywordIntent,
  "info" | "warning" | "success" | "soft" | "secondary"
> = {
  informational: "info",
  commercial: "warning",
  transactional: "success",
  navigational: "soft",
  unknown: "secondary",
};

const SHORT_LABELS: Record<KeywordIntent, string> = {
  informational: "Info",
  commercial: "Comm",
  transactional: "Trans",
  navigational: "Nav",
  unknown: "?",
};

/** Full intent labels, shared with the keyword filters so both stay in sync. */
export const INTENT_LABELS: Record<KeywordIntent, string> = {
  informational: "Informational",
  commercial: "Commercial",
  transactional: "Transactional",
  navigational: "Navigational",
  unknown: "Unknown",
};

const DESCRIPTIONS: Record<
  KeywordIntent,
  { label: string; description: string }
> = {
  informational: {
    label: INTENT_LABELS.informational,
    description:
      "The searcher wants information or answers. Use this for educational content, guides, and comparison-light explainers.",
  },
  commercial: {
    label: INTENT_LABELS.commercial,
    description:
      "The searcher is researching options before a purchase. Treat this as buying intent for comparisons, alternatives, and product-led pages.",
  },
  transactional: {
    label: INTENT_LABELS.transactional,
    description:
      "The searcher is ready to complete an action, often a purchase. Prioritize clear offers, pricing, trials, or conversion paths.",
  },
  navigational: {
    label: INTENT_LABELS.navigational,
    description:
      "The searcher is looking for a specific site, brand, or page. These queries usually reward matching the expected destination.",
  },
  unknown: {
    label: INTENT_LABELS.unknown,
    description:
      "Intent was not available for this keyword, so avoid making content strategy decisions from this badge alone.",
  },
};

export function IntentBadge({ intent }: { intent: KeywordIntent }) {
  const details = DESCRIPTIONS[intent];

  return (
    <Tooltip>
      <TooltipTrigger
        delay={0}
        render={
          <Badge
            variant={VARIANTS[intent]}
            tabIndex={0}
            className="h-6 min-w-11 cursor-help font-semibold"
          />
        }
        aria-label={`${details.label} search intent`}
      >
        {SHORT_LABELS[intent]}
      </TooltipTrigger>
      <TooltipContent className="flex-col items-start gap-1">
        <span className="font-semibold">{details.label}</span>
        <span>{details.description}</span>
      </TooltipContent>
    </Tooltip>
  );
}
