import { describe, expect, it } from "vitest";
import type { DashboardActivation } from "@/server/features/dashboard/services/DashboardService";
import { getStepStatus, getVisibleSteps, setupSteps } from "./dashboardSteps";

const fresh: DashboardActivation = {
  domain: null,
  ga4: { connected: false, propertyDisplayName: null, cardDismissedAt: null },
  gsc: { connected: false, siteUrl: null },
  mcp: { authorizedAt: null, firstToolCallAt: null, cardDismissed: false },
  competitorResearchedAt: null,
  keywordsResearchedAt: null,
  hasAudit: false,
  hasSkillReport: false,
  hasMultipleProjects: false,
  hasTeammate: false,
  dismissedSteps: [],
};

describe("dashboard checklist", () => {
  it("saves skipped steps for later, but completes dismissed skills, team, and project steps", () => {
    const skipped = {
      ...fresh,
      dismissedSteps: ["competitor", "mcp", "skills", "team", "project"],
    };
    expect(getStepStatus(skipped, "competitor")).toBe("skipped");
    expect(getStepStatus(skipped, "mcp")).toBe("skipped");
    expect(getStepStatus(skipped, "skills")).toBe("done");
    expect(getStepStatus(skipped, "team")).toBe("done");
    expect(getStepStatus(skipped, "project")).toBe("done");
  });

  it("only includes the skills step after an agent is connected", () => {
    expect(getVisibleSteps(fresh, true).map((step) => step.id)).not.toContain(
      "skills",
    );
    expect(
      getVisibleSteps(
        { ...fresh, mcp: { ...fresh.mcp, authorizedAt: "2026-09-05" } },
        true,
      ).map((step) => step.id),
    ).toContain("skills");
    expect(
      getVisibleSteps(
        { ...fresh, mcp: { ...fresh.mcp, firstToolCallAt: "2026-09-05" } },
        true,
      ).map((step) => step.id),
    ).toContain("skills");
  });

  it("recognizes setup completed elsewhere even after skipping it", () => {
    const complete: DashboardActivation = {
      ...fresh,
      hasMultipleProjects: true,
      hasTeammate: true,
      hasAudit: true,
      hasSkillReport: true,
      competitorResearchedAt: "2026-09-05",
      keywordsResearchedAt: "2026-09-05",
      mcp: { ...fresh.mcp, firstToolCallAt: "2026-09-05" },
      dismissedSteps: setupSteps.map((step) => step.id),
    };
    expect(
      setupSteps.every((step) => getStepStatus(complete, step.id) === "done"),
    ).toBe(true);
    expect(getStepStatus({ ...fresh, hasSkillReport: true }, "skills")).toBe(
      "done",
    );
  });
});
