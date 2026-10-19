import { describe, expect, it, vi } from "vitest";
import { resolveNextCheckAt } from "./configSchedule";

const mocks = vi.hoisted(() => ({ isHostedServerAuthMode: vi.fn() }));

vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: mocks.isHostedServerAuthMode,
}));
// Pinned on, so the test holds whether or not upstream's pause is live.
vi.mock("@/shared/rank-tracking-pause", () => ({
  SCHEDULED_RANK_CHECKS_PAUSED: true,
}));

// Fork: this deployment is self-hosted and runs its rank checks on a
// schedule, so upstream's hosted-platform pause must never reach it.
describe("resolveNextCheckAt under the hosted pause", () => {
  it("still schedules a self-hosted install and pauses only the hosted one", async () => {
    mocks.isHostedServerAuthMode.mockResolvedValue(false);
    await expect(resolveNextCheckAt("weekly", undefined)).resolves.toEqual(
      expect.any(String),
    );

    mocks.isHostedServerAuthMode.mockResolvedValue(true);
    await expect(resolveNextCheckAt("weekly", undefined)).rejects.toMatchObject(
      { code: "VALIDATION_ERROR" },
    );
  });
});
