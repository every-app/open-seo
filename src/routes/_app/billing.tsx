import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { ErrorState } from "@/client/components/ErrorState";
import { PageHeader } from "@/client/components/PageHeader";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/client/components/ui/card";
import { Field, FieldError } from "@/client/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/client/components/ui/input-group";
import { Skeleton } from "@/client/components/ui/skeleton";
import { queryClient } from "@/client/tanstack-db";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { useCanManageBilling } from "@/client/features/team/organizationQueries";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { prefetchBillingAccount } from "@/client/features/billing/billingAccountQuery";
import {
  openUpgradeCheckout,
  prefetchUpgradeCheckout,
} from "@/client/features/billing/checkout";
import { BillingUsageChart } from "@/client/features/billing/BillingUsageChart";
import { BillingFeatureBreakdown } from "@/client/features/billing/BillingFeatureBreakdown";
import { parseTopUpAmount } from "@/client/features/billing/HostedBillingContentUtils";
import { billingUsageEventsQueryOptions } from "@/client/features/billing/useBillingUsageEvents";
import { useCreditBalance } from "@/client/features/billing/useCreditBalance";
import {
  BASE_PLAN_OFFER,
  getPlanName,
  monthlyCreditsFeature,
} from "@/client/features/billing/plan-offers";
import {
  createBillingPortalSession,
  createTopUpCheckout,
} from "@/serverFunctions/billing";
import { BILLING_ROUTE } from "@/shared/billing";

export const Route = createFileRoute("/_app/billing")({
  // The loader fills the module-scoped query client, so keep it out of server
  // requests: one worker isolate must not cache another account's billing.
  ssr: false,
  beforeLoad: () => {
    if (!isHostedClientAuthMode()) {
      throw notFound();
    }
  },
  // Start both reads, and a free plan's checkout link, on link intent and on
  // a full load alongside the session check, without holding up navigation.
  loader: () => {
    prefetchBillingAccount();
    void queryClient.prefetchQuery(billingUsageEventsQueryOptions());
    prefetchUpgradeCheckout();
  },
  component: BillingPage,
});

type BillingAction = "plan" | "topUp";

