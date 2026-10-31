import { expect, it, vi } from "vitest";
import { AppError } from "@/server/lib/errors";
import { FeatureFlag } from "@/server/lib/featureFlags";
import { captureServerError, isFeatureFlagOn } from "@/server/lib/posthog";

const { captureExceptionImmediate, evaluateFlags } = vi.hoisted(() => ({
  captureExceptionImmediate: vi.fn<(error: Error) => Promise<void>>(),
  evaluateFlags: vi.fn<() => Promise<{ isEnabled: () => boolean }>>(),
}));
vi.mock("cloudflare:workers", () => ({
  env: { POSTHOG_PUBLIC_KEY: "phc_test", POSTHOG_HOST: "https://ph.test" },
}));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: async () => true,
}));
vi.mock("posthog-node", () => ({
  PostHog: class {
    captureExceptionImmediate = captureExceptionImmediate;
    evaluateFlags = evaluateFlags;
    shutdown = async () => {};
  },
}));

it("reports errors without their messages, which can quote customer content", async () => {
  const error = new AppError(
    "INTERNAL_ERROR",
    "Failed query: insert into keywords\nparams: coffee at home,acme.test",
  );
  error.cause = new Error("acme.test refused the connection");

  await captureServerError(error);

  const sent = captureExceptionImmediate.mock.calls[0]?.[0];
  expect(sent?.stack).toMatch(/^AppError: INTERNAL_ERROR\n\s+at /);
  expect(sent?.stack).not.toMatch(/coffee|acme/);
  const cause = sent?.cause instanceof Error ? sent.cause : undefined;
  expect(cause?.message).toBe("");
  expect(cause?.stack).not.toContain("acme");
});

it("reads a feature flag as off when PostHog can't be reached", async () => {
  evaluateFlags.mockRejectedValue(new Error("fetch failed"));
  vi.spyOn(console, "error").mockImplementation(() => {});

  await expect(
    isFeatureFlagOn(FeatureFlag.PauseScheduledRankChecks),
  ).resolves.toBe(false);
});
