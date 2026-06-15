const REFUND_PROMISE =
  "Not for you yet? Email ben@openseo.so within 30 days of your charge and we'll refund your subscription.";

// Hover/focus tooltip (tabIndex makes it work on tap too). The full refund
// terms also live in the pricing FAQ, so the tooltip is reinforcement, not
// the only place the promise appears.
export function MoneyBackGuarantee() {
  return (
    <span className="group relative inline-block" tabIndex={0}>
      <span className="cursor-help underline decoration-dotted decoration-neutral-400 underline-offset-2">
        30-day money-back guarantee
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-64 -translate-x-1/2 rounded-md bg-neutral-900 px-3 py-2 text-xs leading-relaxed text-white shadow-lg group-hover:block group-focus:block"
      >
        {REFUND_PROMISE}
      </span>
    </span>
  );
}
