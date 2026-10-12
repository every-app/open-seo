import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGscClient, GscApiError, GscTokenError } from "./gscClient";

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  fetch: vi.fn<typeof fetch>(),
}));

vi.mock("@/server/features/google/googleOAuth", () => ({
  getGoogleAccessToken: mocks.getAccessToken,
}));

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status });
}

describe("gscClient", () => {
  beforeEach(() => {
    mocks.getAccessToken.mockResolvedValue("tok_123");
    vi.stubGlobal("fetch", mocks.fetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists sites with a bearer token", async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({
        siteEntry: [{ siteUrl: "https://x/", permissionLevel: "siteOwner" }],
      }),
    );
    const sites = await createGscClient({ userId: "u1" }).listSites();

    expect(sites).toHaveLength(1);
    const [url, init] = mocks.fetch.mock.calls[0];
    expect(url).toBe("https://www.googleapis.com/webmasters/v3/sites");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer tok_123" });
  });

  it("targets the selected Better Auth grant by Google sub", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ siteEntry: [] }));

    await createGscClient({
      userId: "u1",
      gscAccountId: "google-sub-a",
    }).listSites();

    expect(mocks.getAccessToken).toHaveBeenCalledWith({
      providerId: "google-search-console",
      userId: "u1",
      accountId: "google-sub-a",
    });
  });

  it("omits accountId for the legacy null-account fallback", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ siteEntry: [] }));

    await createGscClient({ userId: "u1" }).listSites();

    expect(mocks.getAccessToken).toHaveBeenCalledWith({
      providerId: "google-search-console",
      userId: "u1",
      accountId: undefined,
    });
  });

  it("fetches the Google account email from userinfo", async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({ email: "client@example.com" }),
    );

    const email = await createGscClient({
      userId: "u1",
      gscAccountId: "google-sub-a",
    }).getUserInfoEmail();

    expect(email).toBe("client@example.com");
    const [url, init] = mocks.fetch.mock.calls[0];
    expect(url).toBe("https://openidconnect.googleapis.com/v1/userinfo");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer tok_123" });
  });

  it("encodes the siteUrl in the searchAnalytics path (both property forms)", async () => {
    mocks.fetch.mockImplementation(async () => jsonResponse({ rows: [] }));
    const client = createGscClient({ userId: "u1" });

    await client.querySearchAnalytics("sc-domain:example.com", {
      startDate: "2026-01-01",
      endDate: "2026-01-28",
    });
    expect(mocks.fetch.mock.calls[0][0]).toBe(
      "https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aexample.com/searchAnalytics/query",
    );

    await client.querySearchAnalytics("https://example.com/", {
      startDate: "2026-01-01",
      endDate: "2026-01-28",
    });
    expect(mocks.fetch.mock.calls[1][0]).toBe(
      "https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fexample.com%2F/searchAnalytics/query",
    );
  });

  it("posts to the URL Inspection endpoint and returns the result", async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({
        inspectionResult: {
          indexStatusResult: { verdict: "PASS", coverageState: "Indexed" },
        },
      }),
    );
    const result = await createGscClient({ userId: "u1" }).inspectUrl(
      "sc-domain:example.com",
      "https://example.com/post",
      "en-US",
    );

    const [url, init] = mocks.fetch.mock.calls[0];
    expect(url).toBe(
      "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
    );
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer tok_123" });
    const body = init?.body;
    const payload =
      typeof body === "string" ? (JSON.parse(body) as unknown) : null;
    expect(payload).toEqual({
      siteUrl: "sc-domain:example.com",
      inspectionUrl: "https://example.com/post",
      languageCode: "en-US",
    });
    expect(result?.indexStatusResult?.verdict).toBe("PASS");
  });

  it("maps 403 to a no-access GscApiError", async () => {
    mocks.fetch.mockImplementation(async () =>
      jsonResponse({ error: "forbidden" }, 403),
    );
    await expect(
      createGscClient({ userId: "u1" }).listSites(),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      createGscClient({ userId: "u1" }).listSites(),
    ).rejects.toBeInstanceOf(GscApiError);
  });

  it("maps 429 to a rate-limit GscApiError", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ error: "slow down" }, 429));
    await expect(
      createGscClient({ userId: "u1" }).listSites(),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("throws GscTokenError when no access token can be minted", async () => {
    mocks.getAccessToken.mockRejectedValue(new Error("revoked"));
    await expect(
      createGscClient({ userId: "u1" }).listSites(),
    ).rejects.toBeInstanceOf(GscTokenError);
  });
});
