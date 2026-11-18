import { useEffect, type ReactElement } from "react";
import { Link } from "@tanstack/react-router";
import { ErrorState } from "@/client/components/ErrorState";
import { Button } from "@/client/components/ui/button";
import { BASE_PLAN_OFFER } from "@/client/features/billing/plan-offers";
import { billingAccountQueryOptions } from "@/client/features/billing/billingAccountQuery";
import { useCreditBalance } from "@/client/features/billing/useCreditBalance";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { queryClient } from "@/client/tanstack-db";
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
  const { message, action } = useCreditsOffer("card");
  return (
    <ErrorState
      variant={variant}
      title={title}
      message={message}
      action={action}
    />
  );
}

/** The card's button alone, for a spot too small for the card. */
export function GetCreditsButton() {
  return useCreditsOffer("button").action;
}

function useCreditsOffer(surface: "card" | "button") {
  const {
    accountQuery,
    isFreePlan,
    isOutOfCredits,
    refillDate,
    autoReload,
    autoReloadState,
  } = useCreditBalance();

  useEffect(() => {
    captureClientEvent("billing:out_of_credits_shown", { surface });
  }, [surface]);

  // The balance the page shows is up to a minute old; a fresh refusal means
  // it moved, and with auto-reload on it is about to move again. The button
  // alone sits on stored skip reasons, one per row, which say nothing new.
  useEffect(() => {
    if (surface !== "card") return;
    void queryClient.invalidateQueries({
      queryKey: billingAccountQueryOptions().queryKey,
    });
  }, [surface]);

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
  } else if (autoReloadState === "on" && isOutOfCredits && autoReload) {
    // The refused call is what told Autumn to reload; the credits are coming.
    // A balance that is not out means this is an old refusal (a scheduled
    // run's stored skip reason), so it gets the general copy below.
    message = `You're out of credits. Auto-reload is adding $${autoReload.amountUsd} now, so try again in a moment.`;
    action = (
      <CreditsButton link={<Link to={BILLING_ROUTE} />} label="Go to Billing" />
    );
  } else if (autoReloadState === "card_failed") {
    message =
      "You're out of credits and auto-reload couldn't charge your card. Update your card to keep going.";
    action = (
      <CreditsButton link={<Link to={BILLING_ROUTE} />} label="Update card" />
    );
  } else if (autoReloadState === "failed") {
    message =
      "You're out of credits and auto-reload couldn't buy more. Buy credits to keep going.";
    action = (
      <CreditsButton link={<Link to={BILLING_ROUTE} />} label="Buy credits" />
    );
  } else if (autoReloadState === "budget_spent" && autoReload) {
    // Buying credits would not help: the budget counts those too.
    message = `You've hit your $${autoReload.monthlyLimitUsd} monthly auto-reload budget, so credits are paused${refillDate ? ` until ${refillDate}` : ""}. Raise it to keep going.`;
    action = (
      <CreditsButton link={<Link to={BILLING_ROUTE} />} label="Raise budget" />
    );
  } else {
    message = refillDate
      ? `You don't have enough credits for this. Buy more, or wait for your monthly refill on ${refillDate}. Auto-reload can buy them for you next time.`
      : "You don't have enough credits for this. Buy more to keep going. Auto-reload can buy them for you next time.";
    action = (
      <CreditsButton link={<Link to={BILLING_ROUTE} />} label="Buy credits" />
    );
  }

  return { message, action };
}

function CreditsButton({ link, label }: { link: ReactElement; label: string }) {
  return (
    // Its own text color: a red error around it would otherwise tint it.
    <Button
      variant="outline"
      size="sm"
      className="text-foreground"
      nativeButton={false}
      render={link}
    >
      {label}
    </Button>
  );
}
