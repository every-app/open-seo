import type { ReactNode } from "react";
import { cn } from "cn";
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
  description,
  priceLabel = `$${offer.priceUsd}/month`,
  features,
  highlighted = false,
  children,
}: {
  offer: PlanOffer;
  description?: string;
  priceLabel?: string;
  features: string[];
  highlighted?: boolean;
  children: ReactNode;
}) {
  return (
    <Card className={cn(highlighted && "ring-2 ring-primary")}>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-semibold">{offer.name}</span>
            <span className="text-lg font-semibold tabular-nums">
              {priceLabel}
            </span>
          </div>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>

        <ul className="flex-1 space-y-2">
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
        </ul>

        {children}
      </CardContent>
    </Card>
  );
}

export function PlanGuarantee() {
  return (
    <p className="text-center text-xs text-muted-foreground">
      <Tooltip>
        <TooltipTrigger className="cursor-help underline decoration-dotted">
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
