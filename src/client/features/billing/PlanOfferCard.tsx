import type { ReactNode } from "react";
import type { PlanOffer } from "@/client/features/billing/plan-offers";
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
  features,
  afterFeatures,
  children,
}: {
  offer: PlanOffer;
  features: string[];
  afterFeatures?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-semibold">{offer.name}</span>
          <span className="text-lg font-semibold tabular-nums">
            ${offer.priceUsd}/month
          </span>
        </div>

        <ul className="space-y-2">
          {features.map((item) => (
            <li
              key={item}
              className="flex gap-2.5 text-sm text-muted-foreground"
            >
              <span className="text-muted-foreground/60 mt-[2px] shrink-0">
                &mdash;
              </span>
              {item}
            </li>
          ))}
          {afterFeatures}
        </ul>

        {children}

        <p className="text-center text-xs text-muted-foreground">
          <Tooltip>
            <TooltipTrigger className="cursor-help underline decoration-dotted">
              30-day money-back guarantee
            </TooltipTrigger>
            <TooltipContent>
              Not for you yet? Email {SUPPORT_EMAIL} within 30 days of your
              charge and we'll refund your subscription.
            </TooltipContent>
          </Tooltip>
          . Cancel anytime. Powered by Stripe.
        </p>
      </CardContent>
    </Card>
  );
}
