import { HelpCircle } from "lucide-react";

/**
 * Small "?" icon that shows an explanatory tooltip on hover/focus.
 * Uses daisyUI's `.tooltip` utility (no extra dependency); `data-tip`
 * wraps automatically so long explanations are fine.
 */
export function HelpHint({ text }: { text: string }) {
  if (!text) return null;

  return (
    <span
      className="tooltip tooltip-top inline-flex align-middle mx-1"
      data-tip={text}
    >
      <button
        type="button"
        aria-label={text}
        className="inline-flex items-center justify-center text-base-content/50 hover:text-base-content/80 focus:text-base-content/80 outline-none"
        // Decorative trigger only — nothing to activate, just focus/hover target.
        onClick={(e) => e.preventDefault()}
        tabIndex={0}
      >
        <HelpCircle size={14} />
      </button>
    </span>
  );
}
