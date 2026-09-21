import { describe, expect, it } from "vitest";
import type { DashboardActivation } from "@/server/features/dashboard/services/DashboardService";
import { getStepStatus, setupSteps } from "./dashboardSteps";

const fresh: DashboardActivation = {
  domain: null,
  ga4: { connected: false, propertyDisplayName: null, cardDismissedAt: null },
  gsc: { connected: false, siteUrl: null },
  googleAds: { connected: false, customerDescriptiveName: null },
  mcp: { authorizedAt: null, firstToolCallAt: null, cardDismissedAt: null },
  competitorClickedAt: null,
  hasMultipleProjects: false,
  hasTeammate: false,
  dismissedSteps: [],
};

describe("dashboard checklist", () => {
  it("starts with the website and has no SAM chat step", () => {
    expect(setupSteps.map((step) => step.id)).toEqual([
      "domain",
      "project",
      "competitor",
      "mcp",
      "gsc",
      "team",
    ]);
    expect(
      setupSteps.every((step) => getStepStatus(fresh, step.id) === "todo"),
    ).toBe(true);
  });
  it("does not count skipped steps as completed", () => {
    expect(
      getStepStatus({ ...fresh, dismissedSteps: ["project"] }, "project"),
    ).toBe("skipped");
    expect(
      getStepStatus(
        { ...fresh, mcp: { ...fresh.mcp, cardDismissedAt: "2026-09-05" } },
        "mcp",
      ),
    ).toBe("skipped");
  });
  it("recognizes setup completed elsewhere even after skipping it", () => {
    const complete: DashboardActivation = {
      ...fresh,
      domain: "example.com",
      hasMultipleProjects: true,
      hasTeammate: true,
      competitorClickedAt: "2026-09-05",
      gsc: { connected: true, siteUrl: "sc-domain:example.com" },
      mcp: { ...fresh.mcp, firstToolCallAt: "2026-09-05" },
      dismissedSteps: setupSteps.map((step) => step.id),
    };
    expect(
      setupSteps.every((step) => getStepStatus(complete, step.id) === "done"),
    ).toBe(true);
  });
  it("makes disconnected and no-longer-completed steps available again", () => {
    expect(getStepStatus(fresh, "gsc")).toBe("todo");
    expect(getStepStatus(fresh, "team")).toBe("todo");
  });
});
