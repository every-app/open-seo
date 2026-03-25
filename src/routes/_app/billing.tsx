import { createFileRoute, notFound } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink, LoaderCircle } from "lucide-react";
import { useState } from "react";
import {
  BillingAlerts,
  BillingHeader,
  CenteredCard,
  SubscriptionIntro,
  SubscriptionStatusCard,
} from "@/client/features/billing/BillingRouteParts";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import {
  createBacklinksTopUpCheckout,
  createHostedSubscriptionCheckout,
  getHostedBillingStatus,
  openHostedBillingPortal,
} from "@/serverFunctions/billing";

export const Route = createFileRoute("/_app/billing")({
  beforeLoad: () => {
    if (!isHostedClientAuthMode()) {
      throw notFound();
    }
  },
  component: BillingPage,
});

function BillingPage() {
  const { data: session, isPending: isSessionPending } = useSession();
  const [actionError, setActionError] = useState<string | null>(null);
  const [isRedirectingToCheckout, setIsRedirectingToCheckout] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("20");

  const billingStatusQuery = useQuery({
    queryKey: ["billing", "status"],
    queryFn: () => getHostedBillingStatus(),
    enabled: Boolean(session?.user?.id),
  });

  const { billingPortalMutation, startSubscriptionMutation, topUpMutation } =
    useBillingActions({
      setActionError,
      setIsRedirectingToCheckout,
    });

  if (isSessionPending || (session?.user?.id && billingStatusQuery.isLoading)) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoaderCircle className="h-6 w-6 animate-spin text-base-content/60" />
      </div>
    );
  }

  if (!session?.user?.id) {
    return (
      <CenteredCard
        title="Sign in to manage billing"
        body="Your hosted billing settings are tied to your OpenSEO organization."
        action={
          <a className="btn btn-primary" href="/sign-in">
            Go to sign in
          </a>
        }
      />
    );
  }

  if (billingStatusQuery.isError) {
    return (
      <CenteredCard
        title="Billing unavailable"
        body="We could not load your billing details right now. Please reload and try again."
      />
    );
  }

  const billing = billingStatusQuery.data;
  const hasPaidPlan = billing?.hasPaidPlan ?? false;
  const balance = billing?.balance;
  const isActionPending =
    startSubscriptionMutation.isPending ||
    topUpMutation.isPending ||
    billingPortalMutation.isPending;
  const { isValid: isValidTopUpAmount, parsed: parsedTopUpAmount } =
    parseTopUpAmount(topUpAmount);
  const topUpDisabled = !hasPaidPlan || isActionPending || !isValidTopUpAmount;

  if (isRedirectingToCheckout) {
    return (
      <CenteredCard
        title="Redirecting to checkout..."
        body="Please wait while we open your hosted billing flow."
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6">
      <BillingHeader hasPaidPlan={hasPaidPlan} />

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="card border border-base-300 bg-base-100 shadow-sm">
          <div className="card-body gap-4">
            <SubscriptionIntro hasPaidPlan={hasPaidPlan} />

            <SubscriptionStatusCard hasPaidPlan={hasPaidPlan} />

            {!hasPaidPlan ? (
              <button
                type="button"
                className="btn btn-primary btn-block sm:btn-wide"
                disabled={isActionPending}
                onClick={() => startSubscriptionMutation.mutate()}
              >
                {startSubscriptionMutation.isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : null}
                Start base subscription
              </button>
            ) : null}

            {hasPaidPlan ? (
              <button
                type="button"
                className="btn btn-outline btn-block sm:btn-wide"
                disabled={isActionPending}
                onClick={() => billingPortalMutation.mutate()}
              >
                {billingPortalMutation.isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : null}
                Open billing portal
              </button>
            ) : null}
          </div>
        </section>

        <section className="card border border-base-300 bg-base-100 shadow-sm">
          <div className="card-body gap-4">
            <div>
              <h2 className="text-lg font-semibold text-base-content">
                SEO data credits
              </h2>
              <p className="mt-1 text-sm text-base-content/70">
                Buy extra usage credits for DataForSEO-powered features like
                backlinks.
              </p>
            </div>

            <div className="rounded-box border border-base-300 bg-base-200/60 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-base-content/70">Remaining</span>
                <span className="text-2xl font-semibold text-base-content">
                  {formatUsd(balance?.remaining ?? 0)}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-sm text-base-content/70 sm:grid-cols-2">
                <div className="rounded-md bg-base-100 px-3 py-2">
                  <span className="block text-xs uppercase tracking-wide text-base-content/50">
                    Granted
                  </span>
                  <span className="font-medium text-base-content">
                    {formatUsd(balance?.granted ?? 0)}
                  </span>
                </div>
                <div className="rounded-md bg-base-100 px-3 py-2">
                  <span className="block text-xs uppercase tracking-wide text-base-content/50">
                    Used
                  </span>
                  <span className="font-medium text-base-content">
                    {formatUsd(balance?.usage ?? 0)}
                  </span>
                </div>
              </div>
            </div>

            <label className="form-control gap-2">
              <span className="label-text font-medium">Top up amount</span>
              <div className="join">
                <span className="join-item inline-flex items-center rounded-l-btn border border-base-300 bg-base-200 px-4 text-base-content/70">
                  $
                </span>
                <input
                  type="number"
                  min={10}
                  max={99}
                  step={1}
                  inputMode="numeric"
                  className="input join-item input-bordered w-full"
                  value={topUpAmount}
                  onChange={(event) => setTopUpAmount(event.target.value)}
                />
              </div>
              <span className="label-text-alt text-base-content/60">
                {hasPaidPlan
                  ? "Enter a whole-dollar amount between $10 and $99."
                  : "Start the base subscription before buying extra credits."}
              </span>
            </label>

            <button
              type="button"
              className="btn btn-secondary btn-block"
              disabled={topUpDisabled}
              onClick={() => {
                if (topUpDisabled) return;
                topUpMutation.mutate({ amount: parsedTopUpAmount });
              }}
            >
              {topUpMutation.isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : null}
              Buy credits
            </button>

            <p className="text-xs leading-relaxed text-base-content/60">
              Credit purchases use our hosted checkout flow and apply to your
              organization balance.
            </p>
          </div>
        </section>
      </div>

      <BillingAlerts actionError={actionError} hasPaidPlan={hasPaidPlan} />

      <div className="flex items-center gap-2 text-sm text-base-content/60">
        <ExternalLink className="h-4 w-4" />
        <span>Hosted billing is powered by Autumn.</span>
      </div>
    </div>
  );
}

