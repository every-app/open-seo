import type { ReactNode } from "react";
import { CircleAlert, TriangleAlert } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { Progress } from "@/client/components/ui/progress";
import { BASE_PLAN_OFFER } from "@/client/features/billing/plan-offers";
import { useCreditBalance } from "@/client/features/billing/useCreditBalance";

/** What is left to spend: the total first, then the monthly credits against
 *  the plan's allowance and the top-up credits. The ways to get more credits
 *  (`children`, BillingRows) sit under it in the same card. */
export function CreditsCard({ children }: { children?: ReactNode }) {
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
  const monthlyCreditsUsd = accountQuery.data?.monthlyCreditsUsd ?? 0;

  return (
    <Card className="gap-0 pb-0">
      <CardHeader>
        <CardTitle>
          <h2>Credits</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-x-12 gap-y-5 pt-4 pb-4 md:grid-cols-2 md:items-start">
        <div className="space-y-2">
          <p className="flex items-baseline gap-1.5">
            <span className="text-3xl font-semibold tracking-tight tabular-nums">
              ${totalRemaining.toFixed(2)}
            </span>
            <span className="text-sm text-muted-foreground">remaining</span>
          </p>
          {isOutOfCredits ? (
            <p className="flex gap-1.5 text-sm text-red-700 dark:text-destructive">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {isFreePlan
                ? "You’ve used your free credits. Upgrade your plan to continue."
                : `You’ve used this month’s credits. Buy more below to keep going${
                    refillDate
                      ? `, or wait for them to refill on ${refillDate}`
                      : ""
                  }.`}
            </p>
          ) : isLowCredits ? (
            <p className="flex gap-1.5 text-sm text-amber-700 dark:text-amber-500">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                You&rsquo;re running low on credits.{" "}
                {isFreePlan
                  ? `Upgrade to get $${BASE_PLAN_OFFER.monthlyCreditsUsd}/month.`
                  : "Buy more credits below."}
              </span>
            </p>
          ) : isFreePlan ? (
            <p className="text-sm text-muted-foreground">
              Your free credits don&rsquo;t refill.
            </p>
          ) : null}
        </div>

        {isFreePlan ? null : (
          <div className="space-y-4 text-sm">
            <div className="space-y-2">
              <BalanceLine label="Monthly">
                ${monthlyRemaining.toFixed(2)}
                {monthlyCreditsUsd > 0 ? (
                  <span className="text-muted-foreground">
                    {" "}
                    of ${monthlyCreditsUsd.toFixed(2)}
                  </span>
                ) : null}
              </BalanceLine>
              {monthlyCreditsUsd > 0 ? (
                <Progress
                  aria-label="Monthly credits left"
                  // Credits carried over from an upgrade can top the allowance.
                  value={
                    Math.min(monthlyRemaining / monthlyCreditsUsd, 1) * 100
                  }
                />
              ) : null}
              {refillDate ? (
                <p className="text-xs text-muted-foreground">
                  Refills {refillDate}
                </p>
              ) : null}
            </div>
            <BalanceLine label="Top-ups">
              ${topUpRemaining.toFixed(2)}
            </BalanceLine>
          </div>
        )}
      </CardContent>
      {children ? (
        <div className="divide-y divide-border border-t border-border">
          {children}
        </div>
      ) : null}
    </Card>
  );
}

function BalanceLine({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <p className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{children}</span>
    </p>
  );
}
