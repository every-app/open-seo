import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/client/components/ui/button";

export function WizardFooter({
  onBack,
  onSkip,
  skipLabel = "Skip",
  onContinue,
  continueLabel = "Continue",
  continueDisabled = false,
  continueAction,
  className,
}: {
  onBack?: () => void;
  onSkip?: () => void;
  skipLabel?: string;
  onContinue?: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  continueAction?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mt-8 flex flex-wrap items-center justify-between gap-3",
        className,
      )}
    >
      {onBack ? (
        <Button
          type="button"
          variant="ghost"
          className="gap-1.5 px-0 text-xs font-normal text-muted-foreground hover:bg-transparent"
          onClick={onBack}
        >
          <ArrowLeft className="size-3.5" /> Back
        </Button>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-2">
        {onSkip ? (
          <Button
            type="button"
            variant="ghost"
            className="h-8 px-3 text-xs font-semibold text-foreground/55"
            onClick={onSkip}
          >
            {skipLabel}
          </Button>
        ) : null}
        {continueAction ?? (
          <Button
            type="button"
            // Without onContinue this is a placeholder for a step that has
            // nothing to save yet, so it renders small, like the Skip beside it.
            className={`font-semibold disabled:bg-foreground/10 disabled:text-foreground/20 disabled:opacity-100 ${onContinue ? "" : "h-8 px-3 text-xs"}`}
            onClick={onContinue}
            disabled={continueDisabled || !onContinue}
          >
            {continueLabel}
            {onContinue ? <ArrowRight className="size-4" /> : null}
          </Button>
        )}
      </div>
    </div>
  );
}
