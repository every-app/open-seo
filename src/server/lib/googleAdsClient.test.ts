import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGoogleAdsClient } from "./googleAdsClient";
import { GoogleAdsTokenError } from "./googleAdsErrors";

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  fetch: vi.fn<typeof fetch>(),
}));

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getAccessToken: mocks.getAccessToken } }),
}));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: () => Promise.resolve("developer-token"),
}));

const client = () =>
  createGoogleAdsClient({ userId: "user_1", googleAdsAccountId: "account_1" });

describe("createGoogleAdsClient", () => {
  beforeEach(() => {
    mocks.getAccessToken.mockResolvedValue({ accessToken: "ads_tok" });
    // A fresh Response per call: a body can only be read once.
    mocks.fetch.mockImplementation(() =>
      Promise.resolve(
        Response.json({ resourceNames: ["customers/1234567890"] }),
      ),
    );
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("mints one token for concurrent requests", async () => {
    const ads = client();
    await Promise.all([
      ads.listAccessibleCustomers(),
      ads.listAccessibleCustomers(),
    ]);
    expect(mocks.getAccessToken).toHaveBeenCalledTimes(1);
  });

  it("retries after a failed mint instead of failing every later request", async () => {
    mocks.getAccessToken
      .mockRejectedValueOnce(new Error("transient refresh failure"))
      .mockResolvedValue({ accessToken: "ads_tok" });
    const ads = client();
    await expect(ads.listAccessibleCustomers()).rejects.toBeInstanceOf(
      GoogleAdsTokenError,
    );
    await expect(ads.listAccessibleCustomers()).resolves.toEqual([
      "1234567890",
    ]);
  });

  it("keeps Google's own error message alongside the generic one", async () => {
    // The real v25 failure behind PR #9, which reached users only as "Google
    // Ads API error (400)" with Google's explanation thrown away.
    mocks.fetch.mockResolvedValue(
      Response.json(
        {
          error: {
            code: 400,
            message: "Request contains an invalid argument.",
            status: "INVALID_ARGUMENT",
            details: [
              {
                errors: [
                  {
                    errorCode: {
                      queryError: "PROHIBITED_FIELD_IN_SELECT_CLAUSE",
                    },
                    message:
                      "The following field may not be used in SELECT clause: 'local_services_lead.credit_details'.",
                  },
                ],
              },
            ],
          },
        },
        { status: 400 },
      ),
    );
    await expect(client().listAccessibleCustomers()).rejects.toMatchObject({
      message: "Google Ads API error (400).",
      upstreamReason: "PROHIBITED_FIELD_IN_SELECT_CLAUSE",
      upstreamMessage:
        "The following field may not be used in SELECT clause: 'local_services_lead.credit_details'.",
    });
  });

  it("POSTs ProvideLeadFeedback to the v25 resource URL", async () => {
    mocks.fetch.mockResolvedValue(
      Response.json({ creditIssuanceDecision: "FAIL_NOT_ELIGIBLE" }),
    );

    const result = await client().provideLeadFeedback(
      "1234567890",
      "987654321",
      {
        surveyAnswer: "VERY_DISSATISFIED",
        surveyDissatisfied: { surveyDissatisfiedReason: "JOB_TYPE_MISMATCH" },
      },
      { loginCustomerId: null },
    );

    expect(result).toEqual({ creditIssuanceDecision: "FAIL_NOT_ELIGIBLE" });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.fetch.mock.calls[0];
    expect(url).toBe(
      "https://googleads.googleapis.com/v25/customers/1234567890/localServicesLeads/987654321:provideLeadFeedback",
    );
    expect(init?.method).toBe("POST");
    expect(typeof init?.body).toBe("string");
    expect(
      JSON.parse(typeof init?.body === "string" ? init.body : "{}"),
    ).toEqual({
      resourceName: "customers/1234567890/localServicesLeads/987654321",
      surveyAnswer: "VERY_DISSATISFIED",
      surveyDissatisfied: { surveyDissatisfiedReason: "JOB_TYPE_MISMATCH" },
    });
  });
});
