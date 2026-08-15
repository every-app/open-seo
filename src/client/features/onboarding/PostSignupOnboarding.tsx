import { ArrowRight, Check } from "lucide-react";
import type { ReactNode } from "react";
import { Fragment } from "react";
import {
  CLIENT_WEBSITE_COUNT_OPTIONS,
  CLIENT_WORK_FOR,
  getOnboardingOptionLabel,
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
          第 {step + 1} 步，共 {ONBOARDING_LAST_STEP + 1} 步
        </p>
        <h1 className="text-xl font-semibold">
          {title ??
            (firstName
              ? `${firstName}，欢迎使用 OpenSEO！`
              : "欢迎使用 OpenSEO！")}
        </h1>
        <p className="text-sm text-base-content/60">
          {helperText ?? "回答几个简单问题，快速完成设置。"}
        </p>
      </div>

      <div className="rounded-lg border border-base-300 bg-base-100 p-5 shadow-sm">
        {step === 0 ? (
          <OnboardingChoiceGroup
            title="你最关注哪些任务？"
            description="最多选择 3 项。"
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
            title="你在为谁做 SEO？"
            options={[...WORK_FOR_OPTIONS]}
            selectedValues={answers.workFor ? [answers.workFor] : []}
            onToggle={(workFor) => updateAnswers({ workFor })}
            otherValue={answers.workForOther}
            onOtherChange={(workForOther) => updateAnswers({ workForOther })}
            followUp={{
              showForValue: CLIENT_WORK_FOR,
              label: "你大约负责多少个客户网站？",
              options: [...CLIENT_WEBSITE_COUNT_OPTIONS],
              value: answers.clientWebsiteCount,
              onChange: (clientWebsiteCount) =>
                updateAnswers({ clientWebsiteCount }),
            }}
          />
        ) : step === 2 ? (
          <OnboardingChoiceGroup
            title="你是通过什么渠道了解到 OpenSEO 的？"
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
            返回
          </button>
          {step < ONBOARDING_LAST_STEP ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm text-base-content/55"
                disabled={isSaving}
                onClick={onSkip}
              >
                跳过
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canContinue || isSaving}
                onClick={onNext}
              >
                继续
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
              完成
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
                <span>{getOnboardingOptionLabel(option)}</span>
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
          placeholder={multiple ? "请填写其他关注项…" : "请补充说明…"}
          value={otherValue}
          onChange={(event) => onOtherChange(event.target.value)}
        />
      ) : null}
    </div>
  );
}
