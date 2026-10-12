import { useEffect, useState } from "react";
import { Circle, CircleCheck, Loader2 } from "lucide-react";

// Research reports no progress, so steps advance on a timer sized to the
// usual minute-long run. The last step stays in progress until it finishes.
const STEP_MS = 15_000;

/** Research fills only missing context, so only those steps are listed. */
export function WebsiteResearchProgress({
  missingOverview,
  missingCompetitors,
  note,
}: {
  missingOverview: boolean;
  missingCompetitors: boolean;
  note?: string;
}) {
  const steps = [
    ...(missingOverview ? ["Researching your website"] : []),
    ...(missingCompetitors ? ["Finding competitors"] : []),
    "Preparing topics and prompts",
  ];
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    const interval = window.setInterval(
      () => setCurrent((index) => Math.min(index + 1, steps.length - 1)),
      STEP_MS,
    );
    return () => window.clearInterval(interval);
  }, [steps.length]);
  return (
    <div className="flex flex-col items-center gap-5 py-12 text-center">
      {steps.length > 1 && (
        <p
          role="status"
          aria-atomic="true"
          className="text-xs font-medium text-muted-foreground"
        >
          Step {current + 1} of {steps.length}
          <span className="sr-only">: {steps[current]}</span>
        </p>
      )}
      <ol className="space-y-3 text-left">
        {steps.map((step, index) => (
          <li
            key={step}
            aria-current={index === current ? "step" : undefined}
            className={`flex items-center gap-3 text-sm ${index > current ? "text-muted-foreground" : ""}`}
          >
            {index < current ? (
              <CircleCheck className="size-4 text-success" aria-hidden />
            ) : index === current ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Circle className="size-4 opacity-40" aria-hidden />
            )}
            {step}
          </li>
        ))}
      </ol>
      <p className="max-w-sm text-xs text-muted-foreground">
        This can take up to a minute.{note ? ` ${note}` : ""}
      </p>
    </div>
  );
}
