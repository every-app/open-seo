import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/lib/errors";
import { createUmamiClient } from "./umamiClient";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn<typeof fetch>(),
  validate: vi.fn<(url: string) => Promise<string>>(),
}));

// The SSRF guard resolves DNS; these tests cover what the client does with
// its verdict.
vi.mock("@/server/lib/audit/url-policy", () => ({
  normalizeAndValidateStartUrl: mocks.validate,
}));

const range = { startAt: 1_000, endAt: 2_000 };
const passwordLogin = {
  baseUrl: "https://stats.example.com",
  authType: "password" as const,
  username: "viewer",
  secret: "hunter2",
  headers: [{ name: "CF-Access-Client-Id", value: "proxy-id" }],
};

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

function headersOf(call: Parameters<typeof fetch>) {
  return new Headers(call[1]?.headers);
}

describe("umamiClient", () => {
  beforeEach(() => {
    mocks.validate.mockImplementation(async (url) => `${url}/`);
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("logs in once with a password and reuses the token, with proxy headers on every request", async () => {
    mocks.fetch.mockImplementation(async (input) =>
      requestUrl(input).endsWith("/auth/login")
        ? Response.json({ token: "jwt-1" })
        : Response.json({
            data: [{ id: "w1", name: "Site", domain: "a.com" }],
          }),
    );
    const client = createUmamiClient(passwordLogin);

    await client.listWebsites();
    await client.listWebsites();

    const calls = mocks.fetch.mock.calls;
    expect(calls.map(([input]) => requestUrl(input))).toEqual([
      "https://stats.example.com/api/auth/login",
      "https://stats.example.com/api/websites?includeTeams=true&page=1&pageSize=100",
      "https://stats.example.com/api/websites?includeTeams=true&page=1&pageSize=100",
    ]);
    const loginBody = calls[0][1]?.body;
    expect(
      typeof loginBody === "string" ? JSON.parse(loginBody) : null,
    ).toEqual({
      username: "viewer",
      password: "hunter2",
    });
    for (const call of calls) {
      expect(call[1]?.redirect).toBe("manual");
      expect(headersOf(call).get("cf-access-client-id")).toBe("proxy-id");
    }
    expect(headersOf(calls[1]).get("authorization")).toBe("Bearer jwt-1");
  });

  it("sends an Umami Cloud API key at the API root without a login", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ data: [] }));
    const client = createUmamiClient({
      baseUrl: "https://api.umami.is/v1",
      authType: "api_key",
      username: null,
      secret: "key-123",
      headers: [],
    });

    await client.listWebsites();

    const [call] = mocks.fetch.mock.calls;
    expect(requestUrl(call[0])).toMatch(
      /^https:\/\/api\.umami\.is\/v1\/websites\?/,
    );
    expect(headersOf(call).get("x-umami-api-key")).toBe("key-123");
    expect(headersOf(call).get("authorization")).toBeNull();
  });

  it.each([
    [
      "a login that needs two-factor",
      () => Response.json({ requiresTwoFactor: true, partialToken: "p" }),
      "umami_two_factor_required",
    ],
    [
      "a wrong password",
      () => new Response(null, { status: 401 }),
      "umami_auth_failed",
    ],
    [
      "a redirect, which is never followed",
      () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/" },
        }),
      "umami_unreachable",
    ],
    [
      "an auth proxy's HTML page",
      () => new Response("<html>Sign in</html>", { status: 200 }),
      "umami_malformed_response",
    ],
  ])("rejects %s", async (_label, response, code) => {
    mocks.fetch.mockImplementation(async () => response());

    await expect(
      createUmamiClient(passwordLogin).listWebsites(),
    ).rejects.toMatchObject({ code });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("refuses a URL the outbound policy blocks before sending anything", async () => {
    mocks.validate.mockRejectedValue(new AppError("CRAWL_TARGET_BLOCKED"));

    await expect(
      createUmamiClient(passwordLogin).listWebsites(),
    ).rejects.toMatchObject({ code: "umami_url_blocked" });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("rejects Umami v2 stats instead of reading them as zeros", async () => {
    mocks.fetch.mockImplementation(async (input) =>
      requestUrl(input).endsWith("/auth/login")
        ? Response.json({ token: "jwt-1" })
        : Response.json({ pageviews: { value: 10, prev: 8 } }),
    );

    await expect(
      createUmamiClient(passwordLogin).getStats("w1", range),
    ).rejects.toMatchObject({ code: "umami_unsupported_version" });
  });
});
