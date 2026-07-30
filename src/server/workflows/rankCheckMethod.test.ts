import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveQueueLiveFallback,
  resolveRankCheckMethod,
} from "./rankCheckMethod";

const mocks = vi.hoisted(() => ({
  getOptionalEnvValue: vi.fn(),
}));

vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: mocks.getOptionalEnvValue,
}));

describe("resolveRankCheckMethod", () => {
  beforeEach(() => {
    mocks.getOptionalEnvValue.mockResolvedValue(undefined);
  });

  it("always uses the queue for scheduled checks", async () => {
    mocks.getOptionalEnvValue.mockResolvedValue("live");
    expect(await resolveRankCheckMethod("scheduled")).toBe("queued");
  });

  it("defaults manual checks to the live endpoint", async () => {
    expect(await resolveRankCheckMethod("manual")).toBe("live");
    expect(mocks.getOptionalEnvValue).toHaveBeenCalledWith(
      "RANK_CHECK_MANUAL_METHOD",
    );
  });

  it("routes manual checks to the queue when the env toggle is set", async () => {
    mocks.getOptionalEnvValue.mockResolvedValue("queued");
    expect(await resolveRankCheckMethod("manual")).toBe("queued");
  });

  it("keeps manual checks live for unknown toggle values", async () => {
    mocks.getOptionalEnvValue.mockResolvedValue("fast");
    expect(await resolveRankCheckMethod("manual")).toBe("live");
  });
});

describe("resolveQueueLiveFallback", () => {
  beforeEach(() => {
    mocks.getOptionalEnvValue.mockResolvedValue(undefined);
  });

  it("enables the live fallback by default", async () => {
    expect(await resolveQueueLiveFallback()).toBe(true);
    expect(mocks.getOptionalEnvValue).toHaveBeenCalledWith(
      "RANK_CHECK_QUEUE_LIVE_FALLBACK",
    );
  });

  it("disables the live fallback when set to off", async () => {
    mocks.getOptionalEnvValue.mockResolvedValue("off");
    expect(await resolveQueueLiveFallback()).toBe(false);
  });

  it("keeps the fallback for unknown values", async () => {
    mocks.getOptionalEnvValue.mockResolvedValue("no");
    expect(await resolveQueueLiveFallback()).toBe(true);
  });
});
