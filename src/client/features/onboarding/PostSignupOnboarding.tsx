import { OnboardingCard } from "./OnboardingCard";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import type { ReactNode } from "react";
import { Fragment } from "react";
import {
  CLIENT_WEBSITE_COUNT_OPTIONS,
  CLIENT_WORK_FOR,
  INTEREST_OPTIONS,
  ONBOARDING_LAST_STEP,
  ONBOARDING_OPTION_LABELS,
  type OnboardingAnswers,
  SOURCE_OPTIONS,
  WORK_FOR_OPTIONS,
} from "@/client/features/onboarding/onboardingModel";
import { AgentSetup } from "@/client/features/ai-mcp/AgentSetup";
import { SearchConsoleOnboardingStep } from "@/client/features/onboarding/SearchConsoleOnboardingStep";

import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
type PostSignupOnboardingProps = {
  step: number;
  answers: OnboardingAnswers;
  onAnswersChange: (answers: OnboardingAnswers) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onFinish: (mcpSetupIntent?: "yes" | "no") => void;
  isSaving: boolean;
  accountMenu: ReactNode;
};

export function PostSignupOnboarding({
  step,
  answers,
  onAnswersChange,
  onNext,
  onBack,
  onSkip,
  onFinish,
  isSaving,
  accountMenu,
}: PostSignupOnboardingProps) {
  const canContinue =
    step === 0
      ? answers.selectedInterests.length > 0
      : step === 1
        ? Boolean(answers.workFor)
        : step === 2
          ? Boolean(answers.source)
          : true;

  const updateAnswers = (patch: Partial<OnboardingAnswers>) =>
    onAnswersChange({ ...answers, ...patch });

  return (
    <>
      {accountMenu}
      <OnboardingCard step={step + 1} total={ONBOARDING_LAST_STEP + 1}>
        <fieldset disabled={isSaving}>
          {step === 0 ? (
            <OnboardingChoiceGroup
              title="What brings you here?"
              description="Pick up to three things you want to work on."
              maxSelections={3}
              options={[...INTEREST_OPTIONS]}
              selectedValues={answers.selectedInterests}
              onToggle={(value) => {
                updateAnswers({
                  selectedInterests: answers.selectedInterests.includes(value)
                    ? answers.selectedInterests.filter((item) => item !== value)
                    : [...answers.selectedInterests, value],
                });
              }}
              otherValue={answers.interestOther}
              onOtherChange={(interestOther) =>
                updateAnswers({ interestOther })
              }
              multiple
            />
          ) : step === 1 ? (
            <OnboardingChoiceGroup
              title="Who are you doing SEO for?"
              options={[...WORK_FOR_OPTIONS]}
              selectedValues={answers.workFor ? [answers.workFor] : []}
              onToggle={(workFor) => updateAnswers({ workFor })}
              otherValue={answers.workForOther}
              onOtherChange={(workForOther) => updateAnswers({ workForOther })}
              followUp={{
                showForValue: CLIENT_WORK_FOR,
                label: "About how many client sites do you work on?",
                options: [...CLIENT_WEBSITE_COUNT_OPTIONS],
                value: answers.clientWebsiteCount,
                onChange: (clientWebsiteCount) =>
                  updateAnswers({ clientWebsiteCount }),
              }}
            />
          ) : step === 2 ? (
            <OnboardingChoiceGroup
              title="How did you find OpenSEO?"
              options={[...SOURCE_OPTIONS]}
              selectedValues={answers.source ? [answers.source] : []}
              onToggle={(source) => updateAnswers({ source })}
              otherValue={answers.sourceOther}
              onOtherChange={(sourceOther) => updateAnswers({ sourceOther })}
            />
          ) : step === 3 ? (
            <SearchConsoleOnboardingStep
              onNext={onNext}
              onBack={onBack}
              onSkip={onSkip}
            />
          ) : (
            <AgentSetup
              onComplete={onFinish}
              onBack={onBack}
              disabled={isSaving}
            />
          )}

          {step < 3 && (
            <div className="mt-8 flex items-center justify-between gap-3">
              {step > 0 ? (
                <Button
                  variant="ghost"
                  className="rounded-md flex min-h-10 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={onBack}
                >
                  <ArrowLeft className="size-3.5" /> Back
                </Button>
              ) : (
                <Button variant="ghost" type="button" onClick={onSkip}>
                  Skip
                </Button>
              )}
              <div className="flex items-center gap-2">
                {step > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    className="text-muted-foreground"
                    onClick={onSkip}
                  >
                    Skip
                  </Button>
                )}
                <Button
                  type="button"
                  disabled={!canContinue || isSaving}
                  onClick={onNext}
                >
                  Continue <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </fieldset>
      </OnboardingCard>
    </>
  );
}

function OnboardingChoiceGroup({
  title,
  description,
  options,
  selectedValues,
  onToggle,
  otherValue,
  onOtherChange,
  multiple = false,
  maxSelections,
  followUp,
}: {
  title: string;
  description?: string;
  options: string[];
  selectedValues: string[];
  onToggle: (value: string) => void;
  otherValue: string;
  onOtherChange: (value: string) => void;
  multiple?: boolean;
  maxSelections?: number;
  followUp?: {
    showForValue: string;
    label: string;
    options: string[];
    value: string;
    onChange: (value: string) => void;
  };
}) {
  const isOtherSelected = selectedValues.includes("Other");
  const showFollowUp =
    followUp !== undefined && selectedValues.includes(followUp.showForValue);
  const atLimit =
    maxSelections !== undefined && selectedValues.length >= maxSelections;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = selectedValues.includes(option);
          const disabled = atLimit && !selected;
          const showFollowUpHere =
            showFollowUp && followUp?.showForValue === option;

          return (
            <Fragment key={option}>
              <Button
                variant="ghost"
                className={`justify-start whitespace-normal text-left font-normal text-inherit flex min-h-11 items-center gap-3 rounded-full border px-4 py-2.5 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-35 ${selected ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted"}`}
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => onToggle(option)}
              >
                <span
                  className={`flex size-4 shrink-0 items-center justify-center border ${multiple ? "rounded" : "rounded-full"} ${selected ? "border-primary bg-primary text-primary-foreground" : "border-foreground/30"}`}
                >
                  {selected && <Check className="size-3" />}
                </span>
                <span className="capitalize">
                  {ONBOARDING_OPTION_LABELS[option] ?? option}
                </span>
              </Button>

              {showFollowUpHere && followUp ? (
                <div className="w-full rounded-lg border border-border bg-muted/40 p-4">
                  <p className="text-sm text-muted-foreground">
                    {followUp.label}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {followUp.options.map((followUpOption) => {
                      const followUpSelected =
                        followUp.value === followUpOption;

                      return (
                        <Button
                          variant="ghost"
                          key={followUpOption}
                          className={`h-auto text-inherit rounded-md border px-3 py-1.5 text-sm transition-colors ${
                            followUpSelected
                              ? "border-foreground bg-muted text-foreground"
                              : "border-border text-muted-foreground hover:border-foreground/40 hover:bg-muted/60"
                          }`}
                          aria-pressed={followUpSelected}
                          onClick={() =>
                            followUp.onChange(
                              followUpSelected ? "" : followUpOption,
                            )
                          }
                        >
                          {followUpOption}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </Fragment>
          );
        })}
      </div>

      {isOtherSelected ? (
        <Input
          type="text"
          className="mt-4 w-full"
          aria-label={multiple ? "Other tasks" : "Other answer"}
          placeholder={multiple ? "Tell us what else..." : "Tell us more..."}
          value={otherValue}
          onChange={(event) => onOtherChange(event.target.value)}
        />
      ) : null}
    </div>
  );
}
