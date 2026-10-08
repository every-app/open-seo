import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { QueryError } from "@/client/components/QueryState";
import { StatusScreen } from "@/client/components/StatusScreen";
import {
  billingAccountQueryOptions,
  prefetchBillingAccount,
} from "@/client/features/billing/billingAccountQuery";
import {
  openUpgradeCheckout,
  prefetchUpgradeCheckout,
} from "@/client/features/billing/checkout";
import { PlanPageAccountMenu } from "@/client/features/billing/PlanPageAccountMenu";
import { PlanOfferCard } from "@/client/features/billing/PlanOfferCard";
import {
  BASE_PLAN_OFFER,
  monthlyCreditsFeature,
} from "@/client/features/billing/plan-offers";
import { captureClientEvent } from "@/client/lib/posthog";
import { useSession } from "@/lib/auth-client";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getSubscribeRouteState } from "@/client/features/billing/route-state";
import { normalizeAuthRedirect } from "@/lib/auth-redirect";
import { useCanManageBilling } from "@/client/features/team/organizationQueries";
import { SUPPORT_EMAIL } from "@/client/lib/support";
import { Button } from "@/client/components/ui/button";

const PLAN_FEATURES = [
  "Keyword research, backlinks, rank tracking, and site audits",
  "MCP server and agent skills for Claude, Cursor, and ChatGPT",
  "Google Search Console Integration",
  monthlyCreditsFeature(BASE_PLAN_OFFER),
];

// How long the post-checkout "finalizing" screen polls Autumn before giving
// up and letting the user through anyway, and how often it polls.
const FINALIZING_TIMEOUT_MS = 30_000;
const FINALIZING_POLL_MS = 1000;

export const Route = createFileRoute("/_authenticated/subscribe")({
  // The loader fills the module-scoped query client, so keep it out of server
  // requests: one worker isolate must not cache another account's billing.
  ssr: false,
  validateSearch: (
    search: Record<string, unknown>,
  ): { upgrade?: true; redirect?: string; checkout?: "success" } => ({
    upgrade:
      search.upgrade === true || search.upgrade === "true" ? true : undefined,
    redirect:
      typeof search.redirect === "string"
        ? normalizeAuthRedirect(search.redirect)
        : undefined,
    checkout: search.checkout === "success" ? "success" : undefined,
  }),
  loaderDeps: ({ search: { upgrade, checkout } }) => ({ upgrade, checkout }),
  // Start the billing read alongside the session check, not after it. Upgrade
  // links outside Billing land here with ?upgrade=true, and hovering one
  // preloads this route, so the checkout link starts before the click.
  loader: ({ deps }) => {
    prefetchBillingAccount();
    if (deps.upgrade && deps.checkout !== "success") {
      prefetchUpgradeCheckout();
    }
  },
  component: SubscribePage,
});

