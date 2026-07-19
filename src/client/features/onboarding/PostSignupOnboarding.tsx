import { ArrowRight, Check } from "lucide-react";
import type { ReactNode } from "react";
import { Fragment } from "react";
import {
  CLIENT_WEBSITE_COUNT_OPTIONS,
  CLIENT_WORK_FOR,
  INTEREST_OPTIONS,
  ONBOARDING_LAST_STEP,
  type OnboardingAnswers,
  SOURCE_OPTIONS,
  SOURCE_OPTIONS_HIDDEN_ON_MOBILE,
  WORK_FOR_OPTIONS,
} from "@/client/features/onboarding/onboardingModel";
import { SearchConsoleOnboardingStep } from "@/client/features/onboarding/SearchConsoleOnboardingStep";

type PostSignupOnboardingProps = {
  firstName: string;
  title?: string;
  helperText?: string;
  step: number;
  answers: OnboardingAnswers;
  onAnswersChange: (answers: OnboardingAnswers) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onFinish: () => void;
  isSaving: boolean;
  accountMenu: ReactNode;
};

export function PostSignupOnboarding({
  firstName,
  title,
  helperText,
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
    <div className="w-full max-w-md space-y-6">
      {accountMenu}

      <div className="text-center space-y-3">
        <img
          src="/transparent-logo.png"
          alt="OpenSEO"
          className="mx-auto size-10 rounded-lg"
        />
        <p className="text-xs font-medium uppercase tracking-wide text-base-content/50">
          Step {step + 1} of {ONBOARDING_LAST_STEP + 1}
        </p>
        <h1 className="text-xl font-semibold">
          {title ??
            (firstName
              ? `Welcome to OpenSEO, ${firstName}!`
              : "Welcome to OpenSEO!")}
        </h1>
        <p className="text-sm text-base-content/60">
          {helperText ?? "A few quick answers to set things up."}
        </p>
      </div>

      <div className="rounded-lg border border-base-300 bg-base-100 p-5 shadow-sm">
        {step === 0 ? (
          <OnboardingChoiceGroup
            title="What tasks matter to you most?"
            description="Pick up to 3."
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
            onOtherChange={(interestOther) => updateAnswers({ interestOther })}
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
            hiddenOnMobile={[...SOURCE_OPTIONS_HIDDEN_ON_MOBILE]}
          />
        ) : (
          <SearchConsoleOnboardingStep />
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={step === 0 || isSaving}
            onClick={onBack}
          >
            Back
          </button>
          {step < ONBOARDING_LAST_STEP ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm text-base-content/55"
                disabled={isSaving}
                onClick={onSkip}
              >
                Skip
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canContinue || isSaving}
                onClick={onNext}
              >
                Continue
                <ArrowRight className="size-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={isSaving}
              onClick={onFinish}
            >
              Finish
              <ArrowRight className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
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
  hiddenOnMobile,
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
  hiddenOnMobile?: string[];
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
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-base-content/60">{description}</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        {options.map((option) => {
          const selected = selectedValues.includes(option);
          const disabled = atLimit && !selected;
          const showFollowUpHere =
            showFollowUp && followUp?.showForValue === option;
          // Selected options stay visible so a restored answer never vanishes.
          const mobileHidden = hiddenOnMobile?.includes(option) && !selected;

          return (
            <Fragment key={option}>
              <button
                type="button"
                className={`${mobileHidden ? "hidden sm:flex" : "flex"} min-h-11 items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  selected
                    ? "border-base-content bg-base-200 text-base-content"
                    : disabled
                      ? "border-base-300 text-base-content/35 cursor-not-allowed"
                      : "border-base-300 text-base-content/75 hover:border-base-content/40 hover:bg-base-200/60"
                }`}
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => onToggle(option)}
              >
                <span>{option}</span>
                {selected ? <Check className="size-4 shrink-0" /> : null}
              </button>

              {showFollowUpHere && followUp ? (
                <div className="rounded-lg border border-base-300 bg-base-200/40 px-3 py-2.5">
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
          className="input input-bordered w-full"
          placeholder={multiple ? "Tell us what else..." : "Tell us more..."}
          value={otherValue}
          onChange={(event) => onOtherChange(event.target.value)}
        />
      ) : null}
    </div>
  );
}
