import type { ReactNode } from "react";

export function OnboardingCard({
  step,
  total,
  children,
}: {
  step: number;
  total: number;
  children: ReactNode;
}) {
  return (
    <div className="w-full max-w-xl py-8">
      <div className="flex items-center justify-center gap-2 text-sm font-semibold">
        <img src="/transparent-logo.png" alt="" className="size-7" />
        OpenSEO
      </div>
      <main className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-sm md:mt-12 md:p-10">
        <div
          className="mb-8 flex gap-2"
          role="progressbar"
          aria-label="Onboarding progress"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={step}
          aria-valuetext={`Step ${step} of ${total}`}
        >
          {Array.from({ length: total }, (_, index) => (
            <span
              key={index}
              className={`h-1 flex-1 rounded-full ${index < step ? "bg-primary" : "bg-border"}`}
            />
          ))}
        </div>
        {children}
      </main>
    </div>
  );
}
