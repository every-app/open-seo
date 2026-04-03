import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { AutumnProvider, useCustomer } from "autumn-js/react";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { BillingUsageChart } from "@/client/features/billing/BillingUsageChart";
import { parseTopUpAmount } from "@/client/features/billing/HostedBillingContentUtils";
import { getBillingRouteState } from "@/client/features/billing/route-state";
import {
  AUTUMN_MANAGED_SERVICE_ACCESS_FEATURE_ID,
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_CREDITS_PER_USD,
  AUTUMN_SEO_DATA_TOP_UP_PLAN_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
  SUBSCRIBE_ROUTE,
  autumnSeoDataCreditsToUsd,
} from "@/shared/billing";

export const Route = createFileRoute("/_app/billing")({
  beforeLoad: () => {
    if (!isHostedClientAuthMode()) {
      throw notFound();
    }
  },
  component: BillingPage,
});

function BillingPage() {
  return (
    <AutumnProvider>
      <BillingPageContent />
    </AutumnProvider>
  );
}

function BillingPageContent() {
  const navigate = useNavigate();
  const { data: session, isPending: isSessionPending } = useSession();
  const [topUpAmount, setTopUpAmount] = useState("20");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customerQuery = useCustomer({
    queryOptions: {
      enabled: Boolean(session?.user?.id),
    },
  });

  const hasManagedServiceAccess = Boolean(
    customerQuery.data?.flags?.[AUTUMN_MANAGED_SERVICE_ACCESS_FEATURE_ID],
  );
  const billingRouteState = getBillingRouteState({
    hasSession: Boolean(session?.user?.id),
    isSessionPending,
    isCustomerLoading: customerQuery.isLoading,
    isCustomerError: customerQuery.isError,
    hasManagedServiceAccess,
  });

  const monthlyRemaining = autumnSeoDataCreditsToUsd(
    customerQuery.data?.balances?.[AUTUMN_SEO_DATA_BALANCE_FEATURE_ID]
      ?.remaining ?? 0,
  );
  const topUpRemaining = autumnSeoDataCreditsToUsd(
    customerQuery.data?.balances?.[AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID]
      ?.remaining ?? 0,
  );
  const totalRemaining = monthlyRemaining + topUpRemaining;

  const { isValid: isValidTopUp, parsed: parsedTopUpAmount } =
    parseTopUpAmount(topUpAmount);

  useEffect(() => {
    if (billingRouteState !== "redirectToSubscribe") {
      return;
    }

    void navigate({ href: SUBSCRIBE_ROUTE, replace: true });
  }, [billingRouteState, navigate]);

  if (
    billingRouteState === "loading" ||
    billingRouteState === "redirectToSubscribe"
  ) {
    return null;
  }

  if (billingRouteState === "error") {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4 p-4 py-10 md:p-6 md:py-12">
        <h1 className="text-xl font-semibold">Billing unavailable</h1>
        <p className="text-sm text-base-content/70">
          {getStandardErrorMessage(
            customerQuery.error,
            "We couldn't load your billing details right now. Please try again.",
          )}
        </p>
        <button
          type="button"
          className="btn btn-soft btn-sm"
          onClick={() => {
            void customerQuery.refetch();
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  async function runAction(
    callback: () => Promise<unknown>,
    fallbackMessage: string,
  ) {
    setError(null);
    setIsPending(true);
    try {
      await callback();
      await customerQuery.refetch();
    } catch (err) {
      setError(getStandardErrorMessage(err, fallbackMessage));
    } finally {
      setIsPending(false);
    }
  }

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-base-content/50">Redirecting to Stripe...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 p-4 py-10 md:p-6 md:py-12">
      <h1 className="text-xl font-semibold">Billing</h1>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Subscription card */}
        <div className="flex flex-col justify-between rounded-lg border border-base-300 p-4 gap-4">
          <div>
            <div className="text-2xl font-semibold tabular-nums">
              ${totalRemaining.toFixed(2)}{" "}
              <span className="text-sm font-normal text-base-content/50">
                remaining
              </span>
            </div>
            <div className="mt-1 flex gap-3 text-xs text-base-content/50">
              <span className="tabular-nums">
                Monthly ${monthlyRemaining.toFixed(2)}
              </span>
              <span>&middot;</span>
              <span className="tabular-nums">
                Top-ups ${topUpRemaining.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="text-sm">
            <span className="font-medium">Subscription</span>{" "}
            <span className="text-base-content/50">
              {hasManagedServiceAccess ? "Active" : "Inactive"}
            </span>
          </div>

          <button
            className="btn btn-soft btn-sm w-full"
            disabled={isPending}
            onClick={() =>
              void runAction(
                () =>
                  customerQuery.openCustomerPortal({
                    returnUrl: window.location.href,
                  }),
                "We couldn't open the billing portal. Please try again.",
              )
            }
          >
            {isPending ? "Redirecting..." : "Manage subscription"}
          </button>
        </div>

        {/* Buy credits card */}
        <div className="rounded-lg border border-base-300 p-4 space-y-3">
          <div>
            <span className="font-semibold">Buy credits</span>
            <p className="mt-1 text-sm text-base-content/60">
              Top-up credits never expire and are used after your monthly
              credits.
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-base-content/60">$</span>
              <input
                type="number"
                min={10}
                max={99}
                step={1}
                inputMode="numeric"
                className="input input-bordered input-sm w-full"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
              />
            </div>
            {topUpAmount.trim() !== "" && !isValidTopUp ? (
              <p className="mt-1 text-xs text-error">Enter between $10–$99.</p>
            ) : null}
          </div>

          <button
            className="btn btn-soft btn-sm w-full"
            disabled={isPending || !isValidTopUp || !hasManagedServiceAccess}
            onClick={() =>
              void runAction(
                () =>
                  customerQuery.attach({
                    planId: AUTUMN_SEO_DATA_TOP_UP_PLAN_ID,
                    redirectMode: "always",
                    successUrl: window.location.href,
                    featureQuantities: [
                      {
                        featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
                        quantity: Math.round(
                          parsedTopUpAmount * AUTUMN_SEO_DATA_CREDITS_PER_USD,
                        ),
                      },
                    ],
                  }),
                "We couldn't start the checkout. Please try again.",
              )
            }
          >
            Buy credits
          </button>
        </div>
      </div>

      {/* Usage chart */}
      {hasManagedServiceAccess ? <BillingUsageChart /> : null}

      {error ? <p className="text-sm text-error">{error}</p> : null}

      <p className="text-xs text-base-content/40">
        Billing is powered by Stripe.
      </p>
    </div>
  );
}
