import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClarityApiError } from "@/server/lib/clarityErrors";
import { ClarityService } from "@/server/features/clarity/services/ClarityService";
import type * as ClarityClientModule from "@/server/lib/clarityClient";

const mocks = vi.hoisted(() => ({
  getConnectionByProjectId: vi.fn(),
  upsertConnectionWithOverview: vi.fn(),
  getCachedReport: vi.fn(),
  upsertCachedReportIfCurrent: vi.fn(),
  claimReportRefresh: vi.fn(),
  releaseReportRefresh: vi.fn(),
  hasActiveReportRefresh: vi.fn(),
  recordReportRefreshFailure: vi.fn(),
  getReportRefreshState: vi.fn(),
  getConnectionRefreshFailure: vi.fn(),
  disconnect: vi.fn(),
  isConfigured: vi.fn(),
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  fetchClarityReport: vi.fn(),
}));

vi.mock("@/server/features/clarity/repositories/ClarityRepository", () => ({
  ClarityRepository: mocks,
}));
vi.mock("@/server/features/clarity/services/ClarityTokenVault", () => ({
  ClarityTokenVault: {
    isConfigured: mocks.isConfigured,
    encrypt: mocks.encrypt,
    decrypt: mocks.decrypt,
  },
}));
vi.mock("@/server/lib/clarityClient", async (importOriginal) => ({
  ...(await importOriginal<typeof ClarityClientModule>()),
  fetchClarityReport: mocks.fetchClarityReport,
}));

const metrics = [
  {
    metricName: "Traffic",
    information: [{ totalSessionCount: "12" }],
  },
];
const connection = {
  id: "clarity-1",
  projectId: "project-1",
  organizationId: "organization-1",
  encryptedApiToken: "encrypted-token",
  tokenHint: "••••cret",
  connectedByUserId: "user-1",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime("2026-09-03T12:00:00.000Z");
  vi.clearAllMocks();
  mocks.getConnectionByProjectId.mockResolvedValue(connection);
  mocks.getCachedReport.mockResolvedValue(null);
  mocks.upsertCachedReportIfCurrent.mockResolvedValue(true);
  mocks.claimReportRefresh.mockResolvedValue("lease-1");
  mocks.releaseReportRefresh.mockResolvedValue(undefined);
  mocks.hasActiveReportRefresh.mockResolvedValue(true);
  mocks.recordReportRefreshFailure.mockResolvedValue(true);
  mocks.getReportRefreshState.mockResolvedValue(null);
  mocks.getConnectionRefreshFailure.mockResolvedValue(null);
  mocks.isConfigured.mockResolvedValue(true);
  mocks.encrypt.mockResolvedValue("encrypted-token");
  mocks.decrypt.mockResolvedValue("raw-api-token");
  mocks.fetchClarityReport.mockResolvedValue(metrics);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ClarityService.connect", () => {
  it("validates before persisting and stores only encrypted token material", async () => {
    const rawToken = "raw-api-token-with-secret-payload";
    await expect(
      ClarityService.connect({
        projectId: "project-1",
        organizationId: "organization-1",
        userId: "user-1",
        apiToken: `  ${rawToken}  `,
      }),
    ).resolves.toEqual({ connected: true, tokenHint: "••••load" });

    expect(mocks.fetchClarityReport).toHaveBeenCalledWith({
      apiToken: rawToken,
      numOfDays: 3,
    });
    expect(mocks.encrypt).toHaveBeenCalledWith(rawToken);
    expect(mocks.upsertConnectionWithOverview).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        organizationId: "organization-1",
        encryptedApiToken: "encrypted-token",
        tokenHint: "••••load",
      }),
    );
    expect(
      JSON.stringify(mocks.upsertConnectionWithOverview.mock.calls[0]),
    ).not.toContain(rawToken);
  });

  it("fails closed and persists nothing when Clarity rejects the token", async () => {
    mocks.fetchClarityReport.mockRejectedValue(
      new ClarityApiError(401, "unauthorized"),
    );

    await expect(
      ClarityService.connect({
        projectId: "project-1",
        organizationId: "organization-1",
        userId: "user-1",
        apiToken: "bad-token",
      }),
    ).rejects.toMatchObject({ code: "clarity_reconnect_required" });
    expect(mocks.encrypt).toHaveBeenCalledWith("bad-token");
    expect(mocks.upsertConnectionWithOverview).not.toHaveBeenCalled();
  });

  it("does not spend provider quota when token encryption is unavailable", async () => {
    mocks.encrypt.mockRejectedValue(new Error("secret not configured"));

    await expect(
      ClarityService.connect({
        projectId: "project-1",
        organizationId: "organization-1",
        userId: "user-1",
        apiToken: "raw-api-token-with-secret-payload",
      }),
    ).rejects.toMatchObject({ code: "clarity_storage_unavailable" });

    expect(mocks.fetchClarityReport).not.toHaveBeenCalled();
    expect(mocks.upsertConnectionWithOverview).not.toHaveBeenCalled();
  });

  it("does not encrypt or spend provider quota when encryption is not configured", async () => {
    mocks.isConfigured.mockResolvedValue(false);

    await expect(
      ClarityService.connect({
        projectId: "project-1",
        organizationId: "organization-1",
        userId: "user-1",
        apiToken: "raw-api-token-with-secret-payload",
      }),
    ).rejects.toMatchObject({ code: "clarity_setup_required" });

    expect(mocks.encrypt).not.toHaveBeenCalled();
    expect(mocks.fetchClarityReport).not.toHaveBeenCalled();
    expect(mocks.upsertConnectionWithOverview).not.toHaveBeenCalled();
  });
});

