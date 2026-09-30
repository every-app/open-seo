import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { useCustomer } from "autumn-js/react";
import { useState } from "react";
import { ArrowRight, Tag } from "lucide-react";
import { QueryError } from "@/client/components/QueryState";
import { StatusScreen } from "@/client/components/StatusScreen";
import { Button } from "@/client/components/ui/button";
import { PlanPageAccountMenu } from "@/client/features/billing/PlanPageAccountMenu";
import { PlanOfferCard } from "@/client/features/billing/PlanOfferCard";
import {
  YC_PLAN_OFFER,
  monthlyCreditsFeature,
} from "@/client/features/billing/plan-offers";
import { buildCheckoutSuccessUrl } from "@/client/features/billing/checkout-url";
import {
  getCustomerPaidPlanId,
  getCustomerPlanStatus,
} from "@/client/features/billing/plan-detection";
import { getBillingRouteState } from "@/client/features/billing/route-state";
import { useCanManageBilling } from "@/client/features/team/organizationQueries";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { BILLING_ROUTE } from "@/shared/billing";
import { SUPPORT_EMAIL } from "@/client/lib/support";

const PLAN_FEATURES = [
  "Keyword research, backlinks, rank tracking, and site audits",
  "MCP tools for Codex, Claude, and supported ChatGPT plans",
  "Google Search Console Integration",
  monthlyCreditsFeature(YC_PLAN_OFFER),
];

export const Route = createFileRoute("/_authenticated/yc")({
  beforeLoad: () => {
    if (!isHostedClientAuthMode()) {
      throw notFound();
    }
  },
  component: YcPlanPage,
});

function YcPlanPage() {
  const { data: session, isPending: isSessionPending } = useSession();
  const [isAttaching, setIsAttaching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasSession = Boolean(session?.user?.id);
  const customerQuery = useCustomer({
    queryOptions: {
      enabled: hasSession,
    },
  });

  // Checkout is owner-only; other members are pointed at their organization
  // owner instead of a button that would 403.
  const canManageBilling = useCanManageBilling();

  const routeState = getBillingRouteState({
    hasSession,
    isSessionPending,
    isCustomerLoading: customerQuery.isLoading,
    isCustomerError: customerQuery.isError,
    hasCustomerData: customerQuery.data != null,
  });

  const isPaid = getCustomerPlanStatus(customerQuery.data) === "paid";
  const isOnYcPlan =
    getCustomerPaidPlanId(customerQuery.data) === YC_PLAN_OFFER.planId;

  if (routeState === "loading") {
    return null;
  }

  if (routeState === "error") {
    return (
      <StatusScreen logo title="Billing unavailable" size="sm">
        <QueryError
          error={customerQuery.error}
          fallback="We couldn't verify your billing status right now. Please try again."
          onRetry={() => void customerQuery.refetch()}
          isRetrying={customerQuery.isFetching}
        />
      </StatusScreen>
    );
  }

  async function handleSubscribe() {
    setError(null);
    setIsAttaching(true);

    try {
      captureClientEvent("billing:checkout_start", {
        planId: YC_PLAN_OFFER.planId,
      });
      // Existing subscribers switching plans land on Billing so they can see
      // the new plan; new subscribers go into the app.
      await customerQuery.attach({
        planId: YC_PLAN_OFFER.planId,
        redirectMode: "always",
        successUrl: buildCheckoutSuccessUrl(isPaid ? BILLING_ROUTE : "/"),
        checkoutSessionParams: YC_PLAN_OFFER.checkoutSessionParams,
      });
    } catch (err) {
      setError(
        getStandardErrorMessage(
          err,
          "We couldn't start the checkout. Please try again.",
        ),
      );
      setIsAttaching(false);
    }
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <PlanPageAccountMenu email={session?.user?.email} />

      <div className="text-center space-y-3">
        <img
          src="/transparent-logo.png"
          alt="OpenSEO"
          className="mx-auto size-10 rounded-lg"
        />
        <h1 className="text-xl font-semibold">OpenSEO for YC founders</h1>
        <p className="text-sm text-muted-foreground">
          A bigger monthly credit pool for teams doing serious SEO work, with
          your first month free through the YC deal.
        </p>
      </div>

      <PlanOfferCard offer={YC_PLAN_OFFER} features={PLAN_FEATURES}>
        <div className="flex gap-2.5 rounded-md bg-muted p-3 text-sm">
          <Tag className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">
              Don&rsquo;t forget your promo code.
            </span>{" "}
            Enter the code from the YC deal under &ldquo;Add promotion
            code&rdquo; on the checkout page to get your first month free.
          </p>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {isOnYcPlan ? (
          <p className="text-sm text-muted-foreground">
            You&rsquo;re already on the {YC_PLAN_OFFER.name}.{" "}
            <Link
              to={BILLING_ROUTE}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Manage it on Billing
            </Link>
            .
          </p>
        ) : canManageBilling ? (
          <div className="space-y-2">
            <Button
              className="w-full"
              variant="secondary"
              pending={isAttaching}
              onClick={() => void handleSubscribe()}
            >
              {isAttaching
                ? "Redirecting..."
                : isPaid
                  ? `Switch to the ${YC_PLAN_OFFER.name}`
                  : `Get the ${YC_PLAN_OFFER.name}`}
            </Button>
            {isPaid ? (
              <p className="text-center text-xs text-muted-foreground">
                Replaces your current subscription.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Only the organization owner can change the plan. Ask them to switch
            this organization to the {YC_PLAN_OFFER.name}.
          </p>
        )}
      </PlanOfferCard>

      <div className="text-center space-y-2">
        <p className="text-sm text-muted-foreground">
          Questions? Email{" "}
          <a
            className="underline underline-offset-2 hover:text-foreground"
            href={`mailto:${SUPPORT_EMAIL}`}
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowRight className="size-3.5 rotate-180" />
          Back to app
        </Link>
      </div>
    </div>
  );
}
