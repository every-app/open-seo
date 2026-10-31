import { describe, expect, it } from "vitest";
import type { DashboardActivation } from "@/server/features/dashboard/services/DashboardService";
import { getStepStatus, setupSteps } from "./dashboardSteps";

const fresh: DashboardActivation = {
  domain: null,
  ga4: { connected: false, propertyDisplayName: null, cardDismissedAt: null },
  gsc: { connected: false, siteUrl: null },
  umami: { connected: false, websiteName: null },
  mcp: { authorizedAt: null, firstToolCallAt: null, cardDismissed: false },
  competitorResearchedAt: null,
  keywordsResearchedAt: null,
  hasAudit: false,
  hasMultipleProjects: false,
  hasTeammate: false,
  dismissedSteps: [],
};

describe("dashboard checklist", () => {
  it("saves skipped steps for later, but completes skipped team and project steps", () => {
    const skipped = {
      ...fresh,
      dismissedSteps: ["competitor", "mcp", "team", "project"],
    };
    expect(getStepStatus(skipped, "competitor")).toBe("skipped");
    expect(getStepStatus(skipped, "mcp")).toBe("skipped");
    expect(getStepStatus(skipped, "team")).toBe("done");
    expect(getStepStatus(skipped, "project")).toBe("done");
  });
  it("recognizes setup completed elsewhere even after skipping it", () => {
    const complete: DashboardActivation = {
      ...fresh,
      hasMultipleProjects: true,
      hasTeammate: true,
      hasAudit: true,
      competitorResearchedAt: "2026-09-05",
      keywordsResearchedAt: "2026-09-05",
      mcp: { ...fresh.mcp, firstToolCallAt: "2026-09-05" },
      dismissedSteps: setupSteps.map((step) => step.id),
    };
    expect(
      setupSteps.every((step) => getStepStatus(complete, step.id) === "done"),
    ).toBe(true);
  });
});
