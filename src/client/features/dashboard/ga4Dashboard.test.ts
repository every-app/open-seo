import { describe, expect, it } from "vitest";
import {
  formatGa4Count,
  formatGa4Rate,
  getGa4DashboardViewState,
  shouldShowDashboardGa4,
  type DashboardGa4Summary,
} from "./ga4Dashboard";

const summary: Extract<DashboardGa4Summary, { status: "ok" }> = {
  status: "ok",
  metrics: {
    visits: 120,
    conversions: 8,
    conversionRate: 0.0667,
    engagementRate: 0.625,
  },
  previous: { visits: 100, conversions: 5 },
  topPages: [{ title: "Home", path: "/", views: 80 }],
  topCities: [{ city: "Manila", visits: 30 }],
  limitedData: { summary: false, pages: false, cities: false },
};

describe("getGa4DashboardViewState", () => {
  it("stays hidden when the project is not connected", () => {
    expect(
      getGa4DashboardViewState({
        connected: false,
        isPending: true,
        isError: false,
        data: undefined,
      }),
    ).toEqual({ kind: "hidden" });
  });

  it("shows the two-card loading state for a connected project", () => {
    expect(
      getGa4DashboardViewState({
        connected: true,
        isPending: true,
        isError: false,
        data: undefined,
      }),
    ).toEqual({ kind: "loading" });
  });

  it("shows successful report data", () => {
    const state = getGa4DashboardViewState({
      connected: true,
      isPending: false,
      isError: false,
      data: summary,
    });

    expect(state).toMatchObject({
      kind: "success",
      summaryUnavailable: false,
      pagesEmpty: false,
      citiesEmpty: false,
      limited: false,
    });
    if (state.kind === "success") {
      expect(state.data.metrics).toEqual({
        visits: 120,
        conversions: 8,
        conversionRate: 0.0667,
        engagementRate: 0.625,
      });
      expect(state.data.previous).toEqual({ visits: 100, conversions: 5 });
      expect(state.data.topPages).toEqual([
        { title: "Home", path: "/", views: 80 },
      ]);
      expect(state.data.topCities).toEqual([{ city: "Manila", visits: 30 }]);
    }
  });

  it("collapses transport and expected report failures into one recovery state", () => {
    expect(
      getGa4DashboardViewState({
        connected: true,
        isPending: false,
        isError: true,
        data: undefined,
      }).kind,
    ).toBe("error");
    expect(
      getGa4DashboardViewState({
        connected: true,
        isPending: false,
        isError: false,
        data: {
          status: "error",
          error: {
            code: "ga4_reconnect_required",
            message: "Reconnect Google Analytics.",
          },
        },
      }),
    ).toEqual({
      kind: "error",
      message: "Google Analytics access needs to be reconnected.",
    });
  });

  it("preserves honest empty and restricted states", () => {
    const state = getGa4DashboardViewState({
      connected: true,
      isPending: false,
      isError: false,
      data: {
        ...summary,
        metrics: {
          visits: null,
          conversions: null,
          conversionRate: null,
          engagementRate: null,
        },
        topPages: [],
        topCities: [],
        limitedData: { summary: true, pages: true, cities: true },
      },
    });

    expect(state).toMatchObject({
      kind: "success",
      summaryUnavailable: true,
      pagesEmpty: true,
      citiesEmpty: true,
      limited: true,
    });
    expect(formatGa4Count(null)).toBe("—");
    expect(formatGa4Rate(null)).toBe("—");
  });
});

describe("shouldShowDashboardGa4", () => {
  it("shows connected and self-hosted projects during hosted OAuth approval", () => {
    expect(
      shouldShowDashboardGa4({
        hosted: true,
        oauthAppPending: true,
        connected: true,
        dismissedAt: "2026-01-01",
      }),
    ).toBe(true);
    expect(
      shouldShowDashboardGa4({
        hosted: false,
        oauthAppPending: true,
        connected: false,
        dismissedAt: "2026-01-01",
      }),
    ).toBe(true);
  });

  it("suppresses only hosted, unconnected projects while approval is pending", () => {
    expect(
      shouldShowDashboardGa4({
        hosted: true,
        oauthAppPending: true,
        connected: false,
        dismissedAt: null,
      }),
    ).toBe(false);
    expect(
      shouldShowDashboardGa4({
        hosted: true,
        oauthAppPending: false,
        connected: false,
        dismissedAt: null,
      }),
    ).toBe(true);
  });
});

describe("GA4 metric formatting", () => {
  it("formats GA4 rates as percentages", () => {
    expect(formatGa4Rate(0.625)).toBe("62.5%");
    expect(formatGa4Count(1200)).toBe("1,200");
  });
});
