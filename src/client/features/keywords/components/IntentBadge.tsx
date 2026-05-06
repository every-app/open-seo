import { createPortal } from "react-dom";
import type { KeywordIntent } from "@/types/keywords";
import { FloatingTooltip, useFloatingTooltip } from "./FloatingTooltip";

const COLORS: Record<KeywordIntent, string> = {
  informational: "border-info/30 bg-info/15 text-info",
  commercial: "border-warning/35 bg-warning/20 text-warning",
  transactional: "border-success/30 bg-success/15 text-success",
  navigational: "border-primary/30 bg-primary/15 text-primary",
  unknown: "border-base-300 bg-base-200 text-base-content/60",
};

const SHORT_LABELS: Record<KeywordIntent, string> = {
  informational: "Info",
  commercial: "Comm",
  transactional: "Trans",
  navigational: "Nav",
  unknown: "?",
};

const DESCRIPTIONS: Record<
  KeywordIntent,
  { label: string; description: string }
> = {
  informational: {
    label: "Informational",
    description:
      "The searcher wants information or answers. Use this for educational content, guides, and comparison-light explainers.",
  },
  commercial: {
    label: "Commercial",
    description:
      "The searcher is researching options before a purchase. Treat this as buying intent for comparisons, alternatives, and product-led pages.",
  },
  transactional: {
    label: "Transactional",
    description:
      "The searcher is ready to complete an action, often a purchase. Prioritize clear offers, pricing, trials, or conversion paths.",
  },
  navigational: {
    label: "Navigational",
    description:
      "The searcher is looking for a specific site, brand, or page. These queries usually reward matching the expected destination.",
  },
  unknown: {
    label: "Unknown",
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
      className={`inline-flex h-6 min-w-11 cursor-help items-center justify-center rounded-full border px-2 text-xs font-semibold leading-none ${COLORS[intent]}`}
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
