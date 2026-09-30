/* eslint-disable max-lines -- LSA reporting and ProvideLeadFeedback share one test module */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleAdsApiError } from "@/server/lib/googleAdsErrors";
import { LocalServicesReportingService } from "./LocalServicesReportingService";
import type { GoogleAdsConnection } from "@/server/features/google-ads/repositories/GoogleAdsConnectionRepository";

const mocks = vi.hoisted(() => ({
  getByProjectId: vi.fn(),
  search: vi.fn(),
  provideLeadFeedback: vi.fn(),
}));

vi.mock(
  "@/server/features/google-ads/repositories/GoogleAdsConnectionRepository",
  () => ({
    GoogleAdsConnectionRepository: { getByProjectId: mocks.getByProjectId },
  }),
);
vi.mock("@/server/lib/googleAdsClient", () => ({
  createGoogleAdsClient: () => ({
    search: mocks.search,
    provideLeadFeedback: mocks.provideLeadFeedback,
  }),
}));

function makeConnection(
  overrides: Partial<GoogleAdsConnection> = {},
): GoogleAdsConnection {
  return {
    id: "google_ads_connection_1",
    projectId: "project_1",
    organizationId: "org_123",
    customerId: "1234567890",
    loginCustomerId: "2930000000",
    customerDescriptiveName: "Law Firm",
    currencyCode: "USD",
    timeZone: "America/Los_Angeles",
    connectedByUserId: "user_1",
    googleAdsAccountId: "account_1",
    connectedAccountEmail: "alice@example.com",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

const range = {
  projectId: "project_1",
  startDate: "2026-09-01",
  endDate: "2026-09-07",
};

describe("LocalServicesReportingService", () => {
  beforeEach(() => {
    mocks.getByProjectId.mockResolvedValue(makeConnection());
  });

  it("maps a missing connection to google_ads_not_connected", async () => {
    mocks.getByProjectId.mockResolvedValue(null);
    await expect(
      LocalServicesReportingService.getPerformance(range),
    ).rejects.toMatchObject({ code: "google_ads_not_connected" });
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("rejects a malformed date before any API call", async () => {
    await expect(
      LocalServicesReportingService.getPerformance({
        ...range,
        endDate: "07/09/2026",
      }),
    ).rejects.toMatchObject({ code: "validation_error" });
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("aggregates spend, lead totals, CPL, and weekly pacing from GAQL rows", async () => {
    mocks.search.mockImplementation((_customerId: string, query: string) => {
      if (query.includes("FROM local_services_lead")) {
        return Promise.resolve([
          {
            localServicesLead: {
              id: "1",
              leadType: "PHONE_CALL",
              leadStatus: "BOOKED",
              creationDateTime: "2026-09-06 10:00:00",
              leadCharged: true,
              contactDetails: { phoneNumber: "+15095551234" },
            },
          },
          {
            localServicesLead: {
              id: "2",
              leadType: "PHONE_CALL",
              leadStatus: "NEW",
              creationDateTime: "2026-09-05 09:00:00",
              leadCharged: true,
            },
          },
          {
            // ProtoJSON omits false booleans entirely.
            localServicesLead: {
              id: "3",
              leadType: "MESSAGE",
              leadStatus: "EXPIRED",
              creationDateTime: "2026-09-02 08:00:00",
            },
          },
        ]);
      }
      if (query.includes("metrics.cost_micros")) {
        return Promise.resolve(
          query.includes("BETWEEN '2026-09-01'")
            ? [{ campaign: { id: "42" }, metrics: { costMicros: "123000000" } }]
            : [
                {
                  campaign: { id: "42" },
                  metrics: { costMicros: "175000000" },
                },
              ],
        );
      }
      return Promise.resolve([
        {
          campaign: { id: "42", name: "LSA", status: "ENABLED" },
          campaignBudget: { amountMicros: "50000000", period: "DAILY" },
        },
      ]);
    });

    const performance =
      await LocalServicesReportingService.getPerformance(range);

    expect(performance.spendMicros).toBe(123_000_000);
    expect(performance.leadTotals).toEqual({
      total: 3,
      charged: 2,
      booked: 1,
      phoneCalls: 2,
      messages: 1,
      bookings: 0,
      truncated: false,
    });
    expect(performance.costPerChargedLeadMicros).toBe(61_500_000);
    expect(performance.pacing.weeklyBudgetMicros).toBe(350_000_000);
    expect(performance.pacing.last7DaysSpendMicros).toBe(175_000_000);
    expect(performance.pacing.utilization).toBe(0.5);
    // The manager account rides along on every query.
    expect(mocks.search).toHaveBeenCalledWith(
      "1234567890",
      expect.any(String),
      { loginCustomerId: "2930000000" },
    );
  });

  it("leaves the weekly target null for a non-daily budget period", async () => {
    mocks.search.mockImplementation((_customerId: string, query: string) => {
      if (query.includes("FROM local_services_lead"))
        return Promise.resolve([]);
      if (query.includes("metrics.cost_micros")) return Promise.resolve([]);
      return Promise.resolve([
        {
          campaign: { id: "42", name: "LSA", status: "ENABLED" },
          campaignBudget: {
            amountMicros: "1500000000",
            period: "CUSTOM_PERIOD",
          },
        },
      ]);
    });

    const performance =
      await LocalServicesReportingService.getPerformance(range);
    expect(performance.pacing.weeklyBudgetMicros).toBeNull();
    expect(performance.pacing.utilization).toBeNull();
  });

  it("builds the default window from the Ads account's own calendar day", async () => {
    // 21:00 in Los Angeles on the 9th is already the 10th in UTC. Google reads
    // segments.date in the account's zone, so a UTC window would ask for a day
    // that hasn't happened there and drop one off the start.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T04:00:00Z"));
    mocks.search.mockResolvedValue([]);
    try {
      const performance = await LocalServicesReportingService.getPerformance({
        projectId: "project_1",
      });
      expect(performance.dateRange).toEqual({
        startDate: "2026-08-13",
        endDate: "2026-09-09",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("flags lead totals that hit the reporting cap", async () => {
    mocks.search.mockImplementation((_customerId: string, query: string) => {
      if (!query.includes("FROM local_services_lead")) {
        return Promise.resolve([]);
      }
      // One more than the cap, which is exactly what the extra row detects.
      return Promise.resolve(
        Array.from({ length: 1_001 }, (_, i) => ({
          localServicesLead: { id: `${i}`, leadCharged: true },
        })),
      );
    });

    const performance =
      await LocalServicesReportingService.getPerformance(range);
    expect(performance.leadTotals).toMatchObject({
      total: 1_000,
      charged: 1_000,
      truncated: true,
    });
  });

  it("maps an unapproved developer token to google_ads_access_pending", async () => {
    mocks.search.mockRejectedValue(
      new GoogleAdsApiError(
        403,
        "Google has not approved Ads API access for this developer token yet.",
        "DEVELOPER_TOKEN_NOT_APPROVED",
      ),
    );
    await expect(
      LocalServicesReportingService.listLeads({ ...range, limit: 50 }),
    ).rejects.toMatchObject({ code: "google_ads_access_pending" });
  });

  it("maps a Google 400 to request_rejected, not an outage, and still logs the real reason", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.search.mockRejectedValue(
      new GoogleAdsApiError(
        400,
        "Google Ads API error (400).",
        "PROHIBITED_FIELD_IN_SELECT_CLAUSE",
        "The following field may not be used in SELECT clause: 'local_services_lead.credit_details'.",
      ),
    );
    await expect(
      LocalServicesReportingService.listLeads({ ...range, limit: 50 }),
    ).rejects.toMatchObject({
      code: "google_ads_request_rejected",
      message: "Google Ads rejected this report request. Retrying won't help.",
    });
    expect(log).toHaveBeenCalledWith(
      "google_ads.report_failed",
      expect.objectContaining({
        report: "leads",
        projectId: "project_1",
        status: 400,
        reason: "PROHIBITED_FIELD_IN_SELECT_CLAUSE",
        upstreamMessage:
          "The following field may not be used in SELECT clause: 'local_services_lead.credit_details'.",
      }),
    );
  });

  it("still maps a Google 503 to google_ads_upstream_unavailable", async () => {
    mocks.search.mockRejectedValue(
      new GoogleAdsApiError(503, "Google Ads API error (503)."),
    );
    await expect(
      LocalServicesReportingService.listLeads({ ...range, limit: 50 }),
    ).rejects.toMatchObject({ code: "google_ads_upstream_unavailable" });
  });

  it("does not select credit_state or conversations on the performance path", async () => {
    mocks.search.mockResolvedValue([]);
    await LocalServicesReportingService.getPerformance(range);
    const queries = mocks.search.mock.calls.map(([, query]) => String(query));
    expect(queries.some((query) => query.includes("credit_details"))).toBe(
      false,
    );
    expect(
      queries.some((query) =>
        query.includes("local_services_lead_conversation"),
      ),
    ).toBe(false);
  });
});

describe("LocalServicesReportingService.listLeads extras", () => {
  beforeEach(() => {
    mocks.getByProjectId.mockResolvedValue(makeConnection());
  });

  it("returns credit_state, feedback submitted, and call duration on listLeads", async () => {
    mocks.search.mockImplementation((_customerId: string, query: string) => {
      if (query.includes("FROM local_services_lead_conversation")) {
        return Promise.resolve([
          {
            localServicesLeadConversation: {
              lead: "customers/1234567890/localServicesLeads/987654321",
              conversationChannel: "PHONE_CALL",
              phoneCallDetails: { callDurationMillis: "8000" },
            },
          },
          {
            localServicesLeadConversation: {
              lead: "customers/1234567890/localServicesLeads/987654321",
              conversationChannel: "PHONE_CALL",
              phoneCallDetails: { callDurationMillis: "142000" },
            },
          },
          {
            localServicesLeadConversation: {
              lead: "customers/1234567890/localServicesLeads/987654321",
              conversationChannel: "MESSAGE",
            },
          },
        ]);
      }
      if (query.includes("FROM local_services_lead")) {
        return Promise.resolve([
          {
            localServicesLead: {
              id: "987654321",
              leadType: "PHONE_CALL",
              leadStatus: "NEW",
              categoryId: "xcat:service_area_business_plumber",
              creationDateTime: "2026-09-09 13:41:52",
              leadCharged: true,
              leadFeedbackSubmitted: true,
              creditDetails: { creditState: "CREDITED" },
              contactDetails: { phoneNumber: "+15097598423" },
            },
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await LocalServicesReportingService.listLeads({
      ...range,
      limit: 50,
    });
    expect(result.leads).toEqual([
      {
        id: "987654321",
        leadType: "PHONE_CALL",
        leadStatus: "NEW",
        categoryId: "xcat:service_area_business_plumber",
        serviceId: null,
        creationDateTime: "2026-09-09 13:41:52",
        charged: true,
        consumerName: null,
        consumerPhoneNumber: "+15097598423",
        consumerEmail: null,
        creditState: "CREDITED",
        leadFeedbackSubmitted: true,
        conversationDurationMillis: 142_000,
      },
    ]);
    expect(mocks.search).toHaveBeenCalledWith(
      "1234567890",
      expect.stringContaining("credit_details.credit_state"),
      { loginCustomerId: "2930000000" },
    );
    expect(mocks.search).toHaveBeenCalledWith(
      "1234567890",
      expect.stringContaining("call_duration_millis"),
      { loginCustomerId: "2930000000" },
    );
    expect(
      mocks.search.mock.calls.some(([, query]) =>
        String(query).includes("call_recording_url"),
      ),
    ).toBe(false);
  });

  it("falls back when credit/feedback extras are SELECT-prohibited", async () => {
    mocks.search.mockImplementation((_customerId: string, query: string) => {
      if (query.includes("credit_details.credit_state")) {
        return Promise.reject(
          new GoogleAdsApiError(
            400,
            "Google Ads API error (400).",
            "PROHIBITED_FIELD_IN_SELECT_CLAUSE",
            "The following field may not be used in SELECT clause: 'local_services_lead.credit_details.credit_state'.",
          ),
        );
      }
      if (query.includes("FROM local_services_lead_conversation")) {
        return Promise.resolve([]);
      }
      if (query.includes("FROM local_services_lead")) {
        return Promise.resolve([
          { localServicesLead: { id: "1", leadCharged: true } },
        ]);
      }
      return Promise.resolve([]);
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await LocalServicesReportingService.listLeads({
      ...range,
      limit: 50,
    });
    expect(result.leads[0]).toMatchObject({
      id: "1",
      charged: true,
      creditState: null,
      leadFeedbackSubmitted: null,
      conversationDurationMillis: null,
    });
    expect(log).toHaveBeenCalledWith(
      "google_ads.lead_list_extras_unreadable",
      expect.objectContaining({
        reason: "PROHIBITED_FIELD_IN_SELECT_CLAUSE",
      }),
    );
    log.mockRestore();
  });

  it("omits duration when the conversation resource is SELECT-prohibited", async () => {
    mocks.search.mockImplementation((_customerId: string, query: string) => {
      if (query.includes("FROM local_services_lead_conversation")) {
        return Promise.reject(
          new GoogleAdsApiError(
            400,
            "Google Ads API error (400).",
            "PROHIBITED_FIELD_IN_SELECT_CLAUSE",
            "The following field may not be used in SELECT clause: 'local_services_lead_conversation.phone_call_details.call_duration_millis'.",
          ),
        );
      }
      if (query.includes("FROM local_services_lead")) {
        return Promise.resolve([
          {
            localServicesLead: {
              id: "1",
              leadCharged: true,
              leadFeedbackSubmitted: false,
            },
          },
        ]);
      }
      return Promise.resolve([]);
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await LocalServicesReportingService.listLeads({
      ...range,
      limit: 50,
    });
    expect(result.leads[0]?.conversationDurationMillis).toBeNull();
    expect(result.leads[0]?.leadFeedbackSubmitted).toBe(false);
    expect(log).toHaveBeenCalledWith(
      "google_ads.lead_conversations_unreadable",
      expect.objectContaining({
        reason: "PROHIBITED_FIELD_IN_SELECT_CLAUSE",
      }),
    );
    log.mockRestore();
  });
});

const feedback = {
  projectId: "project_1",
  leadId: "987654321",
  surveyAnswer: "VERY_DISSATISFIED" as const,
  surveyDissatisfiedReason: "JOB_TYPE_MISMATCH" as const,
};

describe("LocalServicesReportingService.provideLeadFeedback", () => {
  beforeEach(() => {
    mocks.getByProjectId.mockResolvedValue(makeConnection());
    mocks.provideLeadFeedback.mockResolvedValue({
      creditIssuanceDecision: "SUCCESS_NOT_REACHED_THRESHOLD",
    });
  });

  it("rejects a non-numeric leadId before any API call", async () => {
    await expect(
      LocalServicesReportingService.provideLeadFeedback({
        ...feedback,
        leadId: "customers/1/localServicesLeads/2",
      }),
    ).rejects.toMatchObject({ code: "validation_error" });
    expect(mocks.search).not.toHaveBeenCalled();
    expect(mocks.provideLeadFeedback).not.toHaveBeenCalled();
  });

  it("rejects a dissatisfied survey without a reason", async () => {
    await expect(
      LocalServicesReportingService.provideLeadFeedback({
        projectId: "project_1",
        leadId: "987654321",
        surveyAnswer: "VERY_DISSATISFIED",
      }),
    ).rejects.toMatchObject({ code: "validation_error" });
    expect(mocks.provideLeadFeedback).not.toHaveBeenCalled();
  });

  it("refuses when lead_feedback_submitted is already true", async () => {
    mocks.search.mockImplementation((_customerId: string, query: string) => {
      if (query.includes("lead_feedback_submitted")) {
        return Promise.resolve([
          {
            localServicesLead: {
              id: "987654321",
              leadCharged: true,
              leadFeedbackSubmitted: true,
            },
          },
        ]);
      }
      return Promise.resolve([]);
    });

    await expect(
      LocalServicesReportingService.provideLeadFeedback(feedback),
    ).rejects.toMatchObject({ code: "lead_feedback_already_submitted" });
    expect(mocks.provideLeadFeedback).not.toHaveBeenCalled();
  });

  it("files a dissatisfied survey and returns the post-file re-read", async () => {
    let feedbackReads = 0;
    mocks.search.mockImplementation((_customerId: string, query: string) => {
      if (query.includes("lead_feedback_submitted")) {
        feedbackReads += 1;
        return Promise.resolve([
          {
            localServicesLead: {
              id: "987654321",
              leadCharged: true,
              leadFeedbackSubmitted: feedbackReads > 1,
            },
          },
        ]);
      }
      if (query.includes("credit_details.credit_state")) {
        return Promise.resolve([
          {
            localServicesLead: {
              id: "987654321",
              creditDetails: { creditState: "PENDING" },
            },
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const result =
      await LocalServicesReportingService.provideLeadFeedback(feedback);

    expect(mocks.provideLeadFeedback).toHaveBeenCalledWith(
      "1234567890",
      "987654321",
      {
        surveyAnswer: "VERY_DISSATISFIED",
        surveyDissatisfied: { surveyDissatisfiedReason: "JOB_TYPE_MISMATCH" },
      },
      { loginCustomerId: "2930000000" },
    );
    expect(result).toEqual({
      leadId: "987654321",
      creditIssuanceDecision: "SUCCESS_NOT_REACHED_THRESHOLD",
      leadFeedbackSubmitted: true,
      creditState: "PENDING",
      charged: true,
    });
  });

  it("still files when the credit_state leaf is SELECT-prohibited", async () => {
    mocks.search.mockImplementation((_customerId: string, query: string) => {
      if (query.includes("credit_details.credit_state")) {
        return Promise.reject(
          new GoogleAdsApiError(
            400,
            "Google Ads API error (400).",
            "PROHIBITED_FIELD_IN_SELECT_CLAUSE",
            "The following field may not be used in SELECT clause: 'local_services_lead.credit_details.credit_state'.",
          ),
        );
      }
      if (query.includes("lead_feedback_submitted")) {
        return Promise.resolve([
          {
            localServicesLead: {
              id: "987654321",
              leadCharged: true,
              leadFeedbackSubmitted: false,
            },
          },
        ]);
      }
      return Promise.resolve([]);
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const result =
      await LocalServicesReportingService.provideLeadFeedback(feedback);

    expect(result.creditIssuanceDecision).toBe("SUCCESS_NOT_REACHED_THRESHOLD");
    expect(result.creditState).toBeNull();
    expect(mocks.provideLeadFeedback).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(
      "google_ads.credit_state_unreadable",
      expect.objectContaining({
        leadId: "987654321",
        reason: "PROHIBITED_FIELD_IN_SELECT_CLAUSE",
      }),
    );
    log.mockRestore();
  });

  it("does not file a missing lead", async () => {
    mocks.search.mockResolvedValue([]);
    await expect(
      LocalServicesReportingService.provideLeadFeedback(feedback),
    ).rejects.toMatchObject({ code: "lead_not_found" });
    expect(mocks.provideLeadFeedback).not.toHaveBeenCalled();
  });

  it("maps Google RESOURCE_ALREADY_EXISTS on a re-file to already submitted", async () => {
    mocks.search.mockImplementation((_customerId: string, query: string) => {
      if (query.includes("lead_feedback_submitted")) {
        return Promise.resolve([
          {
            localServicesLead: {
              id: "987654321",
              leadCharged: true,
              leadFeedbackSubmitted: false,
            },
          },
        ]);
      }
      return Promise.resolve([]);
    });
    mocks.provideLeadFeedback.mockRejectedValue(
      new GoogleAdsApiError(
        400,
        "Google Ads API error (400).",
        "RESOURCE_ALREADY_EXISTS",
        "The resource being created already exists.",
      ),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      LocalServicesReportingService.provideLeadFeedback(feedback),
    ).rejects.toMatchObject({ code: "lead_feedback_already_submitted" });
    expect(log).toHaveBeenCalledWith(
      "google_ads.report_failed",
      expect.objectContaining({
        report: "feedback",
        reason: "RESOURCE_ALREADY_EXISTS",
      }),
    );
    log.mockRestore();
  });
});
