import { Link } from "@tanstack/react-router";
import { Sparkles, type LucideIcon } from "@/client/components/icons";
import { SUBSCRIBE_ROUTE } from "@/shared/billing";

import { Badge } from "@/client/components/ui/badge";
import { buttonVariants } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
type Props = {
  feature: string;
  description: string;
  bullets: Array<{ icon: LucideIcon; title: string; body: string }>;
};

export function AiSearchPaidPlanGate({ feature, description, bullets }: Props) {
  return (
    <Card className="mx-auto max-w-3xl overflow-hidden">
      <div className="flex flex-col gap-5 px-6 py-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl space-y-2">
          <Badge variant="primary" size="lg">
            <Sparkles className="size-3.5" />
            Paid plan
          </Badge>
          <h2 className="text-xl font-semibold tracking-tight">
            Unlock {feature}
          </h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Link
          to={SUBSCRIBE_ROUTE}
          search={{ upgrade: true }}
          className={buttonVariants({ className: "shrink-0" })}
        >
          Upgrade
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 border-t border-border px-6 py-6 sm:grid-cols-3">
        {bullets.map(({ icon: Icon, title, body }) => (
          <div key={title} className="space-y-2">
            <div className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-link">
              <Icon className="size-4" />
            </div>
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {body}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
