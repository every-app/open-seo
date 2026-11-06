import {
  Link,
  createFileRoute,
  notFound,
  useNavigate,
} from "@tanstack/react-router";
import { z } from "zod";
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
} from "@/client/components/ui/card";
import { Field } from "@/client/components/ui/field";
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
import { AutoReloadSettings } from "@/client/features/billing/AutoReloadSettings";
import { BillingRow } from "@/client/features/billing/BillingRow";
import { ChangePlanButton } from "@/client/features/billing/PlanChange";
import { BillingTabs } from "@/client/features/billing/BillingTabs";
import { CreditsCard } from "@/client/features/billing/CreditsCard";
import { parseTopUpAmount } from "@/client/features/billing/HostedBillingContentUtils";
import { billingUsageQueryOptions } from "@/client/features/billing/useBillingUsage";
import { useCreditBalance } from "@/client/features/billing/useCreditBalance";
import {
  createBillingPortalSession,
  createTopUpCheckout,
} from "@/serverFunctions/billing";
import {
  BILLING_ROUTE,
  BILLING_TABS,
  SUBSCRIBE_ROUTE,
  TOP_UP_MAX_USD,
  TOP_UP_MIN_USD,
} from "@/shared/billing";
import { pageHead } from "@/client/lib/pageHead";

export const Route = createFileRoute("/_app/billing")({
  head: () => pageHead("Billing"),
  validateSearch: z.object({
    tab: z
      .enum(BILLING_TABS.map((item) => item.value))
      .optional()
      .catch(undefined),
  }),
  // The loader fills the module-scoped query client, so keep it out of server
  // requests: one worker isolate must not cache another account's billing.
  ssr: false,
  beforeLoad: () => {
    if (!isHostedClientAuthMode()) {
      throw notFound();
    }
  },
  // Start both reads on link intent and on a full load alongside the session
  // check, without holding up navigation.
  loader: () => {
    prefetchBillingAccount();
    void queryClient.prefetchQuery(billingUsageQueryOptions());
  },
  component: BillingPage,
});

type BillingAction = "plan" | "topUp";

function BillingPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const [topUpAmount, setTopUpAmount] = useState("20");
  const [buyingCredits, setBuyingCredits] = useState(false);
  const [pendingAction, setPendingAction] = useState<BillingAction | null>(
    null,
  );
  const [error, setError] = useState<{
    action: BillingAction;
    message: string;
  } | null>(null);

  const { accountQuery, isFreePlan, autoReloadState } = useCreditBalance();
  const account = accountQuery.data;
  // The budget counts bought credits too, so a purchase now would sit
  // unspent until it is raised; the notice below the button says so.
  const budgetSpent = autoReloadState === "budget_spent";

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
    <div className="mx-auto box-content max-w-7xl space-y-6 px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <PageHeader title="Billing" />

      {accountQuery.isPending ? (
        <BillingSummarySkeleton />
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

          {/* One column read top to bottom: the plan, then the credits with
              the ways to get more, then the usage tabs. */}
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Plan</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-xl font-semibold tracking-tight">
                    {account.paidPlanId ? account.paidPlanName : "Free Plan"}
                  </p>
                  {account.paidPlanId ? (
                    <p className="text-sm text-muted-foreground">
                      ${account.monthlyCreditsUsd.toFixed(2)} of credits each
                      month
                    </p>
                  ) : canManageBilling ? (
                    <p className="text-sm text-muted-foreground">
                      Upgrade to access every feature and more credits each
                      month
                    </p>
                  ) : null}
                </div>

                {!canManageBilling ? null : isFreePlan ? (
                  <Button
                    size="sm"
                    nativeButton={false}
                    render={
                      <Link to={SUBSCRIBE_ROUTE} search={{ upgrade: true }} />
                    }
                  >
                    Upgrade Plan
                  </Button>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <ChangePlanButton planId={account.paidPlanId} />
                    <Button
                      variant="outline"
                      size="sm"
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
                        ? "Redirecting to Stripe..."
                        : "Manage subscription"}
                    </Button>
                  </div>
                )}
              </div>

              {!canManageBilling ? (
                <p className="text-sm text-muted-foreground">
                  Only the organization owner can change the plan or buy
                  credits. Ask them if you need more.
                </p>
              ) : (
                actionError("plan")
              )}
            </CardContent>
          </Card>

          {/* Buying is owner-only and needs a paid plan; free plans see what
              one adds, so the base plan's credits aren't read as a cap. */}
          <CreditsCard>
            {canManageBilling ? (
              <>
                <BillingRow
                  label="Top-up credits"
                  summary={
                    isFreePlan
                      ? "Need more than your monthly credits? On a paid plan, buy as many as you need. They never expire."
                      : "Never expire and are used after your monthly credits."
                  }
                  action={
                    isFreePlan || buyingCredits ? null : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setBuyingCredits(true)}
                      >
                        Buy credits
                      </Button>
                    )
                  }
                >
                  {!isFreePlan && buyingCredits ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-start gap-2">
                        <Field data-invalid={showTopUpError} className="w-36">
                          <InputGroup>
                            <InputGroupAddon>$</InputGroupAddon>
                            <InputGroupInput
                              type="number"
                              min={TOP_UP_MIN_USD}
                              max={TOP_UP_MAX_USD}
                              step={1}
                              inputMode="numeric"
                              aria-label="Top-up amount in USD"
                              aria-invalid={showTopUpError}
                              autoFocus
                              value={topUpAmount}
                              onChange={(e) => setTopUpAmount(e.target.value)}
                            />
                          </InputGroup>
                        </Field>
                        <Button
                          className="h-10"
                          pending={pendingAction === "topUp"}
                          disabled={
                            !isValidTopUp ||
                            pendingAction !== null ||
                            budgetSpent
                          }
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
                            : `Buy $${parsedTopUpAmount} of credits`}
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-10"
                          disabled={pendingAction !== null}
                          onClick={() => {
                            setBuyingCredits(false);
                            // A failed top-up's error belongs to that attempt.
                            setError((e) => (e?.action === "topUp" ? null : e));
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                      {showTopUpError ? (
                        <p className="text-xs text-destructive">
                          Enter between ${TOP_UP_MIN_USD}–${TOP_UP_MAX_USD}.
                        </p>
                      ) : null}
                      {budgetSpent ? (
                        <p className="text-xs text-muted-foreground">
                          You&rsquo;ve hit your monthly auto-reload budget.
                          Raise it below to buy more.
                        </p>
                      ) : null}
                      {actionError("topUp")}
                    </div>
                  ) : null}
                </BillingRow>

                {/* The sync turns auto-reload off when a plan ends; until that
                  lands, an owner who left the plan still sees it, so they can
                  turn it off. */}
                {!isFreePlan || account.autoReload?.enabled ? (
                  <AutoReloadSettings />
                ) : (
                  <BillingRow
                    label="Auto-reload"
                    summary="On a paid plan, buy more automatically when you run low, up to a monthly budget you set."
                  />
                )}
              </>
            ) : null}
          </CreditsCard>
        </>
      )}

      <BillingTabs
        tab={tab ?? "usage"}
        onTabChange={(next) =>
          void navigate({
            to: BILLING_ROUTE,
            // Like other tabbed pages, Back leaves the page.
            replace: true,
            search: { tab: next === "usage" ? undefined : next },
          })
        }
        invoiceEmailsEnabled={
          canManageBilling && account ? account.invoiceEmailsEnabled : null
        }
      />

      <p className="text-xs text-muted-foreground">
        Billing is powered by Stripe.
      </p>
    </div>
  );
}

/** The Plan and Credits cards' shape while the billing account loads. */
function BillingSummarySkeleton() {
  return (
    <div aria-busy className="space-y-6">
      {[0, 1].map((index) => (
        <Card key={index}>
          <CardHeader>
            <Skeleton className="h-5 w-16" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-56" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
