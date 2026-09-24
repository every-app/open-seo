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
import { brand } from "@/shared/brand";

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
              title={`How did you find ${brand.name}?`}
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
                <button
                  type="button"
                  className="flex min-h-10 items-center gap-1.5 text-xs text-base-content/60 hover:text-base-content"
                  onClick={onBack}
                >
                  <ArrowLeft className="size-3.5" /> Back
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={onSkip}
                >
                  Skip
                </button>
              )}
              <div className="flex items-center gap-2">
                {step > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm text-base-content/55"
                    onClick={onSkip}
                  >
                    Skip
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canContinue || isSaving}
                  onClick={onNext}
                >
                  Continue <ArrowRight className="size-4" />
                </button>
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
          <p className="mt-3 text-sm leading-relaxed text-base-content/60">
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
              <button
                type="button"
                className={`flex min-h-11 items-center gap-3 rounded-full border px-4 py-2.5 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary ${selected ? "border-primary bg-primary/5 text-primary" : "border-base-300 hover:bg-base-200"} disabled:cursor-not-allowed disabled:opacity-35`}
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => onToggle(option)}
              >
                <span
                  className={`flex size-4 shrink-0 items-center justify-center border ${multiple ? "rounded" : "rounded-full"} ${selected ? "border-primary bg-primary text-primary-content" : "border-base-content/30"}`}
                >
                  {selected && <Check className="size-3" />}
                </span>
                <span className="capitalize">
                  {ONBOARDING_OPTION_LABELS[option] ?? option}
                </span>
              </button>

              {showFollowUpHere && followUp ? (
                <div className="w-full rounded-lg border border-base-300 bg-base-200/40 p-4">
                  <p className="text-sm text-base-content/70">
                    {followUp.label}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {followUp.options.map((followUpOption) => {
                      const followUpSelected =
                        followUp.value === followUpOption;

                      return (
                        <button
                          key={followUpOption}
                          type="button"
                          className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                            followUpSelected
                              ? "border-base-content bg-base-200 text-base-content"
                              : "border-base-300 text-base-content/75 hover:border-base-content/40 hover:bg-base-200/60"
                          }`}
                          aria-pressed={followUpSelected}
                          onClick={() =>
                            followUp.onChange(
                              followUpSelected ? "" : followUpOption,
                            )
                          }
                        >
                          {followUpOption}
                        </button>
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
        <input
          type="text"
          className="input input-bordered mt-4 w-full"
          aria-label={multiple ? "Other tasks" : "Other answer"}
          placeholder={multiple ? "Tell us what else..." : "Tell us more..."}
          value={otherValue}
          onChange={(event) => onOtherChange(event.target.value)}
        />
      ) : null}
    </div>
  );
}
