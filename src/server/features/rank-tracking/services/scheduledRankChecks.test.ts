import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDueConfigsWithOrganization: vi.fn(),
  getKeywordCountForConfig: vi.fn(),
  updateConfig: vi.fn(),
  customerHasPaidPlan: vi.fn(),
  isHostedServerAuthMode: vi.fn(),
  beginRankCheckRun: vi.fn(),
  computeNextCheckAt: vi.fn(
    (_interval: string, previous: string | null | undefined) =>
      previous === "2026-07-01T00:00:00.000Z"
        ? "2026-07-02T00:00:00.000Z"
        : "2026-07-08T00:00:00.000Z",
  ),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({ RankTrackingRepository: mocks }),
);
vi.mock("@/server/billing/subscription", () => ({
  customerHasPaidPlan: mocks.customerHasPaidPlan,
}));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: mocks.isHostedServerAuthMode,
}));
vi.mock("@/server/features/rank-tracking/services/rankCheckRunGuards", () => ({
  beginRankCheckRun: mocks.beginRankCheckRun,
}));
vi.mock("@/shared/rank-tracking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/rank-tracking")>();
  return {
    ...actual,
    computeNextCheckAt: mocks.computeNextCheckAt,
  };
});

const unpaidConfig = {
  id: "config_unpaid",
  projectId: "project_1",
  domain: "free.example",
  locationCode: 2840,
  languageCode: "en",
  locationName: null,
  devices: "both" as const,
  serpDepth: 20,
  scheduleInterval: "daily" as const,
  nextCheckAt: "2026-07-01T00:00:00.000Z",
  organizationId: "org_free",
};

const paidConfig = {
  ...unpaidConfig,
  id: "config_paid",
  domain: "paid.example",
  organizationId: "org_paid",
  nextCheckAt: "2026-07-01T12:00:00.000Z",
};

describe("runScheduledRankChecks", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.computeNextCheckAt.mockImplementation(
      (_interval: string, previous: string | null | undefined) =>
        previous === "2026-07-01T00:00:00.000Z"
          ? "2026-07-02T00:00:00.000Z"
          : "2026-07-08T00:00:00.000Z",
    );
    mocks.isHostedServerAuthMode.mockResolvedValue(true);
    mocks.updateConfig.mockResolvedValue(undefined);
    mocks.beginRankCheckRun.mockResolvedValue({ ok: true, runId: "run_1" });
  });

  it("advances nextCheckAt for unpaid orgs so they cannot starve the due queue", async () => {
    mocks.getDueConfigsWithOrganization.mockResolvedValue([
      unpaidConfig,
      paidConfig,
    ]);
    mocks.customerHasPaidPlan.mockImplementation(
      async (orgId: string) => orgId === "org_paid",
    );
    mocks.getKeywordCountForConfig.mockResolvedValue(3);

    const { runScheduledRankChecks } = await import("./scheduledRankChecks");
    await runScheduledRankChecks({
      RANK_CHECK_WORKFLOW: {},
    } as Env);

    expect(mocks.updateConfig).toHaveBeenCalledWith(
      "config_unpaid",
      "project_1",
      { nextCheckAt: "2026-07-02T00:00:00.000Z" },
    );
    expect(mocks.beginRankCheckRun).toHaveBeenCalledTimes(1);
    expect(mocks.beginRankCheckRun).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ id: "config_paid" }),
      }),
    );
  });
});
