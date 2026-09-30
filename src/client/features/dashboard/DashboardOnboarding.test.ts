import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DashboardActivation } from "@/server/features/dashboard/services/DashboardService";
import { DashboardOnboarding } from "./DashboardOnboarding";
import { setupSteps } from "./dashboardSteps";

vi.mock("@/serverFunctions/dashboard", () => ({
  setDashboardStepDismissed: vi.fn(),
}));
vi.mock("@/client/features/integrations/googleLinkError", () => ({
  getGoogleLinkError: () => null,
}));
vi.mock("./DashboardSetupAction", () => ({
  DashboardSetupAction: () => createElement("div", null, "Connection setup"),
}));

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

afterEach(() => vi.unstubAllGlobals());

describe("dashboard onboarding visibility", () => {
  it("opens Search Console setup on the successful OAuth return URL", () => {
    vi.stubGlobal("window", {
      location: new URL("https://app.openseo.so/p/project-a#connect-gsc"),
    });
    const markup = renderChecklist();
    expect(markup).toContain('aria-expanded="true" aria-controls="setup-gsc"');
    expect(markup).toContain("Connection setup");
  });

  it("keeps setup actions collapsed on an ordinary dashboard visit", () => {
    vi.stubGlobal("window", {
      location: new URL("https://app.openseo.so/p/project-a"),
    });
    const markup = renderChecklist();
    expect(markup).not.toContain("Connection setup");
    expect(markup).toContain('id="setup-gsc" hidden=""');
  });

  it("renders nothing once every step is completed or skipped", () => {
    expect(
      renderChecklist({
        ...fresh,
        domain: "example.com",
        dismissedSteps: setupSteps.map((step) => step.id),
      }),
    ).toBe("");
  });
});
