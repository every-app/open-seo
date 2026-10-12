import type { ReactElement } from "react";
import { Link } from "@tanstack/react-router";
import { ErrorState } from "@/client/components/ErrorState";
import { Button } from "@/client/components/ui/button";
import { BASE_PLAN_OFFER } from "@/client/features/billing/plan-offers";
import { useCreditBalance } from "@/client/features/billing/useCreditBalance";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { BILLING_ROUTE, SUBSCRIBE_ROUTE } from "@/shared/billing";

/**
 * An out-of-credits failure that says how to get more: a free plan upgrades,
 * a paid plan buys credits, and until the customer loads the generic copy
 * points at Billing. A retry can't fix it, so there is no retry button.
 *
 * The member role is left to the banner and the billing page: reading it here
 * would pull a server function into every page error (and every test that
 * renders one).
 */
export function InsufficientCreditsError({
  variant,
  title,
}: {
  variant?: "inline" | "card" | "page";
  title?: string;
}) {
  const { accountQuery, isFreePlan, refillDate } = useCreditBalance();

  let message: string;
  let action: ReactElement;
  if (!accountQuery.data) {
    message = getStandardErrorMessage(new Error("INSUFFICIENT_CREDITS"));
    action = (
      <CreditsButton link={<Link to={BILLING_ROUTE} />} label="Go to Billing" />
    );
  } else if (isFreePlan) {
    message = `You don't have enough credits for this. Upgrade to get $${BASE_PLAN_OFFER.monthlyCreditsUsd} of credits every month.`;
    action = (
      <CreditsButton
        link={<Link to={SUBSCRIBE_ROUTE} search={{ upgrade: true }} />}
        label="Upgrade plan"
      />
    );
  } else {
    message = refillDate
      ? `You don't have enough credits for this. Buy more credits to keep going, or wait for your monthly credits to refill on ${refillDate}.`
      : "You don't have enough credits for this. Buy more credits to keep going.";
    action = (
      <CreditsButton link={<Link to={BILLING_ROUTE} />} label="Buy credits" />
    );
  }

  return (
    <ErrorState
      variant={variant}
      title={title}
      message={message}
      action={action}
    />
  );
}

function CreditsButton({ link, label }: { link: ReactElement; label: string }) {
  return (
    <Button variant="outline" size="sm" nativeButton={false} render={link}>
      {label}
    </Button>
  );
}
