import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "cn";
import {
  monthlyCreditsFeature,
  type PlanOffer,
} from "@/client/features/billing/plan-offers";
import { Card, CardContent } from "@/client/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/client/components/ui/tooltip";
import { SUPPORT_EMAIL } from "@/client/lib/support";

// Shared card for the full-page checkout screens (/subscribe, /yc). Callers
// pass the CTA and any extra notes as children.
export function PlanOfferCard({
  offer,
  description,
  priceUsd = offer.priceUsd,
  period = "month",
  features,
  highlighted = false,
  children,
}: {
  offer: PlanOffer;
  description?: string;
  priceUsd?: number;
  period?: "month" | "year";
  features: string[];
  highlighted?: boolean;
  children: ReactNode;
}) {
  return (
    <Card
      size="lg"
      className={cn(highlighted && "border-primary ring-1 ring-primary")}
    >
      <CardContent className="flex flex-1 flex-col gap-6">
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">{offer.name}</h2>
            {description ? (
              <p className="text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {/* The credits are what sets the plans apart, so they sit with
              the price instead of at the end of the list. */}
          <div className="space-y-1">
            <p className="flex items-baseline gap-1">
              <span className="text-3xl font-semibold tracking-tight tabular-nums">
                ${priceUsd.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground">/{period}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              {monthlyCreditsFeature(offer)}
            </p>
          </div>
        </div>

        <ul className="flex-1 space-y-2.5">
          {features.map((item) => (
            <li key={item} className="flex gap-2.5 text-sm">
              <Check
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              />
              {item}
            </li>
          ))}
        </ul>

        {children}
      </CardContent>
    </Card>
  );
}

/** The one underline for the links and the tooltip under the plan cards. */
export const PLAN_FOOTER_LINK_CLASS =
  "underline underline-offset-2 transition-colors hover:text-foreground";

export function PlanGuarantee() {
  return (
    <p className="text-center text-xs text-muted-foreground">
      <Tooltip>
        <TooltipTrigger className={cn(PLAN_FOOTER_LINK_CLASS, "cursor-help")}>
          30-day money-back guarantee
        </TooltipTrigger>
        <TooltipContent>
          Not for you yet? Email {SUPPORT_EMAIL} within 30 days of your charge
          and we'll refund your subscription.
        </TooltipContent>
      </Tooltip>
      . Cancel anytime. Powered by Stripe.
    </p>
  );
}
