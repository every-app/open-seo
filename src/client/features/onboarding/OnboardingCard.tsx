import type { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/client/components/ui/tooltip";

export function OnboardingCard({
  step,
  steps,
  onStepChange,
  disabled,
  children,
}: {
  step: number;
  steps: string[];
  onStepChange: (index: number) => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <div className="w-full max-w-xl py-8">
      <div className="flex items-center justify-center gap-2 text-sm font-semibold">
        <img src="/transparent-logo.png" alt="" className="size-7" />
        OpenSEO
      </div>
      <main className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-sm md:mt-12 md:p-10">
        <nav className="-mt-3 mb-5 flex gap-2" aria-label="Onboarding steps">
          {steps.map((label, index) => (
            <Tooltip key={label}>
              <TooltipTrigger
                render={<button type="button" />}
                aria-label={`Step ${index + 1}: ${label}`}
                aria-current={index === step - 1 ? "step" : undefined}
                disabled={disabled}
                onClick={() => onStepChange(index)}
                className="group flex min-h-7 flex-1 cursor-pointer items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default"
              >
                <span
                  className={`h-1 w-full rounded-full transition-colors group-hover:bg-primary/70 ${index === step - 1 ? "bg-primary" : "bg-border"}`}
                />
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          ))}
        </nav>
        {children}
      </main>
    </div>
  );
}
