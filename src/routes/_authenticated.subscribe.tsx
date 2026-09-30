import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCustomer } from "autumn-js/react";
import { useEffect, useState } from "react";
import { ArrowRight, Settings, User } from "@/client/components/icons";
import { ThemePreferenceMenuItems } from "@/client/components/ThemePreferenceMenuItems";
import { captureClientEvent } from "@/client/lib/posthog";
import { signOutAndRedirect, useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getSubscribeRouteState } from "@/client/features/billing/route-state";
import { getCustomerPlanStatus } from "@/client/features/billing/plan-detection";
import { normalizeAuthRedirect } from "@/lib/auth-redirect";
import { useCanManageBilling } from "@/client/features/team/organizationQueries";
import {
  AUTUMN_CHECKOUT_SESSION_PARAMS,
  AUTUMN_MANAGED_ACCESS_FEATURE_ID,
  AUTUMN_PAID_PLAN_ID,
} from "@/shared/billing";

import { AuthPageCard } from "@/client/features/auth/AuthPage";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
import { Spinner } from "@/client/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/client/components/ui/tooltip";

const SUPPORT_EMAIL = "ben@openseo.so";

const PLAN_FEATURES = [
  "Keyword research, backlinks, rank tracking, and site audits",
  "MCP server and agent skills for Claude, Cursor, and ChatGPT",
  "Google Search Console Integration",
  "Includes $10.00 of Usage Credits each month",
];

// How long the post-checkout "finalizing" screen polls Autumn before giving
// up and letting the user through anyway.
const FINALIZING_TIMEOUT_MS = 30_000;

export const Route = createFileRoute("/_authenticated/subscribe")({
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

  const hasSession = Boolean(session?.user?.id);
  const customerQuery = useCustomer({
    queryOptions: {
      enabled: hasSession,
    },
  });

  // Checkout is owner-only; other members hitting the paywall are pointed at
  // their organization owner instead of a Subscribe button that would 403.
  const canManageBilling = useCanManageBilling();

  // Read managed access from the already-loaded Autumn customer (local, no API
  // call) instead of a separate server round-trip. Self-hosted has no Autumn
  // customer, so mirror the server's "always granted" behavior there.
  const hasManagedAccess = isHostedClientAuthMode()
    ? customerQuery.check({ featureId: AUTUMN_MANAGED_ACCESS_FEATURE_ID })
        .allowed
    : true;

  const planStatus = getCustomerPlanStatus(customerQuery.data);
  const subscribeRouteState = getSubscribeRouteState({
    hasSession,
    isCustomerLoading: customerQuery.isLoading,
    isCustomerError: customerQuery.isError,
    hasManagedAccess,
    planStatus,
    isUpgradeFlow: isUpgradeFlow === true,
    checkoutCompleted,
    finalizingTimedOut,
  });

  // Autumn can lag Stripe by a few seconds after checkout; poll until the
  // subscription shows up so the just-paid user isn't shown the paywall again.
  const isFinalizing = subscribeRouteState === "finalizing";
  const { refetch: refetchCustomer } = customerQuery;
  useEffect(() => {
    if (!isFinalizing) return;
    const interval = setInterval(() => {
      void refetchCustomer();
    }, 2000);
    return () => clearInterval(interval);
  }, [refetchCustomer, isFinalizing]);

  // Armed once on landing with checkout=success (not on the finalizing state,
  // which a transient poll error can leave and re-enter) so the deadline is a
  // hard bound from arrival.
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
    return null;
  }

  if (subscribeRouteState === "finalizing") {
    return (
      <AuthPageCard
        title="Finalizing your subscription…"
        helperText="This usually takes a few seconds."
      >
        <div className="space-y-4 text-center">
          <Spinner className="mx-auto" />
          <p className="text-xs text-muted-foreground">
            Taking longer?{" "}
            <a
              className="underline underline-offset-4"
              href={`mailto:${SUPPORT_EMAIL}`}
            >
              Email {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </div>
      </AuthPageCard>
    );
  }

  if (subscribeRouteState === "error") {
    return (
      <AuthPageCard
        title="Billing unavailable"
        helperText={getStandardErrorMessage(
          customerQuery.error,
          "We couldn't verify your billing status right now. Please try again.",
        )}
      >
        <Button
          variant="secondary"
          type="button"
          className="w-full"
          onClick={() => {
            void customerQuery.refetch();
          }}
        >
          Try again
        </Button>
      </AuthPageCard>
    );
  }

  async function handleSubscribe() {
    setError(null);
    setIsAttaching(true);

    try {
      captureClientEvent("billing:checkout_start");
      const successUrl = new URL(window.location.href);
      successUrl.searchParams.set("checkout", "success");
      await customerQuery.attach({
        planId: AUTUMN_PAID_PLAN_ID,
        redirectMode: "always",
        successUrl: successUrl.toString(),
        checkoutSessionParams: AUTUMN_CHECKOUT_SESSION_PARAMS,
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

  const firstName = session?.user?.name?.split(" ")[0] || "";

  return (
    <div className="w-full max-w-sm space-y-6">
      <SubscribePageAccountMenu email={session?.user?.email} />

      <div className="text-center space-y-3">
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

      <Card className="space-y-4 p-5">
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-semibold">Base Plan</span>
          <span className="text-lg font-semibold tabular-nums">$10/month</span>
        </div>

        <ul className="space-y-2">
          {PLAN_FEATURES.map((item) => (
            <li
              key={item}
              className="flex gap-2.5 text-sm text-muted-foreground"
            >
              <span className="shrink-0" aria-hidden="true">
                &mdash;
              </span>
              {item}
            </li>
          ))}
          {/* Sub-bullet of the Usage Credits line above. */}
          <li className="-mt-1 pl-6 text-xs">
            <a
              className="text-muted-foreground underline decoration-muted-foreground/70 decoration-dotted underline-offset-4 transition-colors hover:text-foreground"
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
        </ul>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {canManageBilling ? (
          <Button
            type="button"
            className="w-full"
            disabled={isAttaching}
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

        <p className="text-center text-xs text-muted-foreground">
          <Tooltip>
            <TooltipTrigger render={<span tabIndex={0} />}>
              <span className="cursor-help underline decoration-dotted">
                30-day money-back guarantee
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{`Not for you yet? Email ${SUPPORT_EMAIL} within 30 days of your charge and we'll refund your subscription.`}</TooltipContent>
          </Tooltip>
          . Cancel anytime. Powered by Stripe.
        </p>
      </Card>

      <div className="text-center space-y-2">
        <p className="text-sm text-muted-foreground">
          Questions? Email {SUPPORT_EMAIL}.
        </p>
        {isUpgradeFlow ? (
          <Button
            variant="ghost"
            size="sm"
            type="button"
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

function SubscribePageAccountMenu({ email }: { email: string | undefined }) {
  if (!email) return null;

  const handleSignOut = () => signOutAndRedirect();

  return (
    <div className="fixed top-4 right-4">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              type="button"
              aria-label="Open account menu"
            />
          }
        >
          <User className="h-5 w-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel
              className="truncate normal-case tracking-normal text-foreground"
              data-ph-mask
            >
              {email}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuItem
            render={<Link to="/settings" className="flex items-center gap-2" />}
          >
            <Settings className="h-4 w-4" />
            Settings
          </DropdownMenuItem>
          <ThemePreferenceMenuItems />
          <DropdownMenuItem className="text-negative" onClick={handleSignOut}>
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