function useBillingActions(args: {
  setActionError: (value: string | null) => void;
  setIsRedirectingToCheckout: (value: boolean) => void;
}) {
  const setBillingActionError = (error: unknown, fallback: string) => {
    args.setActionError(getStandardErrorMessage(error, fallback));
  };

  const billingPortalMutation = useMutation({
    mutationFn: async () => {
      args.setActionError(null);

      try {
        const result = await openHostedBillingPortal({
          data: { returnUrl: window.location.href },
        });
        redirectToHostedUrl(result.url, args.setActionError);
      } catch (error) {
        setBillingActionError(
          error,
          "We could not open the billing portal. Please try again.",
        );
      }
    },
  });

  const startSubscriptionMutation = useMutation({
    mutationFn: async () => {
      args.setActionError(null);
      args.setIsRedirectingToCheckout(true);

      try {
        const result = await createHostedSubscriptionCheckout({
          data: { returnUrl: window.location.href },
        });
        redirectToHostedUrl(result.url, args.setActionError);
      } catch (error) {
        setBillingActionError(
          error,
          "We could not open the hosted billing flow. Please try again.",
        );
      } finally {
        args.setIsRedirectingToCheckout(false);
      }
    },
  });

  const topUpMutation = useMutation({
    mutationFn: async ({ amount }: { amount: number }) => {
      args.setActionError(null);
      args.setIsRedirectingToCheckout(true);

      try {
        const result = await createBacklinksTopUpCheckout({
          data: {
            returnUrl: window.location.href,
            amount,
          },
        });
        redirectToHostedUrl(result.url, args.setActionError);
      } catch (error) {
        setBillingActionError(
          error,
          "We could not open the credit purchase flow. Please try again.",
        );
      } finally {
        args.setIsRedirectingToCheckout(false);
      }
    },
  });

  return {
    billingPortalMutation,
    startSubscriptionMutation,
    topUpMutation,
  };
}

function redirectToHostedUrl(
  url: string | null | undefined,
  setActionError: (value: string | null) => void,
) {
  if (!url) {
    setActionError(
      "We could not open the hosted billing flow. Please try again.",
    );
    return;
  }

  window.location.assign(url);
}

function parseTopUpAmount(value: string) {
  const trimmed = value.trim();

  if (!/^\d+$/.test(trimmed)) {
    return {
      isValid: false,
      parsed: 20,
    };
  }

  const parsed = Number(trimmed);
  const isValid = Number.isInteger(parsed) && parsed >= 10 && parsed <= 99;

  return {
    isValid,
    parsed: isValid ? parsed : 20,
  };
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
