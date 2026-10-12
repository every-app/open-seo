import { describe, expect, it, vi } from "vitest";
import {
  buildOnboardingPayload,
  ONBOARDING_LAST_STEP,
  restoreOnboardingAnswers,
} from "./onboardingModel";

vi.mock("@/serverFunctions/onboarding", () => ({
  getOnboardingAnswers: vi.fn(),
}));
const saved = {
  interestedFeatures: ["Keyword research"],
  workFor: "My own startup or business",
  clientWebsiteCount: null,
  foundVia: "Google",
};

// Persisted analytics values must round-trip unchanged (not become "Other")
// even when the display labels change.
describe("historical onboarding values", () => {
  it.each(["My own startup or business", "My employer's website"])(
    "restores and saves the original work-for value: %s",
    (workFor) => {
      const answers = restoreOnboardingAnswers({ ...saved, workFor });
      expect(answers.workFor).toBe(workFor);
      expect(answers.workForOther).toBe("");
      expect(
        buildOnboardingPayload(answers, ONBOARDING_LAST_STEP).workFor,
      ).toBe(workFor);
    },
  );

  it("keeps the original source and AI workflow values", () => {
    const interestedFeatures = ["AI workflows with Claude or Codex (MCP)"];
    const answers = restoreOnboardingAnswers({ ...saved, interestedFeatures });
    expect(answers.source).toBe("Google");
    expect(answers.sourceOther).toBe("");
    expect(answers.selectedInterests).toEqual(interestedFeatures);
    expect(answers.interestOther).toBe("");
    const payload = buildOnboardingPayload(answers, ONBOARDING_LAST_STEP);
    expect(payload.foundVia).toBe("Google");
    expect(payload.interestedFeatures).toEqual(interestedFeatures);
  });
});
