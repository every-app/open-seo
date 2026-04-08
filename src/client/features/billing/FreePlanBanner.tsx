import { Link } from "@tanstack/react-router";
import { AutumnProvider, useCustomer } from "autumn-js/react";
import { useSession } from "@/lib/auth-client";
import { getCustomerPlanStatus } from "@/client/features/billing/plan-detection";
import {
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
  BILLING_ROUTE,
  LOW_CREDITS_THRESHOLD_USD,
  SUBSCRIBE_ROUTE,
  autumnSeoDataCreditsToUsd,
} from "@/shared/billing";

export function FreePlanBanner() {
  return (
    <AutumnProvider>
      <FreePlanBannerContent />
    </AutumnProvider>
  );
}

function FreePlanBannerContent() {
  const { data: session } = useSession();
  const customerQuery = useCustomer({
    queryOptions: {
      enabled: Boolean(session?.user?.id),
    },
  });

  if (customerQuery.isLoading || !customerQuery.data) {
    return null;
  }

  const planStatus = getCustomerPlanStatus(customerQuery.data);
  const isFreePlan = planStatus === "free";

  const monthlyRemaining = autumnSeoDataCreditsToUsd(
    customerQuery.data.balances?.[AUTUMN_SEO_DATA_BALANCE_FEATURE_ID]
      ?.remaining ?? 0,
  );
  const topUpRemaining = autumnSeoDataCreditsToUsd(
    customerQuery.data.balances?.[AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID]
      ?.remaining ?? 0,
  );
  const totalRemaining = monthlyRemaining + topUpRemaining;

  const isOutOfCredits = totalRemaining <= 0;
  const isLowCredits =
    !isOutOfCredits && totalRemaining < LOW_CREDITS_THRESHOLD_USD;

  const creditsActionLink = isFreePlan ? (
    <Link
      to={SUBSCRIBE_ROUTE}
      search={{ upgrade: true }}
      className="link link-primary font-medium"
    >
      Upgrade your plan
    </Link>
  ) : (
    <Link to={BILLING_ROUTE} className="link link-primary font-medium">
      Buy more credits
    </Link>
  );

  if (isOutOfCredits) {
    return (
      <BannerShell variant="error">
        You&rsquo;ve used all your credits. {creditsActionLink} to continue
        using OpenSEO.
      </BannerShell>
    );
  }

  if (isLowCredits) {
    return (
      <BannerShell variant="warning">
        You&rsquo;re running low on credits. {creditsActionLink} to keep using
        OpenSEO.
      </BannerShell>
    );
  }

  if (isFreePlan) {
    return (
      <BannerShell variant="info">
        We hope you&rsquo;re enjoying OpenSEO!{" "}
        <Link
          to={SUBSCRIBE_ROUTE}
          search={{ upgrade: true }}
          className="link link-primary font-medium"
        >
          Upgrade anytime
        </Link>{" "}
        or{" "}
        <Link to="/support" className="link link-primary font-medium">
          reach out with questions
        </Link>
        .
      </BannerShell>
    );
  }

  return null;
}

function BannerShell({
  variant,
  children,
}: {
  variant: "info" | "warning" | "error";
  children: React.ReactNode;
}) {
  const alertClass =
    variant === "error"
      ? "alert-error"
      : variant === "warning"
        ? "alert-warning"
        : "alert-info";

  return (
    <div className="shrink-0 px-4 py-2.5 md:px-6">
      <div className="mx-auto max-w-7xl">
        <div className={`alert text-sm ${alertClass}`}>
          <span>{children}</span>
        </div>
      </div>
    </div>
  );
}
