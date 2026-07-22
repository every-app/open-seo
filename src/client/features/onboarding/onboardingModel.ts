import { queryOptions } from "@tanstack/react-query";
import { getOnboardingAnswers } from "@/serverFunctions/onboarding";

export const ONBOARDING_LAST_STEP = 3;

export const INTEREST_OPTIONS = [
  "AI workflows with Claude or Codex (MCP)",
  "Keyword research",
  "Competitor research",
  "Backlink analysis",
  "Site audits",
  "Rank tracking",
  "Other",
] as const;

export const WORK_FOR_OPTIONS = [
  "My own startup or business",
  "My clients",
  "My employer's website",
  "My own side project",
  "I'm exploring before choosing a project",
  "Other",
] as const;

export const CLIENT_WORK_FOR = "My clients";

export const CLIENT_WEBSITE_COUNT_OPTIONS = [
  "1–3",
  "4–10",
  "11–25",
  "25+",
] as const;

export const SOURCE_OPTIONS = [
  "Product Hunt",
  "Google",
  "Reddit",
  "X / Twitter",
  "GitHub",
  "AI (Claude, ChatGPT, etc)",
  "Friend or colleague",
  "Other",
] as const;

// Keep the mobile list short: these still count as known options, they just
// aren't shown on small screens.
export const SOURCE_OPTIONS_HIDDEN_ON_MOBILE = [
  "Reddit",
  "X / Twitter",
  "AI (Claude, ChatGPT, etc)",
] as const;

/** In-progress form state. Step is tracked separately in the URL. */
export type OnboardingAnswers = {
  selectedInterests: string[];
  interestOther: string;
  workFor: string;
  workForOther: string;
  clientWebsiteCount: string;
  source: string;
  sourceOther: string;
};

/** Answers as persisted in the DB (read back via getOnboardingAnswers). */
type SavedOnboardingAnswers = {
  interestedFeatures: string[];
  workFor: string | null;
  clientWebsiteCount: string | null;
  foundVia: string | null;
  mcpSetupIntent: string | null;
};

export const onboardingAnswersQueryOptions = () =>
  queryOptions({
    queryKey: ["onboardingAnswers"],
    queryFn: () => getOnboardingAnswers(),
  });

// Saved answers normalize "Other" selections into free text, so restoring the
// UI means mapping any value that isn't a known option back onto "Other".
function restoreSingleChoice(
  saved: string | null,
  options: readonly string[],
): { value: string; other: string } {
  if (!saved) return { value: "", other: "" };
  if (options.includes(saved)) return { value: saved, other: "" };
  return { value: "Other", other: saved };
}

export function restoreOnboardingAnswers(
  saved: SavedOnboardingAnswers,
): OnboardingAnswers {
  const known = saved.interestedFeatures.filter((value) =>
    (INTEREST_OPTIONS as readonly string[]).includes(value),
  );
  const custom = saved.interestedFeatures.filter(
    (value) => !(INTEREST_OPTIONS as readonly string[]).includes(value),
  );
  const work = restoreSingleChoice(saved.workFor, WORK_FOR_OPTIONS);
  const found = restoreSingleChoice(saved.foundVia, SOURCE_OPTIONS);

  return {
    selectedInterests: custom.length > 0 ? [...known, "Other"] : known,
    interestOther: custom[0] ?? "",
    workFor: work.value,
    workForOther: work.other,
    clientWebsiteCount:
      work.value === CLIENT_WORK_FOR ? (saved.clientWebsiteCount ?? "") : "",
    source: found.value,
    sourceOther: found.other,
  };
}

/**
 * Convert the in-progress form into the persisted payload. `step` decides which
 * fields are mature enough to write so we don't clobber later answers on save.
 */
export function buildOnboardingPayload(
  answers: OnboardingAnswers,
  step: number,
  extra: { completed?: boolean } = {},
) {
  const interestedFeatures = answers.selectedInterests.map((value) =>
    value === "Other" && answers.interestOther.trim()
      ? answers.interestOther.trim()
      : value,
  );
  const workFor =
    answers.workFor === "Other" && answers.workForOther.trim()
      ? answers.workForOther.trim()
      : answers.workFor || undefined;
  // Only persist a client-site estimate when "My clients" is selected; clear it
  // otherwise so a stale value from an earlier pass doesn't linger.
  const clientWebsiteCount =
    answers.workFor === CLIENT_WORK_FOR ? answers.clientWebsiteCount : "";
  const foundVia =
    answers.source === "Other" && answers.sourceOther.trim()
      ? answers.sourceOther.trim()
      : answers.source || undefined;

  return {
    ...(step >= 0 ? { interestedFeatures } : {}),
    ...(step >= 1 ? { workFor, clientWebsiteCount } : {}),
    ...(step >= 2 ? { foundVia } : {}),
    ...extra,
  };
}
