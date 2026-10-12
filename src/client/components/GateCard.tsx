import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";
import { Card, CardContent } from "@/client/components/ui/card";

const ICON_TONES = {
  primary: "bg-primary/10 text-primary",
  warning: "bg-warning/15 text-warning-foreground dark:text-warning",
};

/**
 * The card that stands in for a feature the user cannot use yet: a paid-plan
 * upsell, a beta opt-in or a missing setup step. It says what the feature
 * does and gives the one action that unlocks it.
 */
export function GateCard({
  icon: Icon,
  tone = "primary",
  badge,
  title,
  description,
  actions,
  features,
  children,
  className,
}: {
  icon?: LucideIcon;
  tone?: keyof typeof ICON_TONES;
  /** A label above the title, such as a "Paid plan" Badge. */
  badge?: ReactNode;
  title: ReactNode;
  description: ReactNode;
  actions: ReactNode;
  /** What the feature gives, in a grid below the actions. */
  features?: { icon: LucideIcon; title: string; body: string }[];
  /** Status below the actions, such as an Alert. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Card size="lg" className={cn("w-full gap-0 py-0", className)}>
      <CardContent className="space-y-5 py-6">
        <div className="space-y-3">
          {Icon ? (
            <div
              className={cn(
                "flex size-10 items-center justify-center rounded-lg",
                ICON_TONES[tone],
              )}
            >
              <Icon className="size-5" aria-hidden />
            </div>
          ) : null}
          {badge}
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            {description}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">{actions}</div>
        {children}
      </CardContent>

      {features ? (
        <CardContent className="grid grid-cols-1 gap-5 border-t border-border py-6 sm:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="space-y-2">
              <div className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <feature.icon className="size-4" aria-hidden />
              </div>
              <h3 className="text-sm font-semibold">{feature.title}</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {feature.body}
              </p>
            </div>
          ))}
        </CardContent>
      ) : null}
    </Card>
  );
}
