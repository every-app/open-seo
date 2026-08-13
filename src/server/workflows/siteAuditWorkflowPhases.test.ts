import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  fetchLighthouseResultMock,
  selectLighthouseSampleMock,
  storeLighthouseResultMock,
  pgStepMock,
  getPagesForAuditMock,
  insertLighthouseResultsMock,
  updateAuditProgressMock,
} = vi.hoisted(() => ({
  fetchLighthouseResultMock: vi.fn(),
  selectLighthouseSampleMock: vi.fn(),
  storeLighthouseResultMock: vi.fn(),
  pgStepMock: vi.fn(),
  getPagesForAuditMock: vi.fn(),
  insertLighthouseResultsMock: vi.fn(),
  updateAuditProgressMock: vi.fn(),
}));

vi.mock("@/server/lib/audit/lighthouse", () => ({
  fetchLighthouseResult: fetchLighthouseResultMock,
  selectLighthouseSample: selectLighthouseSampleMock,
  storeLighthouseResult: storeLighthouseResultMock,
}));
vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: {
    getPagesForAudit: getPagesForAuditMock,
    insertLighthouseResults: insertLighthouseResultsMock,
    updateAuditProgress: updateAuditProgressMock,
  },
}));
vi.mock("@/server/features/audit/AuditScratchpad", () => ({
  getAuditScratchpad: vi.fn(),
}));
vi.mock("@/server/lib/audit/progress-kv", () => ({ AuditProgressKV: {} }));
vi.mock("@/server/lib/audit/discovery", () => ({
  discoverUrls: vi.fn(),
  parseRobotsTxt: vi.fn(),
}));
vi.mock("@/server/lib/audit/issues/multipage", () => ({
  runMultipageChecks: vi.fn(),
}));
vi.mock("@/server/lib/posthog", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/server/workflows/siteAuditWorkflowCrawl", () => ({
  runCrawlPhase: vi.fn(),
}));
vi.mock("@/server/workflows/pgStep", () => ({ pgStep: pgStepMock }));

import { runLighthousePhase } from "@/server/workflows/siteAuditWorkflowPhases";

describe("runLighthousePhase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPagesForAuditMock.mockResolvedValue([
      {
        id: "page-1",
        url: "https://example.com/",
        statusCode: 200,
      },
    ]);
    selectLighthouseSampleMock.mockReturnValue(["https://example.com/"]);
    fetchLighthouseResultMock.mockImplementation(
      async (_url: string, pageId: string, strategy: "mobile" | "desktop") => ({
        result: { pageId, strategy },
        payloadJson: "{}",
      }),
    );
    storeLighthouseResultMock.mockImplementation(
      async ({ fetched }: { fetched: { result: unknown } }) => fetched.result,
    );
    insertLighthouseResultsMock.mockResolvedValue(undefined);
    updateAuditProgressMock.mockResolvedValue(undefined);
  });

  it("does not replay paid calls when persistence retries", async () => {
    let persistenceAttempts = 0;
    let fetchRetryLimit: number | undefined;
    let persistenceRetryLimit: number | undefined;
    pgStepMock.mockImplementation(
      async (
        _step: unknown,
        name: string,
        config: { retries?: { limit?: number } },
        callback: () => Promise<unknown>,
      ) => {
        if (name === "lighthouse-fetch-1") {
          fetchRetryLimit = config.retries?.limit;
        }
        if (name === "lighthouse-persist-1") {
          persistenceRetryLimit = config.retries?.limit;
          persistenceAttempts += 1;
          try {
            return await callback();
          } catch (error) {
            if ((config.retries?.limit ?? 0) < 1) throw error;
            persistenceAttempts += 1;
            return callback();
          }
        }
        return callback();
      },
    );

    updateAuditProgressMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("progress unavailable"))
      .mockResolvedValueOnce(undefined);

    // pgStep is mocked above, so the opaque WorkflowStep object is never read.
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
    await runLighthousePhase({} as never, {
      auditId: "audit-1",
      workflowInstanceId: "workflow-1",
      billingCustomer: {
        userId: "user-1",
        userEmail: "test@example.com",
        organizationId: "org-1",
      },
      projectId: "project-1",
      startUrl: "https://example.com/",
      config: { maxPages: 50, lighthouseStrategy: "auto" },
    });

    expect(fetchLighthouseResultMock).toHaveBeenCalledTimes(2);
    expect(storeLighthouseResultMock).toHaveBeenCalledTimes(4);
    expect(insertLighthouseResultsMock).toHaveBeenCalledTimes(2);
    expect(persistenceAttempts).toBe(2);
    expect(fetchRetryLimit).toBe(0);
    expect(persistenceRetryLimit).toBe(3);
    expect(updateAuditProgressMock).toHaveBeenLastCalledWith(
      "audit-1",
      "workflow-1",
      { lighthouseCompleted: 2, lighthouseFailed: 0 },
    );
  });

  it("does not replay paid calls for a cached legacy batch", async () => {
    pgStepMock.mockImplementation(
      async (
        _step: unknown,
        name: string,
        _config: unknown,
        callback: () => Promise<unknown>,
      ) => {
        if (name === "lighthouse-batch-1") {
          return { completed: 2, failed: 0 };
        }
        return callback();
      },
    );

    // pgStep is mocked above, so the opaque WorkflowStep object is never read.
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
    await runLighthousePhase({} as never, {
      auditId: "audit-1",
      workflowInstanceId: "workflow-1",
      billingCustomer: {
        userId: "user-1",
        userEmail: "test@example.com",
        organizationId: "org-1",
      },
      projectId: "project-1",
      startUrl: "https://example.com/",
      config: { maxPages: 50, lighthouseStrategy: "auto" },
    });

    expect(pgStepMock).toHaveBeenCalledWith(
      {},
      "lighthouse-batch-1",
      expect.anything(),
      expect.any(Function),
    );
    expect(fetchLighthouseResultMock).not.toHaveBeenCalled();
  });
});
