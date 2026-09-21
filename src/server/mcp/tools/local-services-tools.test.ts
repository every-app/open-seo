import { beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleAdsReportError } from "@/server/lib/googleAdsErrors";
import {
  getLocalServicesLeadsTool,
  getLocalServicesPerformanceTool,
  provideLeadFeedbackTool,
} from "./local-services-tools";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  isHostedServerAuthMode: vi.fn(),
  hasSelfHostedGoogleOAuthConfig: vi.fn(),
  getPerformance: vi.fn(),
  listLeads: vi.fn(),
  provideLeadFeedback: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: mocks.isHostedServerAuthMode,
}));
vi.mock("@/server/features/google/oauth-config", () => ({
  hasSelfHostedGoogleOAuthConfig: mocks.hasSelfHostedGoogleOAuthConfig,
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock(
  "@/server/features/google-ads/services/LocalServicesReportingService",
  async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
      ...actual,
      LocalServicesReportingService: {
        getPerformance: mocks.getPerformance,
        listLeads: mocks.listLeads,
        provideLeadFeedback: mocks.provideLeadFeedback,
      },
    };
  },
);

const toolContext = makeToolContext();

describe("local services MCP tools", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue({ id: "project_1" });
    mocks.isHostedServerAuthMode.mockResolvedValue(true);
    mocks.hasSelfHostedGoogleOAuthConfig.mockResolvedValue(false);
  });

  it("renders performance totals and pacing into text and structured output", async () => {
    mocks.getPerformance.mockResolvedValue({
      currencyCode: "USD",
      customerId: "1234567890",
      dateRange: { startDate: "2026-08-11", endDate: "2026-09-07" },
      campaigns: [
        {
          id: "42",
          name: "LSA",
          status: "ENABLED",
          budgetAmountMicros: 50_000_000,
          budgetPeriod: "DAILY",
        },
      ],
      spendMicros: 123_000_000,
      leadTotals: {
        total: 3,
        charged: 2,
        booked: 1,
        phoneCalls: 2,
        messages: 1,
        bookings: 0,
      },
      costPerChargedLeadMicros: 61_500_000,
      pacing: {
        last7DaysSpendMicros: 175_000_000,
        weeklyBudgetMicros: 350_000_000,
        utilization: 0.5,
      },
    });

    const result = await getLocalServicesPerformanceTool.handler(
      {
        projectId: "project_1",
        startDate: "2026-08-11",
        endDate: "2026-09-07",
      },
      toolContext,
    );

    expect(mocks.getPerformance).toHaveBeenCalledWith({
      projectId: "project_1",
      startDate: "2026-08-11",
      endDate: "2026-09-07",
    });
    expect(textContent(result)).toContain("Spend $123.00");
    expect(textContent(result)).toContain("2 charged");
    expect(textContent(result)).toContain("$175.00 of $350.00/week (50%)");
    expect(result.structuredContent).toMatchObject({
      ok: true,
      spendMicros: 123_000_000,
      costPerChargedLeadMicros: 61_500_000,
    });
  });

  it("tells the caller a rejected report is not worth retrying", async () => {
    mocks.getPerformance.mockRejectedValue(
      new GoogleAdsReportError(
        "google_ads_request_rejected",
        "Google Ads rejected this report request. Retrying won't help.",
      ),
    );

    const result = await getLocalServicesPerformanceTool.handler(
      { projectId: "project_1" },
      toolContext,
    );

    expect(textContent(result)).toContain("Retrying won't help");
    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "google_ads_request_rejected",
    });
  });

  it("reports pending Google approval as expected state, not an error", async () => {
    mocks.getPerformance.mockRejectedValue(
      new GoogleAdsReportError(
        "google_ads_access_pending",
        "Google has not approved Ads API access for this developer token yet.",
      ),
    );

    const result = await getLocalServicesPerformanceTool.handler(
      { projectId: "project_1" },
      toolContext,
    );

    expect(textContent(result)).toContain("Basic Access");
    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "google_ads_access_pending",
    });
  });

  it("lists leads with contact details and a connect hint when not connected", async () => {
    mocks.listLeads.mockResolvedValue({
      currencyCode: "USD",
      dateRange: { startDate: "2026-08-13", endDate: "2026-09-09" },
      leads: [
        {
          id: "1",
          leadType: "PHONE_CALL",
          leadStatus: "BOOKED",
          categoryId: "xcat:service_area_business_plumber",
          serviceId: "drain_cleaning",
          creationDateTime: "2026-09-06 10:00:00",
          charged: true,
          consumerName: null,
          consumerPhoneNumber: "+15095551234",
          consumerEmail: null,
          creditState: "CREDITED",
          leadFeedbackSubmitted: true,
          conversationDurationMillis: 142_000,
        },
      ],
    });

    const listed = await getLocalServicesLeadsTool.handler(
      { projectId: "project_1" },
      toolContext,
    );
    expect(textContent(listed)).toContain("+15095551234");
    expect(textContent(listed)).toContain("CREDITED");
    expect(textContent(listed)).toContain("142s");
    expect(listed.structuredContent).toMatchObject({ ok: true, leadCount: 1 });

    mocks.listLeads.mockRejectedValue(
      new GoogleAdsReportError(
        "google_ads_not_connected",
        "Google Ads isn't connected for this project.",
      ),
    );
    const notConnected = await getLocalServicesLeadsTool.handler(
      { projectId: "project_1" },
      toolContext,
    );
    expect(textContent(notConnected)).toContain("Connect it here:");
    expect(notConnected.structuredContent).toMatchObject({
      ok: false,
      reason: "google_ads_not_connected",
    });
  });

  it("returns creditIssuanceDecision verbatim after filing", async () => {
    mocks.provideLeadFeedback.mockResolvedValue({
      leadId: "987654321",
      creditIssuanceDecision: "SUCCESS_NOT_REACHED_THRESHOLD",
      leadFeedbackSubmitted: true,
      creditState: "PENDING",
      charged: true,
    });

    const result = await provideLeadFeedbackTool.handler(
      {
        projectId: "project_1",
        leadId: "987654321",
        surveyAnswer: "VERY_DISSATISFIED",
        surveyDissatisfiedReason: "JOB_TYPE_MISMATCH",
      },
      toolContext,
    );

    expect(mocks.provideLeadFeedback).toHaveBeenCalledWith({
      projectId: "project_1",
      leadId: "987654321",
      surveyAnswer: "VERY_DISSATISFIED",
      surveyDissatisfiedReason: "JOB_TYPE_MISMATCH",
      surveySatisfiedReason: undefined,
      otherReasonComment: undefined,
    });
    expect(textContent(result)).toContain("SUCCESS_NOT_REACHED_THRESHOLD");
    expect(textContent(result)).toContain("lead_feedback_submitted=true");
    expect(result.structuredContent).toMatchObject({
      ok: true,
      leadId: "987654321",
      creditIssuanceDecision: "SUCCESS_NOT_REACHED_THRESHOLD",
      leadFeedbackSubmitted: true,
    });
  });

  it("surfaces an already-submitted lead without calling it a reconnect", async () => {
    mocks.provideLeadFeedback.mockRejectedValue(
      new GoogleAdsReportError(
        "lead_feedback_already_submitted",
        "Feedback was already submitted for lead 987654321. Google accepts one survey per lead.",
      ),
    );

    const result = await provideLeadFeedbackTool.handler(
      {
        projectId: "project_1",
        leadId: "987654321",
        surveyAnswer: "VERY_DISSATISFIED",
        surveyDissatisfiedReason: "JOB_TYPE_MISMATCH",
      },
      toolContext,
    );

    expect(textContent(result)).toContain("already submitted");
    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "lead_feedback_already_submitted",
    });
  });
});
