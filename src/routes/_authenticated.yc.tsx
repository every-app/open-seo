import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Tag } from "lucide-react";
import { QueryError } from "@/client/components/QueryState";
import { StatusScreen } from "@/client/components/StatusScreen";
import { Button } from "@/client/components/ui/button";
import { Skeleton } from "@/client/components/ui/skeleton";
import {
  billingAccountQueryOptions,
  prefetchBillingAccount,
} from "@/client/features/billing/billingAccountQuery";
import { PlanPageAccountMenu } from "@/client/features/billing/PlanPageAccountMenu";
import { PlanOfferCard } from "@/client/features/billing/PlanOfferCard";
import {
  YC_PLAN_OFFER,
  monthlyCreditsFeature,
} from "@/client/features/billing/plan-offers";
import { openPlanCheckout } from "@/client/features/billing/checkout";
import { useCanManageBilling } from "@/client/features/team/organizationQueries";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { BILLING_ROUTE } from "@/shared/billing";
import { SUPPORT_EMAIL } from "@/client/lib/support";

const PLAN_FEATURES = [
  "Keyword research, backlinks, rank tracking, and site audits",
  "MCP server and agent skills for Claude, Cursor, and ChatGPT",
  "Google Search Console Integration",
  monthlyCreditsFeature(YC_PLAN_OFFER),
];

export const Route = createFileRoute("/_authenticated/yc")({
  // The loader fills the module-scoped query client, so keep it out of server
  // requests: one worker isolate must not cache another account's billing.
  ssr: false,
  beforeLoad: () => {
    if (!isHostedClientAuthMode()) {
      throw notFound();
    }
  },
  // Start the billing read alongside the session check, not after it.
  loader: () => prefetchBillingAccount(),
  component: YcPlanPage,
});

function YcPlanPage() {
  const { data: session } = useSession();
  const [isAttaching, setIsAttaching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accountQuery = useQuery(billingAccountQueryOptions());
  const account = accountQuery.data;

  // Checkout is owner-only; other members are pointed at their organization
  // owner instead of a button that would 403.
  const canManageBilling = useCanManageBilling();

  const isPaid = account?.planStatus === "paid";
  const isOnYcPlan = account?.paidPlanId === YC_PLAN_OFFER.planId;

  // A failed refetch keeps the loaded page; only a failed first read stops.
  if (accountQuery.isError && !account) {
    return (
      <StatusScreen logo title="Billing unavailable" size="sm">
        <QueryError
          cause={accountQuery.error}
          fallback="We couldn't verify your billing status right now. Please try again."
          onRetry={() => void accountQuery.refetch()}
          isRetrying={accountQuery.isFetching}
        />
      </StatusScreen>
    );
  }

  async function handleSubscribe() {
    setError(null);
    setIsAttaching(true);

    try {
      // Existing subscribers switching plans land on Billing so they can see
      // the new plan; new subscribers go into the app.
      await openPlanCheckout(
        YC_PLAN_OFFER.planId,
        isPaid ? BILLING_ROUTE : "/",
      );
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

        {!account ? (
          // The offer is static; only the button depends on the current plan.
          <Skeleton className="h-9 w-full" />
        ) : isOnYcPlan ? (
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
