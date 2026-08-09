import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  // ga4Client always calls fetch with a plain string URL (it stringifies any
  // URL object itself before calling), so the mock is typed to match that
  // real call shape rather than fetch's broader RequestInfo|URL signature.
  fetch: vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(),
}));

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getAccessToken: mocks.getAccessToken } }),
}));

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status });
}

describe("ga4Client", () => {
  beforeEach(() => {
    mocks.getAccessToken.mockReset();
    mocks.getAccessToken.mockResolvedValue({ accessToken: "tok_123" });
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists account summaries with a bearer token", async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({
        accountSummaries: [
          {
            account: "accounts/1",
            displayName: "My Org",
            propertySummaries: [
              { property: "properties/123", displayName: "example.com" },
            ],
          },
        ],
      }),
    );
    const { createGa4Client } = await import("./ga4Client");
    const summaries = await createGa4Client({
      userId: "u1",
    }).listAccountSummaries();

    expect(summaries).toHaveLength(1);
    const [url, init] = mocks.fetch.mock.calls[0];
    expect(url).toContain(
      "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
    );
    expect(init?.headers).toMatchObject({ Authorization: "Bearer tok_123" });
  });

  it("follows pageToken until every account summary page is fetched", async () => {
    mocks.fetch
      .mockResolvedValueOnce(
        jsonResponse({
          accountSummaries: [{ account: "accounts/1", displayName: "A" }],
          nextPageToken: "page2",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          accountSummaries: [{ account: "accounts/2", displayName: "B" }],
        }),
      );
    const { createGa4Client } = await import("./ga4Client");
    const summaries = await createGa4Client({
      userId: "u1",
    }).listAccountSummaries();

    expect(summaries).toHaveLength(2);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.calls[1][0]).toContain(
      "pageToken=page2",
    );
  });

  it("targets the selected Better Auth grant by Google sub", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ accountSummaries: [] }));
    const { createGa4Client } = await import("./ga4Client");

    await createGa4Client({
      userId: "u1",
      ga4AccountId: "google-sub-a",
    }).listAccountSummaries();

    expect(mocks.getAccessToken).toHaveBeenCalledWith({
      body: {
        providerId: "google-analytics",
        userId: "u1",
        accountId: "google-sub-a",
      },
    });
  });

  it("omits accountId for the legacy null-account fallback", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ accountSummaries: [] }));
    const { createGa4Client } = await import("./ga4Client");

    await createGa4Client({ userId: "u1" }).listAccountSummaries();

    expect(mocks.getAccessToken).toHaveBeenCalledWith({
      body: { providerId: "google-analytics", userId: "u1" },
    });
  });

  it("fetches the Google account email from userinfo", async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({ email: "client@example.com" }),
    );
    const { createGa4Client } = await import("./ga4Client");

    const email = await createGa4Client({
      userId: "u1",
      ga4AccountId: "google-sub-a",
    }).getUserInfoEmail();

    expect(email).toBe("client@example.com");
    const [url, init] = mocks.fetch.mock.calls[0];
    expect(url).toBe("https://openidconnect.googleapis.com/v1/userinfo");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer tok_123" });
  });

  it("posts runReport to the property's resource name verbatim", async () => {
    mocks.fetch.mockImplementation(async () => jsonResponse({ rows: [] }));
    const { createGa4Client } = await import("./ga4Client");
    const client = createGa4Client({ userId: "u1" });

    await client.runReport("properties/123456789", {
      dateRanges: [{ startDate: "2026-01-01", endDate: "2026-01-28" }],
      metrics: [{ name: "sessions" }],
    });

    const [url, init] = mocks.fetch.mock.calls[0];
    expect(url).toBe(
      "https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport",
    );
    expect(init?.method).toBe("POST");
    const body = init?.body;
    const payload =
      typeof body === "string" ? (JSON.parse(body) as unknown) : null;
    expect(payload).toEqual({
      dateRanges: [{ startDate: "2026-01-01", endDate: "2026-01-28" }],
      metrics: [{ name: "sessions" }],
    });
  });

  it("maps 403 to a no-access Ga4ApiError", async () => {
    mocks.fetch.mockImplementation(async () =>
      jsonResponse({ error: "forbidden" }, 403),
    );
    const { createGa4Client, Ga4ApiError } = await import("./ga4Client");
    await expect(
      createGa4Client({ userId: "u1" }).listAccountSummaries(),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      createGa4Client({ userId: "u1" }).listAccountSummaries(),
    ).rejects.toBeInstanceOf(Ga4ApiError);
  });

  it("maps 429 to a rate-limit Ga4ApiError", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ error: "slow down" }, 429));
    const { createGa4Client } = await import("./ga4Client");
    await expect(
      createGa4Client({ userId: "u1" }).listAccountSummaries(),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("throws Ga4TokenError when no access token can be minted", async () => {
    mocks.getAccessToken.mockRejectedValue(new Error("revoked"));
    const { createGa4Client, Ga4TokenError } = await import("./ga4Client");
    await expect(
      createGa4Client({ userId: "u1" }).listAccountSummaries(),
    ).rejects.toBeInstanceOf(Ga4TokenError);
  });
});
