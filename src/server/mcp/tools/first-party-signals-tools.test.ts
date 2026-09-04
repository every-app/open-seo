import { beforeEach, describe, expect, it, vi } from "vitest";
import { objectSchema } from "@/server/mcp/output-schemas";
import { makeToolContext } from "./tool-test-support";
import {
  getFirstPartyFunnelTool,
  getFirstPartyLandingConversionsTool,
} from "./first-party-signals-tools";

vi.mock("cloudflare:workers", () => ({ env: {} }));

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getFunnel: vi.fn(),
  getLandingConversions: vi.fn(),
}));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

vi.mock(
  "@/server/features/first-party-signals/FirstPartySignalsService",
  () => ({
    FirstPartySignalsService: {
      getFunnel: mocks.getFunnel,
      getLandingConversions: mocks.getLandingConversions,
    },
  }),
);

const context = makeToolContext({ baseUrl: "https://app.example.com" });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProjectForOrganization.mockResolvedValue({ id: "project_1" });
});

describe("first-party signal MCP tools", () => {
  it("returns project-scoped funnel data with a valid output schema", async () => {
    mocks.getFunnel.mockResolvedValue({
      status: "ok",
      period: {
        startDate: "2026-09-01",
        endDate: "2026-09-04",
        timezone: "UTC",
      },
      observedAt: "2026-09-04",
      receivedAt: "2026-09-04T12:00:00.000Z",
      totals: {
        searchStarted: 10,
        searchCompleted: 8,
        searchNoResults: 1,
        registrationsCompleted: 3,
        checkoutStarted: 2,
        paymentsCompleted: 1,
      },
      conversion: {
        searchCompletionRate: 0.8,
        noResultRate: 0.125,
        registrationPerSearchRate: 0.375,
        checkoutPerSearchRate: 0.25,
        paymentPerCheckoutRate: 0.5,
      },
      privacy: "Aggregate counts only.",
    });
    const result = await getFirstPartyFunnelTool.handler(
      {
        projectId: "project_1",
        startDate: "2026-09-01",
        endDate: "2026-09-04",
      },
      context,
    );
    expect(mocks.getProjectForOrganization).toHaveBeenCalledWith(
      "org_123",
      "project_1",
    );
    expect(result.structuredContent?.status).toBe("ok");
    await expect(
      objectSchema(getFirstPartyFunnelTool.config.outputSchema).safeParseAsync(
        result.structuredContent,
      ),
    ).resolves.toMatchObject({ success: true });
  });

  it("returns landing rows through the shared MCP and SAM definition", async () => {
    mocks.getLandingConversions.mockResolvedValue({
      status: "ok",
      period: {
        startDate: "2026-09-01",
        endDate: "2026-09-04",
        timezone: "UTC",
      },
      rows: [
        {
          landingPath: "/pricing",
          searchStarted: 10,
          searchCompleted: 8,
          searchNoResults: 1,
          registrationsCompleted: 3,
          checkoutStarted: 2,
          paymentsCompleted: 1,
          conversion: {
            searchCompletionRate: 0.8,
            noResultRate: 0.125,
            registrationPerSearchRate: 0.375,
            checkoutPerSearchRate: 0.25,
            paymentPerCheckoutRate: 0.5,
          },
        },
      ],
      privacy: "Aggregate counts only.",
    });
    const result = await getFirstPartyLandingConversionsTool.handler(
      {
        projectId: "project_1",
        startDate: "2026-09-01",
        endDate: "2026-09-04",
        limit: 50,
      },
      context,
    );
    const text = result.content[0];
    expect(text.type === "text" && text.text).toContain("/pricing");
    await expect(
      objectSchema(
        getFirstPartyLandingConversionsTool.config.outputSchema,
      ).safeParseAsync(result.structuredContent),
    ).resolves.toMatchObject({ success: true });
  });
});
