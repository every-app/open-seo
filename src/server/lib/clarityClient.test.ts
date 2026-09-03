import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLARITY_URL_JOIN_KEY,
  fetchClarityReport,
  parseClarityCachedResponse,
  parseClarityResponse,
} from "@/server/lib/clarityClient";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchClarityReport", () => {
  it("sends the token only in the Authorization header and validates the response", async () => {
    const fetchMock = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(
        Response.json([
          {
            metricName: "Traffic",
            information: [
              { URL: "https://example.com", totalSessionCount: "7" },
            ],
          },
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchClarityReport({
      apiToken: "secret-clarity-token",
      numOfDays: 3,
      dimensions: ["URL"],
    });

    expect(result[0]?.metricName).toBe("Traffic");
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("Expected a Clarity fetch call");
    const [url, init] = call;
    expect(url).toBeInstanceOf(URL);
    if (!(url instanceof URL)) throw new Error("Expected a URL request");
    expect(url.href).toBe(
      "https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=3&dimension1=URL",
    );
    expect(url.href).not.toContain("secret-clarity-token");
    expect(init?.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer secret-clarity-token",
    });
  });

  it("maps authentication and quota failures without exposing response bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("provider secret", { status: 401 }))
        .mockResolvedValueOnce(
          new Response("daily limit details", {
            status: 429,
            headers: { "Retry-After": "120" },
          }),
        ),
    );

    await expect(
      fetchClarityReport({ apiToken: "invalid-token", numOfDays: 1 }),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      fetchClarityReport({ apiToken: "valid-token", numOfDays: 1 }),
    ).rejects.toMatchObject({ status: 429, retryAfterSeconds: 120 });
  });

  it("rejects malformed provider payloads", () => {
    expect(() => parseClarityResponse({ metricName: "Traffic" })).toThrow(
      "invalid Data Export response",
    );
    expect(() =>
      parseClarityResponse([
        {
          metricName: "Traffic",
          information: [],
          openSeoOriginalInformationRows: 1_001,
        },
      ]),
    ).toThrow("invalid Data Export response");
  });

  it("allows one bounded internal join key only when parsing cached rows", () => {
    const providerFields = Object.fromEntries(
      Array.from({ length: 64 }, (_, index) => [`field${index}`, index]),
    );
    const cached = [
      {
        metricName: "Traffic",
        information: [
          {
            ...providerFields,
            [CLARITY_URL_JOIN_KEY]: "url-000001",
          },
        ],
      },
    ];

    expect(() => parseClarityResponse(cached)).toThrow(
      "invalid Data Export response",
    );
    expect(parseClarityCachedResponse(cached)).toHaveLength(1);
    expect(() =>
      parseClarityCachedResponse([
        {
          metricName: "Traffic",
          information: [{ ...providerFields, extra: 1 }],
        },
      ]),
    ).toThrow("invalid Data Export response");
  });
});
