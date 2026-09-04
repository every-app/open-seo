import { beforeEach, describe, expect, it, vi } from "vitest";
import { FirstPartyReportingService } from "./FirstPartyReportingService";

const mocks = vi.hoisted(() => ({
  getFunnel: vi.fn(),
  getLandingConversions: vi.fn(),
}));

vi.mock("./FirstPartyReportingRepository", () => ({
  FirstPartyReportingRepository: mocks,
}));

beforeEach(() => vi.clearAllMocks());

describe("FirstPartyReportingService", () => {
  it("returns no_data rather than invented zeroes when no snapshot exists", async () => {
    mocks.getFunnel.mockResolvedValue({
      searchStarted: 0,
      searchCompleted: 0,
      searchNoResults: 0,
      registrationsCompleted: 0,
      checkoutStarted: 0,
      paymentsCompleted: 0,
      observedAt: null,
      receivedAt: null,
    });

    await expect(
      FirstPartyReportingService.getFunnel({
        projectId: "project_1",
        startDate: "2026-09-01",
        endDate: "2026-09-04",
      }),
    ).resolves.toMatchObject({
      status: "no_data",
      totals: null,
      conversion: null,
    });
  });

  it("normalizes cross-dialect totals and computes explicit rates", async () => {
    mocks.getFunnel.mockResolvedValue({
      searchStarted: "10",
      searchCompleted: "8",
      searchNoResults: "2",
      registrationsCompleted: "4",
      checkoutStarted: "2",
      paymentsCompleted: "1",
      observedAt: "2026-09-04",
      receivedAt: "2026-09-04T12:00:00.000Z",
    });

    await expect(
      FirstPartyReportingService.getFunnel({
        projectId: "project_1",
        startDate: "2026-09-01",
        endDate: "2026-09-04",
      }),
    ).resolves.toMatchObject({
      status: "ok",
      totals: {
        searchStarted: 10,
        searchCompleted: 8,
        paymentsCompleted: 1,
      },
      conversion: {
        searchCompletionRate: 0.8,
        noResultRate: 0.25,
        paymentPerCheckoutRate: 0.5,
      },
    });
  });

  it("returns aggregate landing rows without user-level dimensions", async () => {
    mocks.getLandingConversions.mockResolvedValue([
      {
        landingPath: "/pricing",
        searchStarted: 20,
        searchCompleted: 10,
        searchNoResults: 1,
        registrationsCompleted: 5,
        checkoutStarted: 4,
        paymentsCompleted: 2,
      },
    ]);

    const result = await FirstPartyReportingService.getLandingConversions({
      projectId: "project_1",
      startDate: "2026-09-01",
      endDate: "2026-09-04",
      limit: 50,
    });
    expect(result.status).toBe("ok");
    expect(result.rows[0]).toEqual({
      landingPath: "/pricing",
      searchStarted: 20,
      searchCompleted: 10,
      searchNoResults: 1,
      registrationsCompleted: 5,
      checkoutStarted: 4,
      paymentsCompleted: 2,
      conversion: {
        searchCompletionRate: 0.5,
        noResultRate: 0.1,
        registrationPerSearchRate: 0.5,
        checkoutPerSearchRate: 0.4,
        paymentPerCheckoutRate: 0.5,
      },
    });
  });
});
