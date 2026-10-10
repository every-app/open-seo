import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const workers = vi.hoisted(() => ({ env: {} as Record<string, string | undefined> }));
vi.mock("cloudflare:workers", () => ({ env: workers.env }));

import { getFreeDomainRating } from "./client";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("AHREFS_API_KEY", "");
  workers.env.AHREFS_API_KEY = "test-key";
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  delete workers.env.AHREFS_API_KEY;
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("getFreeDomainRating", () => {
  it("makes no request and returns nulls without a key", async () => {
    workers.env.AHREFS_API_KEY = undefined;
    await expect(getFreeDomainRating("example.com")).resolves.toEqual({
      domainRating: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses the nested domain rating the API returns", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        domain_rating: {
          domain_rating: 72,
          license: "http://ahrefs.com/legal/domain-rating-license",
        },
      }),
    );
    await expect(getFreeDomainRating("example.com")).resolves.toEqual({
      domainRating: 72,
    });
  });

  it("also accepts a flat domain_rating number", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ domain_rating: 44 }));
    await expect(getFreeDomainRating("example.com")).resolves.toEqual({
      domainRating: 44,
    });
  });

  it("retries with a date param when the API demands one", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: "date is required" }, 400))
      .mockResolvedValueOnce(jsonResponse({ domain_rating: { domain_rating: 44 } }));
    await expect(getFreeDomainRating("example.com")).resolves.toEqual({
      domainRating: 44,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retried: unknown = fetchMock.mock.calls[1]?.[0];
    expect(retried).toBeInstanceOf(URL);
    expect(new URL(String(retried)).searchParams.get("date")).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });

  it("returns nulls when the API rejects the key", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(["Error", "Forbidden"], 403));
    await expect(getFreeDomainRating("example.com")).resolves.toEqual({
      domainRating: null,
    });
  });

  it("returns nulls for payloads without a rating and rejects out-of-range values", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ unrelated: true }));
    await expect(getFreeDomainRating("example.com")).resolves.toEqual({
      domainRating: null,
    });
    fetchMock.mockResolvedValueOnce(jsonResponse({ domain_rating: 250 }));
    await expect(getFreeDomainRating("example.com")).resolves.toEqual({
      domainRating: null,
    });
  });
});
