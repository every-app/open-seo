import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import type { useCreditBalance } from "@/client/features/billing/useCreditBalance";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { SUPPORT_EMAIL } from "@/client/lib/support";
import { createBillingPortalSession } from "@/serverFunctions/billing";
import {
  AUTO_RELOAD_CARD_FAILURE_REASONS,
  AUTO_RELOAD_MAX_MONTHLY_USD,
  BILLING_ROUTE,
} from "@/shared/billing";

type AutoReload = NonNullable<
  ReturnType<typeof useCreditBalance>["autoReload"]
>;
type AutoReloadState = ReturnType<typeof useCreditBalance>["autoReloadState"];

// What the one-click raise adds once the cycle's budget is spent.
const BUDGET_RAISE_STEP_USD = 50;

// Why a reload did not go through, in the customer's terms, for the reasons
// in AUTO_RELOAD_CARD_FAILURE_REASONS. Anything else is ours and gets support.
const CARD_FAILURES: Record<string, string> = {
  charge_failed: "your card was declined",
  suspended_after_failures: "your card kept declining",
  missing_payment_method: "there is no card on file",
  payment_method_not_supported:
    "your payment method can't be charged automatically",
  payment_method_delayed: "your payment method settles too slowly",
};

function formatDate(epochMs: number) {
  return new Date(epochMs).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** The last failed reload, or the cycle's budget being spent. */
export function AutoReloadNotice({
  saved,
  state,
  canRetry,
  resetDate,
  onRaise,
  pending,
}: {
  saved: AutoReload;
  state: AutoReloadState;
  /** Whether saving below charges the card again, which is the retry. */
  canRetry: boolean;
  resetDate: string | null;
  /** Saves a higher budget at once; absent when saving would charge the card. */
  onRaise: ((monthlyLimitUsd: number) => void) | undefined;
  pending: boolean;
}) {
  // A failure is news while reloads are expected; off, it is history.
  if (saved.enabled && saved.failure) {
    const isCardFailure = AUTO_RELOAD_CARD_FAILURE_REASONS.has(
      saved.failure.reason,
    );
    return (
      <Alert variant="destructive">
        <AlertDescription className="space-y-2">
          <p>
            {isCardFailure ? (
              <>
                Auto-reload failed on {formatDate(saved.failure.at)}:{" "}
                {CARD_FAILURES[saved.failure.reason] ?? "the charge failed"}.{" "}
                {canRetry
                  ? "Update your card, then retry."
                  : "Update your card so it works the next time you run low."}
              </>
            ) : (
              <>
                Auto-reload isn&rsquo;t working right now. Buy credits above and
                email {SUPPORT_EMAIL}.
              </>
            )}
          </p>
          {isCardFailure ? <UpdateCardButton /> : null}
        </AlertDescription>
      </Alert>
    );
  }
  if (state === "budget_spent") {
    const raised = Math.min(
      saved.monthlyLimitUsd + BUDGET_RAISE_STEP_USD,
      AUTO_RELOAD_MAX_MONTHLY_USD,
    );
    // At the maximum there is nothing to raise; the reset is the way out.
    const canRaise = raised > saved.monthlyLimitUsd;
    return (
      <Alert variant="warning">
        <AlertDescription className="space-y-2">
          <p>
            You&rsquo;ve hit your ${saved.monthlyLimitUsd} monthly budget, so
            top-up credits are paused{resetDate ? ` until ${resetDate}` : ""}.
            {canRaise ? " Raise it to keep going." : ""}
          </p>
          {onRaise && canRaise ? (
            <Button
              variant="outline"
              size="sm"
              pending={pending}
              disabled={pending}
              onClick={() => onRaise(raised)}
            >
              Raise budget to ${raised}
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}

/** Opens the Stripe billing portal, where the card on file is changed. */
export function UpdateCardButton() {
  const [isOpening, setIsOpening] = useState(false);

  async function openPortal() {
    setIsOpening(true);
    try {
      window.location.assign(
        await createBillingPortalSession({ data: { returnTo: BILLING_ROUTE } }),
      );
    } catch (error) {
      setIsOpening(false);
      toast.error(
        getStandardErrorMessage(
          error,
          "We couldn't open the billing portal. Please try again.",
        ),
      );
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      pending={isOpening}
      onClick={() => void openPortal()}
    >
      {isOpening ? "Opening Stripe..." : "Update card"}
    </Button>
  );
}
