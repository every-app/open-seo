import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AutumnProvider, useCustomer } from "autumn-js/react";
import { useEffect, useState } from "react";
import { User } from "lucide-react";
import { ThemePreferenceMenuItems } from "@/client/components/ThemePreferenceMenuItems";
import { captureClientEvent } from "@/client/lib/posthog";
import { signOutAndRedirect, useSession } from "@/lib/auth-client";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getSubscribeRouteState } from "@/client/features/billing/route-state";
import {
  AUTUMN_MANAGED_SERVICE_ACCESS_FEATURE_ID,
  AUTUMN_PAID_PLAN_ID,
} from "@/shared/billing";

export const Route = createFileRoute("/_authenticated/subscribe")({
  component: SubscribePage,
});

function SubscribePage() {
  return (
    <AutumnProvider>
      <SubscribePageContent />
    </AutumnProvider>
  );
}

function SubscribePageContent() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const [isAttaching, setIsAttaching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkoutCompleted =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("checkout") === "success";

  const customerQuery = useCustomer({
    queryOptions: {
      enabled: Boolean(session?.user?.id),
    },
  });

  const hasManagedServiceAccess = Boolean(
    customerQuery.data?.flags?.[AUTUMN_MANAGED_SERVICE_ACCESS_FEATURE_ID],
  );
  const subscribeRouteState = getSubscribeRouteState({
    hasSession: Boolean(session?.user?.id),
    isCustomerLoading: customerQuery.isLoading,
    isCustomerError: customerQuery.isError,
    hasManagedServiceAccess,
  });

  useEffect(() => {
    if (subscribeRouteState === "redirectToApp") {
      if (checkoutCompleted) {
        captureClientEvent("billing:checkout_success");
      }
      void navigate({ to: "/", replace: true });
    }
  }, [checkoutCompleted, navigate, subscribeRouteState]);

  if (
    subscribeRouteState === "loading" ||
    subscribeRouteState === "redirectToApp"
  ) {
    return null;
  }

  if (subscribeRouteState === "error") {
    return (
      <div className="w-full max-w-xs space-y-4">
        <div className="text-center space-y-3">
          <img
            src="/transparent-logo.png"
            alt="OpenSEO"
            className="mx-auto size-10 rounded-lg"
          />
          <h1 className="text-xl font-semibold">Billing unavailable</h1>
        </div>

        <p className="text-sm text-center text-base-content/70">
          {getStandardErrorMessage(
            customerQuery.error,
            "We couldn't verify your billing status right now. Please try again.",
          )}
        </p>

        <button
          type="button"
          className="btn btn-soft w-full"
          onClick={() => {
            void customerQuery.refetch();
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  async function handleSubscribe() {
    setError(null);
    setIsAttaching(true);

    try {
      captureClientEvent("billing:checkout_start");
      await customerQuery.attach({
        planId: AUTUMN_PAID_PLAN_ID,
        redirectMode: "always",
        successUrl: `${window.location.origin}${window.location.pathname}?checkout=success`,
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
    <div className="w-full max-w-xs space-y-6">
      <SubscribePageAccountMenu email={session?.user?.email} />
      <div className="text-center space-y-3">
        <img
          src="/transparent-logo.png"
          alt="OpenSEO"
          className="mx-auto size-10 rounded-lg"
        />
        <h1 className="text-xl font-semibold">Get started</h1>
      </div>

      <div className="rounded-lg border border-base-300 p-4">
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-semibold">Base Plan</span>
          <span className="text-lg font-semibold tabular-nums">$10/month</span>
        </div>
        <ul className="mt-3 space-y-2">
          {[
            "Access to OpenSEO's managed service",
            "Includes $10.00 of Usage Credits each month",
            "Credits are consumed as you go for SEO data and AI features",
          ].map((item) => (
            <li
              key={item}
              className="flex gap-2.5 text-sm text-base-content/70"
            >
              <span className="text-base-content/40 mt-[2px] shrink-0">
                &mdash;
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {error ? <p className="text-sm text-error">{error}</p> : null}

      <button
        className="btn btn-soft w-full"
        disabled={isAttaching}
        onClick={() => void handleSubscribe()}
      >
        {isAttaching ? "Redirecting..." : "Subscribe"}
      </button>

      <p className="text-center text-xs text-base-content/50">
        Cancel anytime — no commitment. Powered by Stripe.
      </p>
    </div>
  );
}

function SubscribePageAccountMenu({ email }: { email: string | undefined }) {
  if (!email) return null;

  const handleSignOut = () => signOutAndRedirect();

  return (
    <div className="fixed top-4 right-4">
      <div className="dropdown dropdown-end">
        <button
          type="button"
          tabIndex={0}
          className="btn btn-ghost btn-circle"
          aria-label="Open account menu"
        >
          <User className="h-5 w-5" />
        </button>
        <ul
          tabIndex={0}
          className="dropdown-content z-20 menu mt-3 min-w-56 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg"
        >
          <li className="menu-title max-w-full">
            <span className="truncate text-base-content">{email}</span>
          </li>
          <ThemePreferenceMenuItems />
          <li>
            <button
              type="button"
              className="text-error"
              onClick={handleSignOut}
            >
              Sign out
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