describe("ClarityService.getReport", () => {
  it("uses a fresh project-scoped cache without decrypting or calling Clarity", async () => {
    mocks.getCachedReport.mockResolvedValue({
      id: "cache-1",
      projectId: "project-1",
      reportKind: "url",
      numOfDays: 3,
      responseJson: JSON.stringify(metrics),
      fetchedAt: "2026-09-03T11:00:00.000Z",
    });

    const result = await ClarityService.getReport({
      projectId: "project-1",
      reportKind: "url",
      numOfDays: 3,
    });

    expect(mocks.getConnectionByProjectId).toHaveBeenCalledWith("project-1");
    expect(mocks.getCachedReport).toHaveBeenCalledWith({
      projectId: "project-1",
      reportKind: "url",
      numOfDays: 3,
      connectionId: "clarity-1",
    });
    expect(result.cache).toMatchObject({ hit: true, stale: false });
    expect(mocks.decrypt).not.toHaveBeenCalled();
    expect(mocks.fetchClarityReport).not.toHaveBeenCalled();
  });

  it("serves stale cached data when the provider quota is exhausted", async () => {
    mocks.getCachedReport.mockResolvedValue({
      id: "cache-1",
      projectId: "project-1",
      reportKind: "overview",
      numOfDays: 3,
      responseJson: JSON.stringify(metrics),
      fetchedAt: "2026-09-01T11:00:00.000Z",
    });
    mocks.fetchClarityReport.mockRejectedValue(
      new ClarityApiError(429, "rate limited", 60),
    );

    const result = await ClarityService.getReport({
      projectId: "project-1",
      reportKind: "overview",
      numOfDays: 3,
    });

    expect(result.cache).toMatchObject({ hit: true, stale: true });
    expect(result.warnings).toContain("stale_cache_served");
    expect(mocks.upsertCachedReportIfCurrent).not.toHaveBeenCalled();
  });

  it("requires reconnection on 401 instead of hiding it behind stale data", async () => {
    mocks.getCachedReport.mockResolvedValue({
      id: "cache-1",
      projectId: "project-1",
      reportKind: "overview",
      numOfDays: 3,
      responseJson: JSON.stringify(metrics),
      fetchedAt: "2026-09-01T11:00:00.000Z",
    });
    mocks.fetchClarityReport.mockRejectedValue(
      new ClarityApiError(401, "unauthorized"),
    );

    await expect(
      ClarityService.getReport({
        projectId: "project-1",
        reportKind: "overview",
        numOfDays: 3,
      }),
    ).rejects.toMatchObject({ code: "clarity_reconnect_required" });
  });

  it("retains the refresh lease when recording a provider cooldown fails", async () => {
    mocks.fetchClarityReport.mockRejectedValue(
      new ClarityApiError(429, "rate limited", 60),
    );
    mocks.recordReportRefreshFailure.mockRejectedValue(
      new Error("database unavailable"),
    );

    await expect(
      ClarityService.getReport({
        projectId: "project-1",
        reportKind: "overview",
        numOfDays: 3,
      }),
    ).rejects.toMatchObject({ code: "clarity_rate_limited" });

    expect(mocks.recordReportRefreshFailure).toHaveBeenCalledTimes(1);
    expect(mocks.releaseReportRefresh).not.toHaveBeenCalled();
  });

  it("returns not-connected without attempting to decrypt", async () => {
    mocks.getConnectionByProjectId.mockResolvedValue(null);

    await expect(
      ClarityService.getReport({
        projectId: "foreign-project",
        reportKind: "overview",
        numOfDays: 3,
      }),
    ).rejects.toMatchObject({ code: "clarity_not_connected" });
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });

  it("stops joining when a concurrent refresh lease disappears", async () => {
    mocks.claimReportRefresh.mockResolvedValue(null);
    mocks.getReportRefreshState.mockResolvedValue(null);
    mocks.getConnectionRefreshFailure.mockResolvedValue(null);

    const reportPromise = ClarityService.getReport({
      projectId: "project-1",
      reportKind: "overview",
      numOfDays: 3,
    });
    const expectation = expect(reportPromise).rejects.toMatchObject({
      code: "clarity_upstream_unavailable",
      retryAfterSeconds: 2,
    });
    await vi.advanceTimersByTimeAsync(2_000);
    await expectation;

    expect(mocks.claimReportRefresh).toHaveBeenCalledTimes(1);
    expect(mocks.fetchClarityReport).not.toHaveBeenCalled();
  });
});