function BillingPage() {
  const [topUpAmount, setTopUpAmount] = useState("20");
  const [pendingAction, setPendingAction] = useState<BillingAction | null>(
    null,
  );
  const [error, setError] = useState<{
    action: BillingAction;
    message: string;
  } | null>(null);

  const {
    accountQuery,
    isFreePlan,
    monthlyRemaining,
    topUpRemaining,
    totalRemaining,
    isOutOfCredits,
    isLowCredits,
    refillDate,
  } = useCreditBalance();
  const account = accountQuery.data;

  // Subscription changes are owner-only; other members see balances but are
  // pointed at the owner instead of checkout (the server enforces this too).
  const canManageBilling = useCanManageBilling();

  const { isValid: isValidTopUp, parsed: parsedTopUpAmount } =
    parseTopUpAmount(topUpAmount);
  const showTopUpError = topUpAmount.trim() !== "" && !isValidTopUp;

  // Each action ends by sending the browser to Stripe, so the button stays
  // pending unless it fails.
  async function runAction(
    action: BillingAction,
    callback: () => Promise<void>,
    fallbackMessage: string,
  ) {
    setError(null);
    setPendingAction(action);
    try {
      await callback();
    } catch (err) {
      setError({
        action,
        message: getStandardErrorMessage(err, fallbackMessage),
      });
      setPendingAction(null);
    }
  }

  async function startTopUpCheckout() {
    window.location.assign(
      await createTopUpCheckout({ data: { amountUsd: parsedTopUpAmount } }),
    );
  }

  async function openPortal() {
    window.location.assign(
      await createBillingPortalSession({ data: { returnTo: BILLING_ROUTE } }),
    );
  }

  function actionError(action: BillingAction) {
    return error?.action === action ? (
      <ErrorState message={error.message} />
    ) : null;
  }

  return (
    <div className="mx-auto box-content max-w-7xl space-y-5 px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <PageHeader title="Billing" />

      {accountQuery.isPending ? (
        <div className="grid gap-5 md:grid-cols-2">
          <SubscriptionCardSkeleton />
        </div>
      ) : !account ? (
        <QueryError
          cause={accountQuery.error}
          fallback="We couldn't load your billing details right now. Please try again."
          onRetry={() => void accountQuery.refetch()}
          isRetrying={accountQuery.isFetching}
        />
      ) : (
        <>
          {accountQuery.isError ? (
            <QueryError
              cause={accountQuery.error}
              fallback="Failed to refresh billing details"
              onRetry={() => void accountQuery.refetch()}
              isRetrying={accountQuery.isFetching}
            />
          ) : null}

          <div className="grid gap-5 md:grid-cols-2">
            {/* Subscription card */}
            <Card>
              <CardContent className="flex h-full flex-col justify-between gap-4">
                <div>
                  <div className="text-2xl font-semibold tabular-nums">
                    ${totalRemaining.toFixed(2)}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      remaining
                    </span>
                  </div>
                  {!isFreePlan ? (
                    <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                      <span className="tabular-nums">
                        Monthly ${monthlyRemaining.toFixed(2)}
                      </span>
                      <span>&middot;</span>
                      <span className="tabular-nums">
                        Top-ups ${topUpRemaining.toFixed(2)}
                      </span>
                    </div>
                  ) : null}
                  {isOutOfCredits ? (
                    <p className="mt-2 text-xs text-destructive">
                      {isFreePlan
                        ? "You’ve used your free credits. Upgrade your plan to continue."
                        : `You’ve used this month’s credits. Buy more below to keep going${
                            refillDate
                              ? `, or wait for them to refill on ${refillDate}`
                              : ""
                          }.`}
                    </p>
                  ) : isLowCredits ? (
                    <p className="mt-2 text-xs text-amber-600">
                      You&rsquo;re running low on credits.{" "}
                      {isFreePlan
                        ? `Upgrade to get $${BASE_PLAN_OFFER.monthlyCreditsUsd}/month.`
                        : "Buy more credits below."}
                    </p>
                  ) : null}
                </div>

                <div className="text-sm">
                  <span className="font-medium">Plan</span>{" "}
                  <span className="text-muted-foreground">
                    {account.paidPlanId
                      ? getPlanName(account.paidPlanId)
                      : "Free Plan"}
                  </span>
                  {account.paidPlanId ? (
                    <span className="text-muted-foreground">
                      {" "}
                      &middot; ${account.monthlyCreditsUsd.toFixed(2)} of Usage
                      Credits each month
                    </span>
                  ) : null}
                </div>

                {!canManageBilling ? (
                  <p className="border-t border-border pt-3 text-sm text-muted-foreground">
                    Only the organization owner can change the plan or buy
                    credits. Ask them if you need more.
                  </p>
                ) : isFreePlan ? (
                  <div className="space-y-3 border-t border-border pt-3">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-sm font-medium">
                        {BASE_PLAN_OFFER.name}
                      </span>
                      <span className="text-sm font-medium tabular-nums">
                        ${BASE_PLAN_OFFER.priceUsd}/month
                      </span>
                    </div>
                    <ul className="space-y-1.5">
                      {[
                        "Access to all OpenSEO features",
                        monthlyCreditsFeature(BASE_PLAN_OFFER),
                      ].map((item) => (
                        <li
                          key={item}
                          className="flex gap-2 text-xs text-muted-foreground"
                        >
                          <span className="mt-[1px] shrink-0 text-muted-foreground/60">
                            &mdash;
                          </span>
                          {item}
                        </li>
                      ))}
                    </ul>
                    <Button
                      variant="secondary"
                      className="w-full"
                      pending={pendingAction === "plan"}
                      disabled={pendingAction !== null}
                      onClick={() =>
                        void runAction(
                          "plan",
                          openUpgradeCheckout,
                          "We couldn't start the checkout. Please try again.",
                        )
                      }
                    >
                      {pendingAction === "plan"
                        ? "Redirecting to Stripe..."
                        : "Upgrade Plan"}
                    </Button>
                    {actionError("plan")}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Button
                      variant="secondary"
                      className="w-full"
                      pending={pendingAction === "plan"}
                      disabled={pendingAction !== null}
                      onClick={() =>
                        void runAction(
                          "plan",
                          openPortal,
                          "We couldn't open the billing portal. Please try again.",
                        )
                      }
                    >
                      {pendingAction === "plan"
                        ? "Opening Stripe..."
                        : "Manage subscription"}
                    </Button>
                    {actionError("plan")}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Buy credits card — paid plan only, owner-only */}
            {!isFreePlan && canManageBilling ? (
              <Card>
                <CardHeader>
                  <CardTitle>Buy credits</CardTitle>
                  <CardDescription>
                    Top-up credits never expire and are used after your monthly
                    credits.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Field data-invalid={showTopUpError}>
                    <InputGroup>
                      <InputGroupAddon>$</InputGroupAddon>
                      <InputGroupInput
                        type="number"
                        min={10}
                        max={99}
                        step={1}
                        inputMode="numeric"
                        aria-label="Top-up amount in USD"
                        aria-invalid={showTopUpError}
                        value={topUpAmount}
                        onChange={(e) => setTopUpAmount(e.target.value)}
                      />
                    </InputGroup>
                    {showTopUpError ? (
                      <FieldError>Enter between $10–$99.</FieldError>
                    ) : null}
                  </Field>

                  <Button
                    variant="secondary"
                    className="w-full"
                    pending={pendingAction === "topUp"}
                    disabled={!isValidTopUp || pendingAction !== null}
                    onClick={() =>
                      void runAction(
                        "topUp",
                        startTopUpCheckout,
                        "We couldn't start the checkout. Please try again.",
                      )
                    }
                  >
                    {pendingAction === "topUp"
                      ? "Redirecting to Stripe..."
                      : "Buy credits"}
                  </Button>
                  {actionError("topUp")}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </>
      )}

      <BillingUsageChart />

      <BillingFeatureBreakdown />

      <p className="text-xs text-muted-foreground">
        Billing is powered by Stripe.
      </p>
    </div>
  );
}

/** The subscription card's shape while the billing account loads. */
function SubscriptionCardSkeleton() {
  return (
    <Card aria-busy>
      <CardContent className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-9 w-full" />
      </CardContent>
    </Card>
  );
}
