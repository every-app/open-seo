import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasPagespeedApiKey: vi.fn<() => Promise<boolean>>(),
  listDueForSweep: vi.fn(),
  updateNextRunAt: vi.fn(),
  isHostedServerAuthMode: vi.fn<() => Promise<boolean>>(),
  customerHasPaidPlan: vi.fn<() => Promise<boolean>>(),
  create: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/pagespeedClient", () => ({
  hasPagespeedApiKey: mocks.hasPagespeedApiKey,
}));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: mocks.isHostedServerAuthMode,
}));
vi.mock("@/server/billing/subscription", () => ({
  customerHasPaidPlan: mocks.customerHasPaidPlan,
}));
vi.mock(
  "@/server/features/pagespeed/repositories/PagespeedUrlRepository",
  () => ({
    PagespeedUrlRepository: {
      listDueForSweep: mocks.listDueForSweep,
      updateNextRunAt: mocks.updateNextRunAt,
    },
  }),
);

/** The cron takes just the workflow binding, so no Env fabrication needed. */
const workflow = { create: mocks.create };

function url(overrides: {
  id: string;
  projectId: string;
  organizationId?: string;
  nextRunAt?: string | null;
}) {
  return {
    organizationId: "org_1",
    nextRunAt: null,
    ...overrides,
  };
}

describe("runScheduledPagespeedRuns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasPagespeedApiKey.mockResolvedValue(true);
    mocks.isHostedServerAuthMode.mockResolvedValue(false);
    mocks.customerHasPaidPlan.mockResolvedValue(true);
    mocks.listDueForSweep.mockResolvedValue([]);
  });

  it("does nothing without an API key, without even querying", async () => {
    mocks.hasPagespeedApiKey.mockResolvedValue(false);
    const { runScheduledPagespeedRuns } =
      await import("./scheduledPagespeedRuns");

    await runScheduledPagespeedRuns(workflow);

    expect(mocks.listDueForSweep).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("starts one workflow per project, not per URL", async () => {
    mocks.listDueForSweep.mockResolvedValue([
      url({ id: "u1", projectId: "p1" }),
      url({ id: "u2", projectId: "p1" }),
      url({ id: "u3", projectId: "p2" }),
    ]);
    const { runScheduledPagespeedRuns } =
      await import("./scheduledPagespeedRuns");

    await runScheduledPagespeedRuns(workflow);

    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.create).toHaveBeenCalledWith({
      params: { projectId: "p1", urlIds: ["u1", "u2"] },
    });
    expect(mocks.create).toHaveBeenCalledWith({
      params: { projectId: "p2", urlIds: ["u3"] },
    });
  });

  it("advances every URL's schedule before dispatching", async () => {
    mocks.listDueForSweep.mockResolvedValue([
      url({ id: "u1", projectId: "p1" }),
      url({ id: "u2", projectId: "p1" }),
    ]);
    const order: string[] = [];
    mocks.updateNextRunAt.mockImplementation((id: string) => {
      order.push(`advance:${id}`);
      return Promise.resolve();
    });
    mocks.create.mockImplementation(() => {
      order.push("create");
      return Promise.resolve();
    });
    const { runScheduledPagespeedRuns } =
      await import("./scheduledPagespeedRuns");

    await runScheduledPagespeedRuns(workflow);

    expect(order).toEqual(["advance:u1", "advance:u2", "create"]);
  });

  it("keeps sweeping other projects when one fails to start", async () => {
    mocks.listDueForSweep.mockResolvedValue([
      url({ id: "u1", projectId: "p1" }),
      url({ id: "u2", projectId: "p2" }),
    ]);
    mocks.create.mockRejectedValueOnce(new Error("workflow quota"));
    const { runScheduledPagespeedRuns } =
      await import("./scheduledPagespeedRuns");

    await runScheduledPagespeedRuns(workflow);

    expect(mocks.create).toHaveBeenCalledTimes(2);
  });

  it("skips unpaid organizations on hosted only", async () => {
    mocks.listDueForSweep.mockResolvedValue([
      url({ id: "u1", projectId: "p1", organizationId: "org_free" }),
    ]);
    mocks.isHostedServerAuthMode.mockResolvedValue(true);
    mocks.customerHasPaidPlan.mockResolvedValue(false);
    const { runScheduledPagespeedRuns } =
      await import("./scheduledPagespeedRuns");

    await runScheduledPagespeedRuns(workflow);

    expect(mocks.create).not.toHaveBeenCalled();
    // The schedule must not advance for a project that was never swept.
    expect(mocks.updateNextRunAt).not.toHaveBeenCalled();
  });

  it("does not gate self-hosted instances on billing", async () => {
    mocks.listDueForSweep.mockResolvedValue([
      url({ id: "u1", projectId: "p1" }),
    ]);
    mocks.isHostedServerAuthMode.mockResolvedValue(false);
    mocks.customerHasPaidPlan.mockResolvedValue(false);
    const { runScheduledPagespeedRuns } =
      await import("./scheduledPagespeedRuns");

    await runScheduledPagespeedRuns(workflow);

    expect(mocks.customerHasPaidPlan).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});