function SubscribePage() {
  const navigate = useNavigate();
  const { upgrade: isUpgradeFlow, redirect, checkout } = Route.useSearch();
  const { data: session } = useSession();
  const [isAttaching, setIsAttaching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finalizingTimedOut, setFinalizingTimedOut] = useState(false);
  const checkoutCompleted = checkout === "success";

  const accountQuery = useQuery({
    ...billingAccountQueryOptions(),
    // Autumn can lag Stripe by a few seconds after checkout; poll until the
    // subscription shows up so the just-paid user isn't shown the paywall
    // again. An interval never cancels a read in flight, unlike refetch().
    refetchInterval: (query) =>
      checkoutCompleted &&
      !finalizingTimedOut &&
      query.state.data?.planStatus !== "paid"
        ? FINALIZING_POLL_MS
        : false,
  });
  const account = accountQuery.data;

  // Checkout is owner-only; other members hitting the paywall are pointed at
  // their organization owner instead of a Subscribe button that would 403.
  const canManageBilling = useCanManageBilling();

  const subscribeRouteState = getSubscribeRouteState({
    isCustomerLoading: accountQuery.isPending,
    isCustomerError: accountQuery.isError,
    hasCustomerData: account !== undefined,
    hasManagedAccess: account?.hasManagedAccess ?? false,
    planStatus: account?.planStatus ?? "free",
    isUpgradeFlow: isUpgradeFlow === true,
    checkoutCompleted,
    finalizingTimedOut,
  });

  // Armed once on landing with checkout=success (not on the finalizing state,
  // which a refetch with no cached data can leave for "loading" and re-enter)
  // so the deadline is a hard bound from arrival.
  useEffect(() => {
    if (!checkoutCompleted || finalizingTimedOut) return;
    const timeout = setTimeout(
      () => setFinalizingTimedOut(true),
      FINALIZING_TIMEOUT_MS,
    );
    return () => clearTimeout(timeout);
  }, [checkoutCompleted, finalizingTimedOut]);

  useEffect(() => {
    if (subscribeRouteState === "redirectToApp") {
      if (checkoutCompleted) {
        captureClientEvent("billing:checkout_success");
      }
      void navigate({ href: redirect ?? "/", replace: true });
    }
  }, [checkoutCompleted, navigate, redirect, subscribeRouteState]);

  useEffect(() => {
    if (subscribeRouteState === "showPaywall" && !isUpgradeFlow) {
      captureClientEvent("billing:paywall_viewed");
    }
  }, [isUpgradeFlow, subscribeRouteState]);

  if (
    subscribeRouteState === "loading" ||
    subscribeRouteState === "redirectToApp"
  ) {
    return <StatusScreen pending />;
  }

  if (subscribeRouteState === "finalizing") {
    return (
      <StatusScreen
        logo
        size="sm"
        title="Finalizing your subscription…"
        pending
        description="This usually takes a few seconds."
        footer={
          <>
            Taking longer?{" "}
            <a
              className="underline underline-offset-2 hover:text-foreground"
              href={`mailto:${SUPPORT_EMAIL}`}
            >
              Email {SUPPORT_EMAIL}
            </a>
            .
          </>
        }
      />
    );
  }

  if (subscribeRouteState === "error") {
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
      await openUpgradeCheckout();
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

  const firstName = session?.user?.name?.split(" ")[0] || "";

  return (
    <div className="w-full max-w-sm space-y-6">
      <PlanPageAccountMenu email={session?.user?.email} />

      <div className="space-y-3 text-center">
        <img
          src="/transparent-logo.png"
          alt="OpenSEO"
          className="mx-auto size-10 rounded-lg"
        />
        <h1 className="text-xl font-semibold">
          {isUpgradeFlow
            ? "Upgrade your plan"
            : firstName
              ? `Welcome to OpenSEO, ${firstName}!`
              : "Welcome to OpenSEO!"}
        </h1>
        <p className="text-sm text-muted-foreground">
          SEO on your terms. All your SEO tools in one place at a fair price.
        </p>
      </div>

      <PlanOfferCard
        offer={BASE_PLAN_OFFER}
        features={PLAN_FEATURES}
        afterFeatures={
          /* Sub-bullet of the Usage Credits line above. */
          <li className="-mt-1 pl-6 text-xs">
            <a
              className="text-muted-foreground underline decoration-muted-foreground/40 decoration-dotted underline-offset-4 transition-colors hover:text-foreground"
              href="https://openseo.so/pricing"
              target="_blank"
              rel="noreferrer"
              onClick={() =>
                captureClientEvent("billing:pricing_estimator_click")
              }
            >
              How far do usage credits go?{" "}
              <span aria-hidden="true">&#8599;</span>
            </a>
          </li>
        }
      >
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {canManageBilling ? (
          <Button
            className="w-full"
            variant="secondary"
            pending={isAttaching}
            onClick={() => void handleSubscribe()}
          >
            {isAttaching ? "Redirecting..." : "Subscribe"}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Only the organization owner can subscribe. Ask them to upgrade this
            organization.
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
        {isUpgradeFlow ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => void navigate({ to: "/", replace: true })}
          >
            <ArrowRight className="size-3.5 rotate-180" />
            Back to app
          </Button>
        ) : null}
      </div>
    </div>
  );
}
