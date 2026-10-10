import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { DashboardActivation } from "@/server/features/dashboard/services/DashboardService";
import { DashboardOnboarding } from "./DashboardOnboarding";
import { setupSteps } from "./dashboardSteps";

vi.mock("@/serverFunctions/dashboard", () => ({
  setDashboardStepDismissed: vi.fn(),
}));
vi.mock("./DashboardSetupAction", () => ({
  DashboardSetupAction: () => createElement("div", null, "Connection setup"),
}));

const fresh: DashboardActivation = {
  domain: null,
  ga4: { connected: false, propertyDisplayName: null, cardDismissedAt: null },
  gsc: { connected: false, siteUrl: null },
  bing: { connected: false, siteUrl: null },
  mcp: { authorizedAt: null, firstToolCallAt: null, cardDismissedAt: null },
  competitorClickedAt: null,
  keywordsClickedAt: null,
  hasAudit: false,
  hasMultipleProjects: false,
  hasTeammate: false,
  dismissedSteps: [],
};

function renderChecklist(activation = fresh) {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(DashboardOnboarding, {
        projectId: "project-a",
        activation,
      }),
    ),
  );
}

describe("dashboard onboarding visibility", () => {
  it("keeps skipped steps available to restore", () => {
    const markup = renderChecklist({
      ...fresh,
      dismissedSteps: setupSteps.map((step) => step.id),
    });
    expect(markup).toContain("saved for later");
  });

  it("renders nothing once every step is complete", () => {
    expect(
      renderChecklist({
        ...fresh,
        competitorClickedAt: "2026-09-28",
        keywordsClickedAt: "2026-09-28",
        hasAudit: true,
        mcp: { ...fresh.mcp, authorizedAt: "2026-09-28" },
        hasTeammate: true,
        hasMultipleProjects: true,
      }),
    ).toBe("");
  });
});
