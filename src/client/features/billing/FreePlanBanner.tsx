import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { AppBanner } from "@/client/layout/AppBanner";
import { BASE_PLAN_OFFER } from "@/client/features/billing/plan-offers";
import { useCreditBalance } from "@/client/features/billing/useCreditBalance";
import { captureClientEvent } from "@/client/lib/posthog";
import { useCanManageBilling } from "@/client/features/team/organizationQueries";
import { BILLING_ROUTE, SUBSCRIBE_ROUTE } from "@/shared/billing";

export function FreePlanBanner() {
  const {
    accountQuery,
    isFreePlan,
    isOutOfCredits,
    isLowCredits,
    refillDate,
    autoReload,
    autoReloadState,
    isPausedByBudget,
  } = useCreditBalance();
  const canManageBilling = useCanManageBilling();
  const showsOutOfCredits = Boolean(accountQuery.data) && isOutOfCredits;

  useEffect(() => {
    if (showsOutOfCredits)
      captureClientEvent("billing:out_of_credits_shown", { surface: "banner" });
  }, [showsOutOfCredits]);

  if (!accountQuery.data) {
    return null;
  }

  // Credits may be in the balance, but the budget holds them back; buying
  // more would not help, only raising it does.
  if (isPausedByBudget && autoReload) {
    const until = refillDate ? ` until ${refillDate}` : "";
    return (
      <AppBanner variant="warning">
        {canManageBilling ? (
          <>
            You&rsquo;ve hit your ${autoReload.monthlyLimitUsd} monthly
            auto-reload budget, so credits are paused{until}.{" "}
            <Link
              to={BILLING_ROUTE}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Raise your budget
            </Link>{" "}
            to keep going.
          </>
        ) : (
          <>
            Your organization hit its monthly auto-reload budget, so credits are
            paused{until}. Ask the owner to raise it.
          </>
        )}
      </AppBanner>
    );
  }

  // Out of credits with auto-reload on and working means Autumn is charging
  // the card right now; a "buy more" notice would have them pay twice.
  if (!isFreePlan && isOutOfCredits && autoReloadState === "on" && autoReload) {
    return (
      <AppBanner variant="info">
        You&rsquo;re out of credits. Auto-reload is adding $
        {autoReload.amountUsd} now.
      </AppBanner>
    );
  }

  // Only the owner can change the plan or buy credits, so a link would lead
  // everyone else to a page where they can't act.
  if (!canManageBilling && (isOutOfCredits || isLowCredits)) {
    return (
      <AppBanner variant={isOutOfCredits ? "destructive" : "warning"}>
        {isOutOfCredits
          ? autoReloadState === "card_failed"
            ? "Your organization is out of credits and its card was declined."
            : "Your organization has used its credits."
          : "Your organization is running low on credits."}{" "}
        Ask your organization owner to{" "}
        {autoReloadState === "card_failed" ? "update it" : "add more"}.
      </AppBanner>
    );
  }

  const creditsActionLink = isFreePlan ? (
    <Link
      to={SUBSCRIBE_ROUTE}
      search={{ upgrade: true }}
      className="font-medium text-primary underline-offset-4 hover:underline"
    >
      Upgrade your plan
    </Link>
  ) : (
    <Link
      to={BILLING_ROUTE}
      className="font-medium text-primary underline-offset-4 hover:underline"
    >
      Buy more credits
    </Link>
  );

  if (isOutOfCredits) {
    return (
      <AppBanner variant="destructive">
        {isFreePlan ? (
          <>
            You&rsquo;ve used your free credits. {creditsActionLink} to get $
            {BASE_PLAN_OFFER.monthlyCreditsUsd} of credits every month.
          </>
        ) : autoReloadState === "card_failed" ? (
          <>
            You&rsquo;re out of credits and auto-reload couldn&rsquo;t charge
            your card.{" "}
            <Link
              to={BILLING_ROUTE}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Update your card
            </Link>{" "}
            to keep going.
          </>
        ) : autoReloadState === "failed" ? (
          <>
            You&rsquo;re out of credits and auto-reload couldn&rsquo;t buy more.{" "}
            {creditsActionLink} to keep going.
          </>
        ) : (
          <>
            You&rsquo;ve used this month&rsquo;s credits. {creditsActionLink} to
            keep going
            {refillDate ? `, or wait for them to refill on ${refillDate}` : ""}.
          </>
        )}
      </AppBanner>
    );
  }

  if (isLowCredits) {
    return (
      <AppBanner variant="warning">
        You&rsquo;re running low on credits. {creditsActionLink} to keep using
        OpenSEO.
      </AppBanner>
    );
  }

  if (isFreePlan) {
    return (
      <AppBanner variant="info">
        We hope you&rsquo;re enjoying OpenSEO!{" "}
        <Link
          to={SUBSCRIBE_ROUTE}
          search={{ upgrade: true }}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Upgrade anytime
        </Link>{" "}
        or{" "}
        <Link
          to="/support"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          reach out with questions
        </Link>
        .
      </AppBanner>
    );
  }

  return null;
}
