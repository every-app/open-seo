import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  getState: vi.fn(),
  saveAnswers: vi.fn(),
  dismissGscNudge: vi.fn(),
}));

vi.mock("../repositories/OnboardingRepository", () => ({
  OnboardingRepository: repository,
}));

import { OnboardingService } from "./OnboardingService";

describe("OnboardingService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T08:30:00.000Z"));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("normalizes stored answers for the client", async () => {
    repository.getState.mockResolvedValue({
      completedAt: "2026-09-22T08:00:00.000Z",
      gscNudgeDismissedAt: "2026-09-22T08:00:00.000Z",
      interestedFeatures: '["keywords","audit"]',
      workFor: "agency",
      clientWebsiteCount: "6-10",
      foundVia: "search",
      mcpSetupIntent: "yes",
      userCreatedAt: new Date("2026-09-01T00:00:00.000Z"),
    });

    await expect(OnboardingService.getAnswers("user-1")).resolves.toEqual({
      completedAt: "2026-09-22T08:00:00.000Z",
      gscNudgeDismissedAt: "2026-09-22T08:00:00.000Z",
      userCreatedAt: "2026-09-01T00:00:00.000Z",
      answers: {
        interestedFeatures: ["keywords", "audit"],
        workFor: "agency",
        clientWebsiteCount: "6-10",
        foundVia: "search",
        mcpSetupIntent: "yes",
      },
    });
  });

  it("falls back to an empty feature list for malformed stored JSON", async () => {
    repository.getState.mockResolvedValue({
      completedAt: null,
      gscNudgeDismissedAt: null,
      interestedFeatures: "not-json",
      workFor: null,
      clientWebsiteCount: null,
      foundVia: null,
      mcpSetupIntent: null,
      userCreatedAt: new Date("2026-09-01T00:00:00.000Z"),
    });

    const result = await OnboardingService.getAnswers("user-1");

    expect(result.answers.interestedFeatures).toEqual([]);
  });

  it("stamps completion and resolves the GSC nudge in one repository call", async () => {
    await OnboardingService.saveAnswers("user-1", "org-1", {
      interestedFeatures: ["rank-tracking"],
      completed: true,
    });

    expect(repository.saveAnswers).toHaveBeenCalledWith(
      "user-1",
      "org-1",
      {
        interestedFeatures: ["rank-tracking"],
        completedAt: "2026-09-22T08:30:00.000Z",
      },
      "2026-09-22T08:30:00.000Z",
    );
  });

  it("records a dismissed GSC nudge", async () => {
    await OnboardingService.dismissGscNudge("user-1", "org-1");

    expect(repository.dismissGscNudge).toHaveBeenCalledWith(
      "user-1",
      "org-1",
      "2026-09-22T08:30:00.000Z",
    );
  });
});
