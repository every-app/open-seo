import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import type { ReactNode } from "react";
import { Fragment } from "react";
import {
  CLIENT_WEBSITE_COUNT_OPTIONS,
  CLIENT_WORK_FOR,
  INTEREST_OPTIONS,
  ONBOARDING_LAST_STEP,
  type OnboardingAnswers,
  SOURCE_OPTIONS,
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
  onFinish: (mcpSetupIntent: "yes" | "no") => void;
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
          />
        ) : step === 3 ? (
          <SearchConsoleOnboardingStep />
        ) : (
          <McpRecommendation
            isSaving={isSaving}
            onBack={onBack}
            onSetup={() => onFinish("yes")}
            onSkip={() => onFinish("no")}
          />
        )}

        {step < ONBOARDING_LAST_STEP ? (
          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={step === 0 || isSaving}
              onClick={onBack}
            >
              Back
            </button>
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
          </div>
        ) : null}
      </div>
    </div>
  );
}

function McpRecommendation({
  isSaving,
  onBack,
  onSetup,
  onSkip,
}: {
  isSaving: boolean;
  onBack: () => void;
  onSetup: () => void;
  onSkip: () => void;
}) {
  const capabilities = [
    "Keyword research",
    "Competitor research",
    "Link prospecting",
  ];

  return (
    <div className="flex flex-col">
      <button
        type="button"
        className="btn btn-ghost btn-sm -ml-2 mb-2 self-start gap-1.5 text-base-content/60"
        disabled={isSaving}
        onClick={onBack}
      >
        <ArrowLeft className="size-4" />
        Back
      </button>
      <h2 className="text-lg font-semibold">Set up OpenSEO MCP?</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-base-content/70">
        The most powerful way to use OpenSEO — use AI to supercharge your SEO
        skills.
      </p>

      <ul className="mt-4 w-full space-y-2">
        {capabilities.map((capability) => (
          <li key={capability} className="flex items-center gap-2.5 text-sm">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-base-200 text-base-content">
              <Check className="size-3" />
            </span>
            <span className="text-base-content/80">{capability}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="btn btn-primary mt-5 w-full"
        disabled={isSaving}
        onClick={onSetup}
      >
        Yes, set up MCP
        <ArrowRight className="size-4" />
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm mt-2 w-full text-base-content/60"
        disabled={isSaving}
        onClick={onSkip}
      >
        Not now
      </button>
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

          return (
            <Fragment key={option}>
              <button
                type="button"
                className={`flex min-h-11 items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
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
