import { Link } from "@tanstack/react-router";
import { Button } from "@/client/components/ui/button";
import type { PlanOffer } from "@/client/features/billing/plan-offers";
import { SUPPORT_EMAIL } from "@/client/lib/support";
import {
  canUpgradePlan,
  isMonthlyPlan,
  SUBSCRIBE_ROUTE,
} from "@/shared/billing";

/** Opens the plan picker from Billing. Yearly plans and plans granted by
 *  hand change by email, so they get no button. */
export function ChangePlanButton({ planId }: { planId: string | null }) {
  if (!isMonthlyPlan(planId)) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      nativeButton={false}
      render={<Link to={SUBSCRIBE_ROUTE} search={{ upgrade: true }} />}
    >
      Change plan
    </Button>
  );
}

/** A plan card's button for a paying customer: they move up in the app and
 *  down through support (see canUpgradePlan). */
export function PlanChangeAction({
  offer,
  currentPlanId,
  highlighted,
  onUpgrade,
}: {
  offer: PlanOffer;
  currentPlanId: string | null;
  highlighted: boolean;
  onUpgrade: () => void;
}) {
  if (offer.planId === currentPlanId) {
    return (
      <Button className="w-full" variant="outline" disabled>
        Current plan
      </Button>
    );
  }
  if (canUpgradePlan(currentPlanId, offer.planId)) {
    return (
      <Button
        className="w-full"
        variant={highlighted ? "default" : "outline"}
        onClick={onUpgrade}
      >
        Upgrade
      </Button>
    );
  }
  return (
    <Button
      className="w-full"
      variant="outline"
      nativeButton={false}
      render={
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
            `Switch to the ${offer.name}`,
          )}`}
        />
      }
    >
      Email us to switch
    </Button>
  );
}
