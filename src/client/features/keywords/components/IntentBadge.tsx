import { createPortal } from "react-dom";
import type { KeywordIntent } from "@/types/keywords";
import { FloatingTooltip, useFloatingTooltip } from "./FloatingTooltip";

import { badgeVariants } from "@/client/components/ui/badge";
import { cn } from "@/client/lib/utils";

// Badge variant per intent. Informational has no Badge variant of its own, so
// it tints the default badge with the info token.
const INTENT_BADGE_CLASSES: Record<KeywordIntent, string> = {
  informational: badgeVariants({
    size: "lg",
    className: "bg-info/15 text-info",
  }),
  commercial: badgeVariants({ variant: "warning", size: "lg" }),
  transactional: badgeVariants({ variant: "success", size: "lg" }),
  navigational: badgeVariants({ variant: "primary", size: "lg" }),
  unknown: badgeVariants({ variant: "secondary", size: "lg" }),
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
  const tooltip = useFloatingTooltip<HTMLSpanElement>({ delayMs: 0 });
  const details = DESCRIPTIONS[intent];

  return (
    <span
      ref={tooltip.triggerRef}
      className={cn(
        INTENT_BADGE_CLASSES[intent],
        "min-w-11 cursor-help font-semibold leading-none",
      )}
      tabIndex={0}
      aria-label={`${details.label} search intent`}
      aria-describedby={tooltip.isOpen ? tooltip.tooltipId : undefined}
      onMouseEnter={tooltip.open}
      onMouseLeave={tooltip.close}
      onFocus={tooltip.open}
      onBlur={tooltip.close}
      onKeyDown={(e) => {
        if (e.key === "Escape") tooltip.close();
      }}
    >
      {SHORT_LABELS[intent]}
      {tooltip.isOpen && typeof document !== "undefined"
        ? createPortal(
            <FloatingTooltip id={tooltip.tooltipId} position={tooltip.position}>
              <span className="block font-semibold">{details.label}</span>
              <span className="mt-1 block">{details.description}</span>
            </FloatingTooltip>,
            document.body,
          )
        : null}
    </span>
  );
}
